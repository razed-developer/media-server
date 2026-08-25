import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { getActiveUserId, getLiveChannelGuide, isTauriDesktop, listLiveChannels } from '../api';

const MIN_VISIBLE_MS=500;
const SLOW_START_MS=15000;

export function StartupWarmup({children}:{children:React.ReactNode}){
 const desktop=isTauriDesktop();const[ready,setReady]=useState(!desktop);const[message,setMessage]=useState('Starting Onyx…');
 useEffect(()=>{
  const status=(event:Event)=>{const next=(event as CustomEvent<{message?:string}>).detail?.message;if(next)setMessage(next)};
  const appReady=()=>setMessage('Finalizing Onyx…');
  window.addEventListener('onyx-startup-status',status);window.addEventListener('onyx-app-ready',appReady);
  return()=>{window.removeEventListener('onyx-startup-status',status);window.removeEventListener('onyx-app-ready',appReady)};
 },[]);
 useEffect(()=>{
  if(!desktop){setReady(true);return}
  let disposed=false;const started=Date.now();
  const finish=()=>{if(disposed)return;const wait=Math.max(0,MIN_VISIBLE_MS-(Date.now()-started));window.setTimeout(()=>{if(!disposed)setReady(true)},wait)};
  const timeout=window.setTimeout(()=>{if(!disposed)setMessage('Onyx is still starting…')},SLOW_START_MS);
  const check=async()=>{
   while(!disposed){
    const themed=Boolean(document.documentElement.dataset.theme);
    const profile=document.querySelector<HTMLButtonElement>('.profile-button');
    const server=document.querySelector<HTMLElement>('.server-logo-status.online');
    const shell=document.querySelector<HTMLElement>('.app-shell');
    if(!shell){setMessage('Starting interface…')}
    else if(!themed){setMessage('Loading your theme…')}
    else if(!profile||!profile.textContent?.trim()||/^user\b/i.test(profile.textContent.trim())){setMessage('Loading your profile…')}
    else if(!server){setMessage('Connecting to your media server…')}
    else {
      setMessage('Preparing Live Channels…');
      try{const channels=await listLiveChannels();if(channels.length){const guide=await getLiveChannelGuide();localStorage.setItem(`onyx-live-guide:${getActiveUserId()}`,JSON.stringify(guide))}}catch{/* Live Channels remains optional if no channels are configured. */}
      window.clearTimeout(timeout);finish();return;
    }
    await new Promise(resolve=>window.setTimeout(resolve,100));
   }
  };
  void check();return()=>{disposed=true;window.clearTimeout(timeout)};
 },[desktop]);
 useEffect(()=>{
  let shownAt=0;let finishTimer:number|undefined;
  const loading=(event:Event)=>{if(finishTimer)window.clearTimeout(finishTimer);shownAt=Date.now();const name=(event as CustomEvent<{name?:string}>).detail?.name;setMessage(name?`Loading ${name}…`:'Loading profile…');setReady(false)};
  const loaded=()=>{const delay=Math.max(0,MIN_VISIBLE_MS-(Date.now()-shownAt));finishTimer=window.setTimeout(()=>setReady(true),delay)};
  window.addEventListener('onyx-profile-loading',loading);window.addEventListener('onyx-profile-ready',loaded);
  return()=>{if(finishTimer)window.clearTimeout(finishTimer);window.removeEventListener('onyx-profile-loading',loading);window.removeEventListener('onyx-profile-ready',loaded)};
 },[]);
 return <>{children}{!ready&&<div className="startup-warmup" role="status" aria-live="polite"><div className="startup-warmup-inner"><div className="startup-mark">O</div><div><strong>Onyx</strong><span>{message}</span></div><LoaderCircle className="spin" size={17}/></div></div>}</>;
}
