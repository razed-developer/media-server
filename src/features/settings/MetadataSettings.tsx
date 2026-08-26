import { useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import {
  autoMatchMetadata,
  clearTmdbToken,
  setTmdbToken,
  testTmdb,
} from "../../api";
import type { MetadataProviderStatus } from "../../types";

interface MetadataSettingsProps {
  providers: MetadataProviderStatus[];
  onRefresh: () => Promise<void>;
  onChanged?: () => void;
  onError: (message: string) => void;
}

export function MetadataSettings({
  providers,
  onRefresh,
  onChanged,
  onError,
}: MetadataSettingsProps) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const tmdb = providers.find((provider) => provider.provider === "tmdb");
  const tvdb = providers.find((provider) => provider.provider === "tvdb");

  const saveToken = async () => {
    const nextToken = token.trim();
    if (!nextToken) return;
    setBusy(true);
    setMessage(null);
    try {
      await setTmdbToken(nextToken);
      await testTmdb();
      setToken("");
      setMessage("TMDB connected successfully.");
      await onRefresh();
    } catch (cause) {
      onError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  const testConnection = async () => {
    setBusy(true);
    try {
      await testTmdb();
      setMessage("TMDB connection is working.");
    } catch (cause) {
      onError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  const matchMedia = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const count = await autoMatchMetadata();
      setMessage(
        `${count} high-confidence ${count === 1 ? "item" : "items"} matched. Ambiguous media was left unchanged.`,
      );
      onChanged?.();
    } catch (cause) {
      onError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await clearTmdbToken();
      setMessage(
        "TMDB disconnected. Existing cached metadata remains available.",
      );
      await onRefresh();
    } catch (cause) {
      onError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="eyebrow">IDENTIFICATION</p>
      <h1>Metadata</h1>
      {message && <div className="settings-success">{message}</div>}
      <div className="settings-card metadata-provider-card">
        <div className="provider-title">
          <div>
            <strong>TMDB</strong>
            <span className="primary-provider">Primary</span>
          </div>
          <span
            className={
              tmdb?.configured ? "provider-connected" : "provider-offline"
            }
          >
            {tmdb?.configured ? "Configured" : "Not configured"}
          </span>
        </div>
        <label className="setup-field">
          <span>API Read Access Token</span>
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={
              tmdb?.configured
                ? "•••••••• configured — enter a new token to replace"
                : "Paste TMDB API Read Access Token"
            }
          />
        </label>
        <div className="metadata-actions">
          <button
            className="primary"
            disabled={busy || !token.trim()}
            onClick={() => void saveToken()}
          >
            <Save size={16} />
            Save & test
          </button>
          {tmdb?.configured && (
            <>
              <button disabled={busy} onClick={() => void testConnection()}>
                Test connection
              </button>
              <button disabled={busy} onClick={() => void matchMedia()}>
                <RefreshCw size={16} />
                Match unmatched media
              </button>
              <button
                className="danger-text"
                disabled={busy}
                onClick={() => void disconnect()}
              >
                Disconnect
              </button>
            </>
          )}
        </div>
        <p className="metadata-attribution">{tmdb?.attribution}</p>
      </div>
      <div className="settings-card metadata-provider-card disabled-provider">
        <div className="provider-title">
          <div>
            <strong>TheTVDB</strong>
            <span>Optional secondary provider</span>
          </div>
          <span className="provider-offline">Not enabled</span>
        </div>
        <p className="metadata-attribution">{tvdb?.attribution}</p>
      </div>
    </>
  );
}
