import type { MouseEvent as ReactMouseEvent } from 'react';
import type { MediaItem } from '../types';
import { PageHero } from '../components/layout/PageHero';
import { MediaCard } from '../components/media/MediaCard';

export function MediaGalleryPage({ eyebrow, title, subtitle, items, onPlay, onMenu }: { eyebrow: string; title: string; subtitle: string; items: MediaItem[]; onPlay: (item: MediaItem) => void; onMenu: (event: ReactMouseEvent, item: MediaItem) => void }) {
  return <><PageHero eyebrow={eyebrow} title={title} subtitle={subtitle} /><section className="gallery">{items.map(item => <MediaCard key={item.id} item={item} onPlay={onPlay} onMenu={onMenu} />)}</section></>;
}
