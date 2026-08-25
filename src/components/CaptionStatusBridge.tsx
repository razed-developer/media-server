import { useEffect, useRef } from 'react';
import { getActiveUserId, getCaptionStatus, isTauriDesktop } from '../api';

export function CaptionStatusBridge(){
 const previous=useRef(new Map<string,string>());
 const initialized=useRef(false);
 useEffect(()=>{if(!isTauriDesktop())return;let stopped=false;let timer:number|undefined;
  const poll=async()=>{try{const status=await getCaptionStatus();if(stopped)return;
   const next=new Map(status.jobs.map(job=>[job.mediaId,job.status]));
   for(const job of status.jobs){if(initialized.current&&job.status==='complete'&&previous.current.get(job.mediaId)!=='complete'){
    sessionStorage.removeItem(`onyx-media-cache:${getActiveUserId()}`);
    window.dispatchEvent(new CustomEvent('onyx-subtitle-downloaded',{detail:{mediaId:job.mediaId,source:'ai'}}));
   }}
   previous.current=next;initialized.current=true;window.dispatchEvent(new CustomEvent('onyx-caption-status',{detail:status}));
   timer=window.setTimeout(()=>void poll(),status.jobs.some(job=>['queued','extracting','transcribing'].includes(job.status))?1000:10000);
  }catch{/* Status is best-effort; the worker records failures in Activity. */timer=window.setTimeout(()=>void poll(),10000)}};
  const refresh=()=>{if(timer)window.clearTimeout(timer);void poll()};void poll();window.addEventListener('onyx-caption-refresh',refresh);return()=>{stopped=true;if(timer)window.clearTimeout(timer);window.removeEventListener('onyx-caption-refresh',refresh)};
 },[]);return null;
}
