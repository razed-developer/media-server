import type { MouseEvent as ReactMouseEvent } from 'react';
import type { MediaItem } from '../types';
import { PageHero } from '../components/layout/PageHero';
import { MediaCard } from '../components/media/MediaCard';

export type SpecialGroup = { category: string; values: MediaItem[] };

export function SpecialsPage({ total, groups, onPlay, onMenu }: { total: number; groups: SpecialGroup[]; onPlay: (item: MediaItem) => void; onMenu: (event: ReactMouseEvent, item: MediaItem) => void }) {
  return <><PageHero eyebrow="SPECIALS" title="Specials & Documentaries" subtitle={`${total} files`} /><div className="season-groups">{groups.map(group => <section className="season-section" key={group.category}><div className="season-heading"><div><p>{group.category === 'Unmatched' ? 'NEEDS MATCH' : 'TMDB METADATA'}</p><h2>{group.category}</h2></div><span>{group.values.length} {group.values.length === 1 ? 'file' : 'files'}</span></div><div className="gallery">{group.values.map(item => <MediaCard key={item.id} item={item} onPlay={onPlay} onMenu={onMenu} />)}</div></section>)}</div></>;
}
