import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, Film, FolderOpen, Image, KeyRound, Layers3, List, LogOut, Play, RefreshCw, Search, Server, Tv } from 'lucide-react';
import {
  chooseLibraryPath,
  clearAccessPassword,
  clearThumbnailCache,
  getAuthStatus,
  getServerStatus,
  isTauriDesktop,
  listMedia,
  login,
  logout,
  rescanLibrary,
  resolveMediaUrl,
  saveProgress as persistProgress,
  setAccessPassword,
  setMoviePath,
  setTvPath,
} from './api';
import type { MediaItem, ServerStatus } from './types';

const fallbackStatus: ServerStatus = {
  running: false,
  localUrl: 'http://127.0.0.1:8765',
  itemCount: 0,
  ffprobeAvailable: false,
  ffmpegAvailable: false,
};

type Section = 'movies' | 'tv';
type TvView = 'season' | 'list';

type TvShow = {
  title: string;
  episodes: MediaItem[];
  representative: MediaItem;
  seasons: number;
};

const episodeLabel = (item: MediaItem) => {
  if (item.season == null || item.episode == null) return item.title;
  const end = item.episodeEnd != null ? `-${String(item.episodeEnd).padStart(2, '0')}` : '';
  return `S${String(item.season).padStart(2, '0')} E${String(item.episode).padStart(2, '0')}${end} · ${item.title}`;
};

const formatBytes = (bytes = 0) => bytes < 1024 * 1024
  ? `${Math.round(bytes / 1024)} KB`
  : `${(bytes / 1024 / 1024).toFixed(bytes > 100 * 1024 * 1024 ? 0 : 1)} MB`;

function MediaCard({ item, onPlay }: { item: MediaItem; onPlay: (item: MediaItem) => void }) {
  const displayTitle = item.kind === 'episode' ? item.title : item.title;
  const detail = item.kind === 'episode' ? episodeLabel(item) : item.year ?? 'Movie';
  const progress = item.durationSeconds ? Math.min(100, (item.progressSeconds / item.durationSeconds) * 100) : 0;
  const image = item.kind === 'episode' ? item.thumbnailUrl : item.posterUrl;

  return (
    <article className={`media-card ${item.kind === 'episode' ? 'episode-card' : ''}`} onClick={() => onPlay(item)}>
      <div className="poster">
        {image
          ? <img className="poster-image" src={resolveMediaUrl(image)} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
          : <div className="poster-letter">{displayTitle.charAt(0)}</div>}
        <span className={`mode-badge ${item.playbackMode}`}>{item.playbackMode === 'directPlay' ? 'Direct' : item.playbackMode}</span>
        <button aria-label={`Play ${item.title}`}><Play fill="currentColor" size={21} /></button>
        {progress > 0 && <div className="progress"><span style={{ width: `${progress}%` }} /></div>}
      </div>
      <h3>{displayTitle}</h3>
      <p>{detail}</p>
    </article>
  );
}

function ShowCard({ show, onOpen }: { show: TvShow; onOpen: (show: TvShow) => void }) {
  const image = show.representative.posterUrl;
  const episodeCount = show.episodes.length;
  return (
    <article className="media-card show-card" onClick={() => onOpen(show)}>
      <div className="poster">
        {image
          ? <img className="poster-image" src={resolveMediaUrl(image)} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
          : <div className="poster-letter">{show.title.charAt(0)}</div>}
        <button aria-label={`Open ${show.title}`}><Play size={21} /></button>
      </div>
      <h3>{show.title}</h3>
      <p>{show.seasons} {show.seasons === 1 ? 'season' : 'seasons'} · {episodeCount} {episodeCount === 1 ? 'episode' : 'episodes'}</p>
    </article>
  );
}

