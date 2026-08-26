import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { FormEvent, MouseEvent as ReactMouseEvent } from 'react';
import {
  FolderOpen, Lock,
  UserRound, X,
} from 'lucide-react';
import {
  addToPlaylist, createPlaylist, deletePlaylist, getActiveUserId, getAnalytics,
  getAuthStatus, getServerStatus, getUserPreferences, identifyItem, identifyShow,
  isTauriDesktop, listMedia, listPlaylists, listUsers, lockCollectionSource, login, logout,
  removeFromPlaylist, resetIdentification, resetWatchStatus, resolveMediaUrl,
  rescanLibraryKind, saveProgress as persistProgress, setActiveUserId, setHidden, touchCollectionSource, unlockCollectionSource,
} from './api';
import type { AnalyticsSummary, ContinueWatchingLayout, LibraryNavigationId, MediaItem, Playlist, ServerStatus, ThemeName, UserProfile } from './types';
import { loadContinueWatchingLayout, loadLibraryOrder } from './preferences/navigationPreferences';
import { listUserAvatars, type RecommendationEntry, type UserAvatar } from './userFeaturesApi';
import { LiveChannelsView } from './components/LiveChannelsView';
import { MetadataMatchDialog } from './components/MetadataMatchDialog';
import { MusicView } from './components/MusicView';
import { preloadMusicLibrary } from './musicLibraryCache';
import { SettingsPage } from './components/SettingsPage';
import { SocialBar } from './components/SocialBar';
import { SleepTimer } from './components/SleepTimer';
import { useOnyxDialog } from './components/OnyxDialogProvider';
import { WindowBar } from './components/navigation/WindowBar';
import { Sidebar } from './components/navigation/Sidebar';
import { HomePage } from './pages/HomePage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { CollectionRelockIndicator, ProtectedCollectionGate } from './features/collections/CollectionAccess';
import { TopBar } from './components/navigation/TopBar';
import { MediaGalleryPage } from './pages/MediaGalleryPage';
import { SpecialsPage } from './pages/SpecialsPage';
import { CollectionPage } from './pages/CollectionPage';
import { HiddenMediaPage } from './pages/HiddenMediaPage';
import { PlayerPage } from './pages/PlayerPage';
import { PlaylistsPage } from './pages/PlaylistsPage';
import { ContextMenu, type ContextMenuState, type MenuTarget, type TvShow } from './components/menus/ContextMenu';
import { TelevisionPage } from './pages/TelevisionPage';
import { allWatched, episodeLabel, groupPercent, socialKey, watched } from './utils/media';
import { profileSlug, projectorProfileSlug, requestedProfileSlug } from './utils/routes';

const fallbackStatus: ServerStatus = {
  running: false,
  localUrl: 'http://127.0.0.1:8765',
  itemCount: 0,
  ffprobeAvailable: false,
  ffmpegAvailable: false,
};
const emptyAnalytics: AnalyticsSummary = { totalSeconds: 0, movieSeconds: 0, tvSeconds: 0, shows: [], genres: [] };

type Section = 'home' | 'movies' | 'tv' | 'specials' | 'collection' | 'live' | 'music' | 'history' | 'playlists' | 'analytics' | 'settings' | 'hidden';
type CollectionSession = { token: string; idleSince?: number };
type TvView = 'season' | 'list';

