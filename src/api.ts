import { invoke } from "@tauri-apps/api/core";
import type {
  AnalyticsSummary,
  AuthStatus,
  BackupPreview,
  CaptionStatus,
  GuideChannel,
  FunnelStatus,
  IbConnectionStatus,
  IbDeviceCode,
  IbDevicePoll,
  IbLibrary,
  LibraryHealthReport,
  LibraryRepairReport,
  LiveChannel,
  LiveChannelInput,
  MediaItem,
  MetadataProviderStatus,
  MetadataSearchResult,
  Playlist,
  RestoreReport,
  RootMapping,
  ServerStatus,
  SleepVideoStatus,
  SetupStatus,
  ScanProgress,
  ThemeName,
  UserPreferences,
  UserProfile,
} from "./types";

export async function getCaptionStatus(): Promise<CaptionStatus> {
  if (!isTauriDesktop()) throw new Error("Caption setup is managed from the desktop server app.");
  return invoke<CaptionStatus>("caption_status");
}
export async function configureCaptions(input: { enabled: boolean; autoNew: boolean; language: string; executable?: string; modelPath?: string }): Promise<CaptionStatus> {
  if (!isTauriDesktop()) throw new Error("Caption setup is managed from the desktop server app.");
  return invoke<CaptionStatus>("caption_configure", input);
}
export async function generateCaptions(mediaId: string, force = false): Promise<boolean> {
  if (!isTauriDesktop()) throw new Error("Caption generation is managed from the desktop server app.");
  return invoke<boolean>("caption_generate", { mediaId, force });
}
export async function generateMissingCaptions(): Promise<number> {
  if (!isTauriDesktop()) throw new Error("Caption generation is managed from the desktop server app.");
  return invoke<number>("caption_generate_missing");
}
export async function getSleepVideos(): Promise<SleepVideoStatus> {
  if (isTauriDesktop()) return invoke<SleepVideoStatus>("sleep_video_status");
  return json(await browserFetch(`${serverBaseUrl()}/api/sleep-videos`), "Could not load sleep videos");
}
export async function configureSleepVideos(path?: string): Promise<SleepVideoStatus> {
  if (!isTauriDesktop()) throw new Error("The sleep video folder is managed from the desktop server app.");
  return invoke<SleepVideoStatus>("sleep_video_configure", { path });
}
export interface IdentityInput {
  title?: string;
  year?: number;
  kind?: "movie" | "episode";
  showTitle?: string;
  season?: number;
  episode?: number;
}
export const isTauriDesktop = () =>
  Boolean(
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__,
  );
export const serverBaseUrl = () =>
  isTauriDesktop() ? "http://127.0.0.1:8765" : "";
export const resolveMediaUrl = (url?: string | null) => {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return `${serverBaseUrl()}${url.startsWith("/") ? url : `/${url}`}`;
};
let activeUserId =
  localStorage.getItem("onyx-user") ||
  localStorage.getItem("home-media-user") ||
  "owner";
export const getActiveUserId = () => activeUserId;
export const setActiveUserId = (id: string) => {
  activeUserId = id;
  localStorage.setItem("onyx-user", id);
};
const userHeaders = (extra: Record<string, string> = {}) => ({
  "x-home-media-user": activeUserId,
  ...extra,
});
const browserFetch = (input: string, init?: RequestInit) =>
  fetch(input, {
    ...init,
    credentials: "include",
    headers: {
      ...userHeaders(),
      ...((init?.headers as Record<string, string> | undefined) ?? {}),
    },
  });
