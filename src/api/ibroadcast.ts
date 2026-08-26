import { invoke } from "@tauri-apps/api/core";
import type {
  IbConnectionStatus,
  IbDeviceCode,
  IbDevicePoll,
  IbLibrary,
} from "../types";
import {
  activeUserId,
  browserFetch,
  isTauriDesktop,
  json,
  serverBaseUrl,
} from "./core";

export async function setIbroadcastClientId(clientId: string): Promise<void> {
  if (!isTauriDesktop())
    throw new Error(
      "The iBroadcast app client ID is managed from the desktop server.",
    );
  await invoke("set_ibroadcast_client_id", { clientId });
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
  const response = await browserFetch(
    `${serverBaseUrl()}/api/ibroadcast/disconnect`,
    { method: "POST" },
  );
  if (!response.ok) throw new Error("Could not disconnect iBroadcast");
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
