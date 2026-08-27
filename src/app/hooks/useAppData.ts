import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  getActiveUserId,
  getAnalytics,
  getAuthStatus,
  getServerStatus,
  getUserPreferences,
  listMedia,
  listPlaylists,
  listUsers,
  setActiveUserId,
} from "../../api";
import { listUserAvatars, type UserAvatar } from "../../userFeaturesApi";
import type { AnalyticsSummary, ContinueWatchingLayout, LibraryNavigationId, MediaItem, Playlist, ServerStatus, UserProfile } from "../../types";
import { loadContinueWatchingLayout, loadLibraryOrder } from "../../preferences/navigationPreferences";
import { profileSlug, requestedProfileSlug } from "../../utils/routes";

const fallbackStatus: ServerStatus = { running: false, localUrl: "http://127.0.0.1:8765", itemCount: 0, ffprobeAvailable: false, ffmpegAvailable: false };
const emptyAnalytics: AnalyticsSummary = { totalSeconds: 0, movieSeconds: 0, tvSeconds: 0, shows: [], genres: [] };

function cacheLiveCriteria(library: MediaItem[], playlists: Playlist[]) {
  const showMap = new Map<string, { title: string; posterUrl?: string; episodeCount: number }>();
  for (const item of library) {
    if (item.kind !== "episode" || !item.showTitle) continue;
    const current = showMap.get(item.showTitle);
    showMap.set(item.showTitle, { title: item.showTitle, posterUrl: current?.posterUrl ?? item.posterUrl ?? item.thumbnailUrl, episodeCount: (current?.episodeCount ?? 0) + 1 });
  }
  const userId = getActiveUserId();
  sessionStorage.setItem(`onyx-live-shows:${userId}`, JSON.stringify([...showMap.values()].sort((a, b) => a.title.localeCompare(b.title))));
  sessionStorage.setItem(`onyx-live-criteria:${userId}`, JSON.stringify({ shows: [...showMap.keys()].sort((a, b) => a.localeCompare(b)), genres: [...new Set(library.flatMap(item => item.genres ?? []))].sort((a, b) => a.localeCompare(b)), playlists }));
}

export function useAppData(isDesktop: boolean) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [hiddenItems, setHiddenItems] = useState<MediaItem[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [avatars, setAvatars] = useState<Record<string, UserAvatar>>({});
  const [activeUserId, setActiveUserState] = useState(getActiveUserId());
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [status, setStatus] = useState<ServerStatus>(fallbackStatus);
  const [analytics, setAnalytics] = useState<AnalyticsSummary>(emptyAnalytics);
  const [continueWatchingLayout, setContinueWatchingLayout] = useState<ContinueWatchingLayout>("all");
  const [libraryOrder, setLibraryOrder] = useState<LibraryNavigationId[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(isDesktop);
  const [authenticated, setAuthenticated] = useState(isDesktop);

  const loadUsers = useCallback(async () => {
    const values = await listUsers();
    let id = getActiveUserId();
    const requested = requestedProfileSlug();
    const matched = requested ? values.find(user => profileSlug(user.name) === requested) : undefined;
    if (matched) { id = matched.id; setActiveUserId(id); setActiveUserState(id); }
    if (!values.some(user => user.id === id)) { id = values[0]?.id ?? "owner"; setActiveUserId(id); setActiveUserState(id); }
    setUsers(values);
    return id;
  }, []);

  const refresh = useCallback(async () => {
    const started = performance.now();
    window.dispatchEvent(new CustomEvent("onyx-startup-status", { detail: { message: "Loading shows…" } }));
    const [library, prefs] = await Promise.all([listMedia(), getUserPreferences()]);
    setItems(library);
    setStatus(current => ({ ...current, running: true, itemCount: library.length, localUrl: isDesktop ? current.localUrl : window.location.origin }));
    document.documentElement.dataset.theme = prefs.theme;
    setContinueWatchingLayout(loadContinueWatchingLayout(getActiveUserId(), prefs.splitContinueWatching));
    setLibraryOrder(loadLibraryOrder(getActiveUserId()));
    setError(null);
    const optional = await Promise.allSettled([listPlaylists(), getAnalytics(), listUserAvatars()] as const);
    const playlistData = optional[0].status === "fulfilled" ? optional[0].value : [];
    setPlaylists(playlistData);
    if (optional[1].status === "fulfilled") setAnalytics(optional[1].value);
    if (optional[2].status === "fulfilled") setAvatars(Object.fromEntries(optional[2].value.map(avatar => [avatar.userId, avatar])));
    cacheLiveCriteria(library, playlistData);
    window.dispatchEvent(new CustomEvent("onyx-startup-status", { detail: { message: "Preparing your library…" } }));
    const elapsed = Math.round(performance.now() - started);
    if (isDesktop) void invoke("record_client_activity", { level: elapsed > 1000 ? "warning" : "info", category: "Performance", message: `Initial UI data load completed in ${elapsed} ms for ${library.length} media items` }).catch(() => undefined);
    void getServerStatus().then(setStatus).catch(() => undefined);
  }, [isDesktop]);

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      if (!isDesktop) {
        try { const auth = await getAuthStatus(); setAuthenticated(auth.authenticated); setAuthChecked(true); if (!auth.authenticated) return; }
        catch (cause) { setAuthChecked(true); setError(String(cause)); return; }
      }
      while (!cancelled) {
        try { window.dispatchEvent(new CustomEvent("onyx-startup-status", { detail: { message: "Connecting to server…" } })); await loadUsers(); await refresh(); if (!cancelled) window.dispatchEvent(new Event("onyx-app-ready")); return; }
        catch (cause) { setError(String(cause)); window.dispatchEvent(new CustomEvent("onyx-startup-status", { detail: { message: "Waiting for the Onyx server…" } })); if (!isDesktop) return; await new Promise(resolve => window.setTimeout(resolve, 750)); }
      }
    };
    void bootstrap();
    return () => { cancelled = true; };
  }, [isDesktop, loadUsers, refresh]);

  useEffect(() => {
    const reloadSubtitles = () => { void listMedia().then(setItems).catch(() => undefined); };
    window.addEventListener("onyx-subtitle-downloaded", reloadSubtitles);
    return () => window.removeEventListener("onyx-subtitle-downloaded", reloadSubtitles);
  }, []);

  return { items, setItems, hiddenItems, setHiddenItems, users, setUsers, avatars, activeUserId, setActiveUserState, playlists, setPlaylists, status, analytics, continueWatchingLayout, libraryOrder, error, setError, authChecked, authenticated, setAuthenticated, refresh, loadUsers };
}