async function json<T>(response: Response, message: string): Promise<T> {
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `${message} (${response.status})`);
  }
  return response.json();
}
export async function getAuthStatus(): Promise<AuthStatus> {
  if (isTauriDesktop()) return { required: false, authenticated: true };
  return json(
    await browserFetch(`${serverBaseUrl()}/api/auth/status`),
    "Could not check authentication",
  );
}
export async function login(password: string): Promise<void> {
  if (isTauriDesktop()) return;
  const r = await browserFetch(`${serverBaseUrl()}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!r.ok)
    throw new Error(
      r.status === 401 ? "Incorrect password" : `Login failed (${r.status})`,
    );
}
export async function logout(): Promise<void> {
  if (!isTauriDesktop())
    await browserFetch(`${serverBaseUrl()}/api/auth/logout`, {
      method: "POST",
    });
}
export async function getSetupStatus(): Promise<SetupStatus> {
  if (!isTauriDesktop()) return { complete: true, users: await listUsers() };
  return invoke<SetupStatus>("setup_status");
}
export async function completeSetup(): Promise<void> {
  if (!isTauriDesktop()) return;
  await invoke("complete_setup");
}
export async function setIbroadcastClientId(clientId: string): Promise<void> {
  if (!isTauriDesktop())
    throw new Error(
      "The iBroadcast app client ID is managed from the desktop server.",
    );
  await invoke("set_ibroadcast_client_id", { clientId });
}
export async function listUsers(): Promise<UserProfile[]> {
  if (isTauriDesktop()) return invoke<UserProfile[]>("list_users");
  return json(
    await browserFetch(`${serverBaseUrl()}/api/users`),
    "Could not load users",
  );
}
export async function createUser(name: string): Promise<UserProfile[]> {
  if (!isTauriDesktop())
    throw new Error(
      "User management is available from the desktop server app.",
    );
  return invoke<UserProfile[]>("create_user", { name });
}
export async function renameUser(
  userId: string,
  name: string,
): Promise<UserProfile[]> {
  if (!isTauriDesktop())
    throw new Error(
      "User management is available from the desktop server app.",
    );
  return invoke<UserProfile[]>("rename_user", { userId, name });
}
export async function deleteUser(userId: string): Promise<UserProfile[]> {
  if (!isTauriDesktop())
    throw new Error(
      "User management is available from the desktop server app.",
    );
  return invoke<UserProfile[]>("delete_user", { userId });
}
export async function getUserPreferences(): Promise<UserPreferences> {
  if (isTauriDesktop())
    return invoke<UserPreferences>("get_user_preferences", {
      userId: activeUserId,
    });
  return json(
    await browserFetch(`${serverBaseUrl()}/api/preferences`),
    "Could not load preferences",
  );
}
export async function setUserTheme(theme: ThemeName): Promise<UserPreferences> {
  if (isTauriDesktop())
    return invoke<UserPreferences>("set_user_theme", {
      userId: activeUserId,
      theme,
    });
  return json(
    await browserFetch(`${serverBaseUrl()}/api/preferences/theme`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ theme }),
    }),
    "Could not save theme",
  );
}
export async function setSplitContinueWatching(
  split: boolean,
): Promise<UserPreferences> {
  if (isTauriDesktop())
    return invoke<UserPreferences>("set_split_continue_watching", {
      userId: activeUserId,
      split,
    });
  return json(
    await browserFetch(`${serverBaseUrl()}/api/preferences/continue-watching`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ split }),
    }),
    "Could not save Continue Watching preference",
  );
}
export async function getAnalytics(): Promise<AnalyticsSummary> {
  if (isTauriDesktop())
    return invoke<AnalyticsSummary>("user_analytics", { userId: activeUserId });
  return json(
    await browserFetch(`${serverBaseUrl()}/api/analytics`),
    "Could not load analytics",
  );
}
export async function listMedia(includeHidden = false): Promise<MediaItem[]> {
  if (isTauriDesktop())
    return invoke<MediaItem[]>("list_media", {
      userId: activeUserId,
      includeHidden,
    });
  return json(
    await browserFetch(`${serverBaseUrl()}/api/library`),
    "Could not load media library",
  );
}
export async function getServerStatus(): Promise<ServerStatus> {
  if (isTauriDesktop()) return invoke<ServerStatus>("server_status");
  const status = await json<ServerStatus>(
    await browserFetch(`${serverBaseUrl()}/api/status`),
    "Could not reach media server",
  );
  return { ...status, localUrl: window.location.origin };
}
export async function saveProgress(
  id: string,
  seconds: number,
  watchedSeconds = 0,
): Promise<void> {
  if (isTauriDesktop()) {
    await invoke("save_progress", {
      userId: activeUserId,
      id,
      seconds,
      watchedSeconds,
    });
    return;
  }
  const r = await browserFetch(
    `${serverBaseUrl()}/api/progress/${encodeURIComponent(id)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seconds, watchedSeconds }),
    },
  );
  if (!r.ok) throw new Error(`Could not save playback progress (${r.status})`);
}
export async function resetWatchStatus(ids: string[]): Promise<MediaItem[]> {
  if (isTauriDesktop())
    return invoke<MediaItem[]>("reset_watch_status", {
      userId: activeUserId,
      ids,
    });
  return json(
    await browserFetch(`${serverBaseUrl()}/api/progress/reset`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    }),
    "Could not reset watch status",
  );
}
export async function setHidden(
  targetType: "media" | "show",
  targetKey: string,
  hidden: boolean,
): Promise<MediaItem[]> {
  if (isTauriDesktop())
    return invoke<MediaItem[]>("set_hidden", {
      userId: activeUserId,
      targetType,
      targetKey,
      hidden,
    });
  return json(
    await browserFetch(`${serverBaseUrl()}/api/hidden`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetType, targetKey, hidden }),
    }),
    "Could not update hidden media",
  );
}
export async function listPlaylists(): Promise<Playlist[]> {
  if (isTauriDesktop())
    return invoke<Playlist[]>("list_playlists", { userId: activeUserId });
  return json(
    await browserFetch(`${serverBaseUrl()}/api/playlists`),
    "Could not load playlists",
  );
}
export async function createPlaylist(name: string): Promise<Playlist[]> {
  if (isTauriDesktop())
    return invoke<Playlist[]>("create_playlist", {
      userId: activeUserId,
      name,
    });
  return json(
    await browserFetch(`${serverBaseUrl()}/api/playlists`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    }),
    "Could not create playlist",
  );
}
export async function addToPlaylist(
  playlistId: string,
  mediaId: string,
): Promise<Playlist[]> {
  if (isTauriDesktop())
    return invoke<Playlist[]>("add_to_playlist", {
      userId: activeUserId,
      playlistId,
      mediaId,
    });
  return json(
    await browserFetch(
      `${serverBaseUrl()}/api/playlists/${encodeURIComponent(playlistId)}/add`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mediaId }),
      },
    ),
    "Could not add to playlist",
  );
}
export async function removeFromPlaylist(
  playlistId: string,
  mediaId: string,
): Promise<Playlist[]> {
  if (isTauriDesktop())
    return invoke<Playlist[]>("remove_from_playlist", {
      userId: activeUserId,
      playlistId,
      mediaId,
    });
  return json(
    await browserFetch(
      `${serverBaseUrl()}/api/playlists/${encodeURIComponent(playlistId)}/remove`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mediaId }),
      },
    ),
    "Could not remove from playlist",
  );
}
export async function deletePlaylist(playlistId: string): Promise<Playlist[]> {
  if (isTauriDesktop())
    return invoke<Playlist[]>("delete_playlist", {
      userId: activeUserId,
      playlistId,
    });
  return json(
    await browserFetch(
      `${serverBaseUrl()}/api/playlists/${encodeURIComponent(playlistId)}/delete`,
      { method: "POST" },
    ),
    "Could not delete playlist",
  );
}

