import { useEffect, useMemo, useState } from 'react';
import { LoaderCircle, Radio, RefreshCw, Settings2 } from 'lucide-react';
import { getActiveUserId, getLiveChannelGuide, listLiveChannels, liveChannelStreamUrl, resolveMediaUrl } from '../api';
import type { GuideChannel, LiveChannel, MediaItem } from '../types';

const WINDOW_SECONDS = 3 * 60 * 60;
const HALF_HOUR = 30 * 60;
const cacheKey=()=>`onyx-live-guide:${getActiveUserId()}`;

const clock = (timestamp:number) => new Date(timestamp * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const placeholders = (channels:LiveChannel[]):GuideChannel[] => channels.map(channel=>({channel,current:undefined,programs:[]}));
const reviveCachedGuide=():GuideChannel[]=>{
  try{
    const raw=localStorage.getItem(cacheKey());if(!raw)return[];
    const rows=JSON.parse(raw) as GuideChannel[];const now=Math.floor(Date.now()/1000);
    return rows.map(row=>{
      const current=row.programs.find(program=>program.startsAt<=now&&program.endsAt>now);
      return current?{...row,current:{...current,offsetSeconds:Math.max(0,now-current.startsAt)}}:{...row,current:undefined};
    });
  }catch{return[]}
};

export function LiveChannelsView({media,onOpenSettings}:{media:MediaItem[];onOpenSettings:()=>void}){
  const cached=useMemo(()=>reviveCachedGuide(),[]);
  const[guide,setGuide]=useState<GuideChannel[]>(cached);
  const[tuned,setTuned]=useState<GuideChannel|null>(()=>cached.find(row=>Boolean(row.current))??null);
  const[initializing,setInitializing]=useState(cached.length===0);
  const[loadingGuide,setLoadingGuide]=useState(false);
  const[error,setError]=useState<string|null>(null);
  const mediaById=useMemo(()=>new Map(media.map(item=>[item.id,item])),[media]);
  const now=Math.floor(Date.now()/1000);
  const windowStart=Math.floor(now/HALF_HOUR)*HALF_HOUR;
  const windowEnd=windowStart+WINDOW_SECONDS;
  const ticks=Array.from({length:7},(_,index)=>windowStart+index*HALF_HOUR);

  const refresh=async(autoTune=false)=>{
    setLoadingGuide(true);
    try{
      const next=await getLiveChannelGuide();
      localStorage.setItem(cacheKey(),JSON.stringify(next));
      setGuide(next);setError(null);
      setTuned(current=>{
        if(!current&&autoTune)return next.find(row=>Boolean(row.current))??null;
        if(!current)return current;
        const fresh=next.find(row=>row.channel.id===current.channel.id);
        if(!fresh?.current)return fresh??null;
        return fresh;
      });
    }catch(c){setError(String(c))}finally{setLoadingGuide(false);setInitializing(false)}
  };

  useEffect(()=>{
    let disposed=false;
    const start=async()=>{
      try{
        const channels=await listLiveChannels();
        if(disposed)return;
        setGuide(current=>{
          const known=new Set(channels.map(channel=>channel.id));
          const useful=current.filter(row=>known.has(row.channel.id));
          return useful.length===channels.length?useful:placeholders(channels);
        });
        setInitializing(false);
        if(channels.length)await refresh(true);
      }catch(c){if(!disposed){setError(String(c));setInitializing(false)}}
    };
    void start();
    const timer=window.setInterval(()=>void refresh(false),30_000);
    return()=>{disposed=true;window.clearInterval(timer)};
  },[]);

  const tune=(row:GuideChannel)=>{
    if(row.current){setTuned(row);return;}
    void refresh(true);
  };

  const tunedMedia=tuned?.current?mediaById.get(tuned.current.mediaId):undefined;
  const stream=tuned?.current?liveChannelStreamUrl(tuned.current.mediaId,tuned.current.offsetSeconds):undefined;
  const fallbackArt=tunedMedia?.backdropUrl??tunedMedia?.thumbnailUrl??tunedMedia?.posterUrl;

  return <div className="live-page">
    <section className="live-header">
      <div><p className="eyebrow">LIVE CHANNELS</p><h1>What’s on now</h1><p>Channels keep moving even while you’re away.</p></div>
      <div className="live-header-actions">{loadingGuide&&guide.length>0&&<span className="live-guide-status"><LoaderCircle className="spin" size={14}/>Updating guide…</span>}<button onClick={()=>void refresh(false)}><RefreshCw size={16}/>Refresh</button><button onClick={onOpenSettings}><Settings2 size={16}/>Manage channels</button></div>
    </section>

    {error&&<div className="error-banner">{error}</div>}
    {tuned?.current&&<section className="live-player-card">
      <div className="live-player-info" style={(tuned.channel.artUrl||fallbackArt)?{backgroundImage:`linear-gradient(90deg,rgba(5,7,10,.22),rgba(5,7,10,.92)),url(${resolveMediaUrl(tuned.channel.artUrl||fallbackArt)})`}:undefined}>
        <div><span className="live-badge"><i/>LIVE</span><p>{tuned.channel.name}</p><h2>{tuned.current.title}</h2><span>{tuned.current.subtitle}</span></div>
      </div>
      <div className="live-video"><video key={`${tuned.channel.id}:${tuned.current.mediaId}:${tuned.current.startsAt}`} controls autoPlay src={stream} onEnded={()=>void refresh(true)}/></div>
    </section>}

    {initializing&&guide.length===0?<div className="live-empty"><LoaderCircle className="spin"/><span>Loading channels…</span></div>:guide.length===0?<div className="live-empty"><Radio size={34}/><h2>No channels yet</h2><p>Create a show, genre, or playlist channel in Settings → Live TV.</p><button className="primary" onClick={onOpenSettings}>Create a channel</button></div>:<section className="guide-shell">
      <div className="guide-header-row"><div className="guide-channel-heading">Channels</div><div className="guide-time-head">{ticks.map(tick=><span key={tick} style={{left:`${(tick-windowStart)/WINDOW_SECONDS*100}%`}}>{clock(tick)}</span>)}<i className="guide-now-line" style={{left:`${(now-windowStart)/WINDOW_SECONDS*100}%`}}/></div></div>
      {guide.map(row=>{
        const currentMedia=row.current?mediaById.get(row.current.mediaId):undefined;
        const showFallback=row.channel.criteriaType==='show'?(currentMedia?.backdropUrl??currentMedia?.thumbnailUrl??currentMedia?.posterUrl):undefined;
        const visual=row.channel.artUrl||showFallback;
        return <div className={`guide-row ${tuned?.channel.id===row.channel.id?'tuned':''}`} key={row.channel.id}>
          <button className="guide-channel" onClick={()=>tune(row)}>
            {visual?<img src={resolveMediaUrl(visual)} alt=""/>:<span className="guide-channel-icon"><Radio size={20}/><b>{row.channel.name.slice(0,2).toUpperCase()}</b></span>}
            <div><strong>{row.channel.name}</strong><small>{row.channel.criteriaType}: {row.channel.criteriaValue}</small></div>
          </button>
          <div className="guide-timeline" onClick={()=>tune(row)}>
            {row.programs.length===0&&loadingGuide&&<div className="guide-loading-row">Building schedule…</div>}
            {row.programs.map((program,index)=>{
              const start=Math.max(windowStart,program.startsAt),end=Math.min(windowEnd,program.endsAt);
              if(end<=windowStart||start>=windowEnd)return null;
              const left=(start-windowStart)/WINDOW_SECONDS*100,width=(end-start)/WINDOW_SECONDS*100;
              return <button key={`${program.mediaId}:${program.startsAt}`} className={`guide-program ${index===0?'current':''}`} style={{left:`${left}%`,width:`${Math.max(width,.75)}%`}} onClick={event=>{event.stopPropagation();tune(row)}}><strong>{program.title}</strong><small>{program.subtitle??`${clock(program.startsAt)}–${clock(program.endsAt)}`}</small></button>;
            })}
            <i className="guide-now-line" style={{left:`${(now-windowStart)/WINDOW_SECONDS*100}%`}}/>
          </div>
        </div>;
      })}
    </section>}
  </div>;
}
