import { useState } from "react";
import {
  ArchiveRestore,
  Eye,
  EyeOff,
  FolderOpen,
  RefreshCw,
  Save,
} from "lucide-react";
import {
  chooseBackupDestination,
  chooseBackupFile,
  createBackup,
  previewBackup,
  restoreBackup,
} from "../../api";
import type { BackupPreview, RootMapping } from "../../types";

interface BackupRestoreSettingsProps {
  onRestored: () => Promise<void>;
  onChanged?: () => void;
  onError: (message: string) => void;
}

export function BackupRestoreSettings({
  onRestored,
  onChanged,
  onError,
}: BackupRestoreSettingsProps) {
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [path, setPath] = useState("");
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [rootMappings, setRootMappings] = useState<RootMapping[]>([]);
  const [restoreMode, setRestoreMode] = useState<"merge" | "replace">(
    "replace",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const makeBackup = async () => {
    if (password.length < 10) {
      onError("Use a backup password of at least 10 characters.");
      return;
    }
    const destination = await chooseBackupDestination();
    if (!destination) return;
    setBusy(true);
    try {
      const backup = await createBackup(destination, password);
      setMessage(
        `Encrypted backup created with ${backup.mediaItems} media records and ${backup.users} users.`,
      );
    } catch (cause) {
      onError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  const openBackup = async () => {
    const selectedPath = await chooseBackupFile();
    if (!selectedPath) return;
    setPath(selectedPath);
    setPreview(null);
    setRootMappings([]);
  };

  const inspectBackup = async () => {
    if (!path) return;
    setBusy(true);
    try {
      const backup = await previewBackup(path, password);
      setPreview(backup);
      setRootMappings(
        [...backup.moviePaths, ...backup.tvPaths].map((from) => ({
          from,
          to: from,
        })),
      );
      setMessage("Backup verified. Review the folder mappings before restoring.");
    } catch (cause) {
      onError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  const runRestore = async () => {
    if (
      !path ||
      !preview ||
      !window.confirm(
        `Restore this backup using ${restoreMode} mode? Onyx will create a safety backup first.`,
      )
    )
      return;
    setBusy(true);
    try {
      const report = await restoreBackup(
        path,
        password,
        restoreMode,
        rootMappings.filter((mapping) => mapping.from !== mapping.to),
      );
      setMessage(
        `Restore complete: ${report.mediaItems} media records and ${report.users} users. Safety backup: ${report.safetyBackupPath}`,
      );
      setPreview(null);
      await onRestored();
      onChanged?.();
    } catch (cause) {
      onError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="eyebrow">DATA SAFETY</p>
      <h1>Backup & Restore</h1>
      {message && <div className="settings-success">{message}</div>}
      <div className="settings-card backup-card">
        <h3>Create encrypted backup</h3>
        <p>
          Includes settings, profiles, watch progress, playlists, matches,
          requests, provider state, Onyx-managed subtitles, and saved provider
          credentials. Media files and regenerable artwork are excluded.
        </p>
        <label className="setup-field">
          <span>Backup password</span>
          <div className="password-view-field">
            <input
              type={passwordVisible ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 10 characters"
            />
            <button
              type="button"
              title={passwordVisible ? "Hide backup password" : "Show backup password"}
              aria-label={passwordVisible ? "Hide backup password" : "Show backup password"}
              onClick={() => setPasswordVisible((visible) => !visible)}
            >
              {passwordVisible ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </label>
        <button
          className="primary"
          disabled={busy || password.length < 10}
          onClick={() => void makeBackup()}
        >
          <Save size={16} />
          Create backup file
        </button>
      </div>
      <div className="settings-card backup-card">
        <h3>Restore backup</h3>
        <p>
          Choose a backup, verify it, then adjust any media roots whose drive or
          parent folder changed.
        </p>
        <div className="backup-actions">
          <button disabled={busy} onClick={() => void openBackup()}>
            <FolderOpen size={16} />
            Choose backup
          </button>
          {path && <code title={path}>{path}</code>}
          <button
            disabled={busy || !path || password.length < 10}
            onClick={() => void inspectBackup()}
          >
            <RefreshCw size={16} />
            Verify & preview
          </button>
        </div>
        {preview && (
          <div className="backup-preview">
            <p>
              <strong>{preview.mediaItems}</strong> media records ·{" "}
              <strong>{preview.users}</strong> users · created{" "}
              {new Date(preview.createdAt * 1000).toLocaleString()}
            </p>
            <p>
              Credentials:{" "}
              {[
                preview.includesTmdb && "TMDB",
                preview.includesSubtitles && "OpenSubtitles",
                preview.includesIbroadcast && "iBroadcast",
              ]
                .filter(Boolean)
                .join(", ") || "none"}
            </p>
            <h4>Media folder mapping</h4>
            {rootMappings.map((mapping, index) => (
              <label className="root-mapping" key={`${mapping.from}-${index}`}>
                <span title={mapping.from}>{mapping.from}</span>
                <span>→</span>
                <input
                  value={mapping.to}
                  onChange={(event) =>
                    setRootMappings((current) =>
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
            <label className="setup-field">
              <span>Restore mode</span>
              <select
                value={restoreMode}
                onChange={(event) =>
                  setRestoreMode(event.target.value as "merge" | "replace")
                }
              >
                <option value="replace">Replace current Onyx data</option>
                <option value="merge">Merge with current Onyx data</option>
              </select>
            </label>
            <p className="muted">
              A password-protected safety backup of the current installation is
              created beside the selected backup before any data changes.
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void runRestore()}
            >
              <ArchiveRestore size={16} />
              Restore backup
            </button>
          </div>
        )}
      </div>
    </>
  );
}
