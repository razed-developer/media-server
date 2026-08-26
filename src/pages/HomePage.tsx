import type { MouseEvent as ReactMouseEvent } from "react";
import type { ContinueWatchingLayout, MediaItem, UserProfile } from "../types";
import type { RecommendationEntry } from "../userFeaturesApi";
import { RecommendationsRail } from "../features/social/components/RecommendationsRail";
import { Rail } from "../components/media/Rail";
import { MediaCard } from "../components/media/MediaCard";
import { ShowCard, type ShowCardModel } from "../components/media/ShowCard";

type HomeDestination = "movies" | "tv" | "live" | "music";
type Props = { activeUser?: UserProfile; isDesktop: boolean; continueWatchingLayout: ContinueWatchingLayout; continueItems: MediaItem[]; recentShows: ShowCardModel[]; recentMovies: MediaItem[]; onNavigate: (destination: HomeDestination) => void; onRecommendation: (entry: RecommendationEntry) => void; onPlay: (item: MediaItem) => void; onItemMenu: (event: ReactMouseEvent, item: MediaItem) => void; onOpenShow: (show: ShowCardModel) => void; onShowMenu: (event: ReactMouseEvent, show: ShowCardModel) => void };

export function HomePage({ activeUser, isDesktop, continueWatchingLayout: layout, continueItems, recentShows, recentMovies, onNavigate, onRecommendation, onPlay, onItemMenu, onOpenShow, onShowMenu }: Props) {
  const movies = continueItems.filter(item => item.kind === "movie");
  const shows = continueItems.filter(item => item.kind === "episode");
  const specials = continueItems.filter(item => item.kind === "special");
  const others = continueItems.filter(item => item.kind === "special" || item.kind === "collection");
  const row = (title: string, values: MediaItem[], wide = false) => values.length > 0 && <Rail title={title}>{values.map(item => <MediaCard key={item.id} item={item} artwork={wide && item.kind === "episode" ? "thumbnail" : "poster"} onPlay={onPlay} onMenu={onItemMenu}/>)}</Rail>;
  const continueRows = layout === "movies-shows-split" ? <>{row("Continue Watching Movies", movies)}{row("Continue Watching Shows", shows, true)}</>
    : layout === "movies-shows-others" ? <>{row("Continue Watching Movies", movies)}{row("Continue Watching Shows", shows, true)}{row("Continue Watching Others", others, true)}</>
    : layout === "movies-specials-shows" ? <>{row("Continue Watching Movies & Specials", [...movies, ...specials])}{row("Continue Watching Shows", shows, true)}</>
    : layout === "movies-shows" ? row("Continue Watching", continueItems.filter(item => item.kind === "movie" || item.kind === "episode"))
    : layout === "movies-shows-specials" ? row("Continue Watching", continueItems.filter(item => item.kind !== "collection"))
    : row("Continue Watching", continueItems);
  return <div className="home-page"><section className="onyx-hero"><p className="eyebrow">WELCOME BACK</p><h1>{activeUser?.name ? `${activeUser.name}'s Onyx` : "Onyx"}</h1><p>Your movies, television and optional music—without the clutter.</p><div className="hero-links"><button onClick={() => onNavigate("movies")}>View movies</button><button onClick={() => onNavigate("tv")}>View TV shows</button><button onClick={() => onNavigate("live")}>Live TV</button><button onClick={() => onNavigate("music")}>Open music</button></div></section>{isDesktop && activeUser && <RecommendationsRail userId={activeUser.id} onOpen={onRecommendation}/>} {continueRows}<Rail title="Recently Added Shows" actionLabel="View shows" onAction={() => onNavigate("tv")}>{recentShows.map(show => <ShowCard key={show.title} show={show} onOpen={onOpenShow} onMenu={onShowMenu}/>)}</Rail><Rail title="Recently Added Movies" actionLabel="View movies" onAction={() => onNavigate("movies")}>{recentMovies.map(item => <MediaCard key={item.id} item={item} onPlay={onPlay} onMenu={onItemMenu}/>)}</Rail></div>;
}
