import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Check, Image, Pencil, Plus, Radio, Shuffle, Trash2, X } from 'lucide-react';
import { chooseLiveChannelArtwork, deleteLiveChannel, getActiveUserId, isTauriDesktop, listLiveChannels, listMedia, listPlaylists, resolveMediaUrl, saveLiveChannel, setLiveChannelArtwork } from '../api';
import type { LiveChannel, LiveChannelCriteria, LiveChannelGenreScope, LiveChannelOrder, MediaItem, Playlist } from '../types';

type ShowChoice={title:string;posterUrl?:string;episodeCount:number};
type WarmCriteria={shows:string[];genres:string[];playlists:Playlist[]};
const readWarmCriteria=():WarmCriteria|undefined=>{try{const raw=sessionStorage.getItem(`onyx-live-criteria:${getActiveUserId()}`);return raw?JSON.parse(raw) as WarmCriteria:undefined}catch{return undefined}};
const readShowChoices=():ShowChoice[]=>{try{const raw=sessionStorage.getItem(`onyx-live-shows:${getActiveUserId()}`);return raw?JSON.parse(raw) as ShowChoice[]:[]}catch{return[]}};

export function LiveChannelsSettings(){
  const desktop=isTauriDesktop();
  const warm=useMemo(()=>readWarmCriteria(),[]);
  const[channels,setChannels]=useState<LiveChannel[]>([]);
  const[media,setMedia]=useState<MediaItem[]>([]);
  const[showChoices,setShowChoices]=useState<ShowChoice[]>(()=>readShowChoices());
  const[showQuery,setShowQuery]=useState('');
  const[showPickerOpen,setShowPickerOpen]=useState(false);
  const[playlists,setPlaylists]=useState<Playlist[]>(warm?.playlists??[]);
  const[editingId,setEditingId]=useState<string|undefined>();
  const[name,setName]=useState('');
  const[criteriaType,setCriteriaType]=useState<LiveChannelCriteria>('show');
  const[selectedValues,setSelectedValues]=useState<string[]>([]);
  const[playlistValue,setPlaylistValue]=useState('');
  const[orderMode,setOrderMode]=useState<LiveChannelOrder>('sequential');
  const[genreScope,setGenreScope]=useState<LiveChannelGenreScope>('both');
  const[error,setError]=useState<string|null>(null);
  const[busy,setBusy]=useState(false);
  const[criteriaBusy,setCriteriaBusy]=useState(!warm);

  const refresh=async()=>{
    const started=performance.now();try{
      const[saved,p]=await Promise.all([listLiveChannels(),listPlaylists()]);setChannels(saved);setPlaylists(p);setError(null);
      if(!warm)setCriteriaBusy(true);
      if(!warm){const m=await listMedia();setMedia(m);if(showChoices.length===0){const map=new Map<string,ShowChoice>();for(const item of m){if(item.kind!=='episode'||!item.showTitle)continue;const current=map.get(item.showTitle);map.set(item.showTitle,{title:item.showTitle,posterUrl:current?.posterUrl??item.posterUrl??item.thumbnailUrl,episodeCount:(current?.episodeCount??0)+1})}setShowChoices([...map.values()].sort((a,b)=>a.title.localeCompare(b.title)))}}
    }catch(cause){setError(String(cause))}finally{setCriteriaBusy(false);const elapsed=Math.round(performance.now()-started);if(desktop)void invoke('record_client_activity',{level:elapsed>500?'warning':'info',category:'Performance',message:`Live Channel editor loaded in ${elapsed} ms (${warm?'cached criteria':'full library fallback'})`}).catch(()=>{})}
  };
  useEffect(()=>{void refresh()},[]);

  const shows=useMemo(()=>showChoices.length?showChoices.map(show=>show.title):media.length?[...new Set(media.filter(item=>item.kind==='episode').map(item=>item.showTitle).filter((value):value is string=>Boolean(value)))].sort((a,b)=>a.localeCompare(b)):(warm?.shows??[]),[media,warm,showChoices]);
  const genreMedia=useMemo(()=>media.filter(item=>genreScope==='both'?item.kind==='movie'||item.kind==='episode':genreScope==='movies'?item.kind==='movie':item.kind==='episode'),[media,genreScope]);
  const genres=useMemo(()=>genreMedia.length?[...new Set(genreMedia.flatMap(item=>item.genres??[]))].sort((a,b)=>a.localeCompare(b)):(warm?.genres??[]),[genreMedia,warm]);
  const multiOptions=criteriaType==='show'?shows:genres;
  const visibleShowChoices=useMemo(()=>showChoices.filter(show=>!showQuery.trim()||show.title.toLowerCase().includes(showQuery.trim().toLowerCase())),[showChoices,showQuery]);
  const selectedCount=criteriaType==='playlist'?(playlistValue?1:0):selectedValues.length;

  useEffect(()=>{
    if(criteriaType==='playlist'){
      if(!playlists.some(playlist=>playlist.id===playlistValue))setPlaylistValue(playlists[0]?.id??'');
    }else{
      const valid=new Set(multiOptions);setSelectedValues(current=>current.filter(value=>valid.has(value)));
    }
  },[criteriaType,media.length,playlists.length,multiOptions]);

  const toggleValue=(value:string)=>setSelectedValues(current=>current.includes(value)?current.filter(item=>item!==value):[...current,value]);
  const resetBuilder=()=>{setEditingId(undefined);setName('');setCriteriaType('show');setSelectedValues([]);setPlaylistValue(playlists[0]?.id??'');setOrderMode('sequential');setGenreScope('both')};
  const edit=(channel:LiveChannel)=>{setEditingId(channel.id);setName(channel.name);setCriteriaType(channel.criteriaType);setGenreScope(channel.genreScope??'both');setOrderMode(channel.orderMode);if(channel.criteriaType==='playlist'){setPlaylistValue(channel.criteriaValue);setSelectedValues([])}else setSelectedValues(channel.criteriaValues?.length?channel.criteriaValues:[channel.criteriaValue].filter(Boolean))};
  const saveChannel=async()=>{if(!name.trim()||selectedCount===0||!desktop)return;setBusy(true);setError(null);try{setChannels(await saveLiveChannel({id:editingId,name:name.trim(),criteriaType,criteriaValue:criteriaType==='playlist'?playlistValue:selectedValues[0],criteriaValues:criteriaType==='playlist'?[playlistValue]:selectedValues,genreScope,orderMode}));localStorage.removeItem(`onyx-live-guide:${getActiveUserId()}`);resetBuilder()}catch(cause){setError(String(cause))}finally{setBusy(false)}};
  const remove=async(channel:LiveChannel)=>{if(!desktop||!window.confirm(`Delete channel “${channel.name}”?`))return;try{setChannels(await deleteLiveChannel(channel.id));if(editingId===channel.id)resetBuilder()}catch(cause){setError(String(cause))}};
  const art=async(channel:LiveChannel)=>{if(!desktop)return;const path=await chooseLiveChannelArtwork();if(!path)return;try{setChannels(await setLiveChannelArtwork(channel.id,path))}catch(cause){setError(String(cause))}};
  const channelSummary=(channel:LiveChannel)=>{if(channel.criteriaType==='playlist')return playlists.find(playlist=>playlist.id===channel.criteriaValue)?.name??'Playlist';const values=channel.criteriaValues?.length?channel.criteriaValues:[channel.criteriaValue].filter(Boolean);const summary=values.length<=3?values.join(', '):`${values.slice(0,3).join(', ')} +${values.length-3} more`;if(channel.criteriaType!=='genre')return summary;const scope=channel.genreScope==='movies'?'Movies':channel.genreScope==='shows'?'Shows':'Movies & shows';return `${scope} · ${summary}`};

  return <div className="live-settings">
    <p className="eyebrow">LIVE TV</p><h1>Channels</h1>
    {!desktop&&<div className="settings-card"><strong>Channel administration is desktop-only.</strong></div>}
    {error&&<div className="error-banner">{error}</div>}
    {desktop&&<section className="settings-card live-channel-builder">
      <div className="live-builder-heading"><Radio size={22}/><div><h3>{editingId?'Edit channel':'Create channel'}</h3></div></div>
      <div className="live-builder-grid">
        <label><span>Channel name</span><input value={name} onChange={event=>setName(event.target.value)} placeholder="Star Wars"/></label>
        <label><span>Content</span><select value={criteriaType} onChange={event=>setCriteriaType(event.target.value as LiveChannelCriteria)}><option value="show">TV shows</option><option value="genre">Genres</option><option value="playlist">Playlist</option></select></label>
        {criteriaType==='playlist'?<label><span>Playlist</span><select value={playlistValue} onChange={event=>setPlaylistValue(event.target.value)} disabled={!playlists.length||criteriaBusy}>{criteriaBusy?<option value="">Loading choices…</option>:playlists.length?playlists.map(playlist=><option value={playlist.id} key={playlist.id}>{playlist.name}</option>):<option value="">No playlists</option>}</select></label>:criteriaType==='show'?<div className="live-show-picker-launch"><span>TV shows <small>{selectedValues.length} selected</small></span><button type="button" onClick={()=>setShowPickerOpen(true)}>Choose shows</button></div>:<div className="live-genre-picker"><label><span>Include</span><select value={genreScope} onChange={event=>setGenreScope(event.target.value as LiveChannelGenreScope)}><option value="both">Movies and shows</option><option value="movies">Movies only</option><option value="shows">Shows only</option></select></label><div className="live-multi-field"><span>Genres <small>{selectedValues.length} selected</small></span><div className="live-multi-options">{criteriaBusy&&multiOptions.length===0?<div className="live-multi-empty">Loading choices…</div>:multiOptions.length?multiOptions.map(value=><button type="button" key={value} className={selectedValues.includes(value)?'selected':''} onClick={()=>toggleValue(value)}>{selectedValues.includes(value)&&<Check size={14}/>}<span>{value}</span></button>):<div className="live-multi-empty">No matching content with metadata</div>}</div></div></div>}
        <label><span>Playback order</span><select value={orderMode} onChange={event=>setOrderMode(event.target.value as LiveChannelOrder)}><option value="sequential">In order</option><option value="shuffle">Shuffled</option></select></label>
      </div>
      {criteriaType!=='playlist'&&selectedValues.length>0&&<div className="live-selected-chips">{selectedValues.map(value=><button type="button" key={value} onClick={()=>toggleValue(value)}>{value}<X size={13}/></button>)}</div>}
      <div className="metadata-actions"><button className="primary" disabled={busy||!name.trim()||selectedCount===0} onClick={()=>void saveChannel()}>{editingId?<Pencil size={17}/>:<Plus size={17}/>} {busy?'Saving…':editingId?'Save channel':'Create channel'}</button>{editingId&&<button onClick={resetBuilder}><X size={16}/>Cancel edit</button>}</div>
    </section>}
    {showPickerOpen&&<div className="live-show-picker-modal" role="dialog" aria-modal="true" aria-label="Choose TV shows"><header><div><p className="eyebrow">CHANNEL CONTENT</p><h2>Choose TV shows</h2><span>{selectedValues.length} selected</span></div><input autoFocus value={showQuery} onChange={event=>setShowQuery(event.target.value)} placeholder="Search shows"/><button type="button" onClick={()=>setShowPickerOpen(false)}><X size={20}/>Done</button></header><div className="live-show-modal-grid">{visibleShowChoices.map(show=><button type="button" key={show.title} className={selectedValues.includes(show.title)?'selected':''} onClick={()=>toggleValue(show.title)}>{show.posterUrl?<img src={resolveMediaUrl(show.posterUrl)} alt=""/>:<span className="live-show-placeholder">{show.title.charAt(0)}</span>}<span className="live-show-check">{selectedValues.includes(show.title)&&<Check size={18}/>}</span><strong>{show.title}</strong><small>{show.episodeCount} episodes</small></button>)}</div></div>}
    <section className="live-channel-settings-list">
      {channels.map(channel=><article className="settings-card live-channel-setting" key={channel.id}>
        <div className="live-channel-setting-art">{channel.artUrl?<img src={resolveMediaUrl(channel.artUrl)} alt=""/>:<Radio size={26}/>}</div>
        <div className="live-channel-setting-copy"><h3>{channel.name}</h3><p>{channelSummary(channel)} · {channel.orderMode==='shuffle'?'Shuffled':'In order'}</p></div>
        {desktop&&<><button onClick={()=>edit(channel)}><Pencil size={16}/>Edit</button><button onClick={()=>void art(channel)} title="Recommended: 16:9 landscape, 1280×720 or larger. PNG, JPG/JPEG, or WebP."><Image size={16}/>Artwork</button><button className="danger-text" onClick={()=>void remove(channel)}><Trash2 size={16}/>Delete</button></>}
      </article>)}
      {!channels.length&&<div className="settings-card live-settings-empty"><Shuffle size={24}/><div><strong>No Live Channels yet</strong></div></div>}
    </section>
    {desktop&&<p className="muted">Channel artwork: use a 16:9 landscape image, ideally 1280×720 or 1920×1080. PNG, JPG/JPEG, and WebP are supported.</p>}
  </div>;
}
