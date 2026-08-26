import { useEffect, useState } from "react";
import {
  clearAccessPassword,
  getFunnelStatus,
  setAccessPassword,
  setFunnelEnabled,
} from "../../api";
import type { FunnelStatus } from "../../types";

interface RemoteAccessSettingsProps {
  localUrl?: string;
  accessPasswordSet: boolean;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
}

export function RemoteAccessSettings({
  localUrl,
  accessPasswordSet,
  onRefresh,
  onError,
}: RemoteAccessSettingsProps) {
  const [funnel, setFunnel] = useState<FunnelStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getFunnelStatus().then(setFunnel).catch((cause) => onError(String(cause)));
  }, [onError]);

  const updatePassword = async () => {
    try {
      if (accessPasswordSet) {
        if (window.confirm("Remove the browser access password?")) {
          await clearAccessPassword();
        }
      } else {
        const value = window.prompt(
          "New browser access password (minimum 8 characters):",
        );
        if (value) await setAccessPassword(value);
      }
      await onRefresh();
      setFunnel(await getFunnelStatus());
    } catch (cause) {
      onError(String(cause));
    }
  };

  const toggleFunnel = async () => {
    setBusy(true);
    try {
      setFunnel(await setFunnelEnabled(!funnel?.enabled));
    } catch (cause) {
      onError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="eyebrow">NETWORK</p>
      <h1>Remote access</h1>
      <div className="settings-card">
        <h3>Direct URL</h3>
        <p>
          Tailscale or LAN address: <code>{localUrl}</code>
        </p>
        <p className="muted">
          Direct connections remain password-free and private to the networks
          that can reach this address.
        </p>
      </div>
      <div className="settings-card funnel-settings-card">
        <div className="funnel-settings-heading">
          <div>
            <h3>Tailscale Funnel</h3>
            <p className="muted">
              Temporary public access for devices that cannot run Tailscale.
              The Funnel address always requires a password.
            </p>
          </div>
          <button
            className={funnel?.enabled ? "funnel-toggle active" : "funnel-toggle"}
            onClick={() => void toggleFunnel()}
            disabled={
              busy ||
              !funnel?.available ||
              (!funnel?.enabled && !accessPasswordSet)
            }
            aria-pressed={Boolean(funnel?.enabled)}
          >
            {busy ? "Working…" : funnel?.enabled ? "Turn off" : "Turn on"}
          </button>
        </div>
        <dl>
          <div>
            <dt>Status</dt>
            <dd>{funnel?.enabled ? "Public access on" : "Off"}</dd>
          </div>
          <div>
            <dt>Password</dt>
            <dd>{accessPasswordSet ? "Set" : "Required"}</dd>
          </div>
        </dl>
        {funnel?.url && (
          <p className="funnel-url">
            Public URL: <code>{funnel.url}</code>
          </p>
        )}
        {funnel?.detail && <p className="danger-text">{funnel.detail}</p>}
        <button onClick={() => void updatePassword()} disabled={Boolean(funnel?.enabled)}>
          {accessPasswordSet
            ? "Change or remove Funnel password"
            : "Set Funnel password"}
        </button>
        {funnel?.enabled && (
          <p className="muted">
            Turn Funnel off before changing or removing its password.
          </p>
        )}
        <p className="muted">
          Turning Funnel off makes the public URL unavailable. It does not
          affect the direct URL above.
        </p>
      </div>
    </>
  );
}
