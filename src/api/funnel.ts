import { invoke } from "@tauri-apps/api/core";
import type { FunnelStatus } from "../types";
import { browserFetch, isTauriDesktop, json, serverBaseUrl } from "./core";

export async function setAccessPassword(password: string): Promise<void> {
  if (isTauriDesktop()) {
    await invoke("set_access_password", { password });
    return;
  }
  const response = await browserFetch(
    `${serverBaseUrl()}/api/admin/funnel/password`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    },
  );
  if (!response.ok)
    throw new Error((await response.text()) || "Could not set Funnel password");
}

export async function clearAccessPassword(): Promise<void> {
  if (isTauriDesktop()) {
    await invoke("clear_access_password");
    return;
  }
  const response = await browserFetch(
    `${serverBaseUrl()}/api/admin/funnel/password`,
    { method: "DELETE" },
  );
  if (!response.ok)
    throw new Error(
      (await response.text()) || "Could not remove Funnel password",
    );
}

export async function getFunnelStatus(): Promise<FunnelStatus> {
  if (isTauriDesktop()) return invoke<FunnelStatus>("funnel_status");
  return json(
    await browserFetch(`${serverBaseUrl()}/api/admin/funnel`),
    "Could not load Funnel status",
  );
}

export async function setFunnelEnabled(
  enabled: boolean,
): Promise<FunnelStatus> {
  if (isTauriDesktop())
    return invoke<FunnelStatus>("set_funnel_enabled", { enabled });
  return json(
    await browserFetch(`${serverBaseUrl()}/api/admin/funnel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled }),
    }),
    "Could not update Funnel status",
  );
}
