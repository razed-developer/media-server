import { invoke } from "@tauri-apps/api/core";
import type { CollectionSource, CollectionSourceInput } from "../types";
import { activeUserId, isTauriDesktop } from "./core";

export async function listCollectionSources(): Promise<CollectionSource[]> {
  if (!isTauriDesktop()) return [];
  return invoke<CollectionSource[]>("collection_sources_list");
}

export async function chooseCollectionFolder(): Promise<string | null> {
  if (!isTauriDesktop()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({ directory: true, multiple: false });
  return typeof selected === "string" ? selected : null;
}

export async function saveCollectionSource(
  input: CollectionSourceInput,
): Promise<CollectionSource[]> {
  return invoke<CollectionSource[]>("collection_source_save", { input });
}

export async function deleteCollectionSource(
  sourceId: string,
): Promise<CollectionSource[]> {
  return invoke<CollectionSource[]>("collection_source_delete", { sourceId });
}

export async function unlockCollectionSource(
  sourceId: string,
  pin: string,
): Promise<string> {
  return invoke<string>("collection_source_unlock", {
    sourceId,
    userId: activeUserId,
    pin,
  });
}

export async function touchCollectionSource(token: string): Promise<void> {
  return invoke("collection_source_touch", { token });
}

export async function lockCollectionSource(token: string): Promise<void> {
  return invoke("collection_source_lock", { token });
}
