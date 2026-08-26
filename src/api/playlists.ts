import { invoke } from "@tauri-apps/api/core";
import type { Playlist } from "../types";
import {
  activeUserId,
  browserFetch,
  isTauriDesktop,
  json,
  serverBaseUrl,
} from "./core";

export async function listPlaylists(): Promise<Playlist[]> {
  if (isTauriDesktop())
    return invoke<Playlist[]>("list_playlists", { userId: activeUserId });
  return json(
    await browserFetch(`${serverBaseUrl()}/api/playlists`),
    "Could not load playlists",
  );
}

export async function createPlaylist(name: string): Promise<Playlist[]> {
  if (isTauriDesktop())
    return invoke<Playlist[]>("create_playlist", {
      userId: activeUserId,
      name,
    });
  return json(
    await browserFetch(`${serverBaseUrl()}/api/playlists`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    }),
    "Could not create playlist",
  );
}

export async function addToPlaylist(
  playlistId: string,
  mediaId: string,
): Promise<Playlist[]> {
  if (isTauriDesktop())
    return invoke<Playlist[]>("add_to_playlist", {
      userId: activeUserId,
      playlistId,
      mediaId,
    });
  return json(
    await browserFetch(
      `${serverBaseUrl()}/api/playlists/${encodeURIComponent(playlistId)}/add`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mediaId }),
      },
    ),
    "Could not add to playlist",
  );
}

export async function removeFromPlaylist(
  playlistId: string,
  mediaId: string,
): Promise<Playlist[]> {
  if (isTauriDesktop())
    return invoke<Playlist[]>("remove_from_playlist", {
      userId: activeUserId,
      playlistId,
      mediaId,
    });
  return json(
    await browserFetch(
      `${serverBaseUrl()}/api/playlists/${encodeURIComponent(playlistId)}/remove`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mediaId }),
      },
    ),
    "Could not remove from playlist",
  );
}

export async function deletePlaylist(playlistId: string): Promise<Playlist[]> {
  if (isTauriDesktop())
    return invoke<Playlist[]>("delete_playlist", {
      userId: activeUserId,
      playlistId,
    });
  return json(
    await browserFetch(
      `${serverBaseUrl()}/api/playlists/${encodeURIComponent(playlistId)}/delete`,
      { method: "POST" },
    ),
    "Could not delete playlist",
  );
}