export async function listLiveChannels(): Promise<LiveChannel[]> {
  if (isTauriDesktop())
    return invoke<LiveChannel[]>("live_channels_list", {
      userId: activeUserId,
    });
  const guide = await getLiveChannelGuide();
  return guide.map((row) => row.channel);
}
export async function saveLiveChannel(
  input: LiveChannelInput,
): Promise<LiveChannel[]> {
  if (!isTauriDesktop())
    throw new Error(
      "Live Channel setup is managed from the desktop server app.",
    );
  return invoke<LiveChannel[]>("live_channels_save", {
    userId: activeUserId,
    input,
  });
}
export async function deleteLiveChannel(
  channelId: string,
): Promise<LiveChannel[]> {
  if (!isTauriDesktop())
    throw new Error(
      "Live Channel setup is managed from the desktop server app.",
    );
  return invoke<LiveChannel[]>("live_channels_delete", {
    userId: activeUserId,
    channelId,
  });
}
export async function chooseLiveChannelArtwork(): Promise<string | null> {
  if (!isTauriDesktop()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
  });
  return typeof selected === "string" ? selected : null;
}
export async function setLiveChannelArtwork(
  channelId: string,
  path: string,
): Promise<LiveChannel[]> {
  if (!isTauriDesktop())
    throw new Error(
      "Live Channel artwork is managed from the desktop server app.",
    );
  return invoke<LiveChannel[]>("live_channels_set_artwork", {
    userId: activeUserId,
    channelId,
    path,
  });
}
export async function setLiveChannelStyle(channelId:string,icon?:string,color?:string):Promise<LiveChannel[]>{if(!isTauriDesktop())throw new Error("Live Channel artwork is managed from the desktop server app.");return invoke<LiveChannel[]>("live_channels_set_style",{userId:activeUserId,channelId,icon:icon??null,color:color??null})}
export async function reorderLiveChannels(orderedIds:string[]):Promise<LiveChannel[]>{if(!isTauriDesktop())throw new Error("Live Channel order is managed from the desktop server app.");return invoke<LiveChannel[]>("live_channels_reorder",{userId:activeUserId,orderedIds})}
export async function getLiveChannelGuide(): Promise<GuideChannel[]> {
  if (isTauriDesktop())
    return invoke<GuideChannel[]>("live_channels_guide", {
      userId: activeUserId,
    });
  return json(
    await browserFetch(`${serverBaseUrl()}/api/live-channels/guide`),
    "Could not load Live Channels guide",
  );
}
export const liveChannelStreamUrl = (mediaId: string, offsetSeconds: number) =>
  `${serverBaseUrl()}/api/live-channels/play/${encodeURIComponent(mediaId)}/${Math.max(0, Math.floor(offsetSeconds))}`;

