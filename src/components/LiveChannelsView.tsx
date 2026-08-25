import { useEffect, useMemo, useRef, useState } from 'react';
import { Captions, CaptionsOff, LoaderCircle, Radio, RefreshCw, Settings2 } from 'lucide-react';
import { getActiveUserId, getLiveChannelGuide, listLiveChannels, liveChannelStreamUrl, resolveMediaUrl } from '../api';
import type { GuideChannel, LiveChannel, MediaItem } from '../types';
import { ChannelArtwork } from './ChannelArtwork';

const WINDOW_SECONDS = 3 * 60 * 60;
const HALF_HOUR = 30 * 60;
const MIN_REMAINING_GUIDE = 60 * 60;
const cacheKey=()=>`onyx-live-guide:${getActiveUserId()}`;
const clock=(timestamp:number)=>new Date(timestamp*1000).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
const placeholders=(channels:LiveChannel[]):GuideChannel[]=>channels.map(channel=>({channel,current:undefined,programs:[]}));
const reviveRows=(rows:GuideChannel[]):GuideChannel[]=>{const now=Math.floor(Date.now()/1000);return rows.map(row=>{const current=row.programs.find(program=>program.startsAt<=now&&program.endsAt>now);return current?{...row,current:{...current,offsetSeconds:Math.max(0,now-current.startsAt)}}:{...row,current:undefined}})};
const reviveCachedGuide=():GuideChannel[]=>{try{const raw=localStorage.getItem(cacheKey());return raw?reviveRows(JSON.parse(raw) as GuideChannel[]):[]}catch{return[]}};
const guideHasRoom=(rows:GuideChannel[])=>{const now=Math.floor(Date.now()/1000);return rows.length>0&&rows.every(row=>row.programs.length===0||Math.max(...row.programs.map(program=>program.endsAt))>=now+MIN_REMAINING_GUIDE)};
const openLibraryItem=(mediaId:string)=>window.dispatchEvent(new CustomEvent('onyx-open-library-item',{detail:{mediaId}}));

