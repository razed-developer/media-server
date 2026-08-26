import { useEffect, useMemo, useState } from "react";
import { lockCollectionSource, touchCollectionSource, unlockCollectionSource } from "../../../api";
import type { MediaItem } from "../../../types";

export type CollectionSession = { token: string; idleSince?: number };
export type MediaCollection = { id: string; name: string; protected: boolean; items: MediaItem[] };

export function useCollectionsController(items: MediaItem[], selectedMedia: MediaItem | null, setSelectedMedia: (item: MediaItem | null) => void, setError: (message: string | null) => void) {
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Record<string, CollectionSession>>({});
  const [, setClock] = useState(Date.now());
  const collections = useMemo(() => {
    const grouped = new Map<string, MediaCollection>();
    for (const item of items.filter(value => value.kind === "collection" && value.collectionSourceId)) {
      const id = item.collectionSourceId!;
      const source = grouped.get(id) ?? { id, name: item.collectionSourceName ?? "Collection", protected: Boolean(item.collectionProtected), items: [] };
      source.items.push(item);
      grouped.set(id, source);
    }
    return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);
  const selectedCollection = useMemo(() => collections.find(source => source.id === selectedCollectionId) ?? null, [collections, selectedCollectionId]);
  const groups = useMemo(() => {
    const grouped = new Map<string, MediaItem[]>();
    for (const item of selectedCollection?.items ?? []) { const folder = item.collectionFolder || "Unsorted"; grouped.set(folder, [...(grouped.get(folder) ?? []), item]); }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([folder, values]) => ({ folder, values: [...values].sort((a, b) => a.title.localeCompare(b.title)) }));
  }, [selectedCollection]);
  const continueItems = useMemo(() => (selectedCollection?.items ?? []).filter(item => item.progressSeconds > 0 && (!item.durationSeconds || item.progressSeconds / item.durationSeconds < .995)).sort((a, b) => (b.lastWatchedAt ?? 0) - (a.lastWatchedAt ?? 0)).slice(0, 14), [selectedCollection]);

  const clearSessions = () => {
    Object.entries(sessions).forEach(([sourceId, session]) => { sessionStorage.removeItem(`onyx-collection-unlock:${sourceId}`); void lockCollectionSource(session.token).catch(() => undefined); });
    setSessions({});
  };
  const markIdle = (item: MediaItem | null) => { const id = item?.collectionProtected ? item.collectionSourceId : undefined; if (id) setSessions(current => current[id] ? { ...current, [id]: { ...current[id], idleSince: Date.now() } } : current); };
  const markPlaying = (item: MediaItem | null) => { const id = item?.collectionProtected ? item.collectionSourceId : undefined; if (id) setSessions(current => current[id] ? { ...current, [id]: { ...current[id], idleSince: undefined } } : current); };
  const unlock = async (pin: string) => {
    if (!selectedCollection) return;
    try { const token = await unlockCollectionSource(selectedCollection.id, pin); sessionStorage.setItem(`onyx-collection-unlock:${selectedCollection.id}`, token); setSessions(current => ({ ...current, [selectedCollection.id]: { token, idleSince: Date.now() } })); setError(null); }
    catch (cause) { setError(String(cause)); throw cause; }
  };
  const lockOrRequestUnlock = async (source: MediaCollection, open: (id: string) => void) => {
    if (!source.protected) return;
    const session = sessions[source.id];
    if (!session) { open(source.id); return; }
    await lockCollectionSource(session.token);
    sessionStorage.removeItem(`onyx-collection-unlock:${source.id}`);
    setSessions(current => { const next = { ...current }; delete next[source.id]; return next; });
    if (selectedCollectionId === source.id) setSelectedMedia(null);
  };

  useEffect(() => { const timer = window.setInterval(() => { const now = Date.now(); setClock(now); setSessions(current => { let changed = false; const next = { ...current }; for (const [id, session] of Object.entries(current)) if (session.idleSince && now - session.idleSince >= 30 * 60 * 1000) { changed = true; delete next[id]; sessionStorage.removeItem(`onyx-collection-unlock:${id}`); void lockCollectionSource(session.token).catch(() => undefined); } return changed ? next : current; }); }, 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { if (!selectedMedia?.collectionProtected || !selectedMedia.collectionSourceId) return; const session = sessions[selectedMedia.collectionSourceId]; if (!session) return; const timer = window.setInterval(() => void touchCollectionSource(session.token).catch(() => setSessions(current => { const next = { ...current }; delete next[selectedMedia.collectionSourceId!]; return next; })), 60_000); return () => window.clearInterval(timer); }, [selectedMedia?.id, sessions]);

  return { collections, selectedCollection, selectedCollectionId, setSelectedCollectionId, groups, continueItems, sessions, setSessions, clearSessions, markIdle, markPlaying, unlock, lockOrRequestUnlock };
}
