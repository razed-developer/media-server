import { useEffect, useState } from "react";
import { Save, UserRound } from "lucide-react";
import {
  clearThumbnailCache,
  createUser,
  deleteUser,
  getActiveUserId,
  getServerStatus,
  isTauriDesktop,
  getUserPreferences,
  listUsers,
  metadataProviderStatus,
  renameUser,
  setActiveUserId,
  setIbroadcastClientId,
  setUserTheme,
} from "../../api";
import {
  activityEntries as loadActivityEntries,
  clearActivity,
} from "../../adminTools";
import { listUserAvatars, setBuiltinUserAvatar, type UserAvatar } from "../../userFeaturesApi";
import type {
  ActivityEntry,
  MetadataProviderStatus,
  ServerStatus,
  ThemeName,
  ContinueWatchingLayout,
  LibraryNavigationId,
  UserProfile,
} from "../../types";
import { loadContinueWatchingLayout, loadLibraryOrder, saveContinueWatchingLayout, saveLibraryOrder } from "../../preferences/navigationPreferences";
import { LiveChannelsSettings } from "../live/components/LiveChannelsSettings";
import { LibraryHealthSettings } from "../library-health/LibraryHealthSettings";
import { SubtitleSettings } from "./SubtitleSettings";
import { WishlistView } from "./WishlistView";
import { SettingsNavigation, type SettingsCategory } from "./SettingsNavigation";
import { ActivityConsole } from "./ActivityConsole";
import { CacheSettings } from "./CacheSettings";
import { BackupRestoreSettings } from "./BackupRestoreSettings";
import { MetadataSettings } from "./MetadataSettings";
import { UsersSettings } from "./UsersSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { GeneralSettings } from "./GeneralSettings";
import { MusicSettings } from "./MusicSettings";
import { RemoteAccessSettings } from "./RemoteAccessSettings";
import { LibrarySettings } from "./LibrarySettings";
import "../../activityConsole.css";
import "../../funnelSettings.css";

export function SettingsPage({ onChanged }: { onChanged?: () => void }) {
  const [category, setCategory] = useState<SettingsCategory>("general");
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [avatars, setAvatars] = useState<Record<string, UserAvatar>>({});
  const [active, setActive] = useState(getActiveUserId());
  const [theme, setTheme] = useState<ThemeName>("onyx");
  const [continueWatchingLayout, setContinueWatchingLayoutState] = useState<ContinueWatchingLayout>("all");
  const [libraryOrder, setLibraryOrderState] = useState<LibraryNavigationId[]>([]);
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [newUserOpen, setNewUserOpen] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserAvatar, setNewUserAvatar] = useState<string>("onyx");
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [providers, setProviders] = useState<MetadataProviderStatus[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
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
      setContinueWatchingLayoutState(loadContinueWatchingLayout(getActiveUserId(), p.splitContinueWatching));
      setLibraryOrderState(loadLibraryOrder(getActiveUserId()));
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
    setContinueWatchingLayoutState(loadContinueWatchingLayout(id, p.splitContinueWatching));
    setLibraryOrderState(loadLibraryOrder(id));
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
  const activeProfile = users.find((user) => user.id === active) ?? users[0];
  const canManageFunnel = isTauriDesktop() || Boolean(activeProfile?.isAdmin);
  return (
    <div className="settings-page">
      <SettingsNavigation active={category} canManageRemote={canManageFunnel} onSelect={setCategory} />
      <section className="settings-content">
        {error && <div className="error-banner">{error}</div>}
        {category === "general" && <GeneralSettings status={status} />}
        {category === "library" && (
          <LibrarySettings
            status={status}
            continueWatchingLayout={continueWatchingLayout}
            libraryOrder={libraryOrder}
            onContinueWatchingLayoutChange={(layout) => { setContinueWatchingLayoutState(layout); saveContinueWatchingLayout(active, layout); onChanged?.(); }}
            onLibraryOrderChange={(order) => { setLibraryOrderState(order); saveLibraryOrder(active, order); onChanged?.(); }}
            onRefresh={refresh}
            onChanged={onChanged}
            onError={setError}
          />
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
