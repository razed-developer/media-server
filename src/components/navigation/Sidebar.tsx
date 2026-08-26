import { BarChart3, Film, FolderOpen, History, Home, ListVideo, Lock, Music2, Play, Radio, Settings, Tv } from "lucide-react";
import type { ReactNode } from "react";
import type { LibraryNavigationId, MediaItem } from "../../types";
import { completeLibraryOrder } from "../../preferences/navigationPreferences";
import { SleepTimer } from "../SleepTimer";

export type NavigationSection = "home" | "movies" | "tv" | "specials" | "collection" | "live" | "music" | "history" | "playlists" | "analytics" | "settings" | "hidden";
export type SidebarCollection = { id: string; name: string; protected: boolean };
type Props = { section: NavigationSection; collections: SidebarCollection[]; libraryOrder: LibraryNavigationId[]; selectedCollectionId: string | null; pausedMedia: MediaItem | null; onNavigate: (section: NavigationSection) => void; onOpenCollection: (id: string) => void; onToggleCollectionLock: (source: SidebarCollection) => void | Promise<void>; onScanLibrary: (kind: "movie" | "tv" | "special" | `collection:${string}`, label: string) => void | Promise<void>; onClearHistory: () => void | Promise<void>; onResume: () => void };

export function Sidebar({ section, collections, libraryOrder, selectedCollectionId, pausedMedia, onNavigate, onOpenCollection, onToggleCollectionLock, onScanLibrary, onClearHistory, onResume }: Props) {
  const item = (target: NavigationSection, icon: ReactNode, label: string) => <button className={section === target ? "active" : ""} onClick={() => onNavigate(target)}>{icon}{label}</button>;
  const available: LibraryNavigationId[] = ["movies", "tv", "specials", ...collections.map(source => `collection:${source.id}` as const)];
  const libraries = completeLibraryOrder(libraryOrder, available).map(id => {
    if (id === "movies") return <button key={id} className={section === "movies" ? "active" : ""} onClick={() => onNavigate("movies")} onContextMenu={event => { event.preventDefault(); void onScanLibrary("movie", "Movies"); }} title="Right-click to scan Movies"><Film size={19}/>Movies</button>;
    if (id === "tv") return <button key={id} className={section === "tv" ? "active" : ""} onClick={() => onNavigate("tv")} onContextMenu={event => { event.preventDefault(); void onScanLibrary("tv", "TV"); }} title="Right-click to scan TV"><Tv size={19}/>TV</button>;
    if (id === "specials") return <button key={id} className={section === "specials" ? "active" : ""} onClick={() => onNavigate("specials")} onContextMenu={event => { event.preventDefault(); void onScanLibrary("special", "Specials"); }} title="Right-click to scan Specials"><FolderOpen size={19}/>Specials</button>;
    const source = collections.find(value => `collection:${value.id}` === id);
    return source ? <button key={id} className={section === "collection" && selectedCollectionId === source.id ? "active" : ""} onClick={() => onOpenCollection(source.id)} onContextMenu={event => { event.preventDefault(); if (event.shiftKey) void onScanLibrary(`collection:${source.id}`, source.name); else void onToggleCollectionLock(source); }} title={source.protected ? "Right-click: lock/unlock · Shift+right-click: scan" : "Shift+right-click to scan"}>{source.protected ? <Lock size={19}/> : <FolderOpen size={19}/>} {source.name}</button> : null;
  });
  return <aside className="sidebar">{item("home", <Home size={19}/>, "Home")}{libraries}{item("live", <Radio size={19}/>, "Live TV")}{item("music", <Music2 size={19}/>, "Music")}<button className={section === "history" ? "active" : ""} onClick={() => onNavigate("history")} onContextMenu={event => { event.preventDefault(); void onClearHistory(); }} title="Right-click to clear history"><History size={19}/>History</button>{item("playlists", <ListVideo size={19}/>, "Playlists")}{item("analytics", <BarChart3 size={19}/>, "Analytics")}<div className="sidebar-spacer"/>{pausedMedia && <button className="sidebar-resume" onClick={onResume} title={`Resume ${pausedMedia.title}`}><Play size={16} fill="currentColor"/><span><small>Resume</small>{pausedMedia.kind === "episode" ? pausedMedia.showTitle ?? pausedMedia.title : pausedMedia.title}</span></button>}<SleepTimer/>{item("settings", <Settings size={19}/>, "Settings")}</aside>;
}