export async function getLibraryScanProgress(): Promise<ScanProgress> {
  if (!isTauriDesktop())
    return {
      active: false,
      phase: "idle",
      discovered: 0,
      inspected: 0,
      startedAt: 0,
    };
  return invoke<ScanProgress>("library_scan_progress");
}
export async function rescanLibrary(): Promise<void> {
  if (!isTauriDesktop())
    throw new Error("Library rescans are managed from the desktop server app.");
  await invoke("scan_library");
}
export async function chooseLibraryPath(): Promise<string | null> {
  if (!isTauriDesktop()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({ directory: true, multiple: false });
  return typeof selected === "string" ? selected : null;
}
export async function chooseBackupDestination(): Promise<string | null> {
  if (!isTauriDesktop()) return null;
  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({
    defaultPath: `Onyx-backup-${new Date().toISOString().slice(0, 10)}.onyx-backup`,
    filters: [{ name: "Onyx Backup", extensions: ["onyx-backup"] }],
  });
}
export async function chooseBackupFile(): Promise<string | null> {
  if (!isTauriDesktop()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Onyx Backup", extensions: ["onyx-backup"] }],
  });
  return typeof selected === "string" ? selected : null;
}
export async function createBackup(
  path: string,
  password: string,
): Promise<BackupPreview> {
  return invoke<BackupPreview>("backup_create", { path, password });
}
export async function previewBackup(
  path: string,
  password: string,
): Promise<BackupPreview> {
  return invoke<BackupPreview>("backup_preview", { path, password });
}
export async function restoreBackup(
  path: string,
  password: string,
  mode: "merge" | "replace",
  mappings: RootMapping[],
): Promise<RestoreReport> {
  return invoke<RestoreReport>("backup_restore", {
    path,
    password,
    mode,
    mappings,
  });
}
export async function setLibraryPath(path: string): Promise<void> {
  if (!isTauriDesktop())
    throw new Error("Library folders are managed from the desktop server app.");
  await invoke("set_library_path", { path });
}
export async function setMoviePath(path: string): Promise<void> {
  if (!isTauriDesktop())
    throw new Error("Movie folders are managed from the desktop server app.");
  await invoke("set_movie_path", { path });
}
export async function setTvPath(path: string): Promise<void> {
  if (!isTauriDesktop())
    throw new Error("TV folders are managed from the desktop server app.");
  await invoke("set_tv_path", { path });
}
export async function setAccessPassword(password: string): Promise<void> {
  if (isTauriDesktop()) {
    await invoke("set_access_password", { password });
    return;
  }
  const response = await browserFetch(`${serverBaseUrl()}/api/admin/funnel/password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) throw new Error((await response.text()) || "Could not set Funnel password");
}
export async function clearAccessPassword(): Promise<void> {
  if (isTauriDesktop()) {
    await invoke("clear_access_password");
    return;
  }
  const response = await browserFetch(`${serverBaseUrl()}/api/admin/funnel/password`, { method: "DELETE" });
  if (!response.ok) throw new Error((await response.text()) || "Could not remove Funnel password");
}
export async function getFunnelStatus(): Promise<FunnelStatus> {
  if (isTauriDesktop()) return invoke<FunnelStatus>("funnel_status");
  return json(await browserFetch(`${serverBaseUrl()}/api/admin/funnel`), "Could not load Funnel status");
}
export async function setFunnelEnabled(enabled: boolean): Promise<FunnelStatus> {
  if (isTauriDesktop()) return invoke<FunnelStatus>("set_funnel_enabled", { enabled });
  return json(await browserFetch(`${serverBaseUrl()}/api/admin/funnel`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled }),
  }), "Could not update Funnel status");
}
export async function clearThumbnailCache(): Promise<void> {
  if (!isTauriDesktop())
    throw new Error("Artwork cache is managed from the desktop server app.");
  await invoke("clear_thumbnail_cache");
}
export async function identifyItem(
  id: string,
  identity: IdentityInput,
): Promise<MediaItem[]> {
  if (!isTauriDesktop())
    throw new Error(
      "Identification corrections are managed from the desktop server app.",
    );
  await invoke<MediaItem[]>("identify_item", { id, identity });
  return listMedia();
}
export async function identifyShow(
  id: string,
  showTitle: string,
): Promise<MediaItem[]> {
  if (!isTauriDesktop())
    throw new Error(
      "Identification corrections are managed from the desktop server app.",
    );
  await invoke<MediaItem[]>("identify_show", { id, showTitle });
  return listMedia();
}
export async function resetIdentification(id: string): Promise<MediaItem[]> {
  if (!isTauriDesktop())
    throw new Error(
      "Identification corrections are managed from the desktop server app.",
    );
  await invoke<MediaItem[]>("reset_identification", { id });
  return listMedia();
}
export async function metadataProviderStatus(): Promise<
  MetadataProviderStatus[]
> {
  if (!isTauriDesktop()) return [];
  return invoke<MetadataProviderStatus[]>("metadata_provider_status");
}
export async function setTmdbToken(token: string): Promise<void> {
  if (!isTauriDesktop())
    throw new Error(
      "Metadata credentials are managed from the desktop server.",
    );
  await invoke("set_tmdb_token", { token });
}
export async function clearTmdbToken(): Promise<void> {
  if (!isTauriDesktop())
    throw new Error(
      "Metadata credentials are managed from the desktop server.",
    );
  await invoke("clear_tmdb_token");
}
export async function testTmdb(): Promise<void> {
  if (!isTauriDesktop())
    throw new Error("Metadata providers are managed from the desktop server.");
  await invoke("test_tmdb");
}
export async function searchMetadata(
  id: string,
  query?: string,
): Promise<MetadataSearchResult[]> {
  if (!isTauriDesktop())
    throw new Error("Metadata matching is managed from the desktop server.");
  return invoke<MetadataSearchResult[]>("metadata_search", { id, query });
}
export async function applyMetadataMatch(
  id: string,
  providerId: string,
): Promise<MediaItem[]> {
  if (!isTauriDesktop())
    throw new Error("Metadata matching is managed from the desktop server.");
  await invoke<MediaItem[]>("metadata_apply_match", { id, providerId });
  return listMedia();
}
export async function autoMatchMetadata(): Promise<number> {
  if (!isTauriDesktop())
    throw new Error("Metadata matching is managed from the desktop server.");
  return invoke<number>("metadata_auto_match_all");
}
export async function getLibraryHealth(): Promise<LibraryHealthReport> {
  if (!isTauriDesktop())
    throw new Error("Library health is managed from the desktop server app.");
  return invoke<LibraryHealthReport>("library_health");
}
export async function repairLibraryHealth(): Promise<LibraryRepairReport> {
  if (!isTauriDesktop())
    throw new Error("Metadata repair is managed from the desktop server app.");
  return invoke<LibraryRepairReport>("library_health_repair_all");
}
export async function repairLibraryHealthItem(
  id: string,
): Promise<LibraryRepairReport> {
  if (!isTauriDesktop())
    throw new Error("Metadata repair is managed from the desktop server app.");
  return invoke<LibraryRepairReport>("library_health_repair_item", { id });
}

export async function getIbroadcastStatus(): Promise<IbConnectionStatus> {
  if (isTauriDesktop())
    return invoke<IbConnectionStatus>("ibroadcast_status", {
      userId: activeUserId,
    });
  return json(
    await browserFetch(`${serverBaseUrl()}/api/ibroadcast/status`),
    "Could not check iBroadcast",
  );
}
export async function startIbroadcastDeviceAuth(): Promise<IbDeviceCode> {
  if (isTauriDesktop()) return invoke<IbDeviceCode>("ibroadcast_device_start");
  return json(
    await browserFetch(`${serverBaseUrl()}/api/ibroadcast/device/start`, {
      method: "POST",
    }),
    "Could not start iBroadcast authorization",
  );
}
export async function pollIbroadcastDeviceAuth(
  deviceCode: string,
): Promise<IbDevicePoll> {
  if (isTauriDesktop())
    return invoke<IbDevicePoll>("ibroadcast_device_poll", {
      userId: activeUserId,
      deviceCode,
    });
  return json(
    await browserFetch(`${serverBaseUrl()}/api/ibroadcast/device/poll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceCode }),
    }),
    "Could not finish iBroadcast authorization",
  );
}
export async function syncIbroadcast(): Promise<IbLibrary> {
  if (isTauriDesktop())
    return invoke<IbLibrary>("ibroadcast_sync", { userId: activeUserId });
  return json(
    await browserFetch(`${serverBaseUrl()}/api/ibroadcast/sync`, {
      method: "POST",
    }),
    "Could not sync iBroadcast",
  );
}
export async function getIbroadcastLibrary(): Promise<IbLibrary> {
  if (isTauriDesktop())
    return invoke<IbLibrary>("ibroadcast_library", { userId: activeUserId });
  return json(
    await browserFetch(`${serverBaseUrl()}/api/ibroadcast/library`),
    "Could not load iBroadcast library",
  );
}
export async function disconnectIbroadcast(): Promise<void> {
  if (isTauriDesktop()) {
    await invoke("ibroadcast_disconnect", { userId: activeUserId });
    return;
  }
  const r = await browserFetch(`${serverBaseUrl()}/api/ibroadcast/disconnect`, {
    method: "POST",
  });
  if (!r.ok) throw new Error("Could not disconnect iBroadcast");
}
export const ibroadcastStreamUrl = (trackId: string) =>
  `${serverBaseUrl()}/api/ibroadcast/stream/${encodeURIComponent(trackId)}`;
export async function fetchIbroadcastAudioBlob(
  trackId: string,
): Promise<string> {
  const response = await browserFetch(ibroadcastStreamUrl(trackId), {
    headers: { Range: "bytes=0-" },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      detail || `iBroadcast audio request failed (${response.status})`,
    );
  }
  const contentType = response.headers.get("content-type") || "";
  if (
    contentType.includes("json") ||
    contentType.includes("html") ||
    contentType.startsWith("text/")
  ) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      detail || `iBroadcast returned ${contentType || "non-audio content"}`,
    );
  }
  const blob = await response.blob();
  if (blob.size === 0)
    throw new Error("iBroadcast returned an empty audio response.");
  return URL.createObjectURL(blob);
}
