import { invoke } from "@tauri-apps/api/core";
import type {
  LibraryHealthReport,
  LibraryRepairReport,
  MediaItem,
  MetadataProviderStatus,
  MetadataSearchResult,
} from "../types";
import { isTauriDesktop } from "./core";
import { listMedia } from "./media";

export interface IdentityInput {
  title?: string;
  year?: number;
  kind?: "movie" | "episode";
  showTitle?: string;
  season?: number;
  episode?: number;
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
    throw new Error("Metadata credentials are managed from the desktop server.");
  await invoke("set_tmdb_token", { token });
}

export async function clearTmdbToken(): Promise<void> {
  if (!isTauriDesktop())
    throw new Error("Metadata credentials are managed from the desktop server.");
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