const numberPrompt = (label: string, current?: number) => {
  const value = window.prompt(label, current == null ? '' : String(current));
  if (value == null) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const collectionPlaybackUrl = (item: MediaItem, sessions: Record<string, CollectionSession>) => {
  const url = resolveMediaUrl(item.streamUrl);
  const token = item.collectionSourceId ? sessions[item.collectionSourceId]?.token : undefined;
  if (!url || !token) return url;
  return `${url}${url.includes('?') ? '&' : '?'}unlock=${encodeURIComponent(token)}`;
};

function App() {
  const isDesktop = isTauriDesktop();
  const projectorMode = !isDesktop && Boolean(projectorProfileSlug());
  const dialog = useOnyxDialog();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [hiddenItems, setHiddenItems] = useState<MediaItem[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [avatars, setAvatars] = useState<Record<string, UserAvatar>>({});
  const [activeUserId, setActiveUserState] = useState(getActiveUserId());
  const [profileMenu, setProfileMenu] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [status, setStatus] = useState<ServerStatus>(fallbackStatus);
  const [analytics, setAnalytics] = useState<AnalyticsSummary>(emptyAnalytics);
  const [, setThemeState] = useState<ThemeName>('onyx');
  const [continueWatchingLayout, setContinueWatchingLayout] = useState<ContinueWatchingLayout>('all');
  const [libraryOrder, setLibraryOrder] = useState<LibraryNavigationId[]>([]);
  const [query, setQuery] = useState('');
  const [section, setSection] = useState<Section>(projectorMode ? 'live' : 'home');
  const [tvView, setTvView] = useState<TvView>('season');
  const [selectedShowTitle, setSelectedShowTitle] = useState<string | null>(null);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [collectionSessions, setCollectionSessions] = useState<Record<string, CollectionSession>>({});
  const [, setCollectionClock] = useState(Date.now());
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [pausedMedia, setPausedMedia] = useState<MediaItem | null>(null);
  const [matchItem, setMatchItem] = useState<MediaItem | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [error, setError] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(isDesktop);
  const [authenticated, setAuthenticated] = useState(isDesktop);
  const [loginPassword, setLoginPassword] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [subtitleChoice, setSubtitleChoice] = useState('off');
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastProgressSaveRef = useRef(0);
  const lastWatchTickRef = useRef(Date.now());
  const activeUser = users.find(user => user.id === activeUserId) ?? users[0];

  const applyTheme = (value: ThemeName) => { setThemeState(value); document.documentElement.dataset.theme = value; };
  const refresh = async () => {
    const started=performance.now();
    try {
      window.dispatchEvent(new CustomEvent('onyx-startup-status',{detail:{message:'Loading shows…'}}));
      const [library, serverStatus, prefs] = await Promise.all([listMedia(), getServerStatus(), getUserPreferences()]);
      setItems(library); setStatus(serverStatus); applyTheme(prefs.theme); setContinueWatchingLayout(loadContinueWatchingLayout(getActiveUserId(), prefs.splitContinueWatching)); setLibraryOrder(loadLibraryOrder(getActiveUserId())); setError(null);
      const optional = await Promise.allSettled([listPlaylists(), getAnalytics(), listUsers(), listUserAvatars()] as const);
      const playlistData = optional[0].status === 'fulfilled' ? optional[0].value : [];
      setPlaylists(playlistData);
      if (optional[1].status === 'fulfilled') setAnalytics(optional[1].value);
      if (optional[2].status === 'fulfilled') setUsers(optional[2].value);
      if (optional[3].status === 'fulfilled') setAvatars(Object.fromEntries(optional[3].value.map(avatar => [avatar.userId, avatar])));
      const showMap=new Map<string,{title:string;posterUrl?:string;episodeCount:number}>();
      for(const item of library){if(item.kind!=='episode'||!item.showTitle)continue;const current=showMap.get(item.showTitle);showMap.set(item.showTitle,{title:item.showTitle,posterUrl:current?.posterUrl??item.posterUrl??item.thumbnailUrl,episodeCount:(current?.episodeCount??0)+1})}
      sessionStorage.setItem(`onyx-live-shows:${getActiveUserId()}`,JSON.stringify([...showMap.values()].sort((a,b)=>a.title.localeCompare(b.title))));
      sessionStorage.setItem(`onyx-live-criteria:${getActiveUserId()}`,JSON.stringify({shows:[...showMap.keys()].sort((a,b)=>a.localeCompare(b)),genres:[...new Set(library.flatMap(item=>item.genres??[]))].sort((a,b)=>a.localeCompare(b)),playlists:playlistData}));
      window.dispatchEvent(new CustomEvent('onyx-startup-status',{detail:{message:'Preparing your library…'}}));
      const elapsed=Math.round(performance.now()-started);if(isDesktop)void invoke('record_client_activity',{level:elapsed>1000?'warning':'info',category:'Performance',message:`Initial UI data load completed in ${elapsed} ms for ${library.length} media items`}).catch(()=>{});
    } catch (cause) { setError(String(cause)); }
  };
  const loadUsers = async () => {
    const values = await listUsers(); let id = getActiveUserId();
    const requested=requestedProfileSlug();const matched=requested?values.find(user=>profileSlug(user.name)===requested):undefined;if(matched){id=matched.id;setActiveUserId(id);setActiveUserState(id)}
    if (!values.some(user => user.id === id)) { id = values[0]?.id ?? 'owner'; setActiveUserId(id); setActiveUserState(id); }
    setUsers(values); return id;
  };
  useEffect(() => { let cancelled=false; const bootstrap = async () => {
    if (!isDesktop) { try { const auth = await getAuthStatus(); setAuthenticated(auth.authenticated); setAuthChecked(true); if (!auth.authenticated) return; } catch (cause) { setAuthChecked(true); setError(String(cause)); return; } }
    while(!cancelled){try { window.dispatchEvent(new CustomEvent('onyx-startup-status',{detail:{message:'Connecting to server…'}}));await loadUsers(); await refresh();if(!cancelled)window.dispatchEvent(new Event('onyx-app-ready'));return; } catch (cause) { setError(String(cause));window.dispatchEvent(new CustomEvent('onyx-startup-status',{detail:{message:'Waiting for the Onyx server…'}}));if(!isDesktop)return;await new Promise(resolve=>window.setTimeout(resolve,750)); }}
  }; void bootstrap(); return()=>{cancelled=true}; }, []);
  useEffect(() => { const close = () => setContextMenu(null); window.addEventListener('click', close); window.addEventListener('blur', close); return () => { window.removeEventListener('click', close); window.removeEventListener('blur', close); }; }, []);
  useEffect(() => {
    const reloadSubtitles = () => { void listMedia().then(library => { setItems(library); setSelected(current => current ? (library.find(item => item.id === current.id) ?? current) : current); }).catch(() => undefined); };
    window.addEventListener('onyx-subtitle-downloaded', reloadSubtitles);
    return () => window.removeEventListener('onyx-subtitle-downloaded', reloadSubtitles);
  }, []);

  const movies = useMemo(() => items.filter(i => i.kind === 'movie'), [items]);
  const specials = useMemo(() => items.filter(i => i.kind === 'special'), [items]);
  const collections = useMemo(() => {
    const grouped = new Map<string, { id: string; name: string; protected: boolean; items: MediaItem[] }>();
    for (const item of items.filter(i => i.kind === 'collection' && i.collectionSourceId)) {
      const id = item.collectionSourceId!;
      const source = grouped.get(id) ?? { id, name: item.collectionSourceName ?? 'Collection', protected: Boolean(item.collectionProtected), items: [] };
      source.items.push(item); grouped.set(id, source);
    }
    return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);
  const selectedCollection = useMemo(() => collections.find(source => source.id === selectedCollectionId) ?? null, [collections, selectedCollectionId]);
  const collectionGroups = useMemo(() => {
    const grouped = new Map<string, MediaItem[]>();
    for (const item of selectedCollection?.items ?? []) { const folder = item.collectionFolder || 'Unsorted'; grouped.set(folder, [...(grouped.get(folder) ?? []), item]); }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([folder, values]) => ({ folder, values: [...values].sort((a, b) => a.title.localeCompare(b.title)) }));
  }, [selectedCollection]);
  const collectionContinueItems = useMemo(() => (selectedCollection?.items ?? []).filter(item => item.progressSeconds > 0 && (!item.durationSeconds || item.progressSeconds / item.durationSeconds < .995)).sort((a,b)=>(b.lastWatchedAt??0)-(a.lastWatchedAt??0)).slice(0,14), [selectedCollection]);
  const specialGroups = useMemo(() => {
    const order = ['Documentaries', 'Comedy Specials', 'Other Specials', 'Unmatched'];
    const groups = new Map<string, MediaItem[]>();
    for (const item of specials) {
      const genres = item.genres.map(genre => genre.toLowerCase());
      const category = !item.providerId ? 'Unmatched' : genres.includes('documentary') ? 'Documentaries' : genres.includes('comedy') ? 'Comedy Specials' : 'Other Specials';
      groups.set(category, [...(groups.get(category) ?? []), item]);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
      .map(([category, values]) => ({ category, values: [...values].sort((a, b) => a.title.localeCompare(b.title) || (a.year ?? 0) - (b.year ?? 0)) }));
  }, [specials]);
  const episodes = useMemo(() => items.filter(i => i.kind === 'episode').sort((a, b) => (a.showTitle ?? '').localeCompare(b.showTitle ?? '') || (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0)), [items]);
  const makeShows = (source: MediaItem[]) => {
    const grouped = new Map<string, MediaItem[]>();
    for (const episode of source.filter(i => i.kind === 'episode')) { const title = episode.showTitle?.trim() || 'TV'; grouped.set(title, [...(grouped.get(title) ?? []), episode]); }
    return [...grouped.entries()].map(([title, showEpisodes]) => ({ title, episodes: showEpisodes, representative: showEpisodes[0], seasons: new Set(showEpisodes.map(e => e.season ?? 0)).size, addedAt: Math.max(...showEpisodes.map(e => e.addedAt ?? 0)) })).sort((a, b) => a.title.localeCompare(b.title));
  };
  const shows = useMemo<TvShow[]>(() => makeShows(episodes), [episodes]);
  const hiddenShows = useMemo<TvShow[]>(() => makeShows(hiddenItems), [hiddenItems]);
  const hiddenMovies = useMemo(() => hiddenItems.filter(i => i.kind === 'movie'), [hiddenItems]);
  const generallyVisibleItems = useMemo(() => items.filter(item => !item.collectionProtected || Boolean(item.collectionSourceId && collectionSessions[item.collectionSourceId])), [items, collectionSessions]);
  const historyItems = useMemo(() => generallyVisibleItems.filter(item => Boolean(item.lastWatchedAt)).sort((a, b) => (b.lastWatchedAt ?? 0) - (a.lastWatchedAt ?? 0)), [generallyVisibleItems]);
  const continueItems = useMemo(() => generallyVisibleItems.filter(item => item.progressSeconds > 0 && (!item.durationSeconds || item.progressSeconds / item.durationSeconds < .995)).sort((a, b) => (b.lastWatchedAt ?? 0) - (a.lastWatchedAt ?? 0)).slice(0, 14), [generallyVisibleItems]);
  const recentMovies = useMemo(() => [...movies].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)).slice(0, 12), [movies]);
  const recentShows = useMemo(() => [...shows].sort((a, b) => b.addedAt - a.addedAt).slice(0, 12), [shows]);
  const selectedShow = useMemo(() => shows.find(s => s.title === selectedShowTitle) ?? null, [shows, selectedShowTitle]);
  const selectedPlaylist = useMemo(() => playlists.find(p => p.id === selectedPlaylistId) ?? null, [playlists, selectedPlaylistId]);
  const playlistItems = useMemo(() => selectedPlaylist?.mediaIds.map(id => generallyVisibleItems.find(item => item.id === id)).filter((item): item is MediaItem => Boolean(item)) ?? [], [selectedPlaylist, generallyVisibleItems]);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleMovies = useMemo(() => movies.filter(i => !normalizedQuery || `${i.title} ${i.year ?? ''} ${i.genres?.join(' ') ?? ''}`.toLowerCase().includes(normalizedQuery)), [movies, normalizedQuery]);
  const visibleShows = useMemo(() => shows.filter(s => !normalizedQuery || s.title.toLowerCase().includes(normalizedQuery) || s.episodes.some(e => `${e.title} ${e.genres?.join(' ') ?? ''}`.toLowerCase().includes(normalizedQuery))), [shows, normalizedQuery]);
  const visibleHistory = useMemo(() => historyItems.filter(i => !normalizedQuery || `${i.title} ${i.showTitle ?? ''}`.toLowerCase().includes(normalizedQuery)), [historyItems, normalizedQuery]);
  const showEpisodes = useMemo(() => selectedShow?.episodes.filter(i => !normalizedQuery || `${i.title} ${i.season ?? ''} ${i.episode ?? ''}`.toLowerCase().includes(normalizedQuery)) ?? [], [selectedShow, normalizedQuery]);
  const seasonGroups = useMemo(() => { const groups = new Map<number, MediaItem[]>(); for (const item of showEpisodes) { const season = item.season ?? 0; groups.set(season, [...(groups.get(season) ?? []), item]); } return [...groups.entries()].sort(([a], [b]) => a - b).map(([season, group]) => ({ season, items: group })); }, [showEpisodes]);

  const switchUser = async (id: string) => {
    if (id === activeUserId) { setProfileMenu(false); return; }
    const name = users.find(user => user.id === id)?.name ?? 'profile';
    window.dispatchEvent(new CustomEvent('onyx-profile-loading', { detail: { name } }));
    Object.entries(collectionSessions).forEach(([sourceId, session]) => { sessionStorage.removeItem(`onyx-collection-unlock:${sourceId}`); void lockCollectionSource(session.token).catch(() => undefined); }); setCollectionSessions({});
    setActiveUserId(id); setActiveUserState(id); setProfileMenu(false); setSelected(null); setPausedMedia(null); setSelectedShowTitle(null); setSelectedPlaylistId(null); setSelectedCollectionId(null); setSection('home'); setQuery('');
    if(!isDesktop)window.history.replaceState(null,'',`/${profileSlug(name)}`);
    try { await Promise.all([refresh(), preloadMusicLibrary(id)]); }
    catch (cause) { setError(String(cause)); }
    finally { window.dispatchEvent(new Event('onyx-profile-ready')); }
  };
  const openHidden = async () => { try { const [visible, all] = await Promise.all([listMedia(false), listMedia(true)]); const visibleIds = new Set(visible.map(i => i.id)); setHiddenItems(all.filter(i => !visibleIds.has(i.id))); setProfileMenu(false); setSection('hidden'); } catch (cause) { setError(String(cause)); } };
  const refreshHidden = async () => { if (section !== 'hidden') return; const [visible, all] = await Promise.all([listMedia(false), listMedia(true)]); const visibleIds = new Set(visible.map(i => i.id)); setItems(visible); setHiddenItems(all.filter(i => !visibleIds.has(i.id))); };
  const openMenu = (event: ReactMouseEvent, target: MenuTarget, hiddenView = false) => { event.preventDefault(); event.stopPropagation(); setContextMenu({ x: Math.min(event.clientX, window.innerWidth - 250), y: Math.min(event.clientY, window.innerHeight - 400), target, hiddenView }); };
  const submitLogin = async (event: FormEvent) => { event.preventDefault(); setLoginBusy(true); setError(null); try { await login(loginPassword); setAuthenticated(true); setLoginPassword(''); await loadUsers(); await refresh(); } catch (cause) { setError(String(cause)); } finally { setLoginBusy(false); } };
  const signOut = async () => { Object.entries(collectionSessions).forEach(([sourceId, session]) => { sessionStorage.removeItem(`onyx-collection-unlock:${sourceId}`); void lockCollectionSource(session.token).catch(() => undefined); }); setCollectionSessions({}); await logout(); setAuthenticated(false); setItems([]); setPlaylists([]); };
  const editLocalShow = async (show: TvShow) => { if (!isDesktop) return; const title = window.prompt('Correct local TV show title:', show.title)?.trim(); if (!title) return; try { setItems(await identifyShow(show.representative.id, title)); if (selectedShowTitle === show.title) setSelectedShowTitle(title); } catch (cause) { setError(String(cause)); } };
  const editLocalIdentification = async (item: MediaItem) => { if (!isDesktop) return; try { let updated: MediaItem[]; if (item.kind === 'movie' || item.kind === 'special') { const title = window.prompt(`Correct local ${item.kind === 'special' ? 'special' : 'movie'} title:`, item.title)?.trim(); if (!title) return; updated = await identifyItem(item.id, item.kind === 'movie' ? { title, year: numberPrompt('Release year (optional):', item.year), kind: 'movie' } : { title, year: numberPrompt('Release year (optional):', item.year) }); } else { const showTitle = window.prompt('Correct local TV show title:', item.showTitle ?? '')?.trim(); if (!showTitle) return; updated = await identifyItem(item.id, { title: window.prompt('Episode title:', item.title)?.trim() || item.title, showTitle, season: numberPrompt('Season number:', item.season), episode: numberPrompt('Episode number:', item.episode), kind: 'episode' }); } setItems(updated); } catch (cause) { setError(String(cause)); } };
  const resetLocalIdentification = async (item: MediaItem) => { if (!isDesktop || !window.confirm('Reset local filename/folder identification to automatic detection?')) return; try { setItems(await resetIdentification(item.id)); } catch (cause) { setError(String(cause)); } };
  const resetWatched = async (ids: string[]) => { try { const updated = await resetWatchStatus(ids); setItems(updated); if (selected && ids.includes(selected.id)) setSelected(null); } catch (cause) { setError(String(cause)); } };
  const hideMedia = async (item: MediaItem, hidden: boolean) => { try { setItems(await setHidden('media', item.id, hidden)); if (hidden && selected?.id === item.id) setSelected(null); await refreshHidden(); } catch (cause) { setError(String(cause)); } };
  const hideShow = async (show: TvShow, hidden: boolean) => { try { let updated = await setHidden('show', show.title, hidden); if (!hidden) for (const episode of show.episodes) updated = await setHidden('media', episode.id, false); setItems(updated); if (hidden && selectedShowTitle === show.title) setSelectedShowTitle(null); await refreshHidden(); } catch (cause) { setError(String(cause)); } };
  const makePlaylist = async (ids: string[] = []) => { const name = (await dialog.prompt({title:'New playlist',message:'Give this playlist a name.',label:'Playlist name',placeholder:'Weekend movies',confirmLabel:'Create'}))?.trim(); if (!name) return; try { let updated = await createPlaylist(name); const created = updated.find(p => p.name.toLowerCase() === name.toLowerCase()); if (created) { for (const id of ids) updated = await addToPlaylist(created.id, id); setSelectedPlaylistId(created.id); } setPlaylists(updated); setSection('playlists'); } catch (cause) { setError(String(cause)); } };
  const addIdsToPlaylist = async (playlistId: string, ids: string[]) => { try { let updated = playlists; for (const id of ids) updated = await addToPlaylist(playlistId, id); setPlaylists(updated); } catch (cause) { setError(String(cause)); } };
  const removePlaylistItem = async (playlistId: string, mediaId: string) => { try { setPlaylists(await removeFromPlaylist(playlistId, mediaId)); } catch (cause) { setError(String(cause)); } };
  const removePlaylist = async (playlist: Playlist) => { if (!window.confirm(`Delete playlist “${playlist.name}”?`)) return; try { setPlaylists(await deletePlaylist(playlist.id)); if (selectedPlaylistId === playlist.id) setSelectedPlaylistId(null); } catch (cause) { setError(String(cause)); } };
  const markCollectionIdle = (item: MediaItem | null) => { const id = item?.collectionProtected ? item.collectionSourceId : undefined; if (id) setCollectionSessions(current => current[id] ? { ...current, [id]: { ...current[id], idleSince: Date.now() } } : current); };
  const markCollectionPlaying = (item: MediaItem | null) => { const id = item?.collectionProtected ? item.collectionSourceId : undefined; if (id) setCollectionSessions(current => current[id] ? { ...current, [id]: { ...current[id], idleSince: undefined } } : current); };
  const startPlayback = (item: MediaItem) => { if (item.collectionProtected && item.collectionSourceId && !collectionSessions[item.collectionSourceId]) { setSelectedCollectionId(item.collectionSourceId); setSection('collection'); setError('Unlock this collection before playing it.'); return; } let next = item; if (item.durationSeconds && item.progressSeconds > 0 && 1 - item.progressSeconds / item.durationSeconds <= .1) { const resume = window.confirm('Less than 10% remains.\n\nOK: continue where you left off\nCancel: restart from the beginning'); if (!resume) next = { ...item, progressSeconds: 0 }; } try{sessionStorage.setItem('onyx-current-media',JSON.stringify(next))}catch{/* best effort */} lastWatchTickRef.current = Date.now(); markCollectionPlaying(next); setPausedMedia(null); startTransition(() => setSelected(next)); setSubtitleChoice('off'); };
  const saveProgress = async (force = false) => { if (!selected || !videoRef.current) return; const current = Math.floor(videoRef.current.currentTime); if (!force && Math.abs(current - lastProgressSaveRef.current) < 15) return; const now = Date.now(); const elapsed = videoRef.current.paused ? 0 : Math.min(30, Math.max(0, Math.round((now - lastWatchTickRef.current) / 1000))); lastWatchTickRef.current = now; lastProgressSaveRef.current = current; try { await persistProgress(selected.id, current, elapsed); const stamp = Math.floor(Date.now() / 1000); setItems(existing => existing.map(item => item.id === selected.id ? { ...item, progressSeconds: current, lastWatchedAt: stamp } : item)); } catch { /* best-effort playback persistence */ } };
  const closePlayer = () => { void saveProgress(true); markCollectionIdle(selected); setSelected(null); setSubtitleChoice('off'); };
  const pauseForNavigation = () => { if (!selected) return; const current = Math.floor(videoRef.current?.currentTime ?? selected.progressSeconds); void saveProgress(true); videoRef.current?.pause(); markCollectionIdle(selected); setPausedMedia({ ...selected, progressSeconds: current }); startTransition(() => setSelected(null)); setSubtitleChoice('off'); };
  const resumePaused = () => { if (!pausedMedia) return; const latest = items.find(item => item.id === pausedMedia.id) ?? pausedMedia; lastWatchTickRef.current = Date.now(); setSelected({ ...latest, progressSeconds: pausedMedia.progressSeconds }); setPausedMedia(null); setSubtitleChoice('off'); };
  useEffect(() => { const video = videoRef.current; if (!selected || !video) return; lastProgressSaveRef.current = selected.progressSeconds; lastWatchTickRef.current = Date.now(); const resume = () => { if (selected.progressSeconds > 5 && video.currentTime < 1) video.currentTime = selected.progressSeconds; }; video.addEventListener('loadedmetadata', resume); return () => video.removeEventListener('loadedmetadata', resume); }, [selected]);
  useEffect(() => { const timer = window.setInterval(() => { const now = Date.now(); setCollectionClock(now); setCollectionSessions(current => { let changed = false; const next = { ...current }; for (const [id, session] of Object.entries(current)) if (session.idleSince && now - session.idleSince >= 30 * 60 * 1000) { changed = true; delete next[id]; sessionStorage.removeItem(`onyx-collection-unlock:${id}`); void lockCollectionSource(session.token).catch(() => undefined); } return changed ? next : current; }); }, 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { if (!selected?.collectionProtected || !selected.collectionSourceId) return; const session = collectionSessions[selected.collectionSourceId]; if (!session) return; const timer = window.setInterval(() => void touchCollectionSource(session.token).catch(() => setCollectionSessions(current => { const next = { ...current }; delete next[selected.collectionSourceId!]; return next; })), 60_000); return () => window.clearInterval(timer); }, [selected?.id, collectionSessions]);

  if (!authChecked) return <div className="login-shell"><div className="login-card"><div className="brand-mark">O</div><h1>Onyx</h1><p>Connecting to your media server…</p></div></div>;
  if (!isDesktop && !authenticated) return <div className="login-shell"><form className="login-card" onSubmit={submitLogin}><div className="brand-mark">O</div><p className="eyebrow">PRIVATE LIBRARY</p><h1>Onyx</h1><p>Enter the server access password.</p><input type="password" autoFocus autoComplete="current-password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} placeholder="Password" />{error && <div className="login-error">{error}</div>}<button className="primary" type="submit" disabled={loginBusy || !loginPassword}>{loginBusy ? 'Signing in…' : 'Sign in'}</button></form></div>;

  const playableSubtitles = selected?.subtitles.filter(s => s.url) ?? [];
  const showBackdrop = selectedShow?.representative.backdropUrl;
  const showSocialKey = selectedShow ? socialKey(selectedShow.representative) : '';
  const changeSubtitle = (value: string) => { setSubtitleChoice(value); const video = videoRef.current; if (!video) return; for (let i = 0; i < video.textTracks.length; i++) video.textTracks[i].mode = value === String(i) ? 'showing' : 'disabled'; };
  const navigate = (next: Section) => { if (selected) pauseForNavigation(); setSection(next); setSelectedShowTitle(null); setSelectedPlaylistId(null); if (next !== 'collection') setSelectedCollectionId(null); setQuery(''); };
  const openCollection = (id: string) => { if (selected) pauseForNavigation(); setSelectedCollectionId(id); setSection('collection'); setQuery(''); setError(null); };
  const toggleCollectionLock = async (source: { id: string; name: string; protected: boolean }) => { if (!source.protected) return; const session = collectionSessions[source.id]; if (session) { await lockCollectionSource(session.token); sessionStorage.removeItem(`onyx-collection-unlock:${source.id}`); setCollectionSessions(current => { const next = { ...current }; delete next[source.id]; return next; }); if (selectedCollectionId === source.id) setSelected(null); return; } openCollection(source.id); };
  const clearHistory = async () => { const ids = items.filter(item => item.lastWatchedAt || item.progressSeconds > 0).map(item => item.id); if (ids.length && window.confirm('Clear all watch history for this profile?')) await resetWatched(ids); };
  const scanOneLibrary = async (kind: 'movie'|'tv'|'special'|`collection:${string}`, label: string) => { if (!window.confirm(`Scan ${label} for new or changed media?`)) return; try { setError(`Scanning ${label}…`); await rescanLibraryKind(kind); await refresh(); setError(null); } catch(cause) { setError(String(cause)); } };
  const unlockCollection = async (pin: string) => { if (!selectedCollection) return; try { const token = await unlockCollectionSource(selectedCollection.id, pin); sessionStorage.setItem(`onyx-collection-unlock:${selectedCollection.id}`, token); setCollectionSessions(current => ({ ...current, [selectedCollection.id]: { token, idleSince: Date.now() } })); setError(null); } catch (cause) { setError(String(cause)); throw cause; } };
  const openRecommendation = (entry: RecommendationEntry) => {
    if (entry.targetType === 'movie') {
      const movie = movies.find(item => socialKey(item) === entry.targetKey || item.title === entry.title);
      if (movie) startPlayback(movie);
    } else {
      const show = shows.find(value => socialKey(value.representative) === entry.targetKey || value.title === entry.title);
      if (show) { setSection('tv'); setSelectedShowTitle(show.title); setQuery(''); }
    }
  };

  const sidebar = <Sidebar section={section} collections={collections} libraryOrder={libraryOrder} selectedCollectionId={selectedCollectionId} pausedMedia={pausedMedia} onNavigate={navigate} onOpenCollection={openCollection} onToggleCollectionLock={toggleCollectionLock} onScanLibrary={scanOneLibrary} onClearHistory={clearHistory} onResume={resumePaused} />;

  const shell = projectorMode ? <div className="projector-shell">
    {error && <div className="error-banner">{error}</div>}
    <SleepTimer projector />
    {activeUser?<LiveChannelsView media={items} onOpenSettings={() => undefined} projector userName={activeUser.name} />:<div className="live-empty">Loading profile…</div>}
  </div> : <div className={`app-shell ${isDesktop ? 'desktop-shell' : ''}`}>
    <TopBar selected={selected} section={section} query={query} status={status} activeUser={activeUser} activeUserId={activeUserId} users={users} avatars={avatars} profileMenu={profileMenu} isDesktop={isDesktop} onHome={() => navigate('home')} onQuery={setQuery} onToggleProfiles={() => setProfileMenu(value => !value)} onSwitchUser={switchUser} onOpenHidden={openHidden} onSignOut={signOut} />
    {sidebar}
    {selected ? <PlayerPage item={selected} videoRef={videoRef} sourceUrl={collectionPlaybackUrl(selected, collectionSessions)} subtitleChoice={subtitleChoice} playableSubtitles={playableSubtitles} episodeLabel={episodeLabel} onBack={closePlayer} onPlay={() => markCollectionPlaying(selected)} onPause={() => { void saveProgress(true); markCollectionIdle(selected); }} onEnded={() => markCollectionIdle(selected)} onTimeUpdate={() => void saveProgress()} onSubtitleChange={changeSubtitle} social={isDesktop && selected.kind === 'movie' ? <SocialBar targetType="movie" targetKey={socialKey(selected)} title={selected.title} posterUrl={selected.posterUrl} users={users} /> : undefined} /> : <main className="content">
      {error && <div className="error-banner">{error}</div>}
      {section === 'home' && <HomePage activeUser={activeUser} isDesktop={isDesktop} continueWatchingLayout={continueWatchingLayout} continueItems={continueItems} recentShows={recentShows} recentMovies={recentMovies} onNavigate={navigate} onRecommendation={openRecommendation} onPlay={startPlayback} onItemMenu={(event, item) => openMenu(event, { type: 'item', item })} onOpenShow={show => { setSection('tv'); setSelectedShowTitle(show.title); }} onShowMenu={(event, show) => openMenu(event, { type: 'show', show })} />}
      {section === 'movies' && <MediaGalleryPage eyebrow="MOVIES" title="Movies" subtitle={`${movies.length} titles`} items={visibleMovies} onPlay={startPlayback} onMenu={(event, item) => openMenu(event, { type: 'item', item })} />}
      {section === 'tv' && <TelevisionPage shows={visibleShows} totalShows={shows.length} totalEpisodes={episodes.length} selectedShow={selectedShow} showEpisodes={showEpisodes} seasonGroups={seasonGroups} backdropUrl={showBackdrop} view={tvView} social={isDesktop && selectedShow ? <SocialBar targetType="show" targetKey={showSocialKey} title={selectedShow.title} posterUrl={selectedShow.representative.posterUrl} users={users} /> : undefined} allWatched={allWatched} groupProgress={groupPercent} onOpenShow={show => { setSelectedShowTitle(show.title); setQuery(''); }} onShowMenu={(event, show) => openMenu(event, { type: 'show', show })} onBack={() => { setSelectedShowTitle(null); setQuery(''); }} onView={setTvView} onPlay={startPlayback} onItemMenu={(event, item) => openMenu(event, { type: 'item', item })} onSeasonMenu={(event, season, items) => selectedShow && openMenu(event, { type: 'season', showTitle: selectedShow.title, season, items })} />}
      {section === 'specials' && <SpecialsPage total={specials.length} groups={specialGroups} onPlay={startPlayback} onMenu={(event, item) => openMenu(event, { type: 'item', item })} />}
      {section === 'collection' && selectedCollection && selectedCollection.protected && !collectionSessions[selectedCollection.id] && <ProtectedCollectionGate name={selectedCollection.name} onUnlock={unlockCollection} />}
      {section === 'collection' && selectedCollection && (!selectedCollection.protected || collectionSessions[selectedCollection.id]) && <CollectionPage name={selectedCollection.name} total={selectedCollection.items.length} groups={collectionGroups} continueItems={collectionContinueItems} onPlay={startPlayback} onMenu={(event, item) => openMenu(event, { type: 'item', item })} />}
      {section === 'live' && <LiveChannelsView media={items} onOpenSettings={() => navigate('settings')} />}
      {section === 'music' && <MusicView />}
      {section === 'history' && <MediaGalleryPage eyebrow="HISTORY" title="Recently watched" subtitle={`${historyItems.length} items`} items={visibleHistory} onPlay={startPlayback} onMenu={(event, item) => openMenu(event, { type: 'item', item })} />}
      {section === 'playlists' && <PlaylistsPage playlists={playlists} selected={selectedPlaylist} selectedItems={playlistItems} library={items} onCreate={() => void makePlaylist()} onOpen={playlist => setSelectedPlaylistId(playlist.id)} onBack={() => setSelectedPlaylistId(null)} onPlay={startPlayback} onItemMenu={(event, item) => openMenu(event, { type: 'item', item })} onPlaylistMenu={(event, playlist) => openMenu(event, { type: 'playlist', playlist })} />}
      {section === 'analytics' && <AnalyticsPage analytics={analytics} />}
      {section === 'settings' && <SettingsPage onChanged={() => void refresh()} />}
      {section === 'hidden' && <HiddenMediaPage movies={hiddenMovies} shows={hiddenShows} onPlay={startPlayback} onMovieMenu={(event, item) => openMenu(event, { type: 'item', item }, true)} onShowMenu={(event, show) => openMenu(event, { type: 'show', show }, true)} />}
    </main>}
    {contextMenu && <ContextMenu menu={contextMenu} isDesktop={isDesktop} playlists={playlists} selectedPlaylist={selectedPlaylist} onClose={() => setContextMenu(null)} onPlay={startPlayback} onOpenShow={show => { setSection('tv'); setSelectedShowTitle(show.title); }} onReset={ids => void resetWatched(ids)} onAdd={(id, ids) => void addIdsToPlaylist(id, ids)} onCreate={ids => void makePlaylist(ids)} onFixMatch={item => setMatchItem(item)} onEditLocal={item => void editLocalIdentification(item)} onResetLocal={item => void resetLocalIdentification(item)} onFixShowMatch={show => setMatchItem(show.representative)} onEditLocalShow={show => void editLocalShow(show)} onHideItem={(item, hidden) => void hideMedia(item, hidden)} onHideShow={(show, hidden) => void hideShow(show, hidden)} onRemovePlaylistItem={(id, mediaId) => void removePlaylistItem(id, mediaId)} onOpenPlaylist={playlist => { setSection('playlists'); setSelectedPlaylistId(playlist.id); }} onDeletePlaylist={playlist => void removePlaylist(playlist)} />}
    {matchItem && <MetadataMatchDialog item={matchItem} onClose={() => setMatchItem(null)} onMatched={updated => { setItems(updated); void refresh(); }} />}
    {Object.entries(collectionSessions).filter(([, session]) => session.idleSince).map(([id, session]) => <CollectionRelockIndicator key={id} name={collections.find(source => source.id === id)?.name ?? 'Collection'} idleSince={session.idleSince!} />)}
  </div>;
  return <>{isDesktop && <WindowBar />}{shell}</>;
}

export default App;
