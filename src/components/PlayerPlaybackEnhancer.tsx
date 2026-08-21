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
 select.value=option.value;
 select.dispatchEvent(new Event('change',{bubbles:true}));
 const index=Number.parseInt(option.value,10);
 window.setTimeout(()=>{for(let i=0;i<video.textTracks.length;i++)video.textTracks[i].mode=i===index?'showing':'disabled'},100);
}

export function PlayerPlaybackEnhancer(){
 useEffect(()=>{
   let current:HTMLVideoElement|null=null;let currentId='';let lastTime=0;let selectCleanup:(()=>void)|null=null;
   const detach=()=>{if(selectCleanup){selectCleanup();selectCleanup=null}if(current&&currentId){const state=readState();writeState({mediaId:currentId,time:lastTime||current.currentTime||0,subtitleLabel:selectedSubtitleLabel()??state?.subtitleLabel,eligible:Boolean(document.querySelector('.sidebar-resume'))})}current=null;currentId='';lastTime=0};
   const attach=()=>{
     const video=document.querySelector<HTMLVideoElement>('.player-content .video-stage video');
     if(video===current)return;
     if(current&&!current.isConnected)detach();
     if(!video)return;
     current=video;currentId=mediaId(video);lastTime=video.currentTime||0;
     // Chromium requires CORS mode on the media element before it will render cross-origin WebVTT tracks.
     if(!video.dataset.onyxTrackCors){video.dataset.onyxTrackCors='1';video.crossOrigin='anonymous';video.load();}
     const remember=()=>{lastTime=video.currentTime||lastTime;const previous=readState();writeState({mediaId:currentId,time:lastTime,subtitleLabel:selectedSubtitleLabel()??previous?.subtitleLabel,eligible:previous?.eligible??false})};
     const restore=()=>{const state=readState();if(state?.eligible&&state.mediaId===currentId&&state.time>1&&Math.abs(video.currentTime-state.time)>2)video.currentTime=state.time;window.setTimeout(()=>activateSubtitle(video,state?.eligible&&state.mediaId===currentId?state.subtitleLabel:undefined),120);if(state?.eligible&&state.mediaId===currentId)writeState({...state,eligible:false});};
     video.addEventListener('timeupdate',remember);video.addEventListener('pause',remember);video.addEventListener('loadedmetadata',restore);
     if(video.readyState>=1)restore();
     const select=document.querySelector<HTMLSelectElement>('.player-toolbar .subtitle-control select');
     if(select){const changed=()=>remember();select.addEventListener('change',changed);selectCleanup=()=>select.removeEventListener('change',changed)}
     const cleanupVideo=()=>{video.removeEventListener('timeupdate',remember);video.removeEventListener('pause',remember);video.removeEventListener('loadedmetadata',restore)};
     const oldDetach=detach;detach=()=>{cleanupVideo();oldDetach()};
   };
   attach();const observer=new MutationObserver(()=>{window.setTimeout(attach,0);if(current&&!current.isConnected)window.setTimeout(detach,50)});observer.observe(document.body,{childList:true,subtree:true});
   return()=>{observer.disconnect();detach()};
 },[]);
 return null;
}
