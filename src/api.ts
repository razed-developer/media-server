import { invoke } from '@tauri-apps/api/core';
import type { MediaItem, ServerStatus } from './types';

export const isTauriDesktop = () => Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

export const serverBaseUrl = () => {
  if (isTauriDesktop()) return 'http://127.0.0.1:8765';
  if (window.location.port === '1420') return `${window.location.protocol}//${window.location.hostname}:8765`;
  return '';
};

export const resolveMediaUrl = (url?: string | null) => {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return `${serverBaseUrl()}${url.startsWith('/') ? url : `/${url}`}`;
};

export async function listMedia(): Promise<MediaItem[]> {
  if (isTauriDesktop()) return invoke<MediaItem[]>('list_media');
  const response = await fetch(`${serverBaseUrl()}/api/library`);
  if (!response.ok) throw new Error(`Could not load media library (${response.status})`);
  return response.json();
}

export async function getServerStatus(): Promise<ServerStatus> {
  if (isTauriDesktop()) return invoke<ServerStatus>('server_status');
  const response = await fetch(`${serverBaseUrl()}/api/status`);
  if (!response.ok) throw new Error(`Could not reach media server (${response.status})`);
  const status = await response.json() as { running: boolean; itemCount: number; ffprobeAvailable: boolean };
  return {
    ...status,
    localUrl: serverBaseUrl() || window.location.origin,
  };
}

export async function saveProgress(id: string, seconds: number): Promise<void> {
  if (isTauriDesktop()) {
    await invoke('save_progress', { id, seconds });
    return;
  }
  const response = await fetch(`${serverBaseUrl()}/api/progress/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seconds }),
  });
  if (!response.ok) throw new Error(`Could not save playback progress (${response.status})`);
}

export async function rescanLibrary(): Promise<void> {
  if (!isTauriDesktop()) throw new Error('Library rescans are managed from the desktop server app.');
  await invoke('scan_library');
}

export async function chooseLibraryPath(): Promise<string | null> {
  if (!isTauriDesktop()) return null;
  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({ directory: true, multiple: false });
  return typeof selected === 'string' ? selected : null;
}

export async function setLibraryPath(path: string): Promise<void> {
  if (!isTauriDesktop()) throw new Error('Library folders are managed from the desktop server app.');
  await invoke('set_library_path', { path });
}
