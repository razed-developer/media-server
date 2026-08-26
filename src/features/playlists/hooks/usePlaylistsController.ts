import { addToPlaylist, createPlaylist, deletePlaylist, removeFromPlaylist } from "../../../api";
import type { Playlist } from "../../../types";

type Dialog = { prompt: (options: { title: string; message: string; label: string; placeholder: string; confirmLabel: string }) => Promise<string | null> };

export function usePlaylistsController({ playlists, setPlaylists, selectedPlaylistId, setSelectedPlaylistId, dialog, showPlaylists, setError }: { playlists: Playlist[]; setPlaylists: React.Dispatch<React.SetStateAction<Playlist[]>>; selectedPlaylistId: string | null; setSelectedPlaylistId: (id: string | null) => void; dialog: Dialog; showPlaylists: () => void; setError: (message: string | null) => void }) {
  const create = async (ids: string[] = []) => {
    const name = (await dialog.prompt({ title: "New playlist", message: "Give this playlist a name.", label: "Playlist name", placeholder: "Weekend movies", confirmLabel: "Create" }))?.trim();
    if (!name) return;
    try { let updated = await createPlaylist(name); const created = updated.find(playlist => playlist.name.toLowerCase() === name.toLowerCase()); if (created) { for (const id of ids) updated = await addToPlaylist(created.id, id); setSelectedPlaylistId(created.id); } setPlaylists(updated); showPlaylists(); }
    catch (cause) { setError(String(cause)); }
  };
  const addItems = async (playlistId: string, ids: string[]) => { try { let updated = playlists; for (const id of ids) updated = await addToPlaylist(playlistId, id); setPlaylists(updated); } catch (cause) { setError(String(cause)); } };
  const removeItem = async (playlistId: string, mediaId: string) => { try { setPlaylists(await removeFromPlaylist(playlistId, mediaId)); } catch (cause) { setError(String(cause)); } };
  const remove = async (playlist: Playlist) => { if (!window.confirm(`Delete playlist “${playlist.name}”?`)) return; try { setPlaylists(await deletePlaylist(playlist.id)); if (selectedPlaylistId === playlist.id) setSelectedPlaylistId(null); } catch (cause) { setError(String(cause)); } };
  return { create, addItems, removeItem, remove };
}
