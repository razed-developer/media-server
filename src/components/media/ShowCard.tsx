import { Play } from 'lucide-react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { MediaItem } from '../../types';
import { ProgressLine, WatchedBadge } from './MediaStatus';

export type ShowCardModel = { title: string; episodes: MediaItem[]; representative: MediaItem; seasons: number; addedAt: number };

export function ShowCard({ show, onOpen, onMenu, resolveUrl = value => value, watched = values => values.every(value => Boolean(value.lastWatchedAt)), progress = values => values.length ? values.reduce((total, value) => total + (value.durationSeconds ? value.progressSeconds / value.durationSeconds * 100 : 0), 0) / values.length : 0 }: { show: ShowCardModel; onOpen: (show: ShowCardModel) => void; onMenu: (event: ReactMouseEvent, show: ShowCardModel) => void; resolveUrl?: (url?: string) => string | undefined; watched?: (items: MediaItem[]) => boolean; progress?: (items: MediaItem[]) => number }) {
  const primary = resolveUrl(show.representative.posterUrl), fallback = resolveUrl(show.representative.thumbnailUrl);
  return <article className="media-card show-card" onClick={() => onOpen(show)} onContextMenu={event => onMenu(event, show)}><div className="poster">{primary || fallback ? <img className="poster-image" src={primary || fallback} alt="" loading="lazy" onError={event => { if (fallback && event.currentTarget.src !== fallback) event.currentTarget.src = fallback; else event.currentTarget.style.display = 'none'; }} /> : <div className="poster-letter">{show.title.charAt(0)}</div>}<WatchedBadge done={watched(show.episodes)} /><button aria-label={`Open ${show.title}`}><Play size={21} /></button></div><ProgressLine value={progress(show.episodes)} /><h3>{show.title}</h3><p>{show.seasons} {show.seasons === 1 ? 'season' : 'seasons'} · {show.episodes.length} episodes</p></article>;
}
