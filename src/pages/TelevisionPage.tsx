import { ArrowLeft, Check, Layers3, List } from 'lucide-react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { resolveMediaUrl } from '../api';
import type { MediaItem } from '../types';
import type { TvShow } from '../components/menus/ContextMenu';
import { PageHero } from '../components/layout/PageHero';
import { MediaCard } from '../components/media/MediaCard';
import { MetadataSummary } from '../components/media/MetadataSummary';
import { ProgressLine } from '../components/media/MediaStatus';
import { ShowCard } from '../components/media/ShowCard';

type TvView = 'season' | 'list';
type SeasonGroup = { season: number; items: MediaItem[] };

export function TelevisionPage({ shows, totalShows, totalEpisodes, selectedShow, showEpisodes, seasonGroups, backdropUrl, view, social, allWatched, groupProgress, onOpenShow, onShowMenu, onBack, onView, onPlay, onItemMenu, onSeasonMenu }: { shows: TvShow[]; totalShows: number; totalEpisodes: number; selectedShow: TvShow | null; showEpisodes: MediaItem[]; seasonGroups: SeasonGroup[]; backdropUrl?: string; view: TvView; social?: ReactNode; allWatched: (items: MediaItem[]) => boolean; groupProgress: (items: MediaItem[]) => number; onOpenShow: (show: TvShow) => void; onShowMenu: (event: ReactMouseEvent, show: TvShow) => void; onBack: () => void; onView: (view: TvView) => void; onPlay: (item: MediaItem) => void; onItemMenu: (event: ReactMouseEvent, item: MediaItem) => void; onSeasonMenu: (event: ReactMouseEvent, season: number, items: MediaItem[]) => void }) {
  if (!selectedShow) return <><PageHero eyebrow="TELEVISION" title="TV Shows" subtitle={`${totalShows} shows · ${totalEpisodes} episodes`} /><section className="gallery show-gallery">{shows.map(show => <ShowCard key={show.title} show={show} onOpen={onOpenShow} onMenu={onShowMenu} />)}</section></>;
  return <><section className="show-hero compact-hero" style={backdropUrl ? { backgroundImage: `linear-gradient(90deg,var(--bg) 0%,rgba(5,7,10,.80) 60%),url(${resolveMediaUrl(backdropUrl)})` } : undefined}><div><button className="back-button" onClick={onBack}><ArrowLeft size={18} />All TV shows</button><p className="eyebrow">TV SHOW</p><h1>{selectedShow.title}</h1><p>{selectedShow.seasons} seasons · {selectedShow.episodes.length} episodes {allWatched(selectedShow.episodes) ? '· Watched' : ''}</p><MetadataSummary item={selectedShow.representative} />{social}</div><div className="view-toggle"><button className={view === 'season' ? 'active' : ''} onClick={() => onView('season')}><Layers3 size={17} />By season</button><button className={view === 'list' ? 'active' : ''} onClick={() => onView('list')}><List size={17} />All episodes</button></div></section>{view === 'list' ? <section className="gallery episode-grid">{showEpisodes.map(item => <MediaCard key={item.id} item={item} onPlay={onPlay} onMenu={onItemMenu} />)}</section> : <div className="season-groups">{seasonGroups.map(group => <section className="season-section" key={group.season}><div className="season-heading" onContextMenu={event => onSeasonMenu(event, group.season, group.items)}><div><p>{selectedShow.title}</p><h2>{group.season === 0 ? 'Episodes' : `Season ${group.season}`} {allWatched(group.items) && <Check size={18} />}</h2><ProgressLine value={groupProgress(group.items)} /></div><span>{group.items.length} episodes</span></div><div className="gallery">{group.items.map(item => <MediaCard key={item.id} item={item} onPlay={onPlay} onMenu={onItemMenu} />)}</div></section>)}</div>}</>;
}
