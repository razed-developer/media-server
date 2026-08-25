import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { FormEvent, MouseEvent as ReactMouseEvent } from 'react';
import {
  ArrowLeft, BarChart3, Check, ChevronDown, EyeOff, Expand, Film, FolderOpen, History,
  Home, Layers3, List, ListVideo, LogOut, Maximize2, Minus, Music2, Play,
  Plus, Radio, Search, Settings, Star, Subtitles, Tv, UserRound, X,
} from 'lucide-react';
import {
  addToPlaylist, createPlaylist, deletePlaylist, getActiveUserId, getAnalytics,
  getAuthStatus, getServerStatus, getUserPreferences, identifyItem, identifyShow,
  isTauriDesktop, listMedia, listPlaylists, listUsers, login, logout,
  removeFromPlaylist, resetIdentification, resetWatchStatus, resolveMediaUrl,
  saveProgress as persistProgress, setActiveUserId, setHidden,
} from './api';
import type { AnalyticsSummary, MediaItem, Playlist, ServerStatus, ThemeName, UserProfile } from './types';
import { listUserAvatars, type RecommendationEntry, type UserAvatar } from './userFeaturesApi';
import { LiveChannelsView } from './components/LiveChannelsView';
import { MetadataMatchDialog } from './components/MetadataMatchDialog';
import { MusicView } from './components/MusicView';
import { preloadMusicLibrary } from './musicLibraryCache';
import { RecommendationsRail } from './components/RecommendationsRail';
import { SettingsPage } from './components/SettingsPage';
import { SocialBar } from './components/SocialBar';
import { SleepTimer } from './components/SleepTimer';
import { AvatarBadge } from './components/UserAvatarPicker';
import { useOnyxDialog } from './components/OnyxDialogProvider';

const fallbackStatus: ServerStatus = {
  running: false,
  localUrl: 'http://127.0.0.1:8765',
  itemCount: 0,
  ffprobeAvailable: false,
  ffmpegAvailable: false,
};
const emptyAnalytics: AnalyticsSummary = { totalSeconds: 0, movieSeconds: 0, tvSeconds: 0, shows: [], genres: [] };

type Section = 'home' | 'movies' | 'tv' | 'specials' | 'live' | 'music' | 'history' | 'playlists' | 'analytics' | 'settings' | 'hidden';
type TvView = 'season' | 'list';
type TvShow = { title: string; episodes: MediaItem[]; representative: MediaItem; seasons: number; addedAt: number };
type MenuTarget =
  | { type: 'item'; item: MediaItem }
  | { type: 'show'; show: TvShow }
  | { type: 'season'; showTitle: string; season: number; items: MediaItem[] }
  | { type: 'playlist'; playlist: Playlist };
type ContextMenuState = { x: number; y: number; target: MenuTarget; hiddenView?: boolean } | null;

const episodeLabel = (item: MediaItem) => item.season == null || item.episode == null
  ? item.title
  : `S${String(item.season).padStart(2, '0')} E${String(item.episode).padStart(2, '0')}${item.episodeEnd != null ? `-${String(item.episodeEnd).padStart(2, '0')}` : ''} · ${item.title}`;
