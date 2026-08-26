import { useEffect, useState } from "react";
import {
  chooseLibraryPath,
  completeSetup,
  createUser,
  getSetupStatus,
  isTauriDesktop,
  renameUser,
  rescanLibrary,
  setActiveUserId,
  setIbroadcastClientId,
  setUserTheme,
} from "../api";
import { configureLibraryRoot } from "../libraryRootsApi";
import type { SetupStatus, ThemeName, UserProfile } from "../types";
import { SetupAppearanceStep } from "../features/setup/SetupAppearanceStep";
import {
  SetupFinishStep,
  SetupWelcomeStep,
} from "../features/setup/SetupBoundarySteps";
import { SetupLibraryStep } from "../features/setup/SetupLibraryStep";
import { SetupMusicStep } from "../features/setup/SetupMusicStep";
import { SetupNavigation } from "../features/setup/SetupNavigation";
import { SetupUsersStep } from "../features/setup/SetupUsersStep";
import { SetupRestore } from "./SetupRestore";

type SetupLibraryKind = "movie" | "tv";

export function SetupGate({ children }: { children: React.ReactNode }) {
  const desktop = isTauriDesktop();
  const [status, setStatus] = useState<SetupStatus | null>(
    desktop ? null : { complete: true, users: [] },
  );
  const [step, setStep] = useState(0);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState("owner");
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [newUserOpen, setNewUserOpen] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [libraryMessage, setLibraryMessage] = useState<string | null>(null);
  const [restoreMode, setRestoreMode] = useState(false);

  const syncUsers = (next: UserProfile[]) => {
    setUsers(next);
    setNameDrafts(Object.fromEntries(next.map((user) => [user.id, user.name])));
  };

  useEffect(() => {
    if (!desktop) return;
    getSetupStatus()
      .then((value) => {
        setStatus(value);
        syncUsers(value.users);
        setClientId(value.ibroadcastClientId ?? "");
      })
      .catch((cause) => setError(String(cause)));
  }, [desktop]);

  if (!desktop || status?.complete) return <>{children}</>;
  if (!status)
    return (
      <div className="setup-shell">
        <div className="setup-card">
          <div className="brand-mark">O</div>
          <h1>Onyx</h1>
          <p>Preparing first-run setup…</p>
        </div>
      </div>
    );
  if (restoreMode)
    return (
      <SetupRestore
        onCancel={() => setRestoreMode(false)}
        onRestored={() => window.location.reload()}
      />
    );

  const refreshStatus = async () => setStatus(await getSetupStatus());

  const addUser = async () => {
    const name = newUserName.trim();
    if (!name) return;
    try {
      syncUsers(await createUser(name));
      setNewUserName("");
      setNewUserOpen(false);
    } catch (cause) {
      setError(String(cause));
    }
  };

  const saveName = async (user: UserProfile) => {
    const name = (nameDrafts[user.id] ?? user.name).trim();
    if (!name || name === user.name) return;
    try {
      syncUsers(await renameUser(user.id, name));
    } catch (cause) {
      setError(String(cause));
      setNameDrafts((current) => ({ ...current, [user.id]: user.name }));
    }
  };

  const addFolder = async (kind: SetupLibraryKind) => {
    const path = await chooseLibraryPath();
    if (!path) return;
    setStatus((current) => {
      if (!current) return current;
      if (kind === "movie") {
        const paths =
          current.moviePaths ?? (current.moviePath ? [current.moviePath] : []);
        return { ...current, moviePaths: [...new Set([...paths, path])] };
      }
      const paths = current.tvPaths ?? (current.tvPath ? [current.tvPath] : []);
      return { ...current, tvPaths: [...new Set([...paths, path])] };
    });
    setError(null);
    try {
      await configureLibraryRoot(kind, path, true);
      await refreshStatus();
      setLibraryMessage(
        "Folder added. Click “Scan selected folders” when you are ready.",
      );
    } catch (cause) {
      setError(String(cause));
      setLibraryMessage(null);
      await refreshStatus().catch(() => undefined);
    }
  };

  const removeFolder = async (kind: SetupLibraryKind, path: string) => {
    setError(null);
    try {
      await configureLibraryRoot(kind, path, false);
      await refreshStatus();
      setLibraryMessage(
        "Folder removed. Click “Scan selected folders” when you are ready.",
      );
    } catch (cause) {
      setError(String(cause));
      setLibraryMessage(null);
      await refreshStatus().catch(() => undefined);
    }
  };

  const scanFolders = async () => {
    setLibraryBusy(true);
    setLibraryMessage(
      "Scanning selected movie and TV folders… Large libraries can take several minutes.",
    );
    setError(null);
    try {
      await rescanLibrary();
      setLibraryMessage("Library scan complete.");
    } catch (cause) {
      setError(String(cause));
      setLibraryMessage(null);
    } finally {
      setLibraryBusy(false);
    }
  };

  const chooseTheme = async (value: ThemeName) => {
    const previous = document.documentElement.dataset.theme as
      | ThemeName
      | undefined;
    setActiveUserId(selectedUser);
    document.documentElement.dataset.theme = value;
    try {
      await setUserTheme(value);
      setError(null);
    } catch (cause) {
      document.documentElement.dataset.theme = previous ?? "onyx";
      setError(String(cause));
    }
  };

  const chooseUser = (userId: string) => {
    setSelectedUser(userId);
    setActiveUserId(userId);
  };

  const finish = async () => {
    try {
      await setIbroadcastClientId(clientId);
      await completeSetup();
      setStatus({ ...status, complete: true });
      window.location.reload();
    } catch (cause) {
      setError(String(cause));
    }
  };

  const moviePaths =
    status.moviePaths ?? (status.moviePath ? [status.moviePath] : []);
  const tvPaths = status.tvPaths ?? (status.tvPath ? [status.tvPath] : []);

  return (
    <div className="setup-shell">
      <div className="setup-layout">
        <SetupNavigation activeStep={step} onSelect={setStep} />
        <main className="setup-content">
          {error && <div className="error-banner">{error}</div>}
          {step === 0 && (
            <SetupWelcomeStep
              onFreshInstall={() => setStep(1)}
              onRestore={() => setRestoreMode(true)}
            />
          )}
          {step === 1 && (
            <SetupUsersStep
              users={users}
              nameDrafts={nameDrafts}
              newUserOpen={newUserOpen}
              newUserName={newUserName}
              onNameDraftChange={(userId, name) =>
                setNameDrafts((current) => ({ ...current, [userId]: name }))
              }
              onSaveName={(user) => void saveName(user)}
              onNewUserOpenChange={setNewUserOpen}
              onNewUserNameChange={setNewUserName}
              onAddUser={() => void addUser()}
              onBack={() => setStep(0)}
              onContinue={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <SetupAppearanceStep
              users={users}
              selectedUser={selectedUser}
              onUserChange={chooseUser}
              onThemeChange={(theme) => void chooseTheme(theme)}
              onBack={() => setStep(1)}
              onContinue={() => setStep(3)}
            />
          )}
          {step === 3 && (
            <SetupLibraryStep
              moviePaths={moviePaths}
              tvPaths={tvPaths}
              busy={libraryBusy}
              message={libraryMessage}
              onAddFolder={(kind) => void addFolder(kind)}
              onRemoveFolder={(kind, path) => void removeFolder(kind, path)}
              onScan={() => void scanFolders()}
              onBack={() => setStep(2)}
              onContinue={() => setStep(4)}
            />
          )}
          {step === 4 && (
            <SetupMusicStep
              users={users}
              selectedUser={selectedUser}
              clientId={clientId}
              onUserChange={chooseUser}
              onClientIdChange={setClientId}
              onSaveClient={() => void setIbroadcastClientId(clientId)}
              onBack={() => setStep(3)}
              onContinue={() => setStep(5)}
            />
          )}
          {step === 5 && (
            <SetupFinishStep
              onBack={() => setStep(4)}
              onFinish={() => void finish()}
            />
          )}
        </main>
      </div>
    </div>
  );
}
