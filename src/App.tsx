import { useEffect, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { isTauriDesktop, rescanLibraryKind } from "./api";
import type { MediaItem } from "./types";
import type { RecommendationEntry } from "./userFeaturesApi";
import { useOnyxDialog } from "./components/OnyxDialogProvider";
import { ContextMenu, type ContextMenuState, type MenuTarget } from "./components/menus/ContextMenu";
import { Sidebar } from "./components/navigation/Sidebar";
import { TopBar } from "./components/navigation/TopBar";
import { WindowBar } from "./components/navigation/WindowBar";
import { CollectionRelockIndicator, ProtectedCollectionGate } from "./features/collections/CollectionAccess";
import { useCollectionsController } from "./features/collections/hooks/useCollectionsController";
import { MetadataMatchDialog } from "./features/metadata/components/MetadataMatchDialog";
import { SleepTimer } from "./features/sleep/components/SleepTimer";
import { SocialBar } from "./features/social/components/SocialBar";
import { useLibraryCatalog } from "./features/library/hooks/useLibraryCatalog";
import { LiveChannelsView } from "./features/live/components/LiveChannelsView";
import { MusicView } from "./features/music/components/MusicView";
import { useMediaActions } from "./features/library/hooks/useMediaActions";
import { usePlaybackController } from "./features/playback/hooks/usePlaybackController";
import { usePlaylistsController } from "./features/playlists/hooks/usePlaylistsController";
import { useProfileController } from "./features/profiles/hooks/useProfileController";
import { SettingsPage } from "./features/settings/SettingsPage";
import { useAppData } from "./app/hooks/useAppData";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { CollectionPage } from "./pages/CollectionPage";
import { HiddenMediaPage } from "./pages/HiddenMediaPage";
import { HomePage } from "./pages/HomePage";
import { MediaGalleryPage } from "./pages/MediaGalleryPage";
import { PlayerPage } from "./pages/PlayerPage";
import { PlaylistsPage } from "./pages/PlaylistsPage";
import { SpecialsPage } from "./pages/SpecialsPage";
import { TelevisionPage } from "./pages/TelevisionPage";
import { allWatched, episodeLabel, groupPercent, socialKey } from "./utils/media";
import { projectorProfileSlug } from "./utils/routes";

type Section = "home" | "movies" | "tv" | "specials" | "collection" | "live" | "music" | "history" | "playlists" | "analytics" | "settings" | "hidden";
type TvView = "season" | "list";

function App() {
  const isDesktop = isTauriDesktop();
  const projectorMode = !isDesktop && Boolean(projectorProfileSlug());
  const dialog = useOnyxDialog();
  const data = useAppData(isDesktop);
  const [section, setSection] = useState<Section>(projectorMode ? "live" : "home");
  const [query, setQuery] = useState("");
  const [tvView, setTvView] = useState<TvView>("season");
  const [selectedShowTitle, setSelectedShowTitle] = useState<string | null>(null);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [matchItem, setMatchItem] = useState<MediaItem | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);

  const collections = useCollectionsController(data.items, selected, setSelected, data.setError);
  const playback = usePlaybackController({
    items: data.items,
    setItems: data.setItems,
    selected,
    setSelected,
    sessions: collections.sessions,
    markPlaying: collections.markPlaying,
    markIdle: collections.markIdle,
    requestCollectionUnlock: sourceId => {
      collections.setSelectedCollectionId(sourceId);
      setSection("collection");
      data.setError("Unlock this collection before playing it.");
    },
  });
  const catalog = useLibraryCatalog({
    items: data.items,
    hiddenItems: data.hiddenItems,
    sessions: collections.sessions,
    query,
    selectedShowTitle,
    playlists: data.playlists,
    selectedPlaylistId,
  });
  const mediaActions = useMediaActions({
    isDesktop,
    section,
    selected,
    setSelected,
    selectedShowTitle,
    setSelectedShowTitle,
    setItems: data.setItems,
    setHiddenItems: data.setHiddenItems,
    setError: data.setError,
  });
  const playlistActions = usePlaylistsController({
    playlists: data.playlists,
    setPlaylists: data.setPlaylists,
    selectedPlaylistId,
    setSelectedPlaylistId,
    dialog,
    showPlaylists: () => setSection("playlists"),
    setError: data.setError,
  });
  const profiles = useProfileController({
    isDesktop, activeUserId: data.activeUserId, users: data.users, refresh: data.refresh, loadUsers: data.loadUsers,
    clearCollectionSessions: collections.clearSessions, setActiveUserState: data.setActiveUserState, setItems: data.setItems,
    setHiddenItems: data.setHiddenItems, setPlaylists: data.setPlaylists, setAuthenticated: data.setAuthenticated,
    resetUi: () => { setSelected(null); playback.setPausedMedia(null); setSelectedShowTitle(null); setSelectedPlaylistId(null); collections.setSelectedCollectionId(null); setSection("home"); setQuery(""); },
    openHiddenSection: () => setSection("hidden"), setError: data.setError,
  });
  const activeUser = data.users.find(user => user.id === data.activeUserId) ?? data.users[0];

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    return () => { window.removeEventListener("click", close); window.removeEventListener("blur", close); };
  }, []);

  const navigate = (next: Section) => {
    if (selected) playback.pauseForNavigation();
    setSection(next);
    setSelectedShowTitle(null);
    setSelectedPlaylistId(null);
    if (next !== "collection") collections.setSelectedCollectionId(null);
    setQuery("");
  };
  const openCollection = (id: string) => {
    if (selected) playback.pauseForNavigation();
    collections.setSelectedCollectionId(id);
    setSection("collection");
    setQuery("");
    data.setError(null);
  };
  const openMenu = (event: ReactMouseEvent, target: MenuTarget, hiddenView = false) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: Math.min(event.clientX, window.innerWidth - 250), y: Math.min(event.clientY, window.innerHeight - 400), target, hiddenView });
  };
  const clearHistory = async () => {
    const ids = data.items.filter(item => item.lastWatchedAt || item.progressSeconds > 0).map(item => item.id);
    if (ids.length && window.confirm("Clear all watch history for this profile?")) await mediaActions.resetWatched(ids);
  };
  const scanOneLibrary = async (kind: "movie" | "tv" | "special" | `collection:${string}`, label: string) => {
    if (!window.confirm(`Scan ${label} for new or changed media?`)) return;
    try { data.setError(`Scanning ${label}…`); await rescanLibraryKind(kind); await data.refresh(); data.setError(null); }
    catch (cause) { data.setError(String(cause)); }
  };
  const openRecommendation = (entry: RecommendationEntry) => {
    if (entry.targetType === "movie") {
      const movie = catalog.movies.find(item => socialKey(item) === entry.targetKey || item.title === entry.title);
      if (movie) playback.startPlayback(movie);
    } else {
      const show = catalog.shows.find(value => socialKey(value.representative) === entry.targetKey || value.title === entry.title);
      if (show) { setSection("tv"); setSelectedShowTitle(show.title); setQuery(""); }
    }
  };

  if (!data.authChecked) return <div className="login-shell"><div className="login-card"><div className="brand-mark">O</div><h1>Onyx</h1><p>Connecting to your media server…</p></div></div>;
  if (!isDesktop && !data.authenticated) return <div className="login-shell"><form className="login-card" onSubmit={profiles.submitLogin}><div className="brand-mark">O</div><p className="eyebrow">PRIVATE LIBRARY</p><h1>Onyx</h1><p>Enter the server access password.</p><input type="password" autoFocus autoComplete="current-password" value={profiles.loginPassword} onChange={event => profiles.setLoginPassword(event.target.value)} placeholder="Password"/>{data.error && <div className="login-error">{data.error}</div>}<button className="primary" type="submit" disabled={profiles.loginBusy || !profiles.loginPassword}>{profiles.loginBusy ? "Signing in…" : "Sign in"}</button></form></div>;

  const sidebar = <Sidebar section={section} collections={collections.collections} libraryOrder={data.libraryOrder} selectedCollectionId={collections.selectedCollectionId} pausedMedia={playback.pausedMedia} onNavigate={navigate} onOpenCollection={openCollection} onToggleCollectionLock={source => collections.lockOrRequestUnlock({ ...source, items: collections.collections.find(item => item.id === source.id)?.items ?? [] }, openCollection)} onScanLibrary={scanOneLibrary} onClearHistory={clearHistory} onResume={playback.resumePaused}/>;
  const shell = projectorMode ? <div className="projector-shell">{data.error && <div className="error-banner">{data.error}</div>}<SleepTimer projector/>{activeUser ? <LiveChannelsView media={data.items} onOpenSettings={() => undefined} projector userName={activeUser.name}/> : <div className="live-empty">Loading profile…</div>}</div> : <div className={`app-shell ${isDesktop ? "desktop-shell" : ""}`}>
    <TopBar selected={selected} section={section} query={query} status={data.status} activeUser={activeUser} activeUserId={data.activeUserId} users={data.users} avatars={data.avatars} profileMenu={profiles.profileMenu} isDesktop={isDesktop} onHome={() => navigate("home")} onQuery={setQuery} onToggleProfiles={() => profiles.setProfileMenu(value => !value)} onSwitchUser={profiles.switchUser} onOpenHidden={profiles.openHidden} onSignOut={profiles.signOut}/>
    {sidebar}
    {selected ? <PlayerPage item={selected} videoRef={playback.videoRef} sourceUrl={playback.sourceUrl} subtitleChoice={playback.subtitleChoice} playableSubtitles={playback.playableSubtitles} episodeLabel={episodeLabel} onBack={playback.closePlayer} onPlay={() => collections.markPlaying(selected)} onPause={() => { void playback.saveProgress(true); collections.markIdle(selected); }} onEnded={() => collections.markIdle(selected)} onTimeUpdate={() => void playback.saveProgress()} onSubtitleChange={playback.changeSubtitle} social={isDesktop && selected.kind === "movie" ? <SocialBar targetType="movie" targetKey={socialKey(selected)} title={selected.title} posterUrl={selected.posterUrl} users={data.users}/> : undefined}/> : <main className="content">
      {data.error && <div className="error-banner">{data.error}</div>}
      {section === "home" && <HomePage activeUser={activeUser} isDesktop={isDesktop} continueWatchingLayout={data.continueWatchingLayout} continueItems={catalog.continueItems} recentShows={catalog.recentShows} recentMovies={catalog.recentMovies} onNavigate={navigate} onRecommendation={openRecommendation} onPlay={playback.startPlayback} onItemMenu={(event, item) => openMenu(event, { type: "item", item })} onOpenShow={show => { setSection("tv"); setSelectedShowTitle(show.title); }} onShowMenu={(event, show) => openMenu(event, { type: "show", show })}/>}
      {section === "movies" && <MediaGalleryPage eyebrow="MOVIES" title="Movies" subtitle={`${catalog.movies.length} titles`} items={catalog.visibleMovies} onPlay={playback.startPlayback} onMenu={(event, item) => openMenu(event, { type: "item", item })}/>}
      {section === "tv" && <TelevisionPage shows={catalog.visibleShows} totalShows={catalog.shows.length} totalEpisodes={catalog.episodes.length} selectedShow={catalog.selectedShow} showEpisodes={catalog.showEpisodes} seasonGroups={catalog.seasonGroups} backdropUrl={catalog.selectedShow?.representative.backdropUrl} view={tvView} social={isDesktop && catalog.selectedShow ? <SocialBar targetType="show" targetKey={socialKey(catalog.selectedShow.representative)} title={catalog.selectedShow.title} posterUrl={catalog.selectedShow.representative.posterUrl} users={data.users}/> : undefined} allWatched={allWatched} groupProgress={groupPercent} onOpenShow={show => { setSelectedShowTitle(show.title); setQuery(""); }} onShowMenu={(event, show) => openMenu(event, { type: "show", show })} onBack={() => { setSelectedShowTitle(null); setQuery(""); }} onView={setTvView} onPlay={playback.startPlayback} onItemMenu={(event, item) => openMenu(event, { type: "item", item })} onSeasonMenu={(event, season, items) => catalog.selectedShow && openMenu(event, { type: "season", showTitle: catalog.selectedShow.title, season, items })}/>}
      {section === "specials" && <SpecialsPage total={catalog.specials.length} groups={catalog.specialGroups} onPlay={playback.startPlayback} onMenu={(event, item) => openMenu(event, { type: "item", item })}/>}
      {section === "collection" && collections.selectedCollection?.protected && !collections.sessions[collections.selectedCollection.id] && <ProtectedCollectionGate name={collections.selectedCollection.name} onUnlock={collections.unlock}/>}
      {section === "collection" && collections.selectedCollection && (!collections.selectedCollection.protected || collections.sessions[collections.selectedCollection.id]) && <CollectionPage name={collections.selectedCollection.name} total={collections.selectedCollection.items.length} groups={collections.groups} continueItems={collections.continueItems} onPlay={playback.startPlayback} onMenu={(event, item) => openMenu(event, { type: "item", item })}/>}
      {section === "live" && <LiveChannelsView media={data.items} onOpenSettings={() => navigate("settings")}/>}
      {section === "music" && <MusicView/>}
      {section === "history" && <MediaGalleryPage eyebrow="HISTORY" title="Recently watched" subtitle={`${catalog.historyItems.length} items`} items={catalog.visibleHistory} onPlay={playback.startPlayback} onMenu={(event, item) => openMenu(event, { type: "item", item })}/>}
      {section === "playlists" && <PlaylistsPage playlists={data.playlists} selected={catalog.selectedPlaylist} selectedItems={catalog.playlistItems} library={data.items} onCreate={() => void playlistActions.create()} onOpen={playlist => setSelectedPlaylistId(playlist.id)} onBack={() => setSelectedPlaylistId(null)} onPlay={playback.startPlayback} onItemMenu={(event, item) => openMenu(event, { type: "item", item })} onPlaylistMenu={(event, playlist) => openMenu(event, { type: "playlist", playlist })}/>}
      {section === "analytics" && <AnalyticsPage analytics={data.analytics}/>}
      {section === "settings" && <SettingsPage onChanged={() => void data.refresh()}/>}
      {section === "hidden" && <HiddenMediaPage movies={catalog.hiddenMovies} shows={catalog.hiddenShows} onPlay={playback.startPlayback} onMovieMenu={(event, item) => openMenu(event, { type: "item", item }, true)} onShowMenu={(event, show) => openMenu(event, { type: "show", show }, true)}/>}
    </main>}
    {contextMenu && <ContextMenu menu={contextMenu} isDesktop={isDesktop} playlists={data.playlists} selectedPlaylist={catalog.selectedPlaylist} onClose={() => setContextMenu(null)} onPlay={playback.startPlayback} onOpenShow={show => { setSection("tv"); setSelectedShowTitle(show.title); }} onReset={ids => void mediaActions.resetWatched(ids)} onAdd={(id, ids) => void playlistActions.addItems(id, ids)} onCreate={ids => void playlistActions.create(ids)} onFixMatch={item => setMatchItem(item)} onEditLocal={item => void mediaActions.editItem(item)} onResetLocal={item => void mediaActions.resetIdentificationFor(item)} onFixShowMatch={show => setMatchItem(show.representative)} onEditLocalShow={show => void mediaActions.editShow(show)} onHideItem={(item, hidden) => void mediaActions.hideItem(item, hidden)} onHideShow={(show, hidden) => void mediaActions.hideShow(show, hidden)} onRemovePlaylistItem={(id, mediaId) => void playlistActions.removeItem(id, mediaId)} onOpenPlaylist={playlist => { setSection("playlists"); setSelectedPlaylistId(playlist.id); }} onDeletePlaylist={playlist => void playlistActions.remove(playlist)}/>}
    {matchItem && <MetadataMatchDialog item={matchItem} onClose={() => setMatchItem(null)} onMatched={updated => { data.setItems(updated); void data.refresh(); }}/>}
    {Object.entries(collections.sessions).filter(([, session]) => session.idleSince).map(([id, session]) => <CollectionRelockIndicator key={id} name={collections.collections.find(source => source.id === id)?.name ?? "Collection"} idleSince={session.idleSince!}/>)}
  </div>;
  return <>{isDesktop && <WindowBar/>}{shell}</>;
}

export default App;
