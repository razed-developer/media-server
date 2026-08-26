import { ArrowLeft, ListVideo, Plus } from 'lucide-react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { resolveMediaUrl } from '../api';
import type { MediaItem, Playlist } from '../types';
import { PageHero } from '../components/layout/PageHero';
import { MediaCard } from '../components/media/MediaCard';

export function PlaylistsPage({ playlists, selected, selectedItems, library, onCreate, onOpen, onBack, onPlay, onItemMenu, onPlaylistMenu }: { playlists: Playlist[]; selected: Playlist | null; selectedItems: MediaItem[]; library: MediaItem[]; onCreate: () => void; onOpen: (playlist: Playlist) => void; onBack: () => void; onPlay: (item: MediaItem) => void; onItemMenu: (event: ReactMouseEvent, item: MediaItem) => void; onPlaylistMenu: (event: ReactMouseEvent, playlist: Playlist) => void }) {
  if (selected) return <><PageHero eyebrow="PLAYLIST" title={selected.name} subtitle={`${selectedItems.length} items`} /><button className="back-button playlist-back" onClick={onBack}><ArrowLeft size={18} />All playlists</button><section className="gallery">{selectedItems.map(item => <MediaCard key={item.id} item={item} onPlay={onPlay} onMenu={onItemMenu} />)}</section></>;
  return <><PageHero eyebrow="PLAYLISTS" title="Playlists" subtitle={`${playlists.length} playlists`} /><button className="primary" onClick={onCreate}><Plus size={18} />New playlist</button><section className="playlist-grid">{playlists.map(playlist => { const first = playlist.mediaIds.map(id => library.find(item => item.id === id)).find(Boolean); return <article className="playlist-card" key={playlist.id} onClick={() => onOpen(playlist)} onContextMenu={event => onPlaylistMenu(event, playlist)}>{first?.posterUrl || first?.thumbnailUrl ? <img src={resolveMediaUrl(first.posterUrl || first.thumbnailUrl)} alt="" /> : <div className="playlist-placeholder"><ListVideo size={40} /></div>}<div><h3>{playlist.name}</h3><p>{playlist.mediaIds.length} items</p></div></article>; })}</section></>;
}
