import { BarChart3, Film, FolderOpen, History, Home, ListVideo, Lock, Music2, Play, Radio, Settings, Tv } from "lucide-react";
import { useEffect, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import type { LibraryNavigationId, MediaItem } from "../../types";
import { completeLibraryOrder } from "../../preferences/navigationPreferences";
import { SleepTimer } from "../../features/sleep/components/SleepTimer";

export type NavigationSection = "home" | "movies" | "tv" | "specials" | "collection" | "live" | "music" | "history" | "playlists" | "analytics" | "settings" | "hidden";
export type SidebarCollection = { id: string; name: string; protected: boolean };
type Props = { section: NavigationSection; collections: SidebarCollection[]; libraryOrder: LibraryNavigationId[]; selectedCollectionId: string | null; pausedMedia: MediaItem | null; onNavigate: (section: NavigationSection) => void; onOpenCollection: (id: string) => void; onToggleCollectionLock: (source: SidebarCollection) => void | Promise<void>; onScanLibrary: (kind: "movie" | "tv" | "special" | `collection:${string}`, label: string) => void | Promise<void>; onClearHistory: () => void | Promise<void>; onResume: () => void };

export function Sidebar({ section, collections, libraryOrder, selectedCollectionId, pausedMedia, onNavigate, onOpenCollection, onToggleCollectionLock, onScanLibrary, onClearHistory, onResume }: Props) {
  type ActionMenu = { x: number; y: number; label: string; actions: { label: string; danger?: boolean; run: () => void | Promise<void> }[] } | null;
  const [actionMenu, setActionMenu] = useState<ActionMenu>(null);
  useEffect(() => {
    const close = () => setActionMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    return () => { window.removeEventListener("click", close); window.removeEventListener("blur", close); };
  }, []);
  const showActions = (event: ReactMouseEvent, label: string, actions: NonNullable<ActionMenu>["actions"]) => {
    event.preventDefault();
    event.stopPropagation();
    setActionMenu({ x: Math.min(event.clientX, window.innerWidth - 230), y: Math.min(event.clientY, window.innerHeight - 150), label, actions });
  };
  const runAction = async (action: NonNullable<ActionMenu>["actions"][number]) => { setActionMenu(null); await action.run(); };
  const item = (target: NavigationSection, icon: ReactNode, label: string) => <button className={section === target ? "active" : ""} onClick={() => onNavigate(target)}>{icon}{label}</button>;
  const available: LibraryNavigationId[] = ["movies", "tv", "specials", ...collections.map(source => `collection:${source.id}` as const)];
  const libraries = completeLibraryOrder(libraryOrder, available).map(id => {
    if (id === "movies") return <button key={id} className={section === "movies" ? "active" : ""} onClick={() => onNavigate("movies")} onContextMenu={event => showActions(event, "Movies", [{ label: "Scan Movies", run: () => onScanLibrary("movie", "Movies") }])} title="Right-click for Movies actions"><Film size={19}/>Movies</button>;
    if (id === "tv") return <button key={id} className={section === "tv" ? "active" : ""} onClick={() => onNavigate("tv")} onContextMenu={event => showActions(event, "TV", [{ label: "Scan TV", run: () => onScanLibrary("tv", "TV") }])} title="Right-click for TV actions"><Tv size={19}/>TV</button>;
    if (id === "specials") return <button key={id} className={section === "specials" ? "active" : ""} onClick={() => onNavigate("specials")} onContextMenu={event => showActions(event, "Specials", [{ label: "Scan Specials", run: () => onScanLibrary("special", "Specials") }])} title="Right-click for Specials actions"><FolderOpen size={19}/>Specials</button>;
    const source = collections.find(value => `collection:${value.id}` === id);
    return source ? <button key={id} className={section === "collection" && selectedCollectionId === source.id ? "active" : ""} onClick={() => onOpenCollection(source.id)} onContextMenu={event => showActions(event, source.name, [...(source.protected ? [{ label: "Lock / unlock collection", run: () => onToggleCollectionLock(source) }] : []), { label: `Scan ${source.name}`, run: () => onScanLibrary(`collection:${source.id}`, source.name) }])} title={`Right-click for ${source.name} actions`}>{source.protected ? <Lock size={19}/> : <FolderOpen size={19}/>} {source.name}</button> : null;
  });
  return <><aside className="sidebar">{item("home", <Home size={19}/>, "Home")}{libraries}{item("live", <Radio size={19}/>, "Live TV")}{item("music", <Music2 size={19}/>, "Music")}<button className={section === "history" ? "active" : ""} onClick={() => onNavigate("history")} onContextMenu={event => showActions(event, "History", [{ label: "Clear watch history", danger: true, run: onClearHistory }])} title="Right-click for History actions"><History size={19}/>History</button>{item("playlists", <ListVideo size={19}/>, "Playlists")}{item("analytics", <BarChart3 size={19}/>, "Analytics")}<div className="sidebar-spacer"/>{pausedMedia && <button className="sidebar-resume" onClick={onResume} title={`Resume ${pausedMedia.title}`}><Play size={16} fill="currentColor"/><span><small>Resume</small>{pausedMedia.kind === "episode" ? pausedMedia.showTitle ?? pausedMedia.title : pausedMedia.title}</span></button>}<SleepTimer/>{item("settings", <Settings size={19}/>, "Settings")}</aside>{actionMenu && <div className="sidebar-action-menu" style={{ left: actionMenu.x, top: actionMenu.y }} role="menu" onClick={event => event.stopPropagation()}><strong>{actionMenu.label}</strong>{actionMenu.actions.map(action => <button key={action.label} className={action.danger ? "danger-text" : ""} role="menuitem" onClick={() => void runAction(action)}>{action.label}</button>)}</div>}</>;
}
