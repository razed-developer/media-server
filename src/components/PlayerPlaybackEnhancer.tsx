import { useEffect } from 'react';
import { getActiveUserId } from '../api';

type ResumeState={mediaId:string;time:number;subtitleLabel?:string;eligible:boolean};
const resumeKey=()=>`onyx-navigation-resume:${getActiveUserId()}`;
const subtitlePrefKey=()=>`onyx-subtitle-default:${getActiveUserId()}`;

function mediaId(video:HTMLVideoElement){
 const raw=video.currentSrc||video.querySelector('source')?.src||'';
 try{const path=new URL(raw,window.location.href).pathname;const match=path.match(/\/(?:play|stream)\/([^/]+)/);return match?decodeURIComponent(match[1]):''}catch{return''}
}
function readState():ResumeState|null{try{const raw=sessionStorage.getItem(resumeKey());return raw?JSON.parse(raw) as ResumeState:null}catch{return null}}
function writeState(value:ResumeState){try{sessionStorage.setItem(resumeKey(),JSON.stringify(value))}catch{/* best effort */}}
function selectedSubtitleLabel(){const select=document.querySelector<HTMLSelectElement>('.player-toolbar .subtitle-control select');if(!select||select.value==='off')return undefined;return select.selectedOptions[0]?.textContent?.trim()||undefined}
function activateSubtitle(video:HTMLVideoElement,label?:string){
 const select=document.querySelector<HTMLSelectElement>('.player-toolbar .subtitle-control select');if(!select)return;
 let option=label?Array.from(select.options).find(value=>value.textContent?.trim()===label):undefined;
 if(!option&&localStorage.getItem(subtitlePrefKey())!=='off'){
   const tracks=Array.from(video.querySelectorAll<HTMLTrackElement>('track'));
   const index=tracks.findIndex(track=>/^en(?:-|$)/i.test(track.srclang)||/\benglish\b|\beng\b/i.test(track.label));
   if(index>=0)option=Array.from(select.options).find(value=>value.value===String(index));
 }
 if(!option)return;
 select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));
 const index=Number.parseInt(option.value,10);window.setTimeout(()=>{for(let i=0;i<video.textTracks.length;i++)video.textTracks[i].mode=i===index?'showing':'disabled'},120);
}

export function PlayerPlaybackEnhancer(){
 useEffect(()=>{
   let video:HTMLVideoElement|null=null;let id='';let lastTime=0;let cleanupCurrent:(()=>void)|null=null;
   const save=(eligible?:boolean)=>{if(!video||!id)return;lastTime=video.currentTime||lastTime;const previous=readState();writeState({mediaId:id,time:lastTime,subtitleLabel:selectedSubtitleLabel()??previous?.subtitleLabel,eligible:eligible??previous?.eligible??false})};
   const detach=()=>{if(!video)return;save(Boolean(document.querySelector('.sidebar-resume')));cleanupCurrent?.();cleanupCurrent=null;video=null;id='';lastTime=0};
   const attach=()=>{
     const next=document.querySelector<HTMLVideoElement>('.player-content .video-stage video');
     if(next===video)return;if(video&&!video.isConnected)detach();if(!next)return;
     video=next;id=mediaId(next);lastTime=next.currentTime||0;
     if(!next.dataset.onyxTrackCors){next.dataset.onyxTrackCors='1';next.crossOrigin='anonymous';next.load();}
     const remember=()=>save();
     const restore=()=>{const state=readState();const isResume=Boolean(state?.eligible&&state.mediaId===id);if(isResume&&state!.time>1&&Math.abs(next.currentTime-state!.time)>2)next.currentTime=state!.time;window.setTimeout(()=>activateSubtitle(next,isResume?state?.subtitleLabel:undefined),140);if(isResume&&state)writeState({...state,eligible:false});};
     next.addEventListener('timeupdate',remember);next.addEventListener('pause',remember);next.addEventListener('loadedmetadata',restore);
     const select=document.querySelector<HTMLSelectElement>('.player-toolbar .subtitle-control select');const changed=()=>save();select?.addEventListener('change',changed);
     cleanupCurrent=()=>{next.removeEventListener('timeupdate',remember);next.removeEventListener('pause',remember);next.removeEventListener('loadedmetadata',restore);select?.removeEventListener('change',changed)};
     if(next.readyState>=1)restore();
   };
   attach();const observer=new MutationObserver(()=>{if(video&&!video.isConnected)window.setTimeout(detach,40);window.setTimeout(attach,0)});observer.observe(document.body,{childList:true,subtree:true});
   return()=>{observer.disconnect();detach()};
 },[]);
 return null;
}
