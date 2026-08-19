import { useEffect, useMemo, useRef, useState } from 'react';
import { Film, FolderOpen, Layers3, List, Play, RefreshCw, Search, Server, Tv } from 'lucide-react';
import {
  chooseLibraryPath,
  getServerStatus,
  isTauriDesktop,
  listMedia,
  rescanLibrary,
  resolveMediaUrl,
  saveProgress as persistProgress,
  setLibraryPath,
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

const episodeLabel = (item: MediaItem) => {
  if (item.season == null || item.episode == null) return item.title;
  const end = item.episodeEnd != null ? `-${String(item.episodeEnd).padStart(2, '0')}` : '';
  return `S${String(item.season).padStart(2, '0')} E${String(item.episode).padStart(2, '0')}${end} · ${item.title}`;
};

function MediaCard({ item, onPlay }: { item: MediaItem; onPlay: (item: MediaItem) => void }) {
  const displayTitle = item.kind === 'episode' ? item.showTitle ?? item.title : item.title;
  const detail = item.kind === 'episode' ? episodeLabel(item) : item.year ?? 'Movie';
  const progress = item.durationSeconds
    ? Math.min(100, (item.progressSeconds / item.durationSeconds) * 100)
    : 0;

  return (
    <article className="media-card" onClick={() => onPlay(item)}>
      <div className="poster">
        {item.posterUrl
          ? <img className="poster-image" src={resolveMediaUrl(item.posterUrl)} alt="" loading="lazy" />
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

function App() {
  const isDesktop = isTauriDesktop();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [status, setStatus] = useState<ServerStatus>(fallbackStatus);
  const [query, setQuery] = useState('');
  const [section, setSection] = useState<Section>('movies');
  const [tvView, setTvView] = useState<TvView>('season');
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

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

  useEffect(() => { void refresh(); }, []);

  const movies = useMemo(() => items.filter((item) => item.kind === 'movie'), [items]);
  const episodes = useMemo(() => items
    .filter((item) => item.kind === 'episode')
    .sort((a, b) => (a.showTitle ?? '').localeCompare(b.showTitle ?? '') || (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0)), [items]);

  const searchFilter = (item: MediaItem) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;
    return `${item.title} ${item.showTitle ?? ''} ${item.year ?? ''}`.toLowerCase().includes(normalized);
  };

  const visibleMovies = useMemo(() => movies.filter(searchFilter), [movies, query]);
  const visibleEpisodes = useMemo(() => episodes.filter(searchFilter), [episodes, query]);

  const seasonGroups = useMemo(() => {
    const groups = new Map<string, MediaItem[]>();
    for (const item of visibleEpisodes) {
      const key = `${item.showTitle ?? 'TV'}|||${item.season ?? 0}`;
      const group = groups.get(key) ?? [];
      group.push(item);
      groups.set(key, group);
    }
    return [...groups.entries()].map(([key, group]) => {
      const [showTitle, season] = key.split('|||');
      return { key, showTitle, season: Number(season), items: group };
    });
  }, [visibleEpisodes]);

  const chooseLibrary = async () => {
    if (!isDesktop) return;
    const selectedPath = await chooseLibraryPath();
    if (!selectedPath) return;
    try {
      await setLibraryPath(selectedPath);
      await refresh();
    } catch (cause) {
      setError(String(cause));
    }
  };

  const rescan = async () => {
    try {
      await rescanLibrary();
      await refresh();
    } catch (cause) {
      setError(String(cause));
    }
  };

  const saveProgress = async () => {
    if (!selected || !videoRef.current) return;
    const current = Math.floor(videoRef.current.currentTime);
    try {
      await persistProgress(selected.id, current);
      setItems((existing) => existing.map((item) => item.id === selected.id ? { ...item, progressSeconds: current } : item));
    } catch {
      // Never interrupt playback because progress persistence failed.
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!selected || !video) return;
    const resume = () => {
      if (selected.progressSeconds > 5 && video.currentTime < 1) video.currentTime = selected.progressSeconds;
    };
    video.addEventListener('loadedmetadata', resume);
    return () => video.removeEventListener('loadedmetadata', resume);
  }, [selected]);

  const playableSubtitles = selected?.subtitles.filter((subtitle) => subtitle.url) ?? [];
  const hasLibrary = Boolean(status.libraryPath) || items.length > 0;
  const needsFfmpeg = selected?.playbackMode !== 'directPlay' || Boolean(selected?.subtitles.some((subtitle) => subtitle.embedded));

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">H</span><span>Home Media</span></div>
        <div className="search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${section === 'movies' ? 'movies' : 'TV'}`} /></div>
        <div className={`server-pill ${status.running ? 'online' : ''}`}><Server size={16} />{status.running ? status.localUrl : 'Server offline'}</div>
      </header>

      <aside className="sidebar">
        <button className={section === 'movies' ? 'active' : ''} onClick={() => setSection('movies')}><Film size={19} />Movies</button>
        <button className={section === 'tv' ? 'active' : ''} onClick={() => setSection('tv')}><Tv size={19} />TV</button>
        <div className="sidebar-spacer" />
        {isDesktop ? (
          <>
            <button onClick={chooseLibrary}><FolderOpen size={19} />Choose folder</button>
            <button onClick={rescan}><RefreshCw size={19} />Rescan</button>
          </>
        ) : (
          <div className="browser-mode"><Server size={17} /><span>Browser client</span></div>
        )}
      </aside>

      <main className="content">
        <section className="hero compact-hero">
          <div>
            <p className="eyebrow">{section === 'movies' ? 'MOVIES' : 'TELEVISION'}</p>
            <h1>{section === 'movies' ? 'Your movies.' : 'Your shows.'}</h1>
            <p>{hasLibrary ? `${movies.length} movies · ${episodes.length} episodes` : isDesktop ? 'Choose a media folder to begin.' : 'The server library is empty.'}</p>
            {!status.ffprobeAvailable && hasLibrary && <p className="probe-note">FFprobe not detected — file identification still works, but codec, duration and embedded-subtitle inspection is unavailable.</p>}
            {!status.ffmpegAvailable && items.some((item) => item.playbackMode !== 'directPlay' || item.subtitles.some((subtitle) => subtitle.embedded)) && <p className="probe-note">FFmpeg not detected — some files and embedded subtitles will not play until FFmpeg is installed.</p>}
          </div>
          {section === 'tv' && (
            <div className="view-toggle" aria-label="TV layout">
              <button className={tvView === 'season' ? 'active' : ''} onClick={() => setTvView('season')}><Layers3 size={17} />By season</button>
              <button className={tvView === 'list' ? 'active' : ''} onClick={() => setTvView('list')}><List size={17} />All episodes</button>
            </div>
          )}
        </section>

        {error && <div className="error-banner">{error}</div>}

        {section === 'movies' && (
          visibleMovies.length === 0 ? <EmptyState onChoose={isDesktop ? chooseLibrary : undefined} label="movies" /> :
          <section className="gallery">{visibleMovies.map((item) => <MediaCard key={item.id} item={item} onPlay={setSelected} />)}</section>
        )}

        {section === 'tv' && tvView === 'list' && (
          visibleEpisodes.length === 0 ? <EmptyState onChoose={isDesktop ? chooseLibrary : undefined} label="TV episodes" /> :
          <section className="episode-list">{visibleEpisodes.map((item) => (
            <button key={item.id} className="episode-row" onClick={() => setSelected(item)}>
              <span className="episode-show">{item.showTitle ?? 'TV'}</span>
              <span className="episode-number">{item.season == null ? '—' : `S${String(item.season).padStart(2, '0')}E${String(item.episode ?? 0).padStart(2, '0')}`}</span>
              <span className="episode-title">{item.title}</span>
              <Play size={17} />
            </button>
          ))}</section>
        )}

        {section === 'tv' && tvView === 'season' && (
          seasonGroups.length === 0 ? <EmptyState onChoose={isDesktop ? chooseLibrary : undefined} label="TV episodes" /> :
          <div className="season-groups">{seasonGroups.map((group) => (
            <section className="season-section" key={group.key}>
              <div className="season-heading"><div><p>{group.showTitle}</p><h2>{group.season === 0 ? 'Episodes' : `Season ${group.season}`}</h2></div><span>{group.items.length} episodes</span></div>
              <div className="gallery">{group.items.map((item) => <MediaCard key={item.id} item={item} onPlay={setSelected} />)}</div>
            </section>
          ))}</div>
        )}
      </main>

      {selected && (
        <div className="player-overlay" onClick={() => { void saveProgress(); setSelected(null); }}>
          <div className="player-panel" onClick={(event) => event.stopPropagation()}>
            <div className="player-heading">
              <div><p>{selected.kind === 'episode' ? `${selected.showTitle} · ${episodeLabel(selected)}` : 'MOVIE'}</p><h2>{selected.title}</h2><span className="media-tech">{[selected.container, selected.videoCodec, selected.audioCodec, selected.height ? `${selected.height}p` : null].filter(Boolean).join(' · ')}</span></div>
              <button onClick={() => { void saveProgress(); setSelected(null); }}>Close</button>
            </div>
            {selected.playbackMode !== 'directPlay' && status.ffmpegAvailable && <div className="playback-warning">FFmpeg {selected.playbackMode === 'remux' ? 'remux' : 'transcoding'} is active for this file.</div>}
            {needsFfmpeg && !status.ffmpegAvailable && <div className="playback-warning">This file needs FFmpeg for compatible playback or embedded subtitles. Install FFmpeg on the server and restart Home Media.</div>}
            <video ref={videoRef} controls autoPlay onPause={saveProgress} onTimeUpdate={(event) => { if (Math.floor(event.currentTarget.currentTime) % 15 === 0) void saveProgress(); }}>
              <source src={resolveMediaUrl(selected.streamUrl)} />
              {playableSubtitles.map((subtitle) => <track key={subtitle.url} kind="subtitles" src={resolveMediaUrl(subtitle.url)} srcLang={subtitle.language} label={subtitle.label} default={subtitle.default} />)}
            </video>
            {selected.subtitles.some((subtitle) => subtitle.embedded) && status.ffmpegAvailable && <div className="embedded-note">Embedded subtitles available: {selected.subtitles.filter((subtitle) => subtitle.embedded).map((subtitle) => subtitle.label).join(', ')}.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ onChoose, label }: { onChoose?: () => void; label: string }) {
  return <section className="empty-state"><Film size={42} /><h2>No {label} found</h2><p>{onChoose ? 'Choose a media folder or rescan after adding files.' : 'Add media using the Home Media desktop server, then reload this page.'}</p>{onChoose && <button className="primary" onClick={onChoose}><FolderOpen size={18} />Choose media folder</button>}</section>;
}

export default App;