export function LiveChannelsView({media,onOpenSettings,projector=false,userName}:{media:MediaItem[];onOpenSettings:()=>void;projector?:boolean;userName?:string}){
  const cached=useMemo(()=>reviveCachedGuide(),[]);
  const[guide,setGuide]=useState<GuideChannel[]>(cached);
  const[tuned,setTuned]=useState<GuideChannel|null>(()=>cached.find(row=>Boolean(row.current))??null);
  const[initializing,setInitializing]=useState(cached.length===0);
  const[loadingGuide,setLoadingGuide]=useState(false);
  const[error,setError]=useState<string|null>(null);
  const[subtitlesOn,setSubtitlesOn]=useState(false);
  const[fullscreen,setFullscreen]=useState(Boolean(document.fullscreenElement));
  const videoRef=useRef<HTMLVideoElement>(null);
  const videoShellRef=useRef<HTMLDivElement>(null);
  const channelRefs=useRef(new Map<string,HTMLButtonElement>());
  const refreshBusy=useRef(false);
  const lastNetworkRefresh=useRef(0);
  const initialFocusDone=useRef(false);
  const mediaById=useMemo(()=>new Map(media.map(item=>[item.id,item])),[media]);
  const now=Math.floor(Date.now()/1000);
  const windowStart=Math.floor(now/HALF_HOUR)*HALF_HOUR;
  const windowEnd=windowStart+WINDOW_SECONDS;
  const ticks=Array.from({length:7},(_,index)=>windowStart+index*HALF_HOUR);

  const refresh=async(autoTune=false)=>{if(refreshBusy.current)return;refreshBusy.current=true;setLoadingGuide(true);try{const next=reviveRows(await getLiveChannelGuide());lastNetworkRefresh.current=Date.now();localStorage.setItem(cacheKey(),JSON.stringify(next));setGuide(next);setError(null);setTuned(current=>{if(!current&&autoTune)return next.find(row=>Boolean(row.current))??null;if(!current)return current;return next.find(row=>row.channel.id===current.channel.id)??next.find(row=>Boolean(row.current))??null})}catch(c){setError(String(c))}finally{refreshBusy.current=false;setLoadingGuide(false);setInitializing(false)}};

  useEffect(()=>{let disposed=false;let timer:number|undefined;const start=async()=>{try{if(projector){await refresh(true)}else{const channels=await listLiveChannels();if(disposed)return;const known=new Set(channels.map(channel=>channel.id));const useful=reviveRows(cached.filter(row=>known.has(row.channel.id)));const cacheMatches=useful.length===channels.length&&channels.length>0;setGuide(cacheMatches?useful:placeholders(channels));if(cacheMatches&&!tuned)setTuned(useful.find(row=>Boolean(row.current))??null);setInitializing(false);if(channels.length)await refresh(true)}timer=window.setInterval(()=>{setGuide(current=>{const revived=reviveRows(current);if(!guideHasRoom(revived)||(projector&&Date.now()-lastNetworkRefresh.current>=5*60_000))void refresh(false);return revived});setTuned(current=>current?reviveRows([current])[0]:current)},projector?30_000:60_000)}catch(c){if(!disposed){setError(String(c));setInitializing(false)}}};void start();return()=>{disposed=true;if(timer)window.clearInterval(timer)}},[]);

  useEffect(()=>{if(!projector)return;const reload=()=>void refresh(false);const visible=()=>{if(document.visibilityState==='visible')reload()};const sleepChanged=(event:Event)=>{if(!(event as CustomEvent<boolean>).detail){reload();requestAnimationFrame(()=>channelRefs.current.get(tuned?.channel.id??guide[0]?.channel.id??'')?.focus({preventScroll:true}))}};window.addEventListener('focus',reload);document.addEventListener('visibilitychange',visible);window.addEventListener('onyx-sleep-mode',sleepChanged);return()=>{window.removeEventListener('focus',reload);document.removeEventListener('visibilitychange',visible);window.removeEventListener('onyx-sleep-mode',sleepChanged)}},[projector,tuned?.channel.id,guide]);

  useEffect(()=>{if(!projector||initialFocusDone.current||!guide.length)return;initialFocusDone.current=true;requestAnimationFrame(()=>channelRefs.current.get(tuned?.channel.id??guide[0].channel.id)?.focus({preventScroll:true}))},[projector,guide,tuned?.channel.id]);

  useEffect(()=>{const changed=()=>setFullscreen(Boolean(document.fullscreenElement));document.addEventListener('fullscreenchange',changed);return()=>document.removeEventListener('fullscreenchange',changed)},[]);

  const tune=(row:GuideChannel)=>{const revived=reviveRows([row])[0];if(revived.current){setTuned(revived);setSubtitlesOn(false);return}void refresh(true)};
  const tunedMedia=tuned?.current?mediaById.get(tuned.current.mediaId):undefined;
  const stream=tuned?.current?liveChannelStreamUrl(tuned.current.mediaId,tuned.current.offsetSeconds):undefined;
  const fallbackArt=tunedMedia?.backdropUrl??tunedMedia?.thumbnailUrl??tunedMedia?.posterUrl;
  const subtitleTracks=tunedMedia?.subtitles.filter(track=>Boolean(track.url))??[];

  useEffect(()=>{
    const video=videoRef.current;if(!video)return;
    for(let index=0;index<video.textTracks.length;index++)video.textTracks[index].mode=subtitlesOn&&index===0?'showing':'disabled';
  },[subtitlesOn,tuned?.current?.mediaId]);

  const keepLive=()=>{const video=videoRef.current;if(!document.body.classList.contains('sleep-mode')&&video?.paused&&!video.ended)void video.play().catch(()=>{})};
  const toggleFullscreen=async()=>{try{if(document.fullscreenElement){await document.exitFullscreen();return}await videoShellRef.current?.requestFullscreen()}catch(c){setError(`Could not change fullscreen mode: ${String(c)}`)}};

  return <div className={`live-page ${projector?'projector-live-page':''}`}><section className="live-header"><div><p className="eyebrow">{projector&&userName?`${userName.toUpperCase()}'S LIVE CHANNELS`:'LIVE CHANNELS'}</p><h1>What’s on now</h1></div><div className="live-header-actions">{loadingGuide&&guide.length>0&&<span className="live-guide-status"><LoaderCircle className="spin" size={14}/>Updating…</span>}<button className="live-icon-button" title="Refresh guide" aria-label="Refresh guide" onClick={()=>void refresh(false)}><RefreshCw size={17}/></button>{!projector&&<button className="live-icon-button" title="Manage channels" aria-label="Manage channels" onClick={onOpenSettings}><Settings2 size={17}/></button>}</div></section>
  {error&&<div className="error-banner">{error}</div>}{tuned?.current&&<section className="live-player-card"><div className="live-player-info" style={!projector&&(tuned.channel.artUrl||fallbackArt)?{backgroundImage:`linear-gradient(90deg,rgba(5,7,10,.22),rgba(5,7,10,.92)),url(${resolveMediaUrl(tuned.channel.artUrl||fallbackArt)})`}:undefined}>{!projector&&!tuned.channel.artUrl&&tuned.channel.artIcon&&<ChannelArtwork channel={tuned.channel} className="live-player-symbol"/>}<div><span className="live-badge"><i/>LIVE</span><p>{tuned.channel.name}</p><button className="live-library-link" title="Open this title in your library" onClick={()=>openLibraryItem(tuned.current!.mediaId)}><h2>{tuned.current.title}</h2>{tuned.current.subtitle&&<span>{tuned.current.subtitle}</span>}</button></div></div><div ref={videoShellRef} className={`live-video ${fullscreen?'is-fullscreen':''}`} onClick={()=>void toggleFullscreen()} title={fullscreen?'Click to return to guide':'Click to watch fullscreen'}><video ref={videoRef} key={`${tuned.channel.id}:${tuned.current.mediaId}:${tuned.current.startsAt}`} autoPlay playsInline src={stream} onPause={keepLive} onLoadedMetadata={keepLive} onEnded={()=>{setGuide(current=>reviveRows(current));const row=guide.find(item=>item.channel.id===tuned.channel.id);if(row)setTuned(reviveRows([row])[0])}}>{subtitleTracks.map((track,index)=><track key={`${track.label}:${index}`} kind="subtitles" src={resolveMediaUrl(track.url)} srcLang={track.language||'und'} label={track.label||track.language||`Subtitle ${index+1}`}/>)}</video>{subtitleTracks.length>0&&<button className={`live-caption-toggle ${subtitlesOn?'active':''}`} title={subtitlesOn?'Turn subtitles off':'Turn subtitles on'} aria-label={subtitlesOn?'Turn subtitles off':'Turn subtitles on'} onClick={event=>{event.stopPropagation();setSubtitlesOn(value=>!value)}}>{subtitlesOn?<Captions size={20}/>:<CaptionsOff size={20}/>}</button>}<span className="live-fullscreen-hint">{fullscreen?'Press Back to return to channels':'Select video for fullscreen'}</span></div></section>}
  {projector&&guide.length>0&&<section className="projector-channel-section"><h2>Channels</h2><div className="projector-channel-grid" aria-label="Live channels">{guide.map(row=>{const currentMedia=row.current?mediaById.get(row.current.mediaId):undefined;const visual=row.channel.artUrl??(!row.channel.artIcon?(currentMedia?.backdropUrl??currentMedia?.thumbnailUrl??currentMedia?.posterUrl):undefined);return <button ref={element=>{if(element)channelRefs.current.set(row.channel.id,element);else channelRefs.current.delete(row.channel.id)}} className={`projector-channel ${tuned?.channel.id===row.channel.id?'tuned':''}`} key={row.channel.id} onClick={()=>tune(row)}>{visual?<img src={resolveMediaUrl(visual)} alt=""/>:<ChannelArtwork channel={row.channel} className="projector-channel-placeholder"/>}<span><strong>{row.channel.name}</strong><b>{row.current?.title??'Guide loading…'}</b>{row.current?.subtitle&&<small>{row.current.subtitle}</small>}</span></button>})}</div></section>}
  {initializing&&guide.length===0?<div className="live-empty"><LoaderCircle className="spin"/><span>Loading channels…</span></div>:guide.length===0?<div className="live-empty"><Radio size={34}/><h2>No channels yet</h2>{!projector&&<button className="primary" onClick={onOpenSettings}>Create a channel</button>}</div>:!projector&&<section className="guide-shell"><div className="guide-header-row"><div className="guide-channel-heading">Channels</div><div className="guide-time-head">{ticks.map(tick=><span key={tick} style={{left:`${(tick-windowStart)/WINDOW_SECONDS*100}%`}}>{clock(tick)}</span>)}<i className="guide-now-line" style={{left:`${(now-windowStart)/WINDOW_SECONDS*100}%`}}/></div></div>{guide.map(row=>{const currentMedia=row.current?mediaById.get(row.current.mediaId):undefined;const showFallback=row.channel.criteriaType==='show'&&!row.channel.artIcon?(currentMedia?.backdropUrl??currentMedia?.thumbnailUrl??currentMedia?.posterUrl):undefined;const visual=row.channel.artUrl||showFallback;return <div className={`guide-row ${tuned?.channel.id===row.channel.id?'tuned':''}`} key={row.channel.id}><button className="guide-channel" onClick={()=>tune(row)}>{visual?<img src={resolveMediaUrl(visual)} alt=""/>:<ChannelArtwork channel={row.channel} className="guide-channel-icon"/>}<div><strong>{row.channel.name}</strong></div></button><div className="guide-timeline" onClick={()=>tune(row)}>{row.programs.map(program=>{const start=Math.max(windowStart,program.startsAt),end=Math.min(windowEnd,program.endsAt);if(end<=windowStart||start>=windowEnd)return null;const left=(start-windowStart)/WINDOW_SECONDS*100,width=(end-start)/WINDOW_SECONDS*100;return <button key={`${program.mediaId}:${program.startsAt}`} className={`guide-program ${row.current?.startsAt===program.startsAt?'current':''}`} style={{left:`${left}%`,width:`${Math.max(width,.75)}%`}} onClick={event=>{event.stopPropagation();tune(row)}}><strong>{program.title}</strong><small>{program.subtitle??`${clock(program.startsAt)}–${clock(program.endsAt)}`}</small></button>})}<i className="guide-now-line" style={{left:`${(now-windowStart)/WINDOW_SECONDS*100}%`}}/></div></div>})}</section>}</div>;
}
