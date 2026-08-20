import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Subtitles } from 'lucide-react';
import { listMedia, resolveMediaUrl } from '../api';
import type { MediaItem, SubtitleTrack } from '../types';
import { SubtitleFinder } from './SubtitleFinder';

function absolute(url?:string|null){if(!url)return'';const resolved=resolveMediaUrl(url);if(!resolved)return'';try{return new URL(resolved,window.location.href).href}catch{return resolved}}

export function PlayerSubtitleSearch(){
 const[video,setVideo]=useState<HTMLVideoElement|null>(null);const[toolbar,setToolbar]=useState<HTMLElement|null>(null);const[item,setItem]=useState<MediaItem|null>(null);const[open,setOpen]=useState(false);
 useEffect(()=>{let stopped=false;let last='';let loading='';
  const discover=async()=>{
   const nextVideo=document.querySelector<HTMLVideoElement>('.player-content .video-stage video');
   const nextToolbar=document.querySelector<HTMLElement>('.player-content .player-toolbar');
   setVideo(current=>current===nextVideo?current:nextVideo);setToolbar(current=>current===nextToolbar?current:nextToolbar);
   if(!nextVideo){setItem(null);last='';loading='';return;}
   nextVideo.preload='auto';
   const src=nextVideo.currentSrc||nextVideo.querySelector('source')?.src||'';
   if(!src||src===last||src===loading)return;
   loading=src;
   try{
    const media=await listMedia();if(stopped)return;
    const match=media.find(candidate=>{const candidateUrl=absolute(candidate.streamUrl);const decoded=decodeURIComponent(src);return candidateUrl===src||decoded.includes(encodeURIComponent(candidate.id))||decoded.includes(candidate.id)});
    if(match){setItem(match);last=src;}
   }catch{if(!stopped)setItem(null)}finally{if(loading===src)loading='';}
  };
  void discover();
  const observer=new MutationObserver(()=>void discover());observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
  const timer=window.setInterval(()=>void discover(),250);
  return()=>{stopped=true;observer.disconnect();window.clearInterval(timer)};
 },[]);
 const target=useMemo(()=>toolbar??document.body,[toolbar]);
 const downloaded=(track:SubtitleTrack)=>{if(!video||!track.url)return;for(let i=0;i<video.textTracks.length;i++)video.textTracks[i].mode='disabled';const el=document.createElement('track');el.kind='subtitles';el.src=resolveMediaUrl(track.url)??track.url;el.srclang=track.language;el.label=track.label;el.default=true;video.appendChild(el);const activate=()=>{try{el.track.mode='showing'}catch{}};activate();el.addEventListener('load',activate,{once:true});const select=document.querySelector<HTMLSelectElement>('.player-toolbar .subtitle-control select');if(select&&!Array.from(select.options).some(option=>option.text===track.label)){const option=document.createElement('option');option.value=String(video.textTracks.length-1);option.text=track.label;select.add(option);select.value=option.value;}}
 if(!toolbar||!target)return null;
 return <>{createPortal(<button className="find-subtitles-button" title={item?'Find and download subtitles':'Preparing subtitle search…'} aria-label="Find subtitles" disabled={!item} onClick={()=>item&&setOpen(true)}><Search size={15}/><Subtitles size={16}/><span>Find subtitles</span></button>,target)}{open&&item&&<SubtitleFinder item={item} onClose={()=>setOpen(false)} onDownloaded={downloaded}/>}</>;
}
