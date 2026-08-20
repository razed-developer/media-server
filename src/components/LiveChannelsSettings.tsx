import { useEffect, useMemo, useState } from 'react';
import { Check, Image, Pencil, Plus, Radio, Shuffle, Trash2, X } from 'lucide-react';
import { chooseLiveChannelArtwork, deleteLiveChannel, isTauriDesktop, listLiveChannels, listMedia, listPlaylists, resolveMediaUrl, saveLiveChannel, setLiveChannelArtwork } from '../api';
import type { LiveChannel, LiveChannelCriteria, LiveChannelOrder, MediaItem, Playlist } from '../types';

export function LiveChannelsSettings(){
  const desktop=isTauriDesktop();
  const[channels,setChannels]=useState<LiveChannel[]>([]);
  const[media,setMedia]=useState<MediaItem[]>([]);
  const[playlists,setPlaylists]=useState<Playlist[]>([]);
  const[editingId,setEditingId]=useState<string|undefined>();
  const[name,setName]=useState('');
  const[criteriaType,setCriteriaType]=useState<LiveChannelCriteria>('show');
  const[selectedValues,setSelectedValues]=useState<string[]>([]);
  const[playlistValue,setPlaylistValue]=useState('');
  const[orderMode,setOrderMode]=useState<LiveChannelOrder>('sequential');
  const[error,setError]=useState<string|null>(null);
  const[busy,setBusy]=useState(false);
  const[criteriaBusy,setCriteriaBusy]=useState(true);

  const refresh=async()=>{
    try{
      const saved=await listLiveChannels();setChannels(saved);setError(null);
      setCriteriaBusy(true);
      const[m,p]=await Promise.all([listMedia(),listPlaylists()]);setMedia(m);setPlaylists(p);
    }catch(cause){setError(String(cause))}finally{setCriteriaBusy(false)}
  };
  useEffect(()=>{void refresh()},[]);

  const shows=useMemo(()=>[...new Set(media.filter(item=>item.kind==='episode').map(item=>item.showTitle).filter((value):value is string=>Boolean(value)))].sort((a,b)=>a.localeCompare(b)),[media]);
  const genres=useMemo(()=>[...new Set(media.flatMap(item=>item.genres??[]))].sort((a,b)=>a.localeCompare(b)),[media]);
  const multiOptions=criteriaType==='show'?shows:genres;
  const selectedCount=criteriaType==='playlist'?(playlistValue?1:0):selectedValues.length;

  useEffect(()=>{
    if(criteriaType==='playlist'){
      if(!playlists.some(playlist=>playlist.id===playlistValue))setPlaylistValue(playlists[0]?.id??'');
    }else{
      const valid=new Set(multiOptions);setSelectedValues(current=>current.filter(value=>valid.has(value)));
    }
  },[criteriaType,media.length,playlists.length]);

  const toggleValue=(value:string)=>setSelectedValues(current=>current.includes(value)?current.filter(item=>item!==value):[...current,value]);
  const resetBuilder=()=>{setEditingId(undefined);setName('');setCriteriaType('show');setSelectedValues([]);setPlaylistValue(playlists[0]?.id??'');setOrderMode('sequential')};
  const edit=(channel:LiveChannel)=>{setEditingId(channel.id);setName(channel.name);setCriteriaType(channel.criteriaType);setOrderMode(channel.orderMode);if(channel.criteriaType==='playlist'){setPlaylistValue(channel.criteriaValue);setSelectedValues([])}else setSelectedValues(channel.criteriaValues?.length?channel.criteriaValues:[channel.criteriaValue].filter(Boolean))};
  const saveChannel=async()=>{if(!name.trim()||selectedCount===0||!desktop)return;setBusy(true);setError(null);try{setChannels(await saveLiveChannel({id:editingId,name:name.trim(),criteriaType,criteriaValue:criteriaType==='playlist'?playlistValue:selectedValues[0],criteriaValues:criteriaType==='playlist'?[playlistValue]:selectedValues,orderMode}));resetBuilder()}catch(cause){setError(String(cause))}finally{setBusy(false)}};
  const remove=async(channel:LiveChannel)=>{if(!desktop||!window.confirm(`Delete channel “${channel.name}”?`))return;try{setChannels(await deleteLiveChannel(channel.id));if(editingId===channel.id)resetBuilder()}catch(cause){setError(String(cause))}};
  const art=async(channel:LiveChannel)=>{if(!desktop)return;const path=await chooseLiveChannelArtwork();if(!path)return;try{setChannels(await setLiveChannelArtwork(channel.id,path))}catch(cause){setError(String(cause))}};
  const channelSummary=(channel:LiveChannel)=>{if(channel.criteriaType==='playlist')return playlists.find(playlist=>playlist.id===channel.criteriaValue)?.name??'Playlist';const values=channel.criteriaValues?.length?channel.criteriaValues:[channel.criteriaValue].filter(Boolean);return values.length<=3?values.join(', '):`${values.slice(0,3).join(', ')} +${values.length-3} more`};

  return <div className="live-settings">
    <p className="eyebrow">LIVE TV</p><h1>Channels</h1>
    {!desktop&&<div className="settings-card"><strong>Channel administration is desktop-only.</strong></div>}
    {error&&<div className="error-banner">{error}</div>}
    {desktop&&<section className="settings-card live-channel-builder">
      <div className="live-builder-heading"><Radio size={22}/><div><h3>{editingId?'Edit channel':'Create channel'}</h3></div></div>
      <div className="live-builder-grid">
        <label><span>Channel name</span><input value={name} onChange={event=>setName(event.target.value)} placeholder="Star Wars"/></label>
        <label><span>Content</span><select value={criteriaType} onChange={event=>setCriteriaType(event.target.value as LiveChannelCriteria)}><option value="show">TV shows</option><option value="genre">Genres</option><option value="playlist">Playlist</option></select></label>
        {criteriaType==='playlist'?<label><span>Playlist</span><select value={playlistValue} onChange={event=>setPlaylistValue(event.target.value)} disabled={!playlists.length||criteriaBusy}>{criteriaBusy?<option value="">Loading choices…</option>:playlists.length?playlists.map(playlist=><option value={playlist.id} key={playlist.id}>{playlist.name}</option>):<option value="">No playlists</option>}</select></label>:<div className="live-multi-field"><span>{criteriaType==='show'?'Shows':'Genres'} <small>{selectedValues.length} selected</small></span><div className="live-multi-options">{criteriaBusy?<div className="live-multi-empty">Loading choices…</div>:multiOptions.length?multiOptions.map(value=><button type="button" key={value} className={selectedValues.includes(value)?'selected':''} onClick={()=>toggleValue(value)}>{selectedValues.includes(value)&&<Check size={14}/>}<span>{value}</span></button>):<div className="live-multi-empty">No matching content</div>}</div></div>}
        <label><span>Playback order</span><select value={orderMode} onChange={event=>setOrderMode(event.target.value as LiveChannelOrder)}><option value="sequential">In order</option><option value="shuffle">Shuffled</option></select></label>
      </div>
      {criteriaType!=='playlist'&&selectedValues.length>0&&<div className="live-selected-chips">{selectedValues.map(value=><button type="button" key={value} onClick={()=>toggleValue(value)}>{value}<X size={13}/></button>)}</div>}
      <div className="metadata-actions"><button className="primary" disabled={busy||!name.trim()||selectedCount===0} onClick={()=>void saveChannel()}>{editingId?<Pencil size={17}/>:<Plus size={17}/>} {busy?'Saving…':editingId?'Save channel':'Create channel'}</button>{editingId&&<button onClick={resetBuilder}><X size={16}/>Cancel edit</button>}</div>
    </section>}
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
