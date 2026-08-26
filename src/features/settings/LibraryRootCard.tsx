import { FolderOpen, Plus, Trash2, type LucideIcon } from "lucide-react";

export type LibraryKind = "movie" | "tv" | "special";

interface LibraryRootCardProps {
  kind: LibraryKind;
  paths: string[];
  icon: LucideIcon;
  busy: boolean;
  onAdd: (kind: LibraryKind) => void;
  onRemove: (kind: LibraryKind, path: string) => void;
}

const libraryNames: Record<LibraryKind, string> = {
  movie: "Movies",
  tv: "TV Shows",
  special: "Specials & Documentaries",
};

const libraryDescriptions: Record<LibraryKind, string> = {
  movie: "movie",
  tv: "TV",
  special: "specials",
};

export function LibraryRootCard({
  kind,
  paths,
  icon: Icon,
  busy,
  onAdd,
  onRemove,
}: LibraryRootCardProps) {
  return (
    <div className="settings-card library-root-card">
      <div className="library-root-heading">
        <Icon />
        <div>
          <h3>{libraryNames[kind]}</h3>
          <p>
            {paths.length
              ? `${paths.length} ${paths.length === 1 ? "folder" : "folders"}`
              : "No folders selected"}
          </p>
        </div>
        <button disabled={busy} onClick={() => onAdd(kind)}>
          <Plus size={16} />
          {busy ? "Scanning…" : "Add folder"}
        </button>
      </div>
      <div className="library-root-list">
        {paths.map((path) => (
          <div className="library-root-row" key={path}>
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
        {!paths.length && (
          <p className="muted">
            Add one or more folders. Onyx scans all of them into the same{" "}
            {libraryDescriptions[kind]} library.
          </p>
        )}
      </div>
    </div>
  );
}
