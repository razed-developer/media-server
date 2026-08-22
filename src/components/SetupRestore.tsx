import { useState } from "react";
import { ArchiveRestore, FolderOpen } from "lucide-react";
import {
  chooseBackupFile,
  completeSetup,
  previewBackup,
  restoreBackup,
} from "../api";
import type { BackupPreview, RootMapping } from "../types";

export function SetupRestore({
  onCancel,
  onRestored,
}: {
  onCancel: () => void;
  onRestored: () => void;
}) {
  const [path, setPath] = useState("");
  const [password, setPassword] = useState("");
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [mappings, setMappings] = useState<RootMapping[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async () => {
    const selected = await chooseBackupFile();
    if (selected) {
      setPath(selected);
      setPreview(null);
      setMappings([]);
      setError(null);
    }
  };
  const inspect = async () => {
    setBusy(true);
    setError(null);
    try {
      const value = await previewBackup(path, password);
      setPreview(value);
      setMappings(
        [...value.moviePaths, ...value.tvPaths].map((from) => ({
          from,
          to: from,
        })),
      );
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };
  const restore = async () => {
    setBusy(true);
    setError(null);
    try {
      await restoreBackup(
        path,
        password,
        "replace",
        mappings.filter((mapping) => mapping.from !== mapping.to),
      );
      await completeSetup();
      onRestored();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="setup-shell">
      <div className="setup-import">
        <p className="eyebrow">IMPORTED INSTALL</p>
        <ArchiveRestore size={38} />
        <h1>Restore Onyx</h1>
        <p className="setup-lead">
          Bring back profiles, preferences, watch history, playlists, metadata
          matches, provider connections, and library settings from an encrypted
          Onyx backup.
        </p>
        {error && <div className="error-banner">{error}</div>}
        <div className="setup-import-fields">
          <button onClick={() => void choose()}>
            <FolderOpen size={16} />
            Choose backup file
          </button>
          {path && <code title={path}>{path}</code>}
          <label className="setup-field">
            <span>Backup password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password used when the backup was created"
            />
          </label>
          <button
            className="primary"
            disabled={busy || !path || password.length < 10}
            onClick={() => void inspect()}
          >
            {busy ? "Verifying…" : "Verify backup"}
          </button>
        </div>
        {preview && (
          <div className="setup-import-preview">
            <p>
              <strong>{preview.mediaItems}</strong> media records ·{" "}
              <strong>{preview.users}</strong> profiles
            </p>
            <h3>Confirm media locations</h3>
            <p className="muted">
              Change only roots whose drive letter or parent folder has moved.
              Subfolders are preserved.
            </p>
            {mappings.map((mapping, index) => (
              <label className="root-mapping" key={`${mapping.from}-${index}`}>
                <span title={mapping.from}>{mapping.from}</span>
                <span>→</span>
                <input
                  value={mapping.to}
                  onChange={(event) =>
                    setMappings((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, to: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </label>
            ))}
          </div>
        )}
        <div className="setup-actions">
          <button disabled={busy} onClick={onCancel}>
            Back
          </button>
          {preview && (
            <button
              className="primary"
              disabled={busy}
              onClick={() => void restore()}
            >
              {busy ? "Restoring…" : "Restore and open Onyx"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
