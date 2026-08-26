import { invoke } from "@tauri-apps/api/core";
import type { GuideChannel, LiveChannel, LiveChannelInput } from "../types";
import {
  activeUserId,
  browserFetch,
  isTauriDesktop,
  json,
  serverBaseUrl,
} from "./core";

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
    throw new Error("Live Channel setup is managed from the desktop server app.");
  return invoke<LiveChannel[]>("live_channels_save", {
    userId: activeUserId,
    input,
  });
}

export async function deleteLiveChannel(
  channelId: string,
): Promise<LiveChannel[]> {
  if (!isTauriDesktop())
    throw new Error("Live Channel setup is managed from the desktop server app.");
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
    throw new Error("Live Channel artwork is managed from the desktop server app.");
  return invoke<LiveChannel[]>("live_channels_set_artwork", {
    userId: activeUserId,
    channelId,
    path,
  });
}

export async function setLiveChannelStyle(
  channelId: string,
  icon?: string,
  color?: string,
): Promise<LiveChannel[]> {
  if (!isTauriDesktop())
    throw new Error("Live Channel artwork is managed from the desktop server app.");
  return invoke<LiveChannel[]>("live_channels_set_style", {
    userId: activeUserId,
    channelId,
    icon: icon ?? null,
    color: color ?? null,
  });
}

export async function reorderLiveChannels(
  orderedIds: string[],
): Promise<LiveChannel[]> {
  if (!isTauriDesktop())
    throw new Error("Live Channel order is managed from the desktop server app.");
  return invoke<LiveChannel[]>("live_channels_reorder", {
    userId: activeUserId,
    orderedIds,
  });
}

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
