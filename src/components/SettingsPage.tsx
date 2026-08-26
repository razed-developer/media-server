import { useEffect, useState } from "react";
import {
  Film,
  FolderOpen,
  RefreshCw,
  Save,
  Tv,
  UserRound,
} from "lucide-react";
import {
  chooseLibraryPath,
  clearThumbnailCache,
  createUser,
  deleteUser,
  getActiveUserId,
  getLibraryScanProgress,
  getServerStatus,
  isTauriDesktop,
  getUserPreferences,
  listUsers,
  metadataProviderStatus,
  renameUser,
  rescanLibrary,
  setActiveUserId,
  setIbroadcastClientId,
  setSplitContinueWatching,
  setUserTheme,
} from "../api";
import { addLibraryRoot, removeLibraryRoot } from "../libraryRootsApi";
import {
  activityEntries as loadActivityEntries,
  clearActivity,
} from "../adminTools";
import { listUserAvatars, setBuiltinUserAvatar, type UserAvatar } from "../userFeaturesApi";
import type {
  ActivityEntry,
  MetadataProviderStatus,
  ServerStatus,
  ScanProgress,
  ThemeName,
  UserProfile,
} from "../types";
import { LiveChannelsSettings } from "./LiveChannelsSettings";
import { LibraryHealthSettings } from "./LibraryHealthSettings";
import { SubtitleSettings } from "./SubtitleSettings";
import { WishlistView } from "./WishlistView";
import { CollectionSourcesSettings } from "./CollectionSourcesSettings";
import { SettingsNavigation, type SettingsCategory } from "../features/settings/SettingsNavigation";
import { LibraryRootCard } from "../features/settings/LibraryRootCard";
import { ContinueWatchingSettings } from "../features/settings/ContinueWatchingSettings";
import { ActivityConsole } from "../features/settings/ActivityConsole";
import { CacheSettings } from "../features/settings/CacheSettings";
import { BackupRestoreSettings } from "../features/settings/BackupRestoreSettings";
import { MetadataSettings } from "../features/settings/MetadataSettings";
import { UsersSettings } from "../features/settings/UsersSettings";
import { AppearanceSettings } from "../features/settings/AppearanceSettings";
import { GeneralSettings } from "../features/settings/GeneralSettings";
import { MusicSettings } from "../features/settings/MusicSettings";
import { RemoteAccessSettings } from "../features/settings/RemoteAccessSettings";
import "../activityConsole.css";
import "../funnelSettings.css";

