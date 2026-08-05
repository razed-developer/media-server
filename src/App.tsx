import { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Film, FolderOpen, Play, RefreshCw, Search, Server, Tv } from 'lucide-react';
import type { MediaItem, ServerStatus } from './types';

const fallbackStatus: ServerStatus = {
  running: false,
  localUrl: 'http://127.0.0.1:8765',
  itemCount: 0,
};

function App() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [status, setStatus] = useState<ServerStatus>(fallbackStatus);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'movie' | 'episode'>('all');
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const refresh = async () => {
    try {
      const [library, serverStatus] = await Promise.all([
        invoke<MediaItem[]>('list_media'),
        invoke<ServerStatus>('server_status'),
      ]);
      setItems(library);
      setStatus(serverStatus);
      setError(null);
    } catch (cause) {
      setError(String(cause));
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesFilter = filter === 'all' || item.kind === filter;
      const haystack = `${item.title} ${item.showTitle ?? ''}`.toLowerCase();
      return matchesFilter && (!normalized || haystack.includes(normalized));
    });
  }, [items, query, filter]);

  const chooseLibrary = async () => {
    const selectedPath = await open({ directory: true, multiple: false });
    if (!selectedPath || Array.isArray(selectedPath)) return;
    try {
      await invoke('set_library_path', { path: selectedPath });
      await refresh();
    } catch (cause) {
      setError(String(cause));
    }
  };

  const rescan = async () => {
    try {
      await invoke('scan_library');
      await refresh();
    } catch (cause) {
      setError(String(cause));
    }
  };

  const openPlayer = (item: MediaItem) => setSelected(item);

  const saveProgress = async () => {
    if (!selected || !videoRef.current) return;
    const current = Math.floor(videoRef.current.currentTime);
    try {
      await invoke('save_progress', { id: selected.id, seconds: current });
      setItems((existing) => existing.map((item) => item.id === selected.id ? { ...item, progressSeconds: current } : item));
    } catch {
      // Playback should not be interrupted if progress persistence fails.
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!selected || !video) return;
    const resume = () => {
      if (selected.progressSeconds > 5 && video.currentTime < 1) {
        video.currentTime = selected.progressSeconds;
      }
    };
    video.addEventListener('loadedmetadata', resume);
    return () => video.removeEventListener('loadedmetadata', resume);
  }, [selected]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">H</span><span>Home Media</span></div>
        <div className="search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your library" /></div>
        <div className={`server-pill ${status.running ? 'online' : ''}`}><Server size={16} />{status.running ? status.localUrl : 'Server offline'}</div>
      </header>

      <aside className="sidebar">
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}><Film size={19} />All</button>
        <button className={filter === 'movie' ? 'active' : ''} onClick={() => setFilter('movie')}><Film size={19} />Movies</button>
        <button className={filter === 'episode' ? 'active' : ''} onClick={() => setFilter('episode')}><Tv size={19} />TV Shows</button>
        <div className="sidebar-spacer" />
        <button onClick={chooseLibrary}><FolderOpen size={19} />Choose folder</button>
        <button onClick={rescan}><RefreshCw size={19} />Rescan</button>
      </aside>

      <main className="content">
        <section className="hero">
          <div>
            <p className="eyebrow">YOUR COLLECTION</p>
            <h1>Movies and television.<br />Nothing in the way.</h1>
            <p>{status.libraryPath ? `${status.itemCount} titles from ${status.libraryPath}` : 'Choose a media folder to begin.'}</p>
          </div>
        </section>

        {error && <div className="error-banner">{error}</div>}

        {visibleItems.length === 0 ? (
          <section className="empty-state">
            <Film size={42} />
            <h2>No media found</h2>
            <p>Choose a folder containing MP4, MKV, WebM, M4V, AVI or MOV files. Names such as <code>Show Name S01E02.mkv</code> are recognized as episodes.</p>
            <button className="primary" onClick={chooseLibrary}><FolderOpen size={18} />Choose media folder</button>
          </section>
        ) : (
          <section className="gallery">
            {visibleItems.map((item) => (
              <article className="media-card" key={item.id} onClick={() => openPlayer(item)}>
                <div className="poster">
                  <div className="poster-letter">{(item.showTitle ?? item.title).charAt(0)}</div>
                  <button aria-label={`Play ${item.title}`}><Play fill="currentColor" size={21} /></button>
                  {item.progressSeconds > 0 && <div className="progress"><span style={{ width: `${Math.min(100, ((item.progressSeconds / (item.durationSeconds || 5400)) * 100))}%` }} /></div>}
                </div>
                <h3>{item.kind === 'episode' ? item.showTitle : item.title}</h3>
                <p>{item.kind === 'episode' ? `S${String(item.season).padStart(2, '0')} E${String(item.episode).padStart(2, '0')} · ${item.title}` : item.year ?? 'Movie'}</p>
              </article>
            ))}
          </section>
        )}
      </main>

      {selected && (
        <div className="player-overlay" onClick={() => { void saveProgress(); setSelected(null); }}>
          <div className="player-panel" onClick={(event) => event.stopPropagation()}>
            <div className="player-heading">
              <div><p>{selected.kind === 'episode' ? selected.showTitle : 'MOVIE'}</p><h2>{selected.title}</h2></div>
              <button onClick={() => { void saveProgress(); setSelected(null); }}>Close</button>
            </div>
            <video ref={videoRef} controls autoPlay onPause={saveProgress} onTimeUpdate={(event) => { if (Math.floor(event.currentTarget.currentTime) % 15 === 0) void saveProgress(); }}>
              <source src={selected.streamUrl} />
              {selected.subtitles.map((subtitle) => <track key={subtitle.url} kind="subtitles" src={subtitle.url} srcLang={subtitle.language} label={subtitle.label} />)}
            </video>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
