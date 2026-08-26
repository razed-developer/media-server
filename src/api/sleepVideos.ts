import { invoke } from "@tauri-apps/api/core";
import type { SleepVideoStatus } from "../types";
import { browserFetch, isTauriDesktop, json, serverBaseUrl } from "./core";

export async function getSleepVideos(): Promise<SleepVideoStatus> {
  if (isTauriDesktop()) return invoke<SleepVideoStatus>("sleep_video_status");
  return json(
    await browserFetch(`${serverBaseUrl()}/api/sleep-videos`),
    "Could not load sleep videos",
  );
}

export async function configureSleepVideos(
  path?: string,
): Promise<SleepVideoStatus> {
  if (!isTauriDesktop())
    throw new Error(
      "The sleep video folder is managed from the desktop server app.",
    );
  return invoke<SleepVideoStatus>("sleep_video_configure", { path });
}