export function SettingsPage({ onChanged }: { onChanged?: () => void }) {
  const [category, setCategory] = useState<SettingsCategory>("general");
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [avatars, setAvatars] = useState<Record<string, UserAvatar>>({});
  const [active, setActive] = useState(getActiveUserId());
  const [theme, setTheme] = useState<ThemeName>("onyx");
  const [splitContinueWatching, setSplitContinueWatchingState] =
    useState(false);
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [newUserOpen, setNewUserOpen] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserAvatar, setNewUserAvatar] = useState<string>("onyx");
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [providers, setProviders] = useState<MetadataProviderStatus[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [libraryMessage, setLibraryMessage] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const syncUsers = (next: UserProfile[]) => {
    setUsers(next);
    setNameDrafts(Object.fromEntries(next.map((user) => [user.id, user.name])));
  };
  const syncAvatars = (next: UserAvatar[]) =>
    setAvatars(
      Object.fromEntries(next.map((avatar) => [avatar.userId, avatar])),
    );
  const refresh = async () => {
    try {
      const [s, u, p, m, a] = await Promise.all([
        getServerStatus(),
        listUsers(),
        getUserPreferences(),
        isTauriDesktop() ? metadataProviderStatus() : Promise.resolve([]),
        listUserAvatars(),
      ]);
      setStatus(s);
      syncUsers(u);
      syncAvatars(a);
      setTheme(p.theme);
      setSplitContinueWatchingState(p.splitContinueWatching);
      setClientId(s.ibroadcastClientId ?? "");
      setProviders(m);
      setError(null);
    } catch (c) {
      setError(String(c));
    }
  };
  const refreshActivity = async () => {
    try {
      setActivity(await loadActivityEntries());
    } catch (c) {
      setError(String(c));
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (category !== "activity") return;
    void refreshActivity();
    const timer = window.setInterval(() => void refreshActivity(), 1500);
    return () => window.clearInterval(timer);
  }, [category]);
  useEffect(() => {
    if (!libraryBusy) return;
    const update = () =>
      void getLibraryScanProgress()
        .then(setScanProgress)
        .catch(() => undefined);
    update();
    const timer = window.setInterval(update, 400);
    return () => window.clearInterval(timer);
  }, [libraryBusy]);
  const addFolder = async (kind: "movie" | "tv" | "special") => {
    const path = await chooseLibraryPath();
    if (!path) return;
    setLibraryBusy(true);
    setLibraryMessage(
      `Scanning ${kind === "movie" ? "movie" : kind === "tv" ? "TV" : "specials"} folder… This can take several minutes for a large library.`,
    );
    setError(null);
    try {
      await addLibraryRoot(kind, path);
      await refresh();
      onChanged?.();
      setLibraryMessage("Library scan complete.");
    } catch (c) {
      setError(String(c));
      setLibraryMessage(null);
    } finally {
      setLibraryBusy(false);
    }
  };
  const removeFolder = async (kind: "movie" | "tv" | "special", path: string) => {
    setLibraryBusy(true);
    setLibraryMessage("Updating folders and rescanning the library…");
    setError(null);
    try {
      await removeLibraryRoot(kind, path);
      await refresh();
      onChanged?.();
      setLibraryMessage("Library scan complete.");
    } catch (c) {
      setError(String(c));
      setLibraryMessage(null);
    } finally {
      setLibraryBusy(false);
    }
  };
  const rescan = async () => {
    setLibraryBusy(true);
    setLibraryMessage(
      "Scanning all configured libraries… This can take several minutes.",
    );
    setError(null);
    try {
      await rescanLibrary();
      onChanged?.();
      await refresh();
      setLibraryMessage("Library scan complete.");
    } catch (c) {
      setError(String(c));
      setLibraryMessage(null);
    } finally {
      setLibraryBusy(false);
    }
  };
  const addUser = async () => {
    const name = newUserName.trim();
    if (!name) return;
    try {
      const previousIds = new Set(users.map((user) => user.id));
      const next = await createUser(name);
      syncUsers(next);
      const created = next.find((user) => !previousIds.has(user.id));
      if (created) {
        const avatar = await setBuiltinUserAvatar(created.id, newUserAvatar);
        setAvatars((current) => ({ ...current, [created.id]: avatar }));
      }
      setNewUserName("");
      setNewUserAvatar("onyx");
      setNewUserOpen(false);
    } catch (c) {
      setError(String(c));
    }
  };
  const saveUserName = async (user: UserProfile) => {
    const name = (nameDrafts[user.id] ?? user.name).trim();
    if (!name || name === user.name) return;
    try {
      syncUsers(await renameUser(user.id, name));
      onChanged?.();
    } catch (c) {
      setError(String(c));
      setNameDrafts((current) => ({ ...current, [user.id]: user.name }));
    }
  };
  const removeUser = async (user: UserProfile) => {
    if (user.isAdmin || !window.confirm(`Delete ${user.name}?`)) return;
    try {
      syncUsers(await deleteUser(user.id));
      await refresh();
      onChanged?.();
    } catch (c) {
      setError(String(c));
    }
  };
  const chooseUser = async (id: string) => {
    setActiveUserId(id);
    setActive(id);
    const p = await getUserPreferences();
    setTheme(p.theme);
    onChanged?.();
  };
  const chooseTheme = async (value: ThemeName) => {
    const previous = theme;
    setTheme(value);
    document.documentElement.dataset.theme = value;
    setError(null);
    try {
      const saved = await setUserTheme(value);
      if (saved.theme !== value) {
        setTheme(saved.theme);
        document.documentElement.dataset.theme = saved.theme;
      }
    } catch (c) {
      setTheme(previous);
      document.documentElement.dataset.theme = previous;
      setError(String(c));
    }
  };
  const moviePaths =
    status?.moviePaths ?? (status?.moviePath ? [status.moviePath] : []);
  const tvPaths = status?.tvPaths ?? (status?.tvPath ? [status.tvPath] : []);
  const specialPaths = status?.specialPaths ?? [];
  const activeProfile = users.find((user) => user.id === active) ?? users[0];
  const canManageFunnel = isTauriDesktop() || Boolean(activeProfile?.isAdmin);
  return (
    <div className="settings-page">
      <SettingsNavigation active={category} canManageRemote={canManageFunnel} onSelect={setCategory} />
      <section className="settings-content">
        {error && <div className="error-banner">{error}</div>}
        {category === "general" && <GeneralSettings status={status} />}
        {category === "library" && (
          <>
            <p className="eyebrow">MEDIA</p>
            <h1>Libraries</h1>
            {libraryMessage && (
              <div className="settings-card library-scan-status">
                <RefreshCw className={libraryBusy ? "spin" : ""} size={18} />
                <div>
                  <strong>
                    {libraryBusy
                      ? "Library scan in progress"
                      : "Library updated"}
                  </strong>
                  <p>{libraryMessage}</p>
                  {libraryBusy && scanProgress && (
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
              onChange={(split) => {
                setSplitContinueWatchingState(split);
                void setSplitContinueWatching(split)
                  .then(() => onChanged?.())
                  .catch((cause) => {
                    setSplitContinueWatchingState(!split);
                    setError(String(cause));
                  });
              }}
            />
            <LibraryRootCard
              kind="movie"
              paths={moviePaths}
              icon={Film}
              busy={libraryBusy}
              onAdd={(kind) => void addFolder(kind)}
              onRemove={(kind, path) => void removeFolder(kind, path)}
            />
            <LibraryRootCard
              kind="tv"
              paths={tvPaths}
              icon={Tv}
              busy={libraryBusy}
              onAdd={(kind) => void addFolder(kind)}
              onRemove={(kind, path) => void removeFolder(kind, path)}
            />
            <LibraryRootCard
              kind="special"
              paths={specialPaths}
              icon={FolderOpen}
              busy={libraryBusy}
              onAdd={(kind) => void addFolder(kind)}
              onRemove={(kind, path) => void removeFolder(kind, path)}
            />
            <p className="muted">Specials folders are scanned recursively. Onyx uses filenames as titles and does not request TMDB metadata or artwork.</p>
            <CollectionSourcesSettings onChanged={onChanged}/>
            <button disabled={libraryBusy} onClick={() => void rescan()}>
              <RefreshCw className={libraryBusy ? "spin" : ""} size={17} />
              {libraryBusy ? "Scanning libraries…" : "Rescan libraries"}
            </button>
          </>
        )}
        {category === "backup" && (
          <BackupRestoreSettings
            onRestored={refresh}
            onChanged={onChanged}
            onError={setError}
          />
        )}
        {category === "health" && (
          <LibraryHealthSettings onChanged={onChanged} />
        )}
        {category === "metadata" && (
          <MetadataSettings
            providers={providers}
            onRefresh={refresh}
            onChanged={onChanged}
            onError={setError}
          />
        )}
        {category === "users" && (
          <UsersSettings
            users={users}
            avatars={avatars}
            activeUserId={active}
            nameDrafts={nameDrafts}
            newUserOpen={newUserOpen}
            newUserName={newUserName}
            newUserAvatar={newUserAvatar}
            onNameDraftChange={(userId, name) =>
              setNameDrafts((current) => ({ ...current, [userId]: name }))
            }
            onSaveName={(user) => void saveUserName(user)}
            onChooseUser={(userId) => void chooseUser(userId)}
            onRemoveUser={(user) => void removeUser(user)}
            onAvatarChanged={(userId, avatar) => {
              setAvatars((current) => ({ ...current, [userId]: avatar }));
              onChanged?.();
            }}
            onNewUserOpenChange={setNewUserOpen}
            onNewUserNameChange={setNewUserName}
            onNewUserAvatarChange={setNewUserAvatar}
            onAddUser={() => void addUser()}
          />
        )}
        {category === "requests" && activeProfile && (
          <WishlistView user={activeProfile} />
        )}
        {category === "appearance" && (
          <AppearanceSettings
            theme={theme}
            onThemeChange={(value) => void chooseTheme(value)}
          />
        )}
        {category === "remote" && (
          <RemoteAccessSettings
            localUrl={status?.localUrl}
            accessPasswordSet={Boolean(status?.accessPasswordSet)}
            onRefresh={refresh}
            onError={setError}
          />
        )}
        {category === "music" && (
          <MusicSettings
            clientId={clientId}
            onClientIdChange={setClientId}
            onSave={() => {
              void setIbroadcastClientId(clientId)
                .then(refresh)
                .catch((cause) => setError(String(cause)));
            }}
            onConnected={() => void refresh()}
          />
        )}
        {category === "subtitles" && <SubtitleSettings />}
        {category === "live" && <LiveChannelsSettings />}
        {category === "cache" && (
          <CacheSettings
            artworkCacheBytes={status?.artworkCacheBytes ?? 0}
            onClearThumbnails={() => {
              void clearThumbnailCache().then(refresh).catch((cause) => {
                setError(String(cause));
              });
            }}
          />
        )}
        {category === "activity" && (
          <ActivityConsole
            entries={activity}
            onRefresh={() => void refreshActivity()}
            onClear={() => {
              void clearActivity().then(refreshActivity).catch((cause) => {
                setError(String(cause));
              });
            }}
          />
        )}
      </section>
    </div>
  );
}
