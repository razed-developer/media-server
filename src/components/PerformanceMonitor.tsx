import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { isTauriDesktop } from '../api';

const INTERVAL_MS=500;
const BLOCK_THRESHOLD_MS=180;
const REPORT_COOLDOWN_MS=8000;

export function PerformanceMonitor(){
 useEffect(()=>{
   if(!isTauriDesktop())return;
   let expected=performance.now()+INTERVAL_MS;let lastReport=0;
   const timer=window.setInterval(()=>{
     const now=performance.now();const delay=Math.max(0,now-expected);expected=now+INTERVAL_MS;
     if(delay<BLOCK_THRESHOLD_MS||now-lastReport<REPORT_COOLDOWN_MS)return;
     lastReport=now;
     void invoke('record_client_activity',{level:'warning',category:'Performance',message:`UI thread was blocked for approximately ${Math.round(delay)} ms`}).catch(()=>{});
   },INTERVAL_MS);
   return()=>window.clearInterval(timer);
 },[]);
 return null;
}
