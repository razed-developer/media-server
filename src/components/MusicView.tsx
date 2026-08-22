import { useEffect, useMemo, useRef, useState } from 'react';
import { Disc3, ListMusic, Music2, RefreshCw, Search, UserRound, X } from 'lucide-react';
import { fetchIbroadcastAudioBlob, getActiveUserId, ibroadcastStreamUrl } from '../api';
import type { IbAlbum, IbArtist, IbLibrary, IbPlaylist, IbTrack } from '../types';
import { getPreloadedMusicLibrary, preloadMusicLibrary, updatePreloadedMusicLibrary } from '../musicLibraryCache';
import { IbroadcastConnect } from './IbroadcastConnect';
import '../musicEnhancements.css';

type MusicMode='artists'|'albums'|'tracks'|'playlists';
type CoverChoice={url:string;label:string};
type CoverMenu={x:number;y:number;kind:'artist'|'playlist';id:string;title:string;choices:CoverChoice[]}|null;
const empty:IbLibrary={tracks:[],albums:[],artists:[],playlists:[]};
const duration=(seconds:number)=>`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
const coverKey=(kind:'artist'|'playlist',id:string)=>`onyx-music-cover:${getActiveUserId()}:${kind}:${id}`;

export function MusicView(){
 const initial=getPreloadedMusicLibrary();
 const[status,setStatus]=useState(initial?.status??null);
 const[library,setLibrary]=useState<IbLibrary>(initial?.library??empty);
 const[mode,setMode]=useState<MusicMode>('artists');
 const[query,setQuery]=useState('');
 const[selectedArtist,setSelectedArtist]=useState<IbArtist|null>(null);
 const[selectedArtistAlbum,setSelectedArtistAlbum]=useState<string>('all');
 const[selectedAlbum,setSelectedAlbum]=useState<IbAlbum|null>(null);
 const[selectedPlaylist,setSelectedPlaylist]=useState<IbPlaylist|null>(null);
 const[nowPlaying,setNowPlaying]=useState<IbTrack|null>(null);
 const[audioFallbackUrl,setAudioFallbackUrl]=useState<string|null>(null);
 const[fallbackBusy,setFallbackBusy]=useState(false);
 const[busy,setBusy]=useState(false);
 const[error,setError]=useState<string|null>(null);
 const[coverRevision,setCoverRevision]=useState(0);
 const[coverMenu,setCoverMenu]=useState<CoverMenu>(null);
 const audio=useRef<HTMLAudioElement>(null);
 const fallbackUrlRef=useRef<string|null>(null);

 const revokeFallback=()=>{if(fallbackUrlRef.current){URL.revokeObjectURL(fallbackUrlRef.current);fallbackUrlRef.current=null}setAudioFallbackUrl(null)};
 const load=async(force=false)=>{setBusy(true);setError(null);try{const snapshot=await preloadMusicLibrary(getActiveUserId(),force);setStatus(snapshot.status);setLibrary(snapshot.library);updatePreloadedMusicLibrary(snapshot);}catch(cause){setError(String(cause))}finally{setBusy(false)}};
 useEffect(()=>{void load();return()=>{if(fallbackUrlRef.current)URL.revokeObjectURL(fallbackUrlRef.current)}},[]);
 useEffect(()=>{if(!nowPlaying)return;const timer=window.setTimeout(()=>audio.current?.play().catch(()=>{}),0);return()=>window.clearTimeout(timer)},[nowPlaying,audioFallbackUrl]);
 useEffect(()=>{if(!coverMenu)return;const close=()=>setCoverMenu(null);window.addEventListener('click',close);window.addEventListener('blur',close);return()=>{window.removeEventListener('click',close);window.removeEventListener('blur',close)}},[coverMenu]);

 const normalized=query.trim().toLowerCase();
 const matchesTrack=(track:IbTrack)=>!normalized||`${track.title} ${track.artist} ${track.album}`.toLowerCase().includes(normalized);
 const tracks=useMemo(()=>library.tracks.filter(matchesTrack),[library,normalized]);
 const artists=useMemo(()=>library.artists.filter(a=>!normalized||a.name.toLowerCase().includes(normalized)||library.tracks.some(t=>(t.artistId===a.id||t.artist===a.name)&&matchesTrack(t))),[library,normalized]);
 const albums=useMemo(()=>library.albums.filter(a=>!normalized||`${a.name} ${a.artist}`.toLowerCase().includes(normalized)||a.trackIds.some(id=>library.tracks.find(t=>t.id===id&&matchesTrack(t)))),[library,normalized]);
 const playlists=useMemo(()=>library.playlists.filter(p=>!normalized||p.name.toLowerCase().includes(normalized)||p.trackIds.some(id=>library.tracks.find(t=>t.id===id&&matchesTrack(t)))),[library,normalized]);
 const albumTracks=(album:IbAlbum)=>album.trackIds.map(id=>library.tracks.find(t=>t.id===id)).filter((v):v is IbTrack=>Boolean(v));
 const playlistTracks=(playlist:IbPlaylist)=>playlist.trackIds.map(id=>library.tracks.find(t=>t.id===id)).filter((v):v is IbTrack=>Boolean(v));
 const artistAlbums=(artist:IbArtist)=>library.albums.filter(a=>a.artistId===artist.id||a.artist===artist.name);
 const artistTracks=(artist:IbArtist)=>library.tracks.filter(track=>track.artistId===artist.id||track.artist===artist.name);
 const candidateCovers=(trackIds:string[])=>[...new Set(trackIds.map(id=>library.tracks.find(track=>track.id===id)?.artworkUrl).filter((v):v is string=>Boolean(v)))];
 const artistCoverChoices=(artist:IbArtist):CoverChoice[]=>{
   const choices:CoverChoice[]=[];
   for(const album of artistAlbums(artist)){
     const urls=[album.artworkUrl,...candidateCovers(album.trackIds)].filter((v):v is string=>Boolean(v));
     for(const url of urls)if(!choices.some(choice=>choice.url===url))choices.push({url,label:album.name});
   }
   for(const track of artistTracks(artist))if(track.artworkUrl&&!choices.some(choice=>choice.url===track.artworkUrl))choices.push({url:track.artworkUrl,label:track.album||track.title});
   return choices;
 };
 const playlistCoverChoices=(playlist:IbPlaylist):CoverChoice[]=>playlistTracks(playlist).reduce<CoverChoice[]>((choices,track)=>{if(track.artworkUrl&&!choices.some(choice=>choice.url===track.artworkUrl))choices.push({url:track.artworkUrl,label:`${track.album||track.title} · ${track.artist}`});return choices},[]);
 const selectedCover=(kind:'artist'|'playlist',id:string,choices:CoverChoice[],provider?:string)=>{void coverRevision;const saved=localStorage.getItem(coverKey(kind,id));return (saved&&choices.some(choice=>choice.url===saved)?saved:undefined)??provider??choices[0]?.url;};
 const setCover=(kind:'artist'|'playlist',id:string,url:string)=>{localStorage.setItem(coverKey(kind,id),url);setCoverRevision(value=>value+1);setCoverMenu(null)};
 const showCoverMenu=(event:React.MouseEvent,kind:'artist'|'playlist',id:string,title:string,choices:CoverChoice[])=>{if(!choices.length)return;event.preventDefault();event.stopPropagation();setCoverMenu({x:event.clientX,y:event.clientY,kind,id,title,choices})};
 const openArtist=(artist:IbArtist)=>{setSelectedArtist(artist);setSelectedArtistAlbum('all');setSelectedAlbum(null);setSelectedPlaylist(null)};
 const openAlbum=(album:IbAlbum)=>{setSelectedAlbum(album);setSelectedArtist(null);setSelectedPlaylist(null)};
 const play=(track:IbTrack)=>{revokeFallback();setFallbackBusy(false);setError(null);setNowPlaying(track)};
 const retryPlayback=async()=>{
   if(!nowPlaying||fallbackBusy||audioFallbackUrl)return;
   setFallbackBusy(true);
   try{
     const url=await fetchIbroadcastAudioBlob(nowPlaying.id);
     fallbackUrlRef.current=url;
     setAudioFallbackUrl(url);
     setError(null);
   }catch(cause){setError(`Could not play “${nowPlaying.title}”: ${String(cause)}. Check Settings → Activity for the iBroadcast stream response.`)}finally{setFallbackBusy(false)}
 };

 if(status&&!status.connected)return <div className="music-page"><section className="onyx-hero music-hero"><p className="eyebrow">MUSIC</p><h1>iBroadcast</h1></section><IbroadcastConnect onConnected={()=>void load(true)}/>{error&&<div className="error-banner">{error}</div>}</div>;

 let content:React.ReactNode;
 if(selectedAlbum){
   content=<TrackSection title={`${selectedAlbum.artist} · ${selectedAlbum.name}`} tracks={albumTracks(selectedAlbum)} onBack={()=>setSelectedAlbum(null)} onPlay={play}/>;
 }else if(selectedPlaylist){
   content=<TrackSection title={selectedPlaylist.name} tracks={playlistTracks(selectedPlaylist)} onBack={()=>setSelectedPlaylist(null)} onPlay={play}/>;
 }else if(selectedArtist){
   const allTracks=artistTracks(selectedArtist);
   const relatedAlbums=artistAlbums(selectedArtist).filter(album=>albumTracks(album).length>0);
   const visibleTracks=selectedArtistAlbum==='all'?allTracks:allTracks.filter(track=>track.albumId===selectedArtistAlbum||relatedAlbums.find(album=>album.id===selectedArtistAlbum)?.name===track.album);
   content=<section className="artist-detail"><button className="back-button" onClick={()=>setSelectedArtist(null)}>← All artists</button><div className="artist-detail-heading"><div><p className="eyebrow">ARTIST</p><h2 className="music-section-title">{selectedArtist.name}</h2><span>{allTracks.length} tracks{relatedAlbums.length?` · ${relatedAlbums.length} albums`:''}</span></div></div>{relatedAlbums.length>0&&<div className="artist-album-filters"><button className={selectedArtistAlbum==='all'?'active':''} onClick={()=>setSelectedArtistAlbum('all')}>All tracks</button>{relatedAlbums.map(album=><button key={album.id} className={selectedArtistAlbum===album.id?'active':''} onClick={()=>setSelectedArtistAlbum(album.id)}>{album.name}</button>)}</div>}<TrackList tracks={visibleTracks} onPlay={play}/>{!visibleTracks.length&&<div className="music-empty-state">No tracks are associated with this artist.</div>}</section>;
 }else if(mode==='artists'){
   content=<div className="music-grid">{artists.map(artist=>{const choices=artistCoverChoices(artist);const artwork=selectedCover('artist',artist.id,choices,artist.artworkUrl);const count=artistTracks(artist).length;return <article className="music-tile" key={artist.id} onClick={()=>openArtist(artist)}><div className="music-cover-target" onContextMenu={event=>showCoverMenu(event,'artist',artist.id,artist.name,choices)}>{artwork?<img src={artwork} alt=""/>:<div className="music-art-placeholder"><UserRound size={42}/></div>}</div><h3>{artist.name}</h3><p>{count} tracks</p></article>})}</div>;
 }else if(mode==='albums'){
   content=<div className="music-grid">{albums.map(album=><AlbumCard key={album.id} album={album} tracks={albumTracks(album)} onOpen={openAlbum}/>)}</div>;
 }else if(mode==='playlists'){
   content=<div className="music-grid">{playlists.map(playlist=>{const choices=playlistCoverChoices(playlist);const artwork=selectedCover('playlist',playlist.id,choices,playlist.artworkUrl);return <article className="music-tile" key={playlist.id} onClick={()=>setSelectedPlaylist(playlist)}><div className="music-cover-target" onContextMenu={event=>showCoverMenu(event,'playlist',playlist.id,playlist.name,choices)}>{artwork?<img src={artwork} alt=""/>:<div className="music-art-placeholder"><ListMusic size={42}/></div>}</div><h3>{playlist.name}</h3><p>{playlist.trackIds.length} tracks</p></article>})}</div>;
 }else content=<TrackList tracks={tracks} onPlay={play}/>;

 return <div className="music-page">
   <section className="music-header"><div><p className="eyebrow">IBROADCAST</p><h1>Music</h1><p>{library.tracks.length} tracks · {library.albums.length} albums · {library.artists.length} artists</p></div><button onClick={()=>void load(true)} disabled={busy}><RefreshCw size={17}/>{busy?'Syncing…':'Sync library'}</button></section>
   <div className="music-search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search artist, album, artist + album, track, or playlist"/>{query&&<button className="music-search-clear" aria-label="Clear music search" title="Clear search" onClick={()=>setQuery('')}><X size={16}/></button>}</div>
   <div className="music-tabs"><button className={mode==='artists'?'active':''} onClick={()=>{setMode('artists');setSelectedArtist(null);setSelectedAlbum(null);setSelectedPlaylist(null)}}><UserRound size={17}/>Artists</button><button className={mode==='albums'?'active':''} onClick={()=>{setMode('albums');setSelectedArtist(null);setSelectedAlbum(null);setSelectedPlaylist(null)}}><Disc3 size={17}/>Albums</button><button className={mode==='tracks'?'active':''} onClick={()=>{setMode('tracks');setSelectedArtist(null);setSelectedAlbum(null);setSelectedPlaylist(null)}}><Music2 size={17}/>Tracks</button><button className={mode==='playlists'?'active':''} onClick={()=>{setMode('playlists');setSelectedArtist(null);setSelectedAlbum(null);setSelectedPlaylist(null)}}><ListMusic size={17}/>Playlists</button></div>
   {error&&<div className="error-banner">{error}</div>}
   {content}
   {coverMenu&&<div className="context-menu music-cover-menu" style={{left:Math.min(coverMenu.x,window.innerWidth-270),top:Math.min(coverMenu.y,window.innerHeight-360)}} onClick={event=>event.stopPropagation()}><div className="context-title">{coverMenu.title}</div><div className="context-label">Choose cover</div>{coverMenu.choices.map((choice,index)=><button key={`${choice.url}:${index}`} onClick={()=>setCover(coverMenu.kind,coverMenu.id,choice.url)}><img src={choice.url} alt=""/><span>{choice.label||`Cover ${index+1}`}</span></button>)}</div>}
   {nowPlaying&&<div className="music-player">{nowPlaying.artworkUrl&&<img src={nowPlaying.artworkUrl} alt=""/>}<div><strong>{nowPlaying.title}</strong><span>{nowPlaying.artist} · {nowPlaying.album}</span>{fallbackBusy&&<small>Retrying authenticated stream…</small>}</div><audio key={`${nowPlaying.id}:${audioFallbackUrl??'direct'}`} ref={audio} src={audioFallbackUrl??ibroadcastStreamUrl(nowPlaying.id)} controls autoPlay preload="metadata" onError={()=>void retryPlayback()}/></div>}
 </div>;
}

function AlbumCard({album,tracks,onOpen}:{album:IbAlbum;tracks:IbTrack[];onOpen:(album:IbAlbum)=>void}){const artwork=album.artworkUrl??tracks.find(track=>track.artworkUrl)?.artworkUrl;return <article className="music-tile" onClick={()=>onOpen(album)}>{artwork?<img src={artwork} alt=""/>:<div className="music-art-placeholder"><Disc3 size={42}/></div>}<h3>{album.name}</h3><p>{album.artist}{album.year?` · ${album.year}`:''}</p></article>}
function TrackSection({title,tracks,onBack,onPlay}:{title:string;tracks:IbTrack[];onBack:()=>void;onPlay:(track:IbTrack)=>void}){return <section><button className="back-button" onClick={onBack}>← Back</button><h2 className="music-section-title">{title}</h2><TrackList tracks={tracks} onPlay={onPlay}/></section>}
function TrackList({tracks,onPlay}:{tracks:IbTrack[];onPlay:(track:IbTrack)=>void}){return <div className="track-list">{tracks.map(track=><button className="track-row" key={track.id} onClick={()=>onPlay(track)}>{track.artworkUrl?<img src={track.artworkUrl} alt=""/>:<div className="track-art"><Music2 size={18}/></div>}<span className="track-title"><strong>{track.title}</strong><small>{track.artist}</small></span><span className="track-album">{track.album}</span><span className="track-duration">{duration(track.durationSeconds)}</span><Music2 size={17}/></button>)}</div>}
