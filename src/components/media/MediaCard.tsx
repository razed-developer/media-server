import { Play } from 'lucide-react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { MediaItem } from '../../types';
import { resolveMediaUrl } from '../../api';
import { ProgressLine, WatchedBadge } from './MediaStatus';

export type MediaArtwork = 'default' | 'poster' | 'thumbnail';

type MediaCardProps = {
  item: MediaItem;
  artwork?: MediaArtwork;
  onPlay: (item: MediaItem) => void;
  onMenu: (event: ReactMouseEvent, item: MediaItem) => void;
  watched?: (item: MediaItem) => boolean;
  progress?: (item: MediaItem) => number;
  episodeLabel?: (item: MediaItem) => string;
  resolveUrl?: (url?: string) => string | undefined;
};

export function MediaCard({ item, artwork = 'default', onPlay, onMenu, watched = value => Boolean(value.lastWatchedAt), progress = value => value.durationSeconds ? value.progressSeconds / value.durationSeconds * 100 : 0, episodeLabel = value => `S${String(value.season ?? 0).padStart(2, '0')} · E${String(value.episode ?? 0).padStart(2, '0')}`, resolveUrl = resolveMediaUrl }: MediaCardProps) {
  const landscape = artwork === 'thumbnail' || (artwork === 'default' && item.kind === 'episode');
  const image = artwork === 'poster' ? (item.posterUrl ?? item.thumbnailUrl) : artwork === 'thumbnail' ? (item.thumbnailUrl ?? item.posterUrl) : item.kind === 'episode' ? item.thumbnailUrl : item.posterUrl;
  return <article className={`media-card ${landscape ? 'episode-card' : ''}`} onClick={() => onPlay(item)} onContextMenu={event => onMenu(event, item)}><div className="poster">{image ? <img className="poster-image" src={resolveUrl(image)} alt="" loading="lazy" /> : <div className="poster-letter">{item.title.charAt(0)}</div>}<WatchedBadge done={watched(item)} /><button aria-label={`Play ${item.title}`}><Play fill="currentColor" size={21} /></button></div><ProgressLine value={progress(item)} /><h3>{item.title}</h3><p>{item.kind === 'episode' ? episodeLabel(item) : item.kind === 'special' ? [item.year, item.genres[0] ?? 'Special'].filter(Boolean).join(' · ') : item.year ?? 'Movie'}</p></article>;
}
