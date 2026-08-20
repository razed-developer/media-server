import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Subtitles } from 'lucide-react';
import { listMedia, resolveMediaUrl } from '../api';
import type { MediaItem, SubtitleTrack } from '../types';
import { SubtitleFinder } from './SubtitleFinder';

function absolute(url?:string|null){if(!url)return'';const resolved=resolveMediaUrl(url);if(!resolved)return'';try{return new URL(resolved,window.location.href).href}catch{return resolved}}

export function PlayerSubtitleSearch(){
 const[video,setVideo]=useState<HTMLVideoElement|null>(null);const[toolbar,setToolbar]=useState<HTMLElement|null>(null);const[item,setItem]=useState<MediaItem|null>(null);const[open,setOpen]=useState(false);
 useEffect(()=>{let stopped=false;let last='';const discover=async()=>{const nextVideo=document.querySelector<HTMLVideoElement>('.player-content .video-stage video');const nextToolbar=document.querySelector<HTMLElement>('.player-content .player-toolbar');if(nextVideo!==video)setVideo(nextVideo);if(nextToolbar!==toolbar)setToolbar(nextToolbar);if(!nextVideo){setItem(null);last='';return;}const src=nextVideo.currentSrc||nextVideo.querySelector('source')?.src||'';if(!src||src===last)return;last=src;try{const media=await listMedia();if(stopped)return;const match=media.find(candidate=>{const candidateUrl=absolute(candidate.streamUrl);return candidateUrl===src||decodeURIComponent(src).includes(encodeURIComponent(candidate.id))||decodeURIComponent(src).includes(candidate.id)});setItem(match??null)}catch{if(!stopped)setItem(null)}};void discover();const timer=window.setInterval(()=>void discover(),700);return()=>{stopped=true;window.clearInterval(timer)}},[video,toolbar]);
 const target=useMemo(()=>toolbar??document.body,[toolbar]);
 const downloaded=(track:SubtitleTrack)=>{if(!video||!track.url)return;for(let i=0;i<video.textTracks.length;i++)video.textTracks[i].mode='disabled';const el=document.createElement('track');el.kind='subtitles';el.src=resolveMediaUrl(track.url)??track.url;el.srclang=track.language;el.label=track.label;el.default=true;el.addEventListener('load',()=>{el.track.mode='showing'},{once:true});video.appendChild(el);const select=document.querySelector<HTMLSelectElement>('.player-toolbar .subtitle-control select');if(select&&!Array.from(select.options).some(option=>option.text===track.label)){const option=document.createElement('option');option.value=String(video.textTracks.length-1);option.text=track.label;select.add(option);select.value=option.value;}}
 if(!item||!target)return null;
 return <>{createPortal(<button className="find-subtitles-button" title="Find and download subtitles" aria-label="Find subtitles" onClick={()=>setOpen(true)}><Search size={15}/><Subtitles size={16}/><span>Find subtitles</span></button>,target)}{open&&<SubtitleFinder item={item} onClose={()=>setOpen(false)} onDownloaded={downloaded}/>}</>;
}
