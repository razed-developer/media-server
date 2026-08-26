import type { MouseEvent as ReactMouseEvent } from 'react';
import type { MediaItem } from '../types';
import { PageHero } from '../components/layout/PageHero';
import { MediaCard } from '../components/media/MediaCard';
import { ShowCard, type ShowCardModel } from '../components/media/ShowCard';

export function HiddenMediaPage({ movies, shows, onPlay, onMovieMenu, onShowMenu }: { movies: MediaItem[]; shows: ShowCardModel[]; onPlay: (item: MediaItem) => void; onMovieMenu: (event: ReactMouseEvent, item: MediaItem) => void; onShowMenu: (event: ReactMouseEvent, show: ShowCardModel) => void }) {
  return <><PageHero eyebrow="HIDDEN" title="Hidden media" subtitle={`${movies.length} movies · ${shows.length} shows`} /><h2 className="subsection-title">Movies</h2><section className="gallery">{movies.map(item => <MediaCard key={item.id} item={item} onPlay={onPlay} onMenu={onMovieMenu} />)}</section><h2 className="subsection-title">TV Shows</h2><section className="gallery show-gallery">{shows.map(show => <ShowCard key={show.title} show={show} onOpen={() => undefined} onMenu={onShowMenu} />)}</section></>;
}
