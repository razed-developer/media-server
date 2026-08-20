import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, MouseEvent as ReactMouseEvent } from 'react';
import {
  ArrowLeft, BarChart3, Check, ChevronDown, EyeOff, Expand, Film, History,
  Home, Layers3, List, ListVideo, LogOut, Maximize2, Minus, Music2, Play,
  Plus, Radio, Search, Server, Settings, Star, Subtitles, Tv, UserRound, X,
} from 'lucide-react';
import {
  addToPlaylist, createPlaylist, deletePlaylist, getActiveUserId, getAnalytics,
  getAuthStatus, getServerStatus, getUserPreferences, identifyItem, identifyShow,
  isTauriDesktop, listMedia, listPlaylists, listUsers, login, logout,
  removeFromPlaylist, resetIdentification, resetWatchStatus, resolveMediaUrl,
  saveProgress as persistProgress, setActiveUserId, setHidden,
} from './api';
import type { AnalyticsSummary, MediaItem, Playlist, ServerStatus, ThemeName, UserProfile } from './types';
import { LiveChannelsView } from './components/LiveChannelsView';
import { MetadataMatchDialog } from './components/MetadataMatchDialog';
import { MusicView } from './components/MusicView';
import { SettingsPage } from './components/SettingsPage';

const fallbackStatus: ServerStatus = {
  running: false,
  localUrl: 'http://127.0.0.1:8765',
  itemCount: 0,
  ffprobeAvailable: false,
  ffmpegAvailable: false,
};
const emptyAnalytics: AnalyticsSummary = { totalSeconds: 0, movieSeconds: 0, tvSeconds: 0, shows: [], genres: [] };