const watched = (item: MediaItem) => Boolean(item.durationSeconds && item.progressSeconds / item.durationSeconds >= .9);
const percent = (item: MediaItem) => item.durationSeconds ? Math.min(100, Math.max(0, item.progressSeconds / item.durationSeconds * 100)) : 0;
const groupPercent = (items: MediaItem[]) => items.length ? items.reduce((sum, item) => sum + percent(item), 0) / items.length : 0;
const allWatched = (items: MediaItem[]) => items.length > 0 && items.every(watched);
const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};
const socialKey = (item: MediaItem) => item.metadataEntityId ?? (item.provider && item.providerId ? `${item.provider}:${item.providerId}` : `media:${item.id}`);
const profileSlug=(name:string)=>name.trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const routeSlug=()=>window.location.pathname.split('/').filter(Boolean)[0]?.toLowerCase()??'';
const projectorProfileSlug=()=>routeSlug().startsWith('live-')?routeSlug().slice(5):undefined;
const requestedProfileSlug=()=>(projectorProfileSlug()??routeSlug())||undefined;
const numberPrompt = (label: string, current?: number) => {
  const value = window.prompt(label, current == null ? '' : String(current));
  if (value == null) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

function WindowBar() {
  const run = async (action: 'minimize' | 'maximize' | 'fullscreen' | 'close') => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    if (action === 'minimize') await win.minimize();
    else if (action === 'maximize') await win.toggleMaximize();
    else if (action === 'close') await win.close();
    else {
      const next = !(await win.isFullscreen());
      await win.setFullscreen(next);
      document.body.classList.toggle('app-fullscreen', next);
    }
  };
  return <div className="window-bar" data-tauri-drag-region onDoubleClick={() => void run('maximize')}>
    <div className="window-drag" data-tauri-drag-region>Onyx</div>
    <div className="window-controls">
      <button aria-label="Minimize" onClick={() => void run('minimize')}><Minus size={13} /></button>
      <button aria-label="Maximize" onClick={() => void run('maximize')}><Maximize2 size={12} /></button>
      <button aria-label="Fullscreen" onClick={() => void run('fullscreen')}><Expand size={12} /></button>
      <button className="window-close" aria-label="Close" onClick={() => void run('close')}><X size={13} /></button>
    </div>
  </div>;
}

function ProgressLine({ value }: { value: number }) {
  return <div className="mini-progress"><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}
