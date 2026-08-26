import { invoke } from "@tauri-apps/api/core";
import type { AnalyticsSummary, MediaItem, ServerStatus } from "../types";
import {
  activeUserId,
  browserFetch,
  isTauriDesktop,
  json,
  serverBaseUrl,
} from "./core";

export async function getAnalytics(): Promise<AnalyticsSummary> {
  if (isTauriDesktop())
    return invoke<AnalyticsSummary>("user_analytics", {
      userId: activeUserId,
    });
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
  const response = await browserFetch(
    `${serverBaseUrl()}/api/progress/${encodeURIComponent(id)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seconds, watchedSeconds }),
    },
  );
  if (!response.ok)
    throw new Error(`Could not save playback progress (${response.status})`);
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
