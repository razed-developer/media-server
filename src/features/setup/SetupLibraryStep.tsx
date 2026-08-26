import { Film, FolderOpen, Plus, Trash2, Tv, type LucideIcon } from "lucide-react";

type SetupLibraryKind = "movie" | "tv";

interface SetupLibraryStepProps {
  moviePaths: string[];
  tvPaths: string[];
  busy: boolean;
  message: string | null;
  onAddFolder: (kind: SetupLibraryKind) => void;
  onRemoveFolder: (kind: SetupLibraryKind, path: string) => void;
  onScan: () => void;
  onBack: () => void;
  onContinue: () => void;
}

interface FolderGroupProps {
  kind: SetupLibraryKind;
  paths: string[];
  icon: LucideIcon;
  busy: boolean;
  onAdd: (kind: SetupLibraryKind) => void;
  onRemove: (kind: SetupLibraryKind, path: string) => void;
}

function FolderGroup({
  kind,
  paths,
  icon: Icon,
  busy,
  onAdd,
  onRemove,
}: FolderGroupProps) {
  return (
    <div className="setup-folder-stack">
      <div className="setup-folder">
        <Icon size={22} />
        <div>
          <strong>{kind === "movie" ? "Movies" : "TV Shows"}</strong>
          <span>
            {paths.length
              ? `${paths.length} ${paths.length === 1 ? "folder" : "folders"} selected`
              : "Not selected"}
          </span>
        </div>
        <button disabled={busy} onClick={() => onAdd(kind)}>
          <Plus size={16} />
          Add folder
        </button>
      </div>
      {paths.map((path) => (
        <div className="setup-folder-path" key={path}>
          <FolderOpen size={15} />
          <span title={path}>{path}</span>
          <button
            disabled={busy}
            className="icon-action danger-text"
            aria-label={`Remove ${path}`}
            onClick={() => onRemove(kind, path)}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function SetupLibraryStep({
  moviePaths,
  tvPaths,
  busy,
  message,
  onAddFolder,
  onRemoveFolder,
  onScan,
  onBack,
  onContinue,
}: SetupLibraryStepProps) {
  return (
    <section>
      <FolderOpen size={34} />
      <h1>Media libraries</h1>
      <p>
        Movies and television stay separate in Onyx, and each can span multiple
        folders, drives, or network shares.
      </p>
      {message && (
        <div className="settings-card library-scan-status">
          <FolderOpen size={18} />
          <div>
            <strong>{busy ? "Library scan in progress" : "Library updated"}</strong>
            <p>{message}</p>
          </div>
        </div>
      )}
      <FolderGroup
        kind="movie"
        paths={moviePaths}
        icon={Film}
        busy={busy}
        onAdd={onAddFolder}
        onRemove={onRemoveFolder}
      />
      <FolderGroup
        kind="tv"
        paths={tvPaths}
        icon={Tv}
        busy={busy}
        onAdd={onAddFolder}
        onRemove={onRemoveFolder}
      />
      <button
        className="primary"
        disabled={busy || (!moviePaths.length && !tvPaths.length)}
        onClick={onScan}
      >
        {busy ? "Scanning library…" : "Scan selected folders"}
      </button>
      <div className="setup-actions">
        <button disabled={busy} onClick={onBack}>
          Back
        </button>
        <button disabled={busy} className="primary" onClick={onContinue}>
          {busy ? "Scanning library…" : "Continue"}
        </button>
      </div>
    </section>
  );
}
