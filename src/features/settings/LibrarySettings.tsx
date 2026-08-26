import { useEffect, useState } from "react";
import { Film, FolderOpen, RefreshCw, Tv } from "lucide-react";
import {
  chooseLibraryPath,
  getLibraryScanProgress,
  rescanLibrary,
} from "../../api";
import { addLibraryRoot, removeLibraryRoot } from "../../libraryRootsApi";
import { listCollectionSources } from "../../api";
import type { CollectionSource, ContinueWatchingLayout, LibraryNavigationId, ScanProgress, ServerStatus } from "../../types";
import { CollectionSourcesSettings } from "../../components/CollectionSourcesSettings";
import { ContinueWatchingSettings } from "./ContinueWatchingSettings";
import { LibraryRootCard, type LibraryKind } from "./LibraryRootCard";
import { LibraryOrderSettings } from "./LibraryOrderSettings";
import { completeLibraryOrder } from "../../preferences/navigationPreferences";

interface LibrarySettingsProps {
  status: ServerStatus | null;
  continueWatchingLayout: ContinueWatchingLayout;
  libraryOrder: LibraryNavigationId[];
  onContinueWatchingLayoutChange: (layout: ContinueWatchingLayout) => void;
  onLibraryOrderChange: (order: LibraryNavigationId[]) => void;
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
  continueWatchingLayout, libraryOrder, onContinueWatchingLayoutChange, onLibraryOrderChange,
  onRefresh,
  onChanged,
  onError,
}: LibrarySettingsProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [collectionSources, setCollectionSources] = useState<CollectionSource[]>([]);
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
  useEffect(() => { void listCollectionSources().then(setCollectionSources).catch(() => undefined); }, []);

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

  const availableLibraries = [{ id: "movies" as const, label: "Movies" }, { id: "tv" as const, label: "TV" }, { id: "specials" as const, label: "Specials" }, ...collectionSources.map(source => ({ id: `collection:${source.id}` as LibraryNavigationId, label: source.name }))];
  const orderedLibraries = completeLibraryOrder(libraryOrder, availableLibraries.map(item => item.id)).map(id => availableLibraries.find(item => item.id === id)!).filter(Boolean);

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
        layout={continueWatchingLayout}
        onChange={onContinueWatchingLayoutChange}
      />
      <LibraryOrderSettings libraries={orderedLibraries} onChange={onLibraryOrderChange} />
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
      <CollectionSourcesSettings onChanged={async () => { setCollectionSources(await listCollectionSources()); await onChanged?.(); }} />
      <button disabled={busy} onClick={() => void rescan()}>
        <RefreshCw className={busy ? "spin" : ""} size={17} />
        {busy ? "Scanning libraries…" : "Rescan libraries"}
      </button>
    </>
  );
}
