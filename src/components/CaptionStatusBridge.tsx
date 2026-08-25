import { useEffect, useRef } from 'react';
import { getActiveUserId, getCaptionStatus, isTauriDesktop } from '../api';

export function CaptionStatusBridge(){
 const previous=useRef(new Map<string,string>());
 const initialized=useRef(false);
 useEffect(()=>{if(!isTauriDesktop())return;let stopped=false;
  const poll=async()=>{try{const status=await getCaptionStatus();if(stopped)return;
   const next=new Map(status.jobs.map(job=>[job.mediaId,job.status]));
   for(const job of status.jobs){if(initialized.current&&job.status==='complete'&&previous.current.get(job.mediaId)!=='complete'){
    sessionStorage.removeItem(`onyx-media-cache:${getActiveUserId()}`);
    window.dispatchEvent(new CustomEvent('onyx-subtitle-downloaded',{detail:{mediaId:job.mediaId,source:'ai'}}));
   }}
   previous.current=next;initialized.current=true;window.dispatchEvent(new CustomEvent('onyx-caption-status',{detail:status}));
  }catch{/* Status is best-effort; the worker records failures in Activity. */}};
  void poll();const timer=window.setInterval(()=>void poll(),1500);return()=>{stopped=true;window.clearInterval(timer)};
 },[]);return null;
}
