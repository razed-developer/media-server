import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { getActiveUserId, getLiveChannelGuide, isTauriDesktop, listLiveChannels } from '../api';
import type { GuideChannel } from '../types';

const MIN_VISIBLE_MS=500;
const MAX_VISIBLE_MS=15000;
const MIN_GUIDE_REMAINING=60*60;
const guideCacheKey=()=>`onyx-live-guide:${getActiveUserId()}`;
const cachedGuideHasRoom=(channelIds:string[])=>{try{const raw=localStorage.getItem(guideCacheKey());if(!raw)return false;const rows=JSON.parse(raw) as GuideChannel[];if(rows.length!==channelIds.length)return false;const known=new Set(channelIds);if(rows.some(row=>!known.has(row.channel.id)))return false;const horizon=Math.floor(Date.now()/1000)+MIN_GUIDE_REMAINING;return rows.every(row=>row.programs.length===0||Math.max(...row.programs.map(program=>program.endsAt))>=horizon)}catch{return false}};

export function StartupWarmup({children}:{children:React.ReactNode}){
 const desktop=isTauriDesktop();const[ready,setReady]=useState(!desktop);const[message,setMessage]=useState('Starting Onyx…');
 useEffect(()=>{
  if(!desktop){setReady(true);return}
  let disposed=false;const started=Date.now();
  const finish=()=>{if(disposed)return;const wait=Math.max(0,MIN_VISIBLE_MS-(Date.now()-started));window.setTimeout(()=>{if(!disposed)setReady(true)},wait)};
  const timeout=window.setTimeout(()=>{if(!disposed){setMessage('Opening Onyx…');finish()}},MAX_VISIBLE_MS);
  const check=async()=>{
   while(!disposed){
    const themed=Boolean(document.documentElement.dataset.theme);
    const profile=document.querySelector<HTMLButtonElement>('.profile-button');
    const server=document.querySelector<HTMLElement>('.server-pill.online');
    const shell=document.querySelector<HTMLElement>('.app-shell');
    if(!shell){setMessage('Starting interface…')}
    else if(!themed){setMessage('Loading your theme…')}
    else if(!profile||!profile.textContent?.trim()||/^user\b/i.test(profile.textContent.trim())){setMessage('Loading your profile…')}
    else if(!server){setMessage('Connecting to your media server…')}
    else {
      setMessage('Preparing Live TV…');
      try{const channels=await listLiveChannels();const ids=channels.map(channel=>channel.id);if(channels.length&&!cachedGuideHasRoom(ids)){const guide=await getLiveChannelGuide();localStorage.setItem(guideCacheKey(),JSON.stringify(guide))}}catch{/* Live TV remains optional */}
      window.clearTimeout(timeout);finish();return;
    }
    await new Promise(resolve=>window.setTimeout(resolve,100));
   }
  };
  void check();return()=>{disposed=true;window.clearTimeout(timeout)};
 },[desktop]);
 return <>{children}{!ready&&<div className="startup-warmup" role="status" aria-live="polite"><div className="startup-warmup-inner"><div className="startup-mark">O</div><div><strong>Onyx</strong><span>{message}</span></div><LoaderCircle className="spin" size={17}/></div></div>}</>;
}
