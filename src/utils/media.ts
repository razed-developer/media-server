import type { MediaItem } from '../types';

export const episodeLabel = (item: MediaItem) => item.season == null || item.episode == null ? item.title : `S${String(item.season).padStart(2, '0')} E${String(item.episode).padStart(2, '0')}${item.episodeEnd != null ? `-${String(item.episodeEnd).padStart(2, '0')}` : ''} · ${item.title}`;
export const watched = (item: MediaItem) => Boolean(item.durationSeconds && item.progressSeconds / item.durationSeconds >= .9);
export const percent = (item: MediaItem) => item.durationSeconds ? Math.min(100, Math.max(0, item.progressSeconds / item.durationSeconds * 100)) : 0;
export const groupPercent = (items: MediaItem[]) => items.length ? items.reduce((sum, item) => sum + percent(item), 0) / items.length : 0;
export const allWatched = (items: MediaItem[]) => items.length > 0 && items.every(watched);
export const socialKey = (item: MediaItem) => item.metadataEntityId ?? (item.provider && item.providerId ? `${item.provider}:${item.providerId}` : `media:${item.id}`);
