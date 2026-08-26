import type { ContinueWatchingLayout, LibraryNavigationId } from "../types";

const layoutKey = (userId: string) => `onyx:continue-watching-layout:${userId}`;
const orderKey = (userId: string) => `onyx:library-order:${userId}`;
const layouts: ContinueWatchingLayout[] = ["all", "movies-shows", "movies-shows-split", "movies-shows-others", "movies-shows-specials", "movies-specials-shows"];

export function loadContinueWatchingLayout(userId: string, legacySplit = false): ContinueWatchingLayout {
  const saved = localStorage.getItem(layoutKey(userId)) as ContinueWatchingLayout | null;
  return saved && layouts.includes(saved) ? saved : legacySplit ? "movies-shows-split" : "all";
}

export function saveContinueWatchingLayout(userId: string, layout: ContinueWatchingLayout) {
  localStorage.setItem(layoutKey(userId), layout);
}

export function loadLibraryOrder(userId: string): LibraryNavigationId[] {
  try {
    const value = JSON.parse(localStorage.getItem(orderKey(userId)) ?? "[]");
    return Array.isArray(value) ? value.filter((entry): entry is LibraryNavigationId => typeof entry === "string") : [];
  } catch { return []; }
}

export function saveLibraryOrder(userId: string, order: LibraryNavigationId[]) {
  localStorage.setItem(orderKey(userId), JSON.stringify(order));
}

export function completeLibraryOrder(saved: LibraryNavigationId[], available: LibraryNavigationId[]) {
  return [...saved.filter(id => available.includes(id)), ...available.filter(id => !saved.includes(id))];
}
