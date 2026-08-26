import { useState } from "react";
import type { FormEvent } from "react";
import { listMedia, login, logout, setActiveUserId } from "../../../api";
import { preloadMusicLibrary } from "../../../musicLibraryCache";
import type { MediaItem, Playlist, UserProfile } from "../../../types";
import { profileSlug } from "../../../utils/routes";

export function useProfileController({ isDesktop, activeUserId, users, refresh, loadUsers, clearCollectionSessions, setActiveUserState, setItems, setHiddenItems, setPlaylists, setAuthenticated, resetUi, openHiddenSection, setError }: { isDesktop: boolean; activeUserId: string; users: UserProfile[]; refresh: () => Promise<void>; loadUsers: () => Promise<string>; clearCollectionSessions: () => void; setActiveUserState: (id: string) => void; setItems: React.Dispatch<React.SetStateAction<MediaItem[]>>; setHiddenItems: React.Dispatch<React.SetStateAction<MediaItem[]>>; setPlaylists: React.Dispatch<React.SetStateAction<Playlist[]>>; setAuthenticated: (value: boolean) => void; resetUi: () => void; openHiddenSection: () => void; setError: (message: string | null) => void }) {
  const [profileMenu, setProfileMenu] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const switchUser = async (id: string) => {
    if (id === activeUserId) { setProfileMenu(false); return; }
    const name = users.find(user => user.id === id)?.name ?? "profile";
    window.dispatchEvent(new CustomEvent("onyx-profile-loading", { detail: { name } }));
    clearCollectionSessions();
    setActiveUserId(id);
    setActiveUserState(id);
    setProfileMenu(false);
    resetUi();
    if (!isDesktop) window.history.replaceState(null, "", `/${profileSlug(name)}`);
    try { await Promise.all([refresh(), preloadMusicLibrary(id)]); }
    catch (cause) { setError(String(cause)); }
    finally { window.dispatchEvent(new Event("onyx-profile-ready")); }
  };
  const openHidden = async () => {
    try { const [visible, all] = await Promise.all([listMedia(false), listMedia(true)]); const visibleIds = new Set(visible.map(item => item.id)); setHiddenItems(all.filter(item => !visibleIds.has(item.id))); setProfileMenu(false); openHiddenSection(); }
    catch (cause) { setError(String(cause)); }
  };
  const submitLogin = async (event: FormEvent) => {
    event.preventDefault(); setLoginBusy(true); setError(null);
    try { await login(loginPassword); setAuthenticated(true); setLoginPassword(""); await loadUsers(); await refresh(); }
    catch (cause) { setError(String(cause)); }
    finally { setLoginBusy(false); }
  };
  const signOut = async () => { clearCollectionSessions(); await logout(); setAuthenticated(false); setItems([]); setPlaylists([]); };
  return { profileMenu, setProfileMenu, loginPassword, setLoginPassword, loginBusy, switchUser, openHidden, submitLogin, signOut };
}