function WatchedBadge({ done }: { done: boolean }) {
  return done ? <span className="watched-badge" title="Watched"><Check size={13} /></span> : null;
}
function MediaCard({ item, onPlay, onMenu, artwork = 'default' }: { item: MediaItem; onPlay: (item: MediaItem) => void; onMenu: (event: ReactMouseEvent, item: MediaItem) => void; artwork?: 'default' | 'poster' | 'thumbnail' }) {
  const landscape = artwork === 'thumbnail' || (artwork === 'default' && item.kind === 'episode');
  const image = artwork === 'poster' ? (item.posterUrl ?? item.thumbnailUrl) : artwork === 'thumbnail' ? (item.thumbnailUrl ?? item.posterUrl) : item.kind === 'episode' ? item.thumbnailUrl : item.posterUrl;
  return <article className={`media-card ${landscape ? 'episode-card' : ''}`} onClick={() => onPlay(item)} onContextMenu={event => onMenu(event, item)}>
    <div className="poster">
      {image ? <img className="poster-image" src={resolveMediaUrl(image)} alt="" loading="lazy" /> : <div className="poster-letter">{item.title.charAt(0)}</div>}
      <WatchedBadge done={watched(item)} />
      <button aria-label={`Play ${item.title}`}><Play fill="currentColor" size={21} /></button>
    </div>
    <ProgressLine value={percent(item)} />
    <h3>{item.title}</h3>
    <p>{item.kind === 'episode' ? episodeLabel(item) : item.kind === 'special' ? 'Special' : item.year ?? 'Movie'}</p>
  </article>;
}
function ShowCard({ show, onOpen, onMenu }: { show: TvShow; onOpen: (show: TvShow) => void; onMenu: (event: ReactMouseEvent, show: TvShow) => void }) {
  const primary = resolveMediaUrl(show.representative.posterUrl), fallback = resolveMediaUrl(show.representative.thumbnailUrl);
  return <article className="media-card show-card" onClick={() => onOpen(show)} onContextMenu={event => onMenu(event, show)}>
    <div className="poster">
      {primary || fallback ? <img className="poster-image" src={primary || fallback} alt="" loading="lazy" onError={event => {
        if (fallback && event.currentTarget.src !== fallback) event.currentTarget.src = fallback;
        else event.currentTarget.style.display = 'none';
      }} /> : <div className="poster-letter">{show.title.charAt(0)}</div>}
      <WatchedBadge done={allWatched(show.episodes)} />
      <button aria-label={`Open ${show.title}`}><Play size={21} /></button>
    </div>
    <ProgressLine value={groupPercent(show.episodes)} />
    <h3>{show.title}</h3>
    <p>{show.seasons} {show.seasons === 1 ? 'season' : 'seasons'} · {show.episodes.length} episodes</p>
  </article>;
}
function Rail({ title, actionLabel, onAction, children }: { title: string; actionLabel?: string; onAction?: () => void; children: React.ReactNode }) {
  return <section className="home-rail"><div className="rail-heading"><h2>{title}</h2>{onAction && <button onClick={onAction}>{actionLabel ?? 'View all'} →</button>}</div><div className="rail-scroll">{children}</div></section>;
}
function MetadataSummary({ item }: { item: MediaItem }) {
  if (!item.overview && !item.genres?.length && item.rating == null && !item.releaseDate) return null;
  return <div className="metadata-detail">
    <div className="metadata-chips">
      {item.releaseDate && <span>{item.releaseDate}</span>}
      {item.rating != null && <span className="metadata-rating"><Star size={12} fill="currentColor" /> {item.rating.toFixed(1)}</span>}
      {item.genres?.map(genre => <span key={genre}>{genre}</span>)}
      {item.provider && item.providerId && <span>{item.provider.toUpperCase()} #{item.providerId}</span>}
    </div>
    {item.overview && <p>{item.overview}</p>}
  </div>;
}

function App() {
  const isDesktop = isTauriDesktop();
  const projectorMode = !isDesktop && Boolean(projectorProfileSlug());
  const dialog = useOnyxDialog();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [hiddenItems, setHiddenItems] = useState<MediaItem[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [avatars, setAvatars] = useState<Record<string, UserAvatar?];�h��춻�q�^uctedPlaylist && <><PageHero eyebrow="PLAYLISTS" title="Playlists" subtitle={`${playlists.length} playlists`} /><button className="primary" onClick={() => void makePlaylist()}><Plus size={18} />New playlist</button><section className="playlist-grid">{playlists.map(playlist => { const first = playlist.mediaIds.map(id => items.find(item => item.id === id)).find(Boolean); return <article className="playlist-card" key={playlist.id} onClick={() => setSelectedPlaylistId(playlist.id)} onContextMenu={event => openMenu(event, { type: 'playlist', playlist })}>{first?.posterUrl || first?.thumbnailUrl ? <img src={resolveMediaUrl(first.posterUrl || first.thumbnailUrl)} alt="" /> : <div className="playlist-placeholder"><ListVideo size={40} /></div>}<div><h3>{playlist.name}</h3><p>{playlist.mediaIds.length} items</p></div></article>; })}</section></>}
      {section === 'playlists' && selectedPlaylist && <><PageHero eyebrow="PLAYLIST" title={selectedPlaylist.name} subtitle={`${playlistItems.length} items`} /><button className="back-button playlist-back" onClick={() => setSelectedPlaylistId(null)}><ArrowLeft size={18} />All playlists</button><section className="gallery">{playlistItems.map(item => <MediaCard key={item.id} item={item} onPlay={startPlayback} onMenu={(e, v) => openMenu(e, { type: 'item', item: v })} />)}</section></>}
      {section === 'analytics' && <AnalyticsPage analytics={analytics} />}
      {section === 'settings' && <SettingsPage onChanged={() => void refresh()} />}
      {section === 'hidden' && <><PageHero eyebrow="HIDDEN" title="Hidden media" subtitle={`${hiddenMovies.length} movies · ${hiddenShows.length} shows`} /><h2 className="subsection-title">Movies</h2><section className="gallery">{hiddenMovies.map(item => <MediaCard key={item.id} item={item} onPlay={startPlayback} onMenu={(e, v) => openMenu(e, { type: 'item', item: v }, true)} />)}</section><h2 className="subsection-title">TV Shows</h2><section className="gallery show-gallery">{hiddenShows.map(show => <ShowCard key={show.title} show={show} onOpen={() => {}} onMenu={(e, v) => openMenu(e, { type: 'show', show: v }, true)} />)}</section></>}
    </main>}
    {contextMenu && <ContextMenu menu={contextMenu} isDesktop={isDesktop} playlists={playlists} selectedPlaylist={selectedPlaylist} onClose={() => setContextMenu(null)} onPlay={startPlayback} onOpenShow={show => { setSection('tv'); setSelectedShowTitle(show.title); }} onReset={ids => void resetWatched(ids)} onAdd={(id, ids) => void addIdsToPlaylist(id, ids)} onCreate={ids => void makePlaylist(ids)} onFixMatch={item => setMatchItem(item)} onEditLocal={item => void editLocalIdentification(item)} onResetLocal={item => void resetLocalIdentification(item)} onFixShowMatch={show => setMatchItem(show.representative)} onEditLocalShow={show => void editLocalShow(show)} onHideItem={(item, hidden) => void hideMedia(item, hidden)} onHideShow={(show, hidden) => void hideShow(show, hidden)} onRemovePlaylistItem={(id, mediaId) => void removePlaylistItem(id, mediaId)} onOpenPlaylist={playlist => { setSection('playlists'); setSelectedPlaylistId(playlist.id); }} onDeletePlaylist={playlist => void removePlaylist(playlist)} />}
    {matchItem && <MetadataMatchDialog item={matchItem} onClose={() => setMatchItem(null)} onMatched={updated => { setItems(updated); void refresh(); }} />}
  </div>;
  return <>{isDesktop && <WindowBar />}{shell}</>;
}

