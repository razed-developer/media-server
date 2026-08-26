import { invoke } from "@tauri-apps/api/core";
import type { AuthStatus, SetupStatus } from "../types";
import { browserFetch, isTauriDesktop, json, serverBaseUrl } from "./core";
import { listUsers } from "./users";

export async function getAuthStatus(): Promise<AuthStatus> {
  if (isTauriDesktop()) return { required: false, authenticated: true };
  return json(
    await browserFetch(`${serverBaseUrl()}/api/auth/status`),
    "Could not check authentication",
  );
}

export async function login(password: string): Promise<void> {
  if (isTauriDesktop()) return;
  const response = await browserFetch(`${serverBaseUrl()}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "Incorrect password"
        : `Login failed (${response.status})`,
    );
}

export async function logout(): Promise<void> {
  if (!isTauriDesktop())
    await browserFetch(`${serverBaseUrl()}/api/auth/logout`, {
      method: "POST",
    });
}

export async function getSetupStatus(): Promise<SetupStatus> {
  if (!isTauriDesktop()) return { complete: true, users: await listUsers() };
  return invoke<SetupStatus>("setup_status");
}

export async function completeSetup(): Promise<void> {
  if (!isTauriDesktop()) return;
  await invoke("complete_setup");
}
