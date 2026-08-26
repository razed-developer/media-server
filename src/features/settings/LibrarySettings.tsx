import { useEffect, useState } from "react";
import { Film, FolderOpen, RefreshCw, Tv } from "lucide-react";
import {
  chooseLibraryPath,
  getLibraryScanProgress,
  rescanLibrary,
  setSplitContinueWatching,
} from "../../api";
import { addLibraryRoot, removeLibraryRoot } from "../../libraryRootsApi";
import type { ScanProgress, ServerStatus } from "../../types";
import { CollectionSourcesSettings } from "../../components/CollectionSourcesSettings";
import { ContinueWatchingSettings } from "./ContinueWatchingSettings";
import { LibraryRootCard, type LibraryKind } from "./LibraryRootCard";

interface LibrarySettingsProps {
  status: ServerStatus | null;
  splitContinueWatching: boolean;
  onSplitContinueWatchingChange: (split: boolean) => void;
  onRefresh: () => Promise<void>;
  onChanged?: () => void;
  onError: (message: string) => void;
}

const libraryLabels: Record<LibraryKind, string> = {
  movie: "movie",
  tv: "TV",
  special: "specials",
};

export function LibrarySettings({
  status,
  splitContinueWatching,
  onSplitContinueWatchingChange,
  onRefresh,
  onChanged,
  onError,
}: LibrarySettingsProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const moviePaths =
    status?.moviePaths ?? (status?.moviePath ? [status.moviePath] : []);
  const tvPaths = status?.tvPaths ?? (status?.tvPath ? [status.tvPath] : []);
  const specialPaths = status?.specialPaths ?? [];

  useEffect(() => {
    if (!busy) return;
    const update = () =>
      void getLibraryScanProgress()
        .then(setScanProgress)
        .catch(() => undefined);
    update();
    const timer = window.setInterval(update, 400);
    return () => window.clearInterval(timer);
  }, [busy]);

  const addFolder = async (kind: LibraryKind) => {
    const path = await chooseLibraryPath();
    if (!path) return;
    setBusy(true);
    setMessage(
      `Scanning ${libraryLabels[kind]} folder… This can take several minutes for a large library.`,
    );
    try {
      await addLibraryRoot(kind, path);
      await onRefresh();
      onChanged?.();
      setMessage("Library scan complete.");
    } catch (cause) {
      onError(String(cause));
      setMessage(null);
    } finally {
      setBusy(false);
    }
  };

  const removeFolder = async (kind: LibraryKind, path: string) => {
    setBusy(true);
    setMessage("Updating folders and rescanning the library…");
    try {
      await removeLibraryRoot(kind, path);
      await onRefresh();
      onChanged?.();
      setMessage("Library scan complete.");
    } catch (cause) {
      onError(String(cause));
      setMessage(null);
    } finally {
      setBusy(false);
    }
  };

  const rescan = async () => {
    setBusy(true);
    setMessage("Scanning all configured libraries… This can take several minutes.");
    try {
      await rescanLibrary();
      onChanged?.();
      await onRefresh();
      setMessage("Library scan complete.");
    } catch (cause) {
      onError(String(cause));
      setMessage(null);
    } finally {
      setBusy(false);
    }
  };

  const changeContinueWatching = (split: boolean) => {
    onSplitContinueWatchingChange(split);
    void setSplitContinueWatching(split)
      .then(() => onChanged?.())
      .catch((cause) => {
        onSplitContinueWatchingChange(!split);
        onError(String(cause));
      });
  };

  return (
    <>
      <p className="eyebrow">MEDIA</p>
      <h1>Libraries</h1>
      {message && (
        <div className="settings-card library-scan-status">
          <RefreshCw className={busy ? "spin" : ""} size={18} />
          <div>
            <strong>{busy ? "Library scan in progress" : "Library updated"}</strong>
            <p>{message}</p>
            {busy && scanProgress && (
              <>
                <p className="scan-counts">
                  {scanProgress.phase === "discovering"
                    ? `${scanProgress.discovered} media files discovered`
                    : `${scanProgress.inspected} of ${scanProgress.discovered} media files inspected`}
                </p>
                {scanProgress.currentPath && (
                  <code title={scanProgress.currentPath}>
                    {scanProgress.currentPath}
                  </code>
                )}
              </>
            )}
          </div>
        </div>
      )}
      <ContinueWatchingSettings
        split={splitContinueWatching}
        onChange={changeContinueWatching}
      />
      <LibraryRootCard
        kind="movie"
        paths={moviePaths}
        icon={Film}
        busy={busy}
        onAdd={(kind) => void addFolder(kind)}
        onRemove={(kind, path) => void removeFolder(kind, path)}
      />
      <LibraryRootCard
        kind="tv"
        paths={tvPaths}
        icon={Tv}
        busy={busy}
        onAdd={(kind) => void addFolder(kind)}
        onRemove={(kind, path) => void removeFolder(kind, path)}
      />
      <LibraryRootCard
        kind="special"
        paths={specialPaths}
        icon={FolderOpen}
        busy={busy}
        onAdd={(kind) => void addFolder(kind)}
        onRemove={(kind, path) => void removeFolder(kind, path)}
      />
      <p className="muted">
        Specials folders are scanned recursively. Onyx uses filenames as titles
        and does not request TMDB metadata or artwork.
      </p>
      <CollectionSourcesSettings onChanged={onChanged} />
      <button disabled={busy} onClick={() => void rescan()}>
        <RefreshCw className={busy ? "spin" : ""} size={17} />
        {busy ? "Scanning libraries…" : "Rescan libraries"}
      </button>
    </>
  );
}
