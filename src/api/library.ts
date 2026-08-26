import { invoke } from "@tauri-apps/api/core";
import type { ScanProgress } from "../types";
import { isTauriDesktop } from "./core";

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

export async function clearThumbnailCache(): Promise<void> {
  if (!isTauriDesktop())
    throw new Error("Artwork cache is managed from the desktop server app.");
  await invoke("clear_thumbnail_cache");
}
