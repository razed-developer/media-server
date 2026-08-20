import { useEffect, useMemo, useRef, useState } from 'react';
import { LoaderCircle, Radio, RefreshCw, Settings2 } from 'lucide-react';
import { getLiveChannelGuide, liveChannelStreamUrl, resolveMediaUrl } from '../api';
import type { GuideChannel, MediaItem } from '../types';

const WINDOW_SECONDS = 3 * 60 * 60;
const HALF_HOUR = 30 * 60;

const clock = (timestamp:number) => new Date(timestamp * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function LiveChannelsView({media,onOpenSettings}:{media:MediaItem[];onOpenSettings:()=>void}){
  const[guide,setGuide]=useState<GuideChannel[]>([]);
  const[tuned,setTuned]=useState<GuideChannel|null>(null);
  const[busy,setBusy]=useState(true);
  const[error,setError]=useState<string|null>(null);
  const videoRef=useRef<HTMLVideoElement>(null);
  const mediaById=useMemo(()=>new Map(media.map(item=>[item.id,item])),[media]);
  const now=Math.floor(Date.now()/1000);
  const windowStart=Math.floor(now/HALF_HOUR)*HALF_HOUR;
  const windowEnd=windowStart+WINDOW_SECONDS;
  const ticks=Array.from({length:7},(_,index)=>windowStart+index*HALF_HOUR);

  const refresh=async()=>{
    try{
      const next=await getLiveChannelGuide();
      setGuide(next);setError(null);
      setTuned(current=>{
        if(!current)return current;
        const fresh=next.find(row=>row.channel.id===current.channel.id);
        if(!fresh?.current)return fresh??null;
        if(fresh.current.mediaId!==current.current?.mediaId)return fresh;
        return current;
      });
    }catch(c){setError(String(c))}finally{setBusy(false)}
  };

  useEffect(()=>{void refresh();const timer=window.setInterval(()=>void refresh(),30_000);return()=>window.clearInterval(timer)},[]);

  const tune=async(row:GuideChannel)=>{
    setBusy(true);
    try{
      const next=await getLiveChannelGuide();
      setGuide(next);
      setTuned(next.find(value=>value.channel.id===row.channel.id)??row);
      setError(null);
    }catch(c){setError(String(c))}finally{setBusy(false)}
  };

  const tunedMedia=tuned?.current?mediaById.get(tuned.current.mediaId):undefined;
  const stream=tuned?.current?liveChannelStreamUrl(tuned.current.mediaId,tuned.current.offsetSeconds):undefined;
  const fallbackArt=tunedMedia?.backdropUrl??tunedMedia?.thumbnailUrl??tunedMedia?.posterUrl;

  return <div className="live-page">
    <section className="live-header">
      <div><p className="eyebrow">LIVE CHANNELS</p><h1>What’s on now.</h1><p>Channels keep moving even while you’re away.</p></div>
      <div className="live-header-actions"><button onClick={()=>void refresh()}><RefreshCw size={16}/>Refresh</button><button onClick={onOpenSettings}><Settings2 size={16}/>Manage channels</button></div>
    </section>

    {error&&<div className="error-banner">{error}</div>}
    {tuned?.current&&<section className="live-player-card">
      <div className="live-player-info" style={(tuned.channel.artUrl||fallbackArt)?{backgroundImage:`linear-gradient(90deg,rgba(5,7,10,.22),rgba(5,7,10,.92)),url(${resolveMediaUrl(tuned.channel.artUrl||fallbackArt)})`}:undefined}>
        <div><span className="live-badge"><i/>LIVE</span><p>{tuned.channel.name}</p><h2>{tuned.current.title}</h2><span>{tuned.current.subtitle}</span></div>
      </div>
      <div className="live-video"><video key={`${tuned.channel.id}:${tuned.current.mediaId}:${tuned.current.startsAt}`} ref={videoRef} controls autoPlay src={stream} onEnded={()=>void tune(tuned)}/></div>
    </section>}

    {busy&&guide.length===0?<div className="live-empty"><LoaderCircle className="spin"/><span>Building guide…</span></div>:guide.length===0?<div className="live-empty"><Radio size={34}/><h2>No channels yet</h2><p>Create a show, genre, or playlist channel in Settings → Live TV.</p><button className="primary" onClick={onOpenSettings}>Create a channel</button></div>:<section className="guide-shell">
      <div className="guide-header-row"><div className="guide-channel-heading">Channels</div><div className="guide-time-head">{ticks.map(tick=><span key={tick} style={{left:`${(tick-windowStart)/WINDOW_SECONDS*100}%`}}>{clock(tick)}</span>)}<i className="guide-now-line" style={{left:`${(now-windowStart)/WINDOW_SECONDS*100}%`}}/></div></div>
      {guide.map(row=>{
        const currentMedia=row.current?mediaById.get(row.current.mediaId):undefined;
        const fallback=currentMedia?.backdropUrl??currentMedia?.thumbnailUrl??currentMedia?.posterUrl;
        return <div className={`guide-row ${tuned?.channel.id===row.channel.id?'tuned':''}`} key={row.channel.id}>
          <button className="guide-channel" onClick={()=>void tune(row)}>
            {(row.channel.artUrl||fallback)?<img src={resolveMediaUrl(row.channel.artUrl||fallback)} alt=""/>:<span className="guide-channel-icon"><Radio size={22}/></span>}
            <div><strong>{row.channel.name}</strong><small>{row.channel.criteriaType}: {row.channel.criteriaValue}</small></div>
          </button>
          <div className="guide-timeline" onClick={()=>void tune(row)}>
            {row.programs.map((program,index)=>{
              const start=Math.max(windowStart,program.startsAt),end=Math.min(windowEnd,program.endsAt);
              if(end<=windowStart||start>=windowEnd)return null;
              const left=(start-windowStart)/WINDOW_SECONDS*100,width=(end-start)/WINDOW_SECONDS*100;
              return <button key={`${program.mediaId}:${program.startsAt}`} className={`guide-program ${index===0?'current':''}`} style={{left:`${left}%`,width:`${Math.max(width,.75)}%`}} onClick={event=>{event.stopPropagation();void tune(row)}}><strong>{program.title}</strong><small>{program.subtitle??`${clock(program.startsAt)}–${clock(program.endsAt)}`}</small></button>;
            })}
            <i className="guide-now-line" style={{left:`${(now-windowStart)/WINDOW_SECONDS*100}%`}}/>
          </div>
        </div>;
      })}
    </section>}
  </div>;
}
