import { Star } from 'lucide-react';
import type { MediaItem } from '../../types';

export function MetadataSummary({ item }: { item: MediaItem }) {
  if (!item.overview && !item.genres?.length && item.rating == null && !item.releaseDate) return null;
  return <div className="metadata-detail"><div className="metadata-chips">{item.releaseDate && <span>{item.releaseDate}</span>}{item.rating != null && <span className="metadata-rating"><Star size={12} fill="currentColor" /> {item.rating.toFixed(1)}</span>}{item.genres?.map(genre => <span key={genre}>{genre}</span>)}{item.provider && item.providerId && <span>{item.provider.toUpperCase()} #{item.providerId}</span>}</div>{item.overview && <p>{item.overview}</p>}</div>;
}
