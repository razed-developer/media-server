import { useMemo } from "react";
import type { MediaItem, Playlist } from "../../../types";
import type { TvShow } from "../../../components/menus/ContextMenu";
import type { CollectionSession } from "../../collections/hooks/useCollectionsController";

function makeShows(source: MediaItem[]): TvShow[] {
  const grouped = new Map<string, MediaItem[]>();
  for (const episode of source.filter(item => item.kind === "episode")) {
    const title = episode.showTitle?.trim() || "TV";
    grouped.set(title, [...(grouped.get(title) ?? []), episode]);
  }
  return [...grouped.entries()].map(([title, episodes]) => ({ title, episodes, representative: episodes[0], seasons: new Set(episodes.map(item => item.season ?? 0)).size, addedAt: Math.max(...episodes.map(item => item.addedAt ?? 0)) })).sort((a, b) => a.title.localeCompare(b.title));
}

export function useLibraryCatalog({ items, hiddenItems, sessions, query, selectedShowTitle, playlists, selectedPlaylistId }: { items: MediaItem[]; hiddenItems: MediaItem[]; sessions: Record<string, CollectionSession>; query: string; selectedShowTitle: string | null; playlists: Playlist[]; selectedPlaylistId: string | null }) {
  return useMemo(() => {
    const movies = items.filter(item => item.kind === "movie");
    const specials = items.filter(item => item.kind === "special");
    const episodes = items.filter(item => item.kind === "episode").sort((a, b) => (a.showTitle ?? "").localeCompare(b.showTitle ?? "") || (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0));
    const shows = makeShows(episodes);
    const hiddenShows = makeShows(hiddenItems);
    const hiddenMovies = hiddenItems.filter(item => item.kind === "movie");
    const visibleItems = items.filter(item => !item.collectionProtected || Boolean(item.collectionSourceId && sessions[item.collectionSourceId]));
    const historyItems = visibleItems.filter(item => Boolean(item.lastWatchedAt)).sort((a, b) => (b.lastWatchedAt ?? 0) - (a.lastWatchedAt ?? 0));
    const continueItems = visibleItems.filter(item => !item.collectionProtected && item.progressSeconds > 0 && (!item.durationSeconds || item.progressSeconds / item.durationSeconds < .995)).sort((a, b) => (b.lastWatchedAt ?? 0) - (a.lastWatchedAt ?? 0)).slice(0, 14);
    const recentMovies = [...movies].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)).slice(0, 12);
    const recentShows = [...shows].sort((a, b) => b.addedAt - a.addedAt).slice(0, 12);
    const selectedShow = shows.find(show => show.title === selectedShowTitle) ?? null;
    const selectedPlaylist = playlists.find(playlist => playlist.id === selectedPlaylistId) ?? null;
    const playlistItems = selectedPlaylist?.mediaIds.map(id => visibleItems.find(item => item.id === id)).filter((item): item is MediaItem => Boolean(item)) ?? [];
    const normalizedQuery = query.trim().toLowerCase();
    const visibleMovies = movies.filter(item => !normalizedQuery || `${item.title} ${item.year ?? ""} ${item.genres?.join(" ") ?? ""}`.toLowerCase().includes(normalizedQuery));
    const visibleShows = shows.filter(show => !normalizedQuery || show.title.toLowerCase().includes(normalizedQuery) || show.episodes.some(item => `${item.title} ${item.genres?.join(" ") ?? ""}`.toLowerCase().includes(normalizedQuery)));
    const visibleHistory = historyItems.filter(item => !normalizedQuery || `${item.title} ${item.showTitle ?? ""}`.toLowerCase().includes(normalizedQuery));
    const showEpisodes = selectedShow?.episodes.filter(item => !normalizedQuery || `${item.title} ${item.season ?? ""} ${item.episode ?? ""}`.toLowerCase().includes(normalizedQuery)) ?? [];
    const seasonMap = new Map<number, MediaItem[]>();
    for (const item of showEpisodes) { const season = item.season ?? 0; seasonMap.set(season, [...(seasonMap.get(season) ?? []), item]); }
    const seasonGroups = [...seasonMap.entries()].sort(([a], [b]) => a - b).map(([season, groupItems]) => ({ season, items: groupItems }));
    const specialOrder = ["Documentaries", "Comedy Specials", "Other Specials", "Unmatched"];
    const specialMap = new Map<string, MediaItem[]>();
    for (const item of specials) { const genres = item.genres.map(genre => genre.toLowerCase()); const category = !item.providerId ? "Unmatched" : genres.includes("documentary") ? "Documentaries" : genres.includes("comedy") ? "Comedy Specials" : "Other Specials"; specialMap.set(category, [...(specialMap.get(category) ?? []), item]); }
    const specialGroups = [...specialMap.entries()].sort(([a], [b]) => specialOrder.indexOf(a) - specialOrder.indexOf(b)).map(([category, values]) => ({ category, values: [...values].sort((a, b) => a.title.localeCompare(b.title) || (a.year ?? 0) - (b.year ?? 0)) }));
    return { movies, specials, episodes, shows, hiddenShows, hiddenMovies, visibleItems, historyItems, continueItems, recentMovies, recentShows, selectedShow, selectedPlaylist, playlistItems, visibleMovies, visibleShows, visibleHistory, showEpisodes, seasonGroups, specialGroups };
  }, [items, hiddenItems, sessions, query, selectedShowTitle, playlists, selectedPlaylistId]);
}