function App() {
  const isDesktop = isTauriDesktop();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [status, setStatus] = useState<ServerStatus>(fallbackStatus);
  const [query, setQuery] = useState('');
  const [section, setSection] = useState<Section>('movies');
  const [tvView, setTvView] = useState<TvView>('season');
  const [selectedShowTitle, setSelectedShowTitle] = useState<string | null>(null);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(isDesktop);
  const [authenticated, setAuthenticated] = useState(isDesktop);
  const [loginPassword, setLoginPassword] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastProgressSaveRef = useRef(0);

  const refresh = async () => {
    try {
      const [library, serverStatus] = await Promise.all([listMedia(), getServerStatus()]);
      setItems(library);
      setStatus(serverStatus);
      setError(null);
    } catch (cause) {
      setError(String(cause));
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      if (isDesktop) {
        await refresh();
        return;
      }
      try {
        const auth = await getAuthStatus();
        setAuthenticated(auth.authenticated);
        setAuthChecked(true);
        if (auth.authenticated) await refresh();
      } catch (cause) {
        setAuthChecked(true);
        setError(String(cause));
      }
    };
    void bootstrap();
  }, []);

  const movies = useMemo(() => items.filter((item) => item.kind === 'movie'), [items]);
  const episodes = useMemo(() => items
    .filter((item) => item.kind === 'episode')
    .sort((a, b) => (a.showTitle ?? '').localeCompare(b.showTitle ?? '') || (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0)), [items]);

  const shows = useMemo<TvShow[]>(() => {
    const grouped = new Map<string, MediaItem[]>();
    for (const episode of episodes) {
      const title = episode.showTitle?.trim() || 'TV';
      grouped.set(title, [...(grouped.get(title) ?? []), episode]);
    }
    return [...grouped.entries()]
      .map(([title, showEpisodes]) => ({
        title,
        episodes: showEpisodes,
        representative: showEpisodes[0],
        seasons: new Set(showEpisodes.map((episode) => episode.season ?? 0)).size,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [episodes]);

  const selectedShow = useMemo(() => shows.find((show) => show.title === selectedShowTitle) ?? null, [shows, selectedShowTitle]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleMovies = useMemo(() => movies.filter((item) => !normalizedQuery || `${item.title} ${item.year ?? ''}`.toLowerCase().includes(normalizedQuery)), [movies, normalizedQuery]);
  const visibleShows = useMemo(() => shows.filter((show) => !normalizedQuery || show.title.toLowerCase().includes(normalizedQuery) || show.episodes.some((episode) => episode.title.toLowerCase().includes(normalizedQuery))), [shows, normalizedQuery]);
  const showEpisodes = useMemo(() => selectedShow?.episodes.filter((item) => !normalizedQuery || `${item.title} ${item.season ?? ''} ${item.episode ?? ''}`.toLowerCase().includes(normalizedQuery)) ?? [], [selectedShow, normalizedQuery]);

  const seasonGroups = useMemo(() => {
    const groups = new Map<number, MediaItem[]>();
    for (const item of showEpisodes) {
      const season = item.season ?? 0;
      groups.set(season, [...(groups.get(season) ?? []), item]);
    }
    return [...groups.entries()].sort(([a], [b]) => a - b).map(([season, group]) => ({ season, items: group }));
  }, [showEpisodes]);

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoginBusy(true);
    setError(null);
    try {
      await login(loginPassword);
      setAuthenticated(true);
      setLoginPassword('');
      await refresh();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setLoginBusy(false);
    }
  };

  const chooseMediaFolder = async (kind: Section) => {
    if (!isDesktop) return;
    const path = await chooseLibraryPath();
    if (!path) return;
    try {
      kind === 'movies' ? await setMoviePath(path) : await setTvPath(path);
      await refresh();
    } catch (cause) {
      setError(String(cause));
    }
  };

  const configurePassword = async () => {
    if (!isDesktop) return;
    if (status.accessPasswordSet) {
      if (!window.confirm('Browser access is password protected. Click OK to remove the password, or Cancel to keep it.')) return;
      try {
        await clearAccessPassword();
        await refresh();
      } catch (cause) {
        setError(String(cause));
      }
      return;
    }
    const password = window.prompt('Set a browser access password (minimum 8 characters):');
    if (!password) return;
    try {
      await setAccessPassword(password);
      await refresh();
    } catch (cause) {
      setError(String(cause));
    }
  };

  const clearThumbs = async () => {
    if (!isDesktop) return;
    if (!window.confirm('Clear generated episode thumbnails? They will be recreated as needed.')) return;
    try {
      await clearThumbnailCache();
      await refresh();
    } catch (cause) {
      setError(String(cause));
    }
  };

  const signOut = async () => {
    await logout();
    setAuthenticated(false);
    setItems([]);
  };

  const rescan = async () => {
    try {
      await rescanLibrary();
      await refresh();
    } catch (cause) {
      setError(String(cause));
    }
  };

  const saveProgress = async (force = false) => {
    if (!selected || !videoRef.current) return;
    const current = Math.floor(videoRef.current.currentTime);
    if (!force && Math.abs(current - lastProgressSaveRef.current) < 15) return;
    lastProgressSaveRef.current = current;
    try {
      await persistProgress(selected.id, current);
      setItems((existing) => existing.map((item) => item.id === selected.id ? { ...item, progressSeconds: current } : item));
    } catch {
      // Playback should never be interrupted because progress persistence failed.
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!selected || !video) return;
    lastProgressSaveRef.current = selected.progressSeconds;
    const resume = () => {
      if (selected.progressSeconds > 5 && video.currentTime < 1) video.currentTime = selected.progressSeconds;
    };
    video.addEventListener('loadedmetadata', resume);
    return () => video.removeEventListener('loadedmetadata', resume);
  }, [selected]);

  useEffect(() => {
    if (section !== 'tv') setSelectedShowTitle(null);
  }, [section]);

  if (!authChecked) return <div className="login-shell"><div className="login-card"><div className="brand-mark">H</div><h1>Home Media</h1><p>Connecting to your media server…</p></div></div>;

  if (!isDesktop && !authenticated) {
    return <div className="login-shell"><form className="login-card" onSubmit={submitLogin}><div className="brand-mark">H</div><p className="eyebrow">PRIVATE LIBRARY</p><h1>Home Media</h1><p>Enter the server access password.</p><input type="password" autoFocus autoComplete="current-password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} placeholder="Password" />{error && <div className="login-error">{error}</div>}<button className="primary" type="submit" disabled={loginBusy || !loginPassword}>{loginBusy ? 'Signing in…' : 'Sign in'}</button></form></div>;
  }

  const playableSubtitles = selected?.subtitles.filter((subtitle) => subtitle.url) ?? [];
  const hasLibrary = Boolean(status.moviePath || status.tvPath || status.libraryPath) || items.length > 0;
  const needsFfmpeg = selected?.playbackMode !== 'directPlay' || Boolean(selected?.subtitles.some((subtitle) => subtitle.embedded));
  const showBackdrop = selectedShow?.representative.backdropUrl;

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">H</span><span>Home Media</span></div>
      <div className="search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={section === 'movies' ? 'Search movies' : selectedShow ? `Search ${selectedShow.title}` : 'Search TV shows'} /></div>
      <div className={`server-pill ${status.running ? 'online' : ''}`}><Server size={16} />{status.running ? status.localUrl : 'Server offline'}</div>
    </header>

    <aside className="sidebar">
      <button className={section === 'movies' ? 'active' : ''} onClick={() => setSection('movies')}><Film size={19} />Movies</button>
      <button className={section === 'tv' ? 'active' : ''} onClick={() => { setSection('tv'); setSelectedShowTitle(null); }}><Tv size={19} />TV</button>
      <div className="sidebar-spacer" />
      {isDesktop ? <>
        <button onClick={() => chooseMediaFolder('movies')}><FolderOpen size={19} />Movie folder</button>
        <button onClick={() => chooseMediaFolder('tv')}><FolderOpen size={19} />TV folder</button>
        <button onClick={rescan}><RefreshCw size={19} />Rescan</button>
        <button onClick={clearThumbs}><Image size={19} />Clear thumbnails</button>
        <div className="browser-mode"><Image size={17} /><span>Artwork {formatBytes(status.artworkCacheBytes)}</span></div>
        <button onClick={configurePassword}><KeyRound size={19} />{status.accessPasswordSet ? 'Remove password' : 'Set access password'}</button>
      </> : <>
        <div className="browser-mode"><Server size={17} /><span>Browser client</span></div>
        <button onClick={signOut}><LogOut size={19} />Sign out</button>
      </>}
    </aside>

    <main className="content">
      {section === 'tv' && selectedShow ? (
        <section className="show-hero compact-hero" style={showBackdrop ? { backgroundImage: `linear-gradient(90deg, rgba(10,12,15,.96), rgba(10,12,15,.78)), url(${resolveMediaUrl(showBackdrop)})` } : undefined}>
          <div>
            <button className="back-button" onClick={() => { setSelectedShowTitle(null); setQuery(''); }}><ArrowLeft size={18} />All TV shows</button>
            <p className="eyebrow">TV SHOW</p>
            <h1>{selectedShow.title}</h1>
            <p>{selectedShow.seasons} {selectedShow.seasons === 1 ? 'season' : 'seasons'} · {selectedShow.episodes.length} episodes</p>
          </div>
          <div className="view-toggle" aria-label="TV layout">
            <button className={tvView === 'season' ? 'active' : ''} onClick={() => setTvView('season')}><Layers3 size={17} />By season</button>
            <button className={tvView === 'list' ? 'active' : ''} onClick={() => setTvView('list')}><List size={17} />All episodes</button>
          </div>
        </section>
      ) : (
        <section className="hero compact-hero">
          <div>
            <p className="eyebrow">{section === 'movies' ? 'MOVIES' : 'TELEVISION'}</p>
            <h1>{section === 'movies' ? 'Your movies.' : 'Your shows.'}</h1>
            <p>{hasLibrary ? `${movies.length} movies · ${shows.length} shows · ${episodes.length} episodes` : isDesktop ? 'Choose your Movies and TV folders to begin.' : 'The server library is empty.'}</p>
            {isDesktop && section === 'movies' && status.moviePath && <p className="library-path">{status.moviePath}</p>}
            {isDesktop && section === 'tv' && status.tvPath && <p className="library-path">{status.tvPath}</p>}
            {!status.ffprobeAvailable && hasLibrary && <p className="probe-note">FFprobe not detected — file identification still works, but codec, duration and embedded-subtitle inspection is unavailable.</p>}
            {!status.ffmpegAvailable && hasLibrary && <p className="probe-note">FFmpeg not detected — generated thumbnails, normalized artwork and some playback features are unavailable.</p>}
          </div>
        </section>
      )}

      {error && <div className="error-banner">{error}</div>}

      {section === 'movies' && (visibleMovies.length === 0
        ? <EmptyState onChoose={isDesktop ? () => chooseMediaFolder('movies') : undefined} label="movies" />
        : <section className="gallery">{visibleMovies.map((item) => <MediaCard key={item.id} item={item} onPlay={setSelected} />)}</section>)}

      {section === 'tv' && !selectedShow && (visibleShows.length === 0
        ? <EmptyState onChoose={isDesktop ? () => chooseMediaFolder('tv') : undefined} label="TV shows" />
        : <section className="gallery show-gallery">{visibleShows.map((show) => <ShowCard key={show.title} show={show} onOpen={(value) => { setSelectedShowTitle(value.title); setQuery(''); }} />)}</section>)}

      {section === 'tv' && selectedShow && tvView === 'list' && (showEpisodes.length === 0
        ? <EmptyState label="episodes" />
        : <section className="episode-list">{showEpisodes.map((item) => <button key={item.id} className="episode-row" onClick={() => setSelected(item)}>{item.thumbnailUrl && <img className="episode-thumb" src={resolveMediaUrl(item.thumbnailUrl)} alt="" loading="lazy" />}<span className="episode-number">{item.season == null ? '—' : `S${String(item.season).padStart(2, '0')}E${String(item.episode ?? 0).padStart(2, '0')}`}</span><span className="episode-title">{item.title}</span><span className="episode-duration">{item.durationSeconds ? `${Math.round(item.durationSeconds / 60)} min` : ''}</span><Play size={17} /></button>)}</section>)}

      {section === 'tv' && selectedShow && tvView === 'season' && (seasonGroups.length === 0
        ? <EmptyState label="episodes" />
        : <div className="season-groups">{seasonGroups.map((group) => <section className="season-section" key={group.season}><div className="season-heading"><div><p>{selectedShow.title}</p><h2>{group.season === 0 ? 'Episodes' : `Season ${group.season}`}</h2></div><span>{group.items.length} episodes</span></div><div className="gallery">{group.items.map((item) => <MediaCard key={item.id} item={item} onPlay={setSelected} />)}</div></section>)}</div>)}
    </main>

    {selected && <div className="player-overlay" onClick={() => { void saveProgress(true); setSelected(null); }} style={selected.backdropUrl ? { backgroundImage: `linear-gradient(rgba(5,7,9,.88),rgba(5,7,9,.96)),url(${resolveMediaUrl(selected.backdropUrl)})` } : undefined}><div className="player-panel" onClick={(event) => event.stopPropagation()}><div className="player-heading"><div><p>{selected.kind === 'episode' ? `${selected.showTitle} · ${episodeLabel(selected)}` : 'MOVIE'}</p><h2>{selected.title}</h2><span className="media-tech">{[selected.container, selected.videoCodec, selected.audioCodec, selected.height ? `${selected.height}p` : null].filter(Boolean).join(' · ')}</span></div><button onClick={() => { void saveProgress(true); setSelected(null); }}>Close</button></div>{selected.playbackMode !== 'directPlay' && status.ffmpegAvailable && <div className="playback-warning">FFmpeg {selected.playbackMode === 'remux' ? 'remux' : 'transcoding'} is active for this file.</div>}{needsFfmpeg && !status.ffmpegAvailable && <div className="playback-warning">This file needs FFmpeg for compatible playback or embedded subtitles.</div>}<video ref={videoRef} controls autoPlay onPause={() => { void saveProgress(true); }} onTimeUpdate={() => { void saveProgress(); }}><source src={resolveMediaUrl(selected.streamUrl)} />{playableSubtitles.map((subtitle) => <track key={subtitle.url} kind="subtitles" src={resolveMediaUrl(subtitle.url)} srcLang={subtitle.language} label={subtitle.label} default={subtitle.default} />)}</video>{selected.subtitles.some((subtitle) => subtitle.embedded) && status.ffmpegAvailable && <div className="embedded-note">Embedded subtitles available: {selected.subtitles.filter((subtitle) => subtitle.embedded).map((subtitle) => subtitle.label).join(', ')}.</div>}</div></div>}
  </div>;
}

function EmptyState({ onChoose, label }: { onChoose?: () => void; label: string }) {
  return <section className="empty-state"><Film size={42} /><h2>No {label} found</h2><p>{onChoose ? 'Choose a media folder or rescan after adding files.' : 'Nothing matches this view.'}</p>{onChoose && <button className="primary" onClick={onChoose}><FolderOpen size={18} />Choose media folder</button>}</section>;
}

export default App;
