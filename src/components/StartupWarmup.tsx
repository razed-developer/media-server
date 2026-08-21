import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { getActiveUserId, getLiveChannelGuide, isTauriDesktop, listLiveChannels, listMedia, listPlaylists } from '../api';
import type { GuideChannel } from '../types';

const MIN_VISIBLE_MS=650;
const MAX_VISIBLE_MS=4500;
const MIN_GUIDE_REMAINING=60*60;
const sleep=(ms:number)=>new Promise(resolve=>window.setTimeout(resolve,ms));
const guideCacheKey=()=>`onyx-live-guide:${getActiveUserId()}`;
const cachedGuideHasRoom=(channelIds:string[])=>{try{const raw=localStorage.getItem(guideCacheKey());if(!raw)return false;const rows=JSON.parse(raw) as GuideChannel[];if(rows.length!==channelIds.length)return false;const known=new Set(channelIds);if(rows.some(row=>!known.has(row.channel.id)))return false;const horizon=Math.floor(Date.now()/1000)+MIN_GUIDE_REMAINING;return rows.every(row=>row.programs.length===0||Math.max(...row.programs.map(program=>program.endsAt))>=horizon)}catch{return false}};

export function StartupWarmup({children}:{children:React.ReactNode}){
 const desktop=isTauriDesktop();const[ready,setReady]=useState(!desktop);const[message,setMessage]=useState('Preparing your library…');
 useEffect(()=>{
  if(!desktop){setReady(true);return}
  let disposed=false;const started=Date.now();
  const finish=()=>{if(!disposed)setReady(true)};
  const timeout=window.setTimeout(finish,MAX_VISIBLE_MS);
  const run=async()=>{
   try{
    setMessage('Loading movies and television…');
    const[media,playlists,channels]=await Promise.all([listMedia(),listPlaylists(),listLiveChannels()]);
    if(disposed)return;
    try{sessionStorage.setItem(`onyx-media-cache:${getActiveUserId()}`,JSON.stringify(media))}catch{/* cache is optional */}
    const shows=[...new Set(media.filter(item=>item.kind==='episode').map(item=>item.showTitle).filter((value):value is string=>Boolean(value)))].sort((a,b)=>a.localeCompare(b));
    const genres=[...new Set(media.flatMap(item=>item.genres??[]))].sort((a,b)=>a.localeCompare(b));
    sessionStorage.setItem(`onyx-live-criteria:${getActiveUserId()}`,JSON.stringify({shows,genres,playlists,createdAt:Date.now()}));
    const channelIds=channels.map(channel=>channel.id);
    if(channels.length&&!cachedGuideHasRoom(channelIds)){setMessage('Extending Live TV guide…');try{const guide=await getLiveChannelGuide();localStorage.setItem(guideCacheKey(),JSON.stringify(guide))}catch{/* Live TV remains optional */}}
    else if(channels.length)setMessage('Live TV is ready…');
   }catch{/* App surfaces any real load error after startup */}
   finally{const remaining=Math.max(0,MIN_VISIBLE_MS-(Date.now()-started));if(remaining)await sleep(remaining);window.clearTimeout(timeout);finish()}
  };
  void run();return()=>{disposed=true;window.clearTimeout(timeout)};
 },[desktop]);
 if(ready)return <>{children}</>;
 return <div className="startup-warmup" role="status" aria-live="polite"><div className="startup-warmup-inner"><div className="startup-mark">O</div><div><strong>Onyx</strong><span>{message}</span></div><LoaderCircle className="spin" size={17}/></div></div>;
}
