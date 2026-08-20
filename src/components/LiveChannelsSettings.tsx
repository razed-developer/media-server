import { useEffect, useMemo, useState } from 'react';
import { Image, Plus, Radio, Shuffle, Trash2 } from 'lucide-react';
import { chooseLiveChannelArtwork, deleteLiveChannel, listLiveChannels, listMedia, listPlaylists, saveLiveChannel, setLiveChannelArtwork } from '../api';
import type { LiveChannel, LiveChannelCriteria, LiveChannelOrder, MediaItem, Playlist } from '../types';

export function LiveChannelsSettings(){
  const[channels,setChannels]=useState<LiveChannel[]>([]);
  const[media,setMedia]=useState<MediaItem[]>([]);
  const[playlists,setPlaylists]=useState<Playlist[]>([]);
  const[name,setName]=useState('');
  const[criteriaType,setCriteriaType]=useState<LiveChannelCriteria>('show');
  const[criteriaValue,setCriteriaValue]=useState('');
  const[orderMode,setOrderMode]=useState<LiveChannelOrder>('sequential');
  const[error,setError]=useState<string|null>(null);
  const[busy,setBusy]=useState(false);

  const refresh=async()=>{
    try{
      const[c,m,p]=await Promise.all([listLiveChannels(),listMedia(),listPlaylists()]);
      setChannels(c);setMedia(m);setPlaylists(p);setError(null);
    }catch(cause){setError(String(cause))}
  };
  useEffect(()=>{void refresh()},[]);

  const shows=useMemo(()=>[...new Set(media.filter(item=>item.kind==='episode').map(item=>item.showTitle).filter((value):value is string=>Boolean(value)))].sort((a,b)=>a.localeCompare(b)),[media]);
  const genres=useMemo(()=>[...new Set(media.flatMap(item=>item.genres??[]))].sort((a,b)=>a.localeCompare(b)),[media]);
  const options=criteriaType==='show'?shows:criteriaType==='genre'?genres:playlists.map(playlist=>playlist.id);
  const optionLabel=(value:string)=>criteriaType==='playlist'?playlists.find(playlist=>playlist.id===value)?.name??value:value;

  useEffect(()=>{if(!options.includes(criteriaValue))setCriteriaValue(options[0]??'')},[criteriaType,media.length,playlists.length]);

  const create=async()=>{
    if(!name.trim()||!criteriaValue)return;
    setBusy(true);setError(null);
    try{
      setChannels(await saveLiveChannel({name:name.trim(),criteriaType,criteriaValue,orderMode}));
      setName('');
    }catch(cause){setError(String(cause))}finally{setBusy(false)}
  };

  const remove=async(channel:LiveChannel)=>{
    if(!window.confirm(`Delete channel “${channel.name}”?`))return;
    try{setChannels(await deleteLiveChannel(channel.id))}catch(cause){setError(String(cause))}
  };

  const art=async(channel:LiveChannel)=>{
    const path=await chooseLiveChannelArtwork();if(!path)return;
    try{setChannels(await setLiveChannelArtwork(channel.id,path))}catch(cause){setError(String(cause))}
  };

  return <div className="live-settings">
    <p className="eyebrow">EXPERIMENTAL MODULE</p><h1>Live TV</h1>
    <p>Build clock-driven channels from your library. A channel never pauses: leaving for twenty minutes means it is twenty minutes further through its schedule when you return.</p>
    {error&&<div className="error-banner">{error}</div>}

    <section className="settings-card live-channel-builder">
      <div className="live-builder-heading"><Radio size={22}/><div><h3>Create channel</h3><p>Channels belong to the current Onyx profile and are stored separately from the media library.</p></div></div>
      <div className="live-builder-grid">
        <label><span>Channel name</span><input value={name} onChange={event=>setName(event.target.value)} placeholder="Comedy Central"/></label>
        <label><span>Content</span><select value={criteriaType} onChange={event=>setCriteriaType(event.target.value as LiveChannelCriteria)}><option value="show">TV show</option><option value="genre">Genre</option><option value="playlist">Playlist</option></select></label>
        <label><span>{criteriaType==='show'?'Show':criteriaType==='genre'?'Genre':'Playlist'}</span><select value={criteriaValue} onChange={event=>setCriteriaValue(event.target.value)} disabled={!options.length}>{options.length?options.map(value=><option value={value} key={value}>{optionLabel(value)}</option>):<option value="">No matching content</option>}</select></label>
        <label><span>Playback order</span><select value={orderMode} onChange={event=>setOrderMode(event.target.value as LiveChannelOrder)}><option value="sequential">In order</option><option value="shuffle">Shuffled</option></select></label>
      </div>
      <button className="primary" disabled={busy||!name.trim()||!criteriaValue} onClick={()=>void create()}><Plus size={17}/>{busy?'Creating…':'Create channel'}</button>
    </section>

    <section className="live-channel-settings-list">
      {channels.map(channel=><article className="settings-card live-channel-setting" key={channel.id}>
        <div className="live-channel-setting-art">{channel.artUrl?<img src={channel.artUrl} alt=""/>:<Radio size={26}/>}</div>
        <div className="live-channel-setting-copy"><h3>{channel.name}</h3><p>{channel.criteriaType==='playlist'?playlists.find(playlist=>playlist.id===channel.criteriaValue)?.name??'Playlist':channel.criteriaValue} · {channel.orderMode==='shuffle'?'Shuffled':'In order'}</p></div>
        <button onClick={()=>void art(channel)}><Image size={16}/>Artwork</button>
        <button className="danger-text" onClick={()=>void remove(channel)}><Trash2 size={16}/>Delete</button>
      </article>)}
      {!channels.length&&<div className="settings-card live-settings-empty"><Shuffle size={24}/><div><strong>No Live Channels yet</strong><p>Create one above. The guide will appear in the main Onyx sidebar.</p></div></div>}
    </section>
  </div>;
}
