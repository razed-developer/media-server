import type { MouseEvent as ReactMouseEvent } from 'react';
import type { MediaItem } from '../types';
import { PageHero } from '../components/layout/PageHero';
import { MediaCard } from '../components/media/MediaCard';

export type CollectionGroup = { folder: string; values: MediaItem[] };

export function CollectionPage({ name, total, groups, onPlay, onMenu }: { name: string; total: number; groups: CollectionGroup[]; onPlay: (item: MediaItem) => void; onMenu: (event: ReactMouseEvent, item: MediaItem) => void }) {
  return <><PageHero eyebrow="COLLECTION" title={name} subtitle={`${total} files`} /><div className="season-groups">{groups.map(group => <section className="season-section" key={group.folder}><div className="season-heading"><div><p>{name}</p><h2>{group.folder}</h2></div><span>{group.values.length} {group.values.length === 1 ? 'file' : 'files'}</span></div><div className="gallery episode-grid">{group.values.map(item => <MediaCard key={item.id} item={item} artwork="thumbnail" onPlay={onPlay} onMenu={onMenu} />)}</div></section>)}</div></>;
}
