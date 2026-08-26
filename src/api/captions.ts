import { invoke } from "@tauri-apps/api/core";
import type { CaptionStatus } from "../types";
import { isTauriDesktop } from "./core";

export async function getCaptionStatus(): Promise<CaptionStatus> {
  if (!isTauriDesktop())
    throw new Error("Caption setup is managed from the desktop server app.");
  return invoke<CaptionStatus>("caption_status");
}

export async function configureCaptions(input: {
  enabled: boolean;
  autoNew: boolean;
  language: string;
  executable?: string;
  modelPath?: string;
}): Promise<CaptionStatus> {
  if (!isTauriDesktop())
    throw new Error("Caption setup is managed from the desktop server app.");
  return invoke<CaptionStatus>("caption_configure", input);
}

export async function generateCaptions(
  mediaId: string,
  force = false,
): Promise<boolean> {
  if (!isTauriDesktop())
    throw new Error(
      "Caption generation is managed from the desktop server app.",
    );
  return invoke<boolean>("caption_generate", { mediaId, force });
}

export async function generateMissingCaptions(): Promise<number> {
  if (!isTauriDesktop())
    throw new Error(
      "Caption generation is managed from the desktop server app.",
    );
  return invoke<number>("caption_generate_missing");
}
