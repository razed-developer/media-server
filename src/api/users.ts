import { invoke } from "@tauri-apps/api/core";
import type {
  ThemeName,
  UserPreferences,
  UserProfile,
} from "../types";
import {
  activeUserId,
  browserFetch,
  isTauriDesktop,
  json,
  serverBaseUrl,
} from "./core";

export async function listUsers(): Promise<UserProfile[]> {
  if (isTauriDesktop()) return invoke<UserProfile[]>("list_users");
  return json(
    await browserFetch(`${serverBaseUrl()}/api/users`),
    "Could not load users",
  );
}

export async function createUser(name: string): Promise<UserProfile[]> {
  if (!isTauriDesktop())
    throw new Error("User management is available from the desktop server app.");
  return invoke<UserProfile[]>("create_user", { name });
}

export async function renameUser(
  userId: string,
  name: string,
): Promise<UserProfile[]> {
  if (!isTauriDesktop())
    throw new Error("User management is available from the desktop server app.");
  return invoke<UserProfile[]>("rename_user", { userId, name });
}

export async function deleteUser(userId: string): Promise<UserProfile[]> {
  if (!isTauriDesktop())
    throw new Error("User management is available from the desktop server app.");
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