type Section = 'home' | 'movies' | 'tv' | 'live' | 'music' | 'history' | 'playlists' | 'analytics' | 'settings' | 'hidden';
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
function MediaCard({ item, onPlay, onMenu }: { item: MediaItem; onPlay: (item: MediaItem) => void; onMenu: (event: ReactMouseEvent, item: MediaItem) => void }) {
  const image = item.kind === 'episode' ? item.thumbnailUrl : item.posterUrl;
  return <article className={`media-card ${item.kind === 'episode' ? 'episode-card' : ''}`} onClick={() => onPlay(item)} onContextMenu={event => onMenu(event, item)}>
    <div className="poster">
      {image ? <img className="poster-image" src={resolveMediaUrl(image)} alt="" loading="lazy" /> : <div className="poster-letter">{item.title.charAt(0)}</div>}
      <WatchedBadge done={watched(item)} />
      <button aria-label={`Play ${item.title}`}><Play fill="currentColor" size={21} /></button>
    </div>
    <ProgressLine value={percent(item)} />
    <h3>{item.title}</h3>
    <p>{item.kind === 'episode' ? episodeLabel(item) : item.year ?? 'Movie'}</p>
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
  const [items, setItems] = useState<MediaItem[]>([]);
  const [hiddenItems, setHiddenItems] = useState<MediaItem[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [activeUserId, setActiveUserState] = useState(getActiveUserId());
  const [profileMenu, setProfileMenu] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [status, setStatus] = useState<ServerStatus>(fallbackStatus);
  const [analytics, setAnalytics] = useState<AnalyticsSummary>(emptyAnalytics);
  const [, setThemeState] = useState<ThemeName>('onyx');
  const [query, setQuery] = useState('');
  const [section, setSection] = useState<Section>('home');
  const [tvView, setTvView] = useState<TvView>('season');
  const [selectedShowTitle, setSelectedShowTitle] = useState<string | null>(null);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [selected, setSelected] = useState<MediaItem | null>(null);
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
    try {
      const [library, serverStatus, playlistData, prefs, stats, userData] = await Promise.all([listMedia(), getServerStatus(), listPlaylists(), getUserPreferences(), getAnalytics(), listUsers()]);
      setItems(library); setStatus(serverStatus); setPlaylists(playlistData); setAnalytics(stats); setUsers(userData); applyTheme(prefs.theme); setError(null);
    } catch (cause) { setError(String(cause)); }
  };
  const loadUsers = async () => {
    const values = await listUsers(); let id = getActiveUserId();
    if (!values.some(user => user.id === id)) { id = values[0]?.id ?? 'owner'; setActiveUserId(id); setActiveUserState(id); }
    setUsers(values); return id;
  };
  useEffect(() => { const bootstrap = async () => {
    if (!isDesktop) { try { const auth = await getAuthStatus(); setAuthenticated(auth.authenticated); setAuthChecked(true); if (!auth.authenticated) return; } catch (cause) { setAuthChecked(true); setError(String(cause)); return; } }
    try { await loadUsers(); await refresh(); } catch (cause) { setError(String(cause)); }
  }; void bootstrap(); }, []);
  useEffect(() => { const close = () => setContextMenu(null); window.addEventListener('click', close); window.addEventListener('blur', close); return () => { window.removeEventListener('click', close); window.removeEventListener('blur', close); }; }, []);

  const movies = useMemo(() => items.filter(i => i.kind === 'movie'), [items]);
  const episodes = useMemo(() => items.filter(i => i.kind === 'episode').sort((a, b) => (a.showTitle ?? '').localeCompare(b.showTitle ?? '') || (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0)), [items]);
  const makeShows = (source: MediaItem[]) => {
    const grouped = new Map<string, MediaItem[]>();
    for (const episode of source.filter(i => i.kind === 'episode')) { const title = episode.showTitle?.trim() || 'TV'; grouped.set(title, [...(grouped.get(title) ?? []), episode]); }
    return [...grouped.entries()].map(([title, showEpisodes]) => ({ title, episodes: showEpisodes, representative: showEpisodes[0], seasons: new Set(showEpisodes.map(e => e.season ?? 0)).size, addedAt: Math.max(...showEpisodes.map(e => e.addedAt ?? 0)) })).sort((a, b) => a.title.localeCompare(b.title));
  };
  const shows = useMemo<TvShow[]>(() => makeShows(episodes), [episodes]);
  const hiddenShows = useMemo<TvShow[]>(() => makeShows(hiddenItems), [hiddenItems]);
  const hiddenMovies = useMemo(() => hiddenItems.filter(i => i.kind === 'movie'), [hiddenItems]);
  const historyItems = useMemo(() => items.filter(item => Boolean(item.lastWatchedAt)).sort((a, b) => (b.lastWatchedAt ?? 0) - (a.lastWatchedAt ?? 0)), [items]);
  const continueItems = useMemo(() => items.filter(item => item.progressSeconds > 0 && (!item.durationSeconds || item.progressSeconds / item.durationSeconds < .995)).sort((a, b) => (b.lastWatchedAt ?? 0) - (a.lastWatchedAt ?? 0)).slice(0, 14), [items]);
  const recentMovies = useMemo(() => [...movies].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)).slice(0, 12), [movies]);
  const recentShows = useMemo(() => [...shows].sort((a, b) => b.addedAt - a.addedAt).slice(0, 12), [shows]);
  const selectedShow = useMemo(() => shows.find(s => s.title === selectedShowTitle) ?? null, [shows, selectedShowTitle]);
  const selectedPlaylist = useMemo(() => playlists.find(p => p.id === selectedPlaylistId) ?? null, [playlists, selectedPlaylistId]);
  const playlistItems = useMemo(() => selectedPlaylist?.mediaIds.map(id => items.find(item => item.id === id)).filter((item): item is MediaItem => Boolean(item)) ?? [], [selectedPlaylist, items]);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleMovies = useMemo(() => movies.filter(i => !normalizedQuery || `${i.title} ${i.year ?? ''} ${i.genres?.join(' ') ?? ''}`.toLowerCase().includes(normalizedQuery)), [movies, normalizedQuery]);
  const visibleShows = useMemo(() => shows.filter(s => !normalizedQuery || s.title.toLowerCase().includes(normalizedQuery) || s.episodes.some(e => `${e.title} ${e.genres?.join(' ') ?? ''}`.toLowerCase().includes(normalizedQuery))), [shows, normalizedQuery]);
  const visibleHistory = useMemo(() => historyItems.filter(i => !normalizedQuery || `${i.title} ${i.showTitle ?? ''}`.toLowerCase().includes(normalizedQuery)), [historyItems, normalizedQuery]);
  const showEpisodes = useMemo(() => selectedShow?.episodes.filter(i => !normalizedQuery || `${i.title} ${i.season ?? ''} ${i.episode ?? ''}`.toLowerCase().includes(normalizedQuery)) ?? [], [selectedShow, normalizedQuery]);
  const seasonGroups = useMemo(() => { const groups = new Map<number, MediaItem[]>(); for (const item of showEpisodes) { const season = item.season ?? 0; groups.set(season, [...(groups.get(season) ?? []), item]); } return [...groups.entries()].sort(([a], [b]) => a - b).map(([season, group]) => ({ season, items: group })); }, [showEpisodes]);

  const switchUser = async (id: string) => { setActiveUserId(id); setActiveUserState(id); setProfileMenu(false); setSelected(null); setSelectedShowTitle(null); setSelectedPlaylistId(null); setSection('home'); setQuery(''); await refresh(); };
  const openHidden = async () => { try { const [visible, all] = await Promise.all([listMedia(false), listMedia(true)]); const visibleIds = new Set(visible.map(i => i.id)); setHiddenItems(all.filter(i => !visibleIds.has(i.id))); setProfileMenu(false); setSection('hidden'); } catch (cause) { setError(String(cause)); } };
  const refreshHidden = async () => { if (section !== 'hidden') return; const [visible, all] = await Promise.all([listMedia(false), listMedia(true)]); const visibleIds = new Set(visible.map(i => i.id)); setItems(visible); setHiddenItems(all.filter(i => !visibleIds.has(i.id))); };
  const openMenu = (event: ReactMouseEvent, target: MenuTarget, hiddenView = false) => { event.preventDefault(); event.stopPropagation(); setContextMenu({ x: Math.min(event.clientX, window.innerWidth - 250), y: Math.min(event.clientY, window.innerHeight - 400), target, hiddenView }); };
  const submitLogin = async (event: FormEvent) => { event.preventDefault(); setLoginBusy(true); setError(null); try { await login(loginPassword); setAuthenticated(true); setLoginPassword(''); await loadUsers(); await refresh(); } catch (cause) { setError(String(cause)); } finally { setLoginBusy(false); } };
  const signOut = async () => { await logout(); setAuthenticated(false); setItems([]); setPlaylists([]); };
  const editLocalShow = async (show: TvShow) => { if (!isDesktop) return; const title = window.prompt('Correct local TV show title:', show.title)?.trim(); if (!title) return; try { setItems(await identifyShow(show.representative.id, title)); if (selectedShowTitle === show.title) setSelectedShowTitle(title); } catch (cause) { setError(String(cause)); } };
  const editLocalIdentification = async (item: MediaItem) => { if (!isDesktop) return; try { let updated: MediaItem[]; if (item.kind === 'movie') { const title = window.prompt('Correct local movie title:', item.title)?.trim(); if (!title) return; updated = await identifyItem(item.id, { title, year: numberPrompt('Release year (optional):', item.year), kind: 'movie' }); } else { const showTitle = window.prompt('Correct local TV show title:', item.showTitle ?? '')?.trim(); if (!showTitle) return; updated = await identifyItem(item.id, { title: window.prompt('Episode title:', item.title)?.trim() || item.title, showTitle, season: numberPrompt('Season number:', item.season), episode: numberPrompt('Episode number:', item.episode), kind: 'episode' }); } setItems(updated); } catch (cause) { setError(String(cause)); } };
  const resetLocalIdentification = async (item: MediaItem) => { if (!isDesktop || !window.confirm('Reset local filename/folder identification to automatic detection?')) return; try { setItems(await resetIdentification(item.id)); } catch (cause) { setError(String(cause)); } };
  const resetWatched = async (ids: string[]) => { try { setItems(await resetWatchStatus(ids)); if (selected && ids.includes(selected.id)) setSelected(existing => existing ? { ...existing, progressSeconds: 0, lastWatchedAt: undefined } : existing); } catch (cause) { setError(String(cause)); } };
  const hideMedia = async (item: MediaItem, hidden: boolean) => { try { setItems(await setHidden('media', item.id, hidden)); if (hidden && selected?.id === item.id) setSelected(null); await refreshHidden(); } catch (cause) { setError(String(cause)); } };
  const hideShow = async (show: TvShow, hidden: boolean) => { try { let updated = await setHidden('show', show.title, hidden); if (!hidden) for (const episode of show.episodes) updated = await setHidden('media', episode.id, false); setItems(updated); if (hidden && selectedShowTitle === show.title) setSelectedShowTitle(null); await refreshHidden(); } catch (cause) { setError(String(cause)); } };
  const makePlaylist = async (ids: string[] = []) => { const name = window.prompt('Playlist name:')?.trim(); if (!name) return; try { let updated = await createPlaylist(name); const created = updated.find(p => p.name.toLowerCase() === name.toLowerCase()); if (created) { for (const id of ids) updated = await addToPlaylist(created.id, id); setSelectedPlaylistId(created.id); } setPlaylists(updated); setSection('playlists'); } catch (cause) { setError(String(cause)); } };
  const addIdsToPlaylist = async (playlistId: string, ids: string[]) => { try { let updated = playlists; for (const id of ids) updated = await addToPlaylist(playlistId, id); setPlaylists(updated); } catch (cause) { setError(String(cause)); } };
  const removePlaylistItem = async (playlistId: string, mediaId: string) => { try { setPlaylists(await removeFromPlaylist(playlistId, mediaId)); } catch (cause) { setError(String(cause)); } };
  const removePlaylist = async (playlist: Playlist) => { if (!window.confirm(`Delete playlist “${playlist.name}”?`)) return; try { setPlaylists(await deletePlaylist(playlist.id)); if (selectedPlaylistId === playlist.id) setSelectedPlaylistId(null); } catch (cause) { setError(String(cause)); } };
  const startPlayback = (item: MediaItem) => { let next = item; if (item.durationSeconds && item.progressSeconds > 0 && 1 - item.progressSeconds / item.durationSeconds <= .1) { const resume = window.confirm('Less than 10% remains.\n\nOK: continue where you left off\nCancel: restart from the beginning'); if (!resume) next = { ...item, progressSeconds: 0 }; } lastWatchTickRef.current = Date.now(); setSelected(next); setSubtitleChoice('off'); };
  const saveProgress = async (force = false) => { if (!selected || !videoRef.current) return; const current = Math.floor(videoRef.current.currentTime); if (!force && Math.abs(current - lastProgressSaveRef.current) < 15) return; const now = Date.now(); const elapsed = videoRef.current.paused ? 0 : Math.min(30, Math.max(0, Math.round((now - lastWatchTickRef.current) / 1000))); lastWatchTickRef.current = now; lastProgressSaveRef.current = current; try { await persistProgress(selected.id, current, elapsed); const stamp = Math.floor(Date.now() / 1000); setItems(existing => existing.map(item => item.id === selected.id ? { ...item, progressSeconds: current, lastWatchedAt: stamp } : item)); } catch { /* best-effort playback persistence */ } };
  const closePlayer = () => { void saveProgress(true); setSelected(null); setSubtitleChoice('off'); };
  useEffect(() => { const video = videoRef.current; if (!selected || !video) return; lastProgressSaveRef.current = selected.progressSeconds; lastWatchTickRef.current = Date.now(); const resume = () => { if (selected.progressSeconds > 5 && video.currentTime < 1) video.currentTime = selected.progressSeconds; }; video.addEventListener('loadedmetadata', resume); return () => video.removeEventListener('loadedmetadata', resume); }, [selected]);

  if (!authChecked) return <div className="login-shell"><div className="login-card"><div className="brand-mark">O</div><h1>Onyx</h1><p>Connecting to your media server…</p></div></div>;
  if (!isDesktop && !authenticated) return <div className="login-shell"><form className="login-card" onSubmit={submitLogin}><div className="brand-mark">O</div><p className="eyebrow">PRIVATE LIBRARY</p><h1>Onyx</h1><p>Enter the server access password.</p><input type="password" autoFocus autoComplete="current-password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} placeholder="Password" />{error && <div className="login-error">{error}</div>}<button className="primary" type="submit" disabled={loginBusy || !loginPassword}>{loginBusy ? 'Signing in…' : 'Sign in'}</button></form></div>;

  const playableSubtitles = selected?.subtitles.filter(s => s.url) ?? [];
  const showBackdrop = selectedShow?.representative.backdropUrl;
  const changeSubtitle = (value: string) => { setSubtitleChoice(value); const video = videoRef.current; if (!video) return; for (let i = 0; i < video.textTracks.length; i++) video.textTracks[i].mode = value === String(i) ? 'showing' : 'disabled'; };
  const navigate = (next: Section) => { closePlayer(); setSection(next); setSelectedShowTitle(null); setSelectedPlaylistId(null); setQuery(''); };

  const sidebar = <aside className="sidebar">
    <button className={section === 'home' ? 'active' : ''} onClick={() => navigate('home')}><Home size={19} />Home</button>
    <button className={section === 'movies' ? 'active' : ''} onClick={() => navigate('movies')}><Film size={19} />Movies</button>
    <button className={section === 'tv' ? 'active' : ''} onClick={() => navigate('tv')}><Tv size={19} />TV</button>
    <button className={section === 'live' ? 'active' : ''} onClick={() => navigate('live')}><Radio size={19} />Live TV</button>
    <button className={section === 'music' ? 'active' : ''} onClick={() => navigate('music')}><Music2 size={19} />Music</button>
    <button className={section === 'history' ? 'active' : ''} onClick={() => navigate('history')}><History size={19} />History</button>
    <button className={section === 'playlists' ? 'active' : ''} onClick={() => navigate('playlists')}><ListVideo size={19} />Playlists</button>
    <button className={section === 'analytics' ? 'active' : ''} onClick={() => navigate('analytics')}><BarChart3 size={19} />Analytics</button>
    <div className="sidebar-spacer" />
    <button className={section === 'settings' ? 'active' : ''} onClick={() => navigate('settings')}><Settings size={19} />Settings</button>
  </aside>;

  const shell = <div className={`app-shell ${isDesktop ? 'desktop-shell' : ''}`}>
    <header className="topbar"><button className="brand brand-button" onClick={() => navigate('home')}><span className="brand-mark">O</span><span>Onyx</span></button>{selected ? <div className="now-playing-title">{selected.kind === 'episode' ? selected.showTitle : selected.title}</div> : section === 'music' || section === 'live' || section === 'settings' ? <div /> : <div className="search"><Search size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search Onyx" /></div>}<div className="topbar-right"><div className={`server-pill ${status.running ? 'online' : ''}`}><Server size={15} />{status.running ? status.localUrl : 'Offline'}</div><div className="profile-wrap"><button className="profile-button" onClick={event => { event.stopPropagation(); setProfileMenu(v => !v); }}><UserRound size={16} />{activeUser?.name ?? 'User'}<ChevronDown size={14} /></button>{profileMenu && <div className="profile-menu" onClick={event => event.stopPropagation()}><div className="profile-label">Profiles</div>{users.map(user => <button key={user.id} className={user.id === activeUserId ? 'active' : ''} onClick={() => void switchUser(user.id)}><UserRound size={15} />{user.name}{user.isAdmin && <small>Owner</small>}</button>)}<div className="context-separator" /><button onClick={() => void openHidden()}><EyeOff size={15} />Hidden media</button>{!isDesktop && <button onClick={() => void signOut()}><LogOut size={15} />Sign out</button>}</div>}</div></div></header>
    {sidebar}
    {selected ? <main className="content player-content"><section className="player-page" style={selected.backdropUrl ? { backgroundImage: `linear-gradient(rgba(4,6,8,.82),rgba(4,6,8,.98)),url(${resolveMediaUrl(selected.backdropUrl)})` } : undefined}><div className="player-page-header"><button className="back-button" data-player-back onClick={closePlayer}><ArrowLeft size={18} />Back</button><div><p className="eyebrow">{selected.kind === 'episode' ? selected.showTitle : 'MOVIE'}</p><h1>{selected.title}</h1><p>{selected.kind === 'episode' ? episodeLabel(selected) : selected.year ?? ''}</p><MetadataSummary item={selected} /></div></div><div className="video-stage"><video ref={videoRef} controls autoPlay onPause={() => void saveProgress(true)} onTimeUpdate={() => void saveProgress()}><source src={resolveMediaUrl(selected.streamUrl)} />{playableSubtitles.map(subtitle => <track key={subtitle.url} kind="subtitles" src={resolveMediaUrl(subtitle.url)} srcLang={subtitle.language} label={subtitle.label} />)}</video></div><div className="player-toolbar"><div className="player-meta">{[selected.container, selected.videoCodec, selected.audioCodec, selected.height ? `${selected.height}p` : null].filter(Boolean).join(' · ')}</div><label className="subtitle-control"><Subtitles size={18} /><span>Subtitles</span><select value={subtitleChoice} onChange={event => changeSubtitle(event.target.value)}><option value="off">Off</option>{playableSubtitles.map((subtitle, index) => <option key={subtitle.url} value={String(index)}>{subtitle.label}{subtitle.forced ? ' · Forced' : ''}</option>)}</select></label></div></section></main> : <main className="content">
      {error && <div className="error-banner">{error}</div>}
      {section === 'home' && <div className="home-page"><section className="onyx-hero"><p className="eyebrow">WELCOME BACK</p><h1>{activeUser?.name ? `${activeUser.name}'s Onyx` : 'Onyx'}</h1><p>Your movies, television and optional music—without the clutter.</p><div className="hero-links"><button onClick={() => navigate('movies')}>View movies</button><button onClick={() => navigate('tv')}>View TV shows</button><button onClick={() => navigate('live')}>Live TV</button><button onClick={() => navigate('music')}>Open music</button></div></section>{continueItems.length > 0 && <Rail title="Continue Watching">{continueItems.map(item => <MediaCard key={item.id} item={item} onPlay={startPlayback} onMenu={(e, v) => openMenu(e, { type: 'item', item: v })} />)}</Rail>}<Rail title="Recently Added Shows" actionLabel="View shows" onAction={() => navigate('tv')}>{recentShows.map(show => <ShowCard key={show.title} show={show} onOpen={value => { setSection('tv'); setSelectedShowTitle(value.title); }} onMenu={(e, v) => openMenu(e, { type: 'show', show: v })} />)}</Rail><Rail title="Recently Added Movies" actionLabel="View movies" onAction={() => navigate('movies')}>{recentMovies.map(item => <MediaCard key={item.id} item={item} onPlay={startPlayback} onMenu={(e, v) => openMenu(e, { type: 'item', item: v })} />)}</Rail></div>}
      {section === 'movies' && <><PageHero eyebrow="MOVIES" title="Movies" subtitle={`${movies.length} titles`} /><section className="gallery">{visibleMovies.map(item => <MediaCard key={item.id} item={item} onPlay={startPlayback} onMenu={(e, v) => openMenu(e, { type: 'item', item: v })} />)}</section></>}
      {section === 'tv' && !selectedShow && <><PageHero eyebrow="TELEVISION" title="TV Shows" subtitle={`${shows.length} shows · ${episodes.length} episodes`} /><section className="gallery show-gallery">{visibleShows.map(show => <ShowCard key={show.title} show={show} onOpen={value => { setSelectedShowTitle(value.title); setQuery(''); }} onMenu={(e, v) => openMenu(e, { type: 'show', show: v })} />)}</section></>}
      {section === 'tv' && selectedShow && <><section className="show-hero compact-hero" style={showBackdrop ? { backgroundImage: `linear-gradient(90deg,var(--bg) 0%,rgba(5,7,10,.80) 60%),url(${resolveMediaUrl(showBackdrop)})` } : undefined}><div><button className="back-button" onClick={() => { setSelectedShowTitle(null); setQuery(''); }}><ArrowLeft size={18} />All TV shows</button><p className="eyebrow">TV SHOW</p><h1>{selectedShow.title}</h1><p>{selectedShow.seasons} seasons · {selectedShow.episodes.length} episodes {allWatched(selectedShow.episodes) ? '· Watched' : ''}</p><MetadataSummary item={selectedShow.representative} /></div><div className="view-toggle"><button className={tvView === 'season' ? 'active' : ''} onClick={() => setTvView('season')}><Layers3 size={17} />By season</button><button className={tvView === 'list' ? 'active' : ''} onClick={() => setTvView('list')}><List size={17} />All episodes</button></div></section>{tvView === 'list' ? <section className="gallery episode-grid">{showEpisodes.map(item => <MediaCard key={item.id} item={item} onPlay={startPlayback} onMenu={(e, v) => openMenu(e, { type: 'item', item: v })} />)}</section> : <div className="season-groups">{seasonGroups.map(group => <section className="season-section" key={group.season}><div className="season-heading" onContextMenu={e => openMenu(e, { type: 'season', showTitle: selectedShow.title, season: group.season, items: group.items })}><div><p>{selectedShow.title}</p><h2>{group.season === 0 ? 'Episodes' : `Season ${group.season}`} {allWatched(group.items) && <Check size={18} />}</h2><ProgressLine value={groupPercent(group.items)} /></div><span>{group.items.length} episodes</span></div><div className="gallery">{group.items.map(item => <MediaCard key={item.id} item={item} onPlay={startPlayback} onMenu={(e, v) => openMenu(e, { type: 'item', item: v })} />)}</div></section>)}</div>}</>}
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
