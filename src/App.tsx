import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { FormEvent, MouseEvent as ReactMouseEvent } from 'react';
import {
  ArrowLeft, BarChart3, Check, ChevronDown, EyeOff, Expand, Film, FolderOpen, History,
  Home, KeyRound, Layers3, List, ListVideo, Lock, LogOut, Maximize2, Minus, Music2, Play,
  Plus, Radio, Search, Settings, Subtitles, Tv, UserRound, X,
} from 'lucide-react';
import {
  addToPlaylist, createPlaylist, deletePlaylist, getActiveUserId, getAnalytics,
  getAuthStatus, getServerStatus, getUserPreferences, identifyItem, identifyShow,
  isTauriDesktop, listMedia, listPlaylists, listUsers, lockCollectionSource, login, logout,
  removeFromPlaylist, resetIdentification, resetWatchStatus, resolveMediaUrl,
  saveProgress as persistProgress, setActiveUserId, setHidden, touchCollectionSource, unlockCollectionSource,
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
import { Rail } from './components/media/Rail';
import { ProgressLine, WatchedBadge } from './components/media/MediaStatus';
import { MetadataSummary } from './components/media/MetadataSummary';
import { MediaCard } from './components/media/MediaCard';
import { ShowCard } from './components/media/ShowCard';

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
const collectionPlaybackUrl = (item: MediaItem, sessions: Record<string, CollectionSession>) => {
  const url = resolveMediaUrl(item.streamUrl);
  const token = item.collectionSourceId ? sessions[item.collectionSourceId]?.token : undefined;
  if (!url || !token) return url;
  return `${url}${url.includes('?') ? '&' : '?'}unlock=${encodeURIComponent(token)}`;
};

function ProtectedCollectionGate({ name, onUnlock }: { name: string; onUnlock: (pin: string) => Promise<void> }) {
  const [pin, setPin] = useState(''); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const submit = async () => { if (pin.length < 4 || busy) return; setBusy(true); setMessage(''); try { await onUnlock(pin); setPin(''); } catch { setMessage('That PIN did not unlock this collection.'); } finally { setBusy(false); } };
  return <section className="collection-lock-gate"><Lock size={38} /><p className="eyebrow">PROTECTED COLLECTION</p><h1>{name}</h1><p>Enter the PIN to view this source.</p><div className="collection-pin-dots" aria-label={`${pin.length} PIN digits entered`}>{Array.from({ length: Math.max(4, pin.length) }, (_, index) => <i key={index} className={index < pin.length ? 'filled' : ''} />)}</div><div className="collection-pin-pad">{[1,2,3,4,5,6,7,8,9].map(value => <button key={value} onClick={() => setPin(current => current.length < 12 ? `${current}${value}` : current)}>{value}</button>)}<button onClick={() => setPin(current => current.slice(0, -1))}>⌫</button><button onClick={() => setPin(current => current.length < 12 ? `${current}0` : current)}>0</button><button className="pin-enter" disabled={pin.length < 4 || busy} onClick={() => void submit()}><KeyRound size={18} /></button></div>{message && <div className="login-error">{message}</div>}<small>It relocks after 30 minutes without playback.</small></section>;
}
function CollectionRelockIndicator({ name, idleSince }: { name: string; idleSince: number }) {
  const remaining = Math.max(0, 30 * 60 - Math.floor((Date.now() - idleSince) / 1000));
  return <div className="collection-relock-indicator"><Lock size={14} /><span><strong>{name}</strong> relocks in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</span></div>;
}

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
  const [splitContinueWatching, setSplitContinueWatching] = useState(false);
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
      setItems(library); setStatus(serverStatus); applyTheme(prefs.theme); setSplitContinueWatching(prefs.splitContinueWatching); setError(null);
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
  const continueMovies = useMemo(() => continueItems.filter(item => item.kind === 'movie'), [continueItems]);
  const continueEpisodes = useMemo(() => continueItems.filter(item => item.kind === 'episode'), [continueItems]);
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

  const sidebar = <aside className="sidebar">
    <button className={section === 'home' ? 'active' : ''} onClick={() => navigate('home')}><Home size={19} />Home</button>
    <button className={section === 'movies' ? 'active' : ''} onClick={() => navigate('movies')}><Film size={19} />Movies</button>
    <button className={section === 'tv' ? 'active' : ''} onClick={() => navigate('tv')}><Tv size={19} />TV</button>
    <button className={section === 'specials' ? 'active' : ''} onClick={() => navigate('specials')}><FolderOpen size={19} />Specials</button>
    {collections.map(source => <button key={source.id} className={section === 'collection' && selectedCollectionId === source.id ? 'active' : ''} onClick={() => openCollection(source.id)} onContextMenu={event => { event.preventDefault(); void toggleCollectionLock(source); }} title={source.protected ? 'Right-click to lock or unlock' : undefined}>{source.protected ? <Lock size={19} /> : <FolderOpen size={19} />}{source.name}</button>)}
    <button className={section === 'live' ? 'active' : ''} onClick={() => navigate('live')}><Radio size={19} />Live TV</button>
    <button className={section === 'music' ? 'active' : ''} onClick={() => navigate('music')}><Music2 size={19} />Music</button>
    <button className={section === 'history' ? 'active' : ''} onClick={() => navigate('history')} onContextMenu={event => { event.preventDefault(); void clearHistory(); }} title="Right-click to clear history"><History size={19} />History</button>
    <button className={section === 'playlists' ? 'active' : ''} onClick={() => navigate('playlists')}><ListVideo size={19} />Playlists</button>
    <button className={section === 'analytics' ? 'active' : ''} onClick={() => navigate('analytics')}><BarChart3 size={19} />Analytics</button>
    <div className="sidebar-spacer" />
    {pausedMedia && <button className="sidebar-resume" onClick={resumePaused} title={`Resume ${pausedMedia.title}`}><Play size={16} fill="currentColor" /><span><small>Resume</small>{pausedMedia.kind === 'episode' ? pausedMedia.showTitle ?? pausedMedia.title : pausedMedia.title}</span></button>}
    <SleepTimer />
    <button className={section === 'settings' ? 'active' : ''} onClick={() => navigate('settings')}><Settings size={19} />Settings</button>
  </aside>;

  const shell = projectorMode ? <div className="projector-shell">
    {error && <div className="error-banner">{error}</div>}
    <SleepTimer projector />
    {activeUser?<LiveChannelsView media={items} onOpenSettings={() => undefined} projector userName={activeUser.name} />:<div className="live-empty">Loading profile…</div>}
  </div> : <div className={`app-shell ${isDesktop ? 'desktop-shell' : ''}`}>
    <header className="topbar"><button className="brand brand-button" onClick={() => navigate('home')}><span className="brand-mark">O</span><span>Onyx</span></button>{selected ? <div className="now-playing-title">{selected.kind === 'episode' ? selected.showTitle : selected.title}</div> : section === 'music' || section === 'live' || section === 'settings' ? <div /> : <div className="search"><Search size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search Onyx" /></div>}<div className="topbar-right"><button className={`server-logo-status ${status.running ? 'online' : ''}`} title={`${status.running ? 'Connected' : 'Disconnected'} · ${status.localUrl}\nClick to copy`} aria-label={`${status.running ? 'Connected to' : 'Disconnected from'} ${status.localUrl}. Click to copy.`} onClick={() => void navigator.clipboard.writeText(status.localUrl)}><img src="/app-icon.png" alt="" /></button><div className="profile-wrap"><button className="profile-button" onClick={event => { event.stopPropagation(); setProfileMenu(v => !v); }}>{activeUser?.name ?? 'User'}<ChevronDown size={14} /></button>{profileMenu && <div className="profile-menu" onClick={event => event.stopPropagation()}><div className="profile-label">Profiles</div>{users.map(user => <button key={user.id} className={user.id === activeUserId ? 'active' : ''} onClick={() => void switchUser(user.id)}><AvatarBadge avatar={avatars[user.id]} name={user.name} size="sm" />{user.name}{user.isAdmin && <small>Owner</small>}</button>)}<div className="context-separator" /><button onClick={() => void openHidden()}><EyeOff size={15} />Hidden media</button>{!isDesktop && <button onClick={() => void signOut()}><LogOut size={15} />Sign out</button>}</div>}</div></div></header>
    {sidebar}
    {selected ? <main className="content player-content"><section className="player-page" style={selected.backdropUrl ? { backgroundImage: `linear-gradient(rgba(4,6,8,.82),rgba(4,6,8,.98)),url(${resolveMediaUrl(selected.backdropUrl)})` } : undefined}><div className="player-page-header"><button className="back-button" data-player-back onClick={closePlayer}><ArrowLeft size={18} />Back</button><div><p className="eyebrow">{selected.kind === 'episode' ? selected.showTitle : selected.kind === 'collection' ? selected.collectionSourceName : 'MOVIE'}</p><h1>{selected.title}</h1><p>{selected.kind === 'episode' ? episodeLabel(selected) : selected.year ?? ''}</p><MetadataSummary item={selected} />{isDesktop && selected.kind === 'movie' && <SocialBar targetType="movie" targetKey={socialKey(selected)} title={selected.title} posterUrl={selected.posterUrl} users={users} />}</div></div><div className="video-stage"><video ref={videoRef} controls autoPlay preload="auto" onPlay={() => markCollectionPlaying(selected)} onPause={() => { void saveProgress(true); markCollectionIdle(selected); }} onEnded={() => markCollectionIdle(selected)} onTimeUpdate={() => void saveProgress()}><source src={collectionPlaybackUrl(selected, collectionSessions)} />{playableSubtitles.map(subtitle => <track key={subtitle.url} kind="subtitles" src={resolveMediaUrl(subtitle.url)} srcLang={subtitle.language} label={subtitle.label} />)}</video></div><div className="player-toolbar"><div className="player-meta">{[selected.container, selected.videoCodec, selected.audioCodec, selected.height ? `${selected.height}p` : null].filter(Boolean).join(' · ')}</div><label className="subtitle-control"><Subtitles size={18} /><span>Subtitles</span><select value={subtitleChoice} onChange={event => changeSubtitle(event.target.value)}><option value="off">Off</option>{playableSubtitles.map((subtitle, index) => <option key={subtitle.url} value={String(index)}>{subtitle.label}{subtitle.forced ? ' · Forced' : ''}</option>)}</select></label></div></section></main> : <main className="content">
      {error && <div className="error-banner">{error}</div>}
      {section === 'home' && <div className="home-page"><section className="onyx-hero"><p className="eyebrow">WELCOME BACK</p><h1>{activeUser?.name ? `${activeUser.name}'s Onyx` : 'Onyx'}</h1><p>Your movies, television and optional music—without the clutter.</p><div className="hero-links"><button onClick={() => navigate('movies')}>View movies</button><button onClick={() => navigate('tv')}>View TV shows</button><button onClick={() => navigate('live')}>Live TV</button><button onClick={() => navigate('music')}>Open music</button></div></section>{isDesktop && activeUser && <RecommendationsRail userId={activeUser.id} onOpen={openRecommendation} />}{!splitContinueWatching && continueItems.length > 0 && <Rail title="Continue Watching">{continueItems.map(item => <MediaCard key={item.id} item={item} artwork="poster" onPlay={startPlayback} onMenu={(e, v) => openMenu(e, { type: 'item', item: v })} />)}</Rail>}{splitContinueWatching && continueMovies.length > 0 && <Rail title="Continue Watching Movies">{continueMovies.map(item => <MediaCard key={item.id} item={item} artwork="poster" onPlay={startPlayback} onMenu={(e, v) => openMenu(e, { type: 'item', item: v })} />)}</Rail>}{splitContinueWatching && continueEpisodes.length > 0 && <Rail title="Continue Watching Shows">{continueEpisodes.map(item => <MediaCard key={item.id} item={item} artwork="thumbnail" onPlay={startPlayback} onMenu={(e, v) => openMenu(e, { type: 'item', item: v })} />)}</Rail>}<Rail title="Recently Added Shows" actionLabel="View shows" onAction={() => navigate('tv')}>{recentShows.map(show => <ShowCard key={show.title} show={show} onOpen={value => { setSection('tv'); setSelectedShowTitle(value.title); }} onMenu={(e, v) => openMenu(e, { type: 'show', show: v })} />)}</Rail><Rail title="Recently Added Movies" actionLabel="View movies" onAction={() => navigate('movies')}>{recentMovies.map(item => <MediaCard key={item.id} item={item} onPlay={startPlayback} onMenu={(e, v) => openMenu(e, { type: 'item', item: v })} />)}</Rail></div>}
      {section === 'movies' && <><PageHero eyebrow="MOVIES" title="Movies" subtitle={`${movies.length} titles`} /><section className="gallery">{visibleMovies.map(item => <MediaCard key={item.id} item={item} onPlay={startPlayback} onMenu={(e, v) => openMenu(e, { type: 'item', item: v })} />)}</section></>}
      {section === 'tv' && !selectedShow && <><PageHero eyebrow="TELEVISION" title="TV Shows" subtitle={`${shows.length} shows · ${episodes.length} episodes`} /><section className="gallery show-gallery">{visibleShows.map(show => <ShowCard key={show.title} show={show} onOpen={value => { setSelectedShowTitle(value.title); setQuery(''); }} onMenu={(e, v) => openMenu(e, { type: 'show', show: v })} />)}</section></>}
      {section === 'tv' && selectedShow && <><section className="show-hero compact-hero" style={showBackdrop ? { backgroundImage: `linear-gradient(90deg,var(--bg) 0%,rgba(5,7,10,.80) 60%),url(${resolveMediaUrl(showBackdrop)})` } : undefined}><div><button className="back-button" onClick={() => { setSelectedShowTitle(null); setQuery(''); }}><ArrowLeft size={18} />All TV shows</button><p className="eyebrow">TV SHOW</p><h1>{selectedShow.title}</h1><p>{selectedShow.seasons} seasons · {selectedShow.episodes.length} episodes {allWatched(selectedShow.episodes) ? '· Watched' : ''}</p><MetadataSummary item={selectedShow.representative} />{isDesktop && <SocialBar targetType="show" targetKey={showSocialKey} title={selectedShow.title} posterUrl={selectedShow.representative.posterUrl} users={users} />}</div><div className="view-toggle"><button className={tvView === 'season' ? 'active' : ''} onClick={() => setTvView('season')}><Layers3 size={17} />By season</button><button className={tvView === 'list' ? 'active' : ''} onClick={() => setTvView('list')}><List size={17} />All episodes</button></div></section>{tvView === 'list' ? <section className="gallery episode-grid">{showEpisodes.map(item => <MediaCard key={item.id} item={item} onPlay={startPlayback} onMenu={(e, v) => openMenu(e, { type: 'item', item: v })} />)}</section> : <div className="season-groups">{seasonGroups.map(group => <section className="season-section" key={group.season}><div className="season-heading" onContextMenu={e => openMenu(e, { type: 'season', showTitle: selectedShow.title, season: group.season, items: group.items })}><div><p>{selectedShow.title}</p><h2>{group.season === 0 ? 'Episodes' : `Season ${group.season}`} {allWatched(group.items) && <Check size={18} />}</h2><ProgressLine value={groupPercent(group.items)} /></div><span>{group.items.length} episodes</span></div><div className="gallery">{group.items.map(item => <MediaCard key={item.id} item={item} onPlay={startPlayback} onMenu={(e, v) => openMenu(e, { type: 'item', item: v })} />)}</div></section>)}</div>}</>}
      {section === 'specials' && <><PageHero eyebrow="SPECIALS" title="Specials & Documentaries" subtitle={`${specials.length} files`} /><div className="season-groups">{specialGroups.map(group => <section className="season-section" key={group.category}><div className="season-heading"><div><p>{group.category === 'Unmatched' ? 'NEEDS MATCH' : 'TMDB METADATA'}</p><h2>{group.category}</h2></div><span>{group.values.length} {group.values.length === 1 ? 'file' : 'files'}</span></div><div className="gallery">{group.values.map(item => <MediaCard key={item.id} item={item} onPlay={startPlayback} onMenu={(e, v) => openMenu(e, { type: 'item', item: v })} />)}</div></section>)}</div></>}
      {section === 'collection' && selectedCollection && selectedCollection.protected && !collectionSessions[selectedCollection.id] && <ProtectedCollectionGate name={selectedCollection.name} onUnlock={unlockCollection} />}
      {section === 'collection' && selectedCollection && (!selectedCollection.protected || collectionSessions[selectedCollection.id]) && <><PageHero eyebrow="COLLECTION" title={selectedCollection.name} subtitle={`${selectedCollection.items.length} files`} /><div className="season-groups">{collectionGroups.map(group => <section className="season-section" key={group.folder}><div className="season-heading"><div><p>{selectedCollection.name}</p><h2>{group.folder}</h2></div><span>{group.values.length} {group.values.length === 1 ? 'file' : 'files'}</span></div><div className="gallery episode-grid">{group.values.map(item => <MediaCard key={item.id} item={item} artwork="thumbnail" onPlay={startPlayback} onMenu={(e, v) => openMenu(e, { type: 'item', item: v })} />)}</div></section>)}</div></>}
      {section === 'live' && <LiveChannelsView media={items} onOpenSettings={() => navigate('settings')} />}
      {section === 'music' && <MusicView />}
      {section === 'history' && <><PageHero eyebrow="HISTORY" title="Recently watched" subtitle={`${historyItems.length} items`} /><section className="gallery">{visibleHistory.map(item => <MediaCard key={item.id} item={item} onPlay={startPlayback} onMenu={(e, v) => openMenu(e, { type: 'item', item: v })} />)}</section></>}
      {section === 'playlists' && !selectedPlaylist && <><PageHero eyebrow="PLAYLISTS" title="Playlists" subtitle={`${playlists.length} playlists`} /><button className="primary" onClick={() => void makePlaylist()}><Plus size={18} />New playlist</button><section className="playlist-grid">{playlists.map(playlist => { const first = playlist.mediaIds.map(id => items.find(item => item.id === id)).find(Boolean); return <article className="playlist-card" key={playlist.id} onClick={() => setSelectedPlaylistId(playlist.id)} onContextMenu={event => openMenu(event, { type: 'playlist', playlist })}>{first?.posterUrl || first?.thumbnailUrl ? <img src={resolveMediaUrl(first.posterUrl || first.thumbnailUrl)} alt="" /> : <div className="playlist-placeholder"><ListVideo size={40} /></div>}<div><h3>{playlist.name}</h3><p>{playlist.mediaIds.length} items</p></div></article>; })}</section></>}
      {section === 'playlists' && selectedPlaylist && <><PageHero eyebrow="PLAYLIST" title={selectedPlaylist.name} subtitle={`${playlistItems.length} items`} /><button className="back-button playlist-back" onClick={() => setSelectedPlaylistId(null)}><ArrowLeft size={18} />All playlists</button><section className="gallery">{playlistItems.map(item => <MediaCard key={item.id} item={item} onPlay={startPlayback} onMenu={(e, v) => openMenu(e, { type: 'item', item: v })} />)}</section></>}
      {section === 'analytics' && <AnalyticsPage analytics={analytics} />}
      {section === 'settings' && <SettingsPage onChanged={() => void refresh()} />}
      {section === 'hidden' && <><PageHero eyebrow="HIDDEN" title="Hidden media" subtitle={`${hiddenMovies.length} movies · ${hiddenShows.length} shows`} /><h2 className="subsection-title">Movies</h2><section className="gallery">{hiddenMovies.map(item => <MediaCard key={item.id} item={item} onPlay={startPlayback} onMenu={(e, v) => openMenu(e, { type: 'item', item: v }, true)} />)}</section><h2 className="subsection-title">TV Shows</h2><section className="gallery show-gallery">{hiddenShows.map(show => <ShowCard key={show.title} show={show} onOpen={() => {}} onMenu={(e, v) => openMenu(e, { type: 'show', show: v }, true)} />)}</section></>}
    </main>}
    {contextMenu && <ContextMenu menu={contextMenu} isDesktop={isDesktop} playlists={playlists} selectedPlaylist={selectedPlaylist} onClose={() => setContextMenu(null)} onPlay={startPlayback} onOpenShow={show => { setSection('tv'); setSelectedShowTitle(show.title); }} onReset={ids => void resetWatched(ids)} onAdd={(id, ids) => void addIdsToPlaylist(id, ids)} onCreate={ids => void makePlaylist(ids)} onFixMatch={item => setMatchItem(item)} onEditLocal={item => void editLocalIdentification(item)} onResetLocal={item => void resetLocalIdentification(item)} onFixShowMatch={show => setMatchItem(show.representative)} onEditLocalShow={show => void editLocalShow(show)} onHideItem={(item, hidden) => void hideMedia(item, hidden)} onHideShow={(show, hidden) => void hideShow(show, hidden)} onRemovePlaylistItem={(id, mediaId) => void removePlaylistItem(id, mediaId)} onOpenPlaylist={playlist => { setSection('playlists'); setSelectedPlaylistId(playlist.id); }} onDeletePlaylist={playlist => void removePlaylist(playlist)} />}
    {matchItem && <MetadataMatchDialog item={matchItem} onClose={() => setMatchItem(null)} onMatched={updated => { setItems(updated); void refresh(); }} />}
    {Object.entries(collectionSessions).filter(([, session]) => session.idleSince).map(([id, session]) => <CollectionRelockIndicator key={id} name={collections.find(source => source.id === id)?.name ?? 'Collection'} idleSince={session.idleSince!} />)}
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
