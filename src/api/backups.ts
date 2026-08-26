import { invoke } from "@tauri-apps/api/core";
import type {
  BackupPreview,
  RestoreReport,
  RootMapping,
} from "../types";
import { isTauriDesktop } from "./core";

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