function PageHero({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return <section className="page-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{subtitle}</p></section>;
}
function AnalyticsBars({ title, entries }: { title: string; entries: { label: string; seconds: number }[] }) {
  const max = Math.max(1, ...entries.map(entry => entry.seconds));
  return <section className="analytics-panel"><h2>{title}</h2>{entries.length ? entries.map(entry => <div className="analytics-row" key={entry.label}><span>{entry.label}</span><div><i style={{ width: `${entry.seconds / max * 100}%` }} /></div><strong>{formatTime(entry.seconds)}</strong></div>) : <p>No data recorded yet.</p>}</section>;
}
function AnalyticsPage({ analytics }: { analytics: AnalyticsSummary }) {
  return <div className="analytics-page"><PageHero eyebrow="ANALYTICS" title="Your viewing" subtitle={`${formatTime(analytics.totalSeconds)} watched in this profile`} /><section className="stat-grid"><div><span>Total</span><strong>{formatTime(analytics.totalSeconds)}</strong></div><div><span>Movies</span><strong>{formatTime(analytics.movieSeconds)}</strong></div><div><span>TV</span><strong>{formatTime(analytics.tvSeconds)}</strong></div></section><AnalyticsBars title="TV shows" entries={analytics.shows} /><AnalyticsBars title="Genres" entries={analytics.genres ?? []} />{!analytics.genres?.length && <section className="analytics-note"><h3>Genre metadata</h3><p>Genre analytics populate as movies and shows are matched to a metadata provider.</p></section>}</div>;
}

function ContextMenu({ menu, isDesktop, playlists, selectedPlaylist, onClose, onPlay, onOpenShow, onReset, onAdd, onCreate, onFixMatch, onEditLocal, onResetLocal, onFixShowMatch, onEditLocalShow, onHideItem, onHideShow, onRemovePlaylistItem, onOpenPlaylist, onDeletePlaylist }: {
  menu: NonNullable<ContextMenuState>; isDesktop: boolean; playlists: Playlist[]; selectedPlaylist: Playlist | null; onClose: () => void; onPlay: (item: MediaItem) => void; onOpenShow: (show: TvShow) => void; onReset: (ids: string[]) => void; onAdd: (playlistId: string, ids: string[]) => void; onCreate: (ids: string[]) => void; onFixMatch: (item: MediaItem) => void; onEditLocal: (item: MediaItem) => void; onResetLocal: (item: MediaItem) => void; onFixShowMatch: (show: TvShow) => void; onEditLocalShow: (show: TvShow) => void; onHideItem: (item: MediaItem, hidden: boolean) => void; onHideShow: (show: TvShow, hidden: boolean) => void; onRemovePlaylistItem: (playlistId: string, mediaId: string) => void; onOpenPlaylist: (playlist: Playlist) => void; onDeletePlaylist: (playlist: Playlist) => void;
}) {
  const target = menu.target;
  const ids = target.type === 'item' ? [target.item.id] : target.type === 'show' ? target.show.episodes.map(i => i.id) : target.type === 'season' ? target.items.map(i => i.id) : [];
  const label = target.type === 'item' ? target.item.title : target.type === 'show' ? target.show.title : target.type === 'season' ? `Season ${target.season}` : target.playlist.name;
  const action = (fn: () => void) => () => { fn(); onClose(); };
  return <div className="context-menu" style={{ left: menu.x, top: menu.y }} onClick={event => event.stopPropagation()}>
    <div className="context-title">{label}</div>
    {target.type === 'item' && <button onClick={action(() => onPlay(target.item))}>Play</button>}
    {target.type === 'show' && !menu.hiddenView && <button onClick={action(() => onOpenShow(target.show))}>Open show</button>}
    {target.type === 'playlist' && <button onClick={action(() => onOpenPlaylist(target.playlist))}>Open playlist</button>}
    {target.type !== 'playlist' && !menu.hiddenView && <button onClick={action(() => onReset(ids))}>Reset watch status</button>}
    {target.type === 'item' && !menu.hiddenView && <button onClick={action(() => onHideItem(target.item, true))}>Hide for this user</button>}
    {target.type === 'show' && !menu.hiddenView && <button onClick={action(() => onHideShow(target.show, true))}>Hide show for this user</button>}
    {target.type === 'item' && menu.hiddenView && <button onClick={action(() => onHideItem(target.item, false))}>Unhide</button>}
    {target.type === 'show' && menu.hiddenView && <button onClick={action(() => onHideShow(target.show, false))}>Unhide show</button>}
    {target.type !== 'playlist' && !menu.hiddenView && <><div className="context-separator" /><div className="context-label">Add to playlist</div>{playlists.map(playlist => <button key={playlist.id} onClick={action(() => onAdd(playlist.id, ids))}>{playlist.name}</button>)}<button onClick={action(() => onCreate(ids))}>+ New playlist…</button></>}
    {target.type === 'item' && selectedPlaylist?.mediaIds.includes(target.item.id) && <button onClick={action(() => onRemovePlaylistItem(selectedPlaylist.id, target.item.id))}>Remove from this playlist</button>}
    {isDesktop && target.type === 'item' && <><div className="context-separator" /><button onClick={action(() => onFixMatch(target.item))}>Fix Match…</button><button onClick={action(() => onEditLocal(target.item))}>Edit local identification…</button><button onClick={action(() => onResetLocal(target.item))}>Reset local identification</button></>}
    {isDesktop && target.type === 'show' && <><div className="context-separator" /><button onClick={action(() => onFixShowMatch(target.show))}>Fix Match…</button><button onClick={action(() => onEditLocalShow(target.show))}>Edit local show name…</button></>}
    {target.type === 'playlist' && <><div className="context-separator" /><button className="danger" onClick={action(() => onDeletePlaylist(target.playlist))}>Delete playlist</button></>}
  </div>;
}

export default App;
