import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Sparkles, Subtitles } from 'lucide-react';
import { generateCaptions, getActiveUserId, isTauriDesktop, listMedia, resolveMediaUrl } from '../api';
import type { MediaItem, SubtitleTrack } from '../types';
import { SubtitleFinder } from './SubtitleFinder';

function absolute(url?:string|null){if(!url)return'';const resolved=resolveMediaUrl(url);if(!resolved)return'';try{return new URL(resolved,window.location.href).href}catch{return resolved}}
function cachedMedia():MediaItem[]{try{const raw=sessionStorage.getItem(`onyx-media-cache:${getActiveUserId()}`);return raw?JSON.parse(raw) as MediaItem[]:[]}catch{return[]}}
function idFromSource(src:string){try{const path=new URL(src,window.location.href).pathname;const match=path.match(/\/(?:play|stream)\/([^/]+)/)||path.match(/\/api\/playback\/resume\/([^/]+)/);return match?decodeURIComponent(match[1]):''}catch{return''}}

export function PlayerSubtitleSearch(){
 const[video,setVideo]=useState<HTMLVideoElement|null>(null);const[toolbar,setToolbar]=useState<HTMLElement|null>(null);const[item,setItem]=useState<MediaItem|null>(null);const[open,setOpen]=useState(false);const[captionBusy,setCaptionBusy]=useState(false);const[captionMessage,setCaptionMessage]=useState('Generate AI subtitles');
 useEffect(()=>{let stopped=false;let last='';let loading='';
  const discover=async()=>{
   const nextVideo=document.querySelector<HTMLVideoElement>('.player-content .video-stage video');const nextToolbar=document.querySelector<HTMLElement>('.player-content .player-toolbar');
   setVideo(current=>current===nextVideo?current:nextVideo);setToolbar(current=>current===nextToolbar?current:nextToolbar);
   if(!nextVideo){setItem(null);last='';loading='';return;}nextVideo.preload='auto';
   const src=nextVideo.currentSrc||nextVideo.querySelector('source')?.src||'';if(!src||src===last||src===loading)return;loading=src;
   try{
    const wanted=idFromSource(src);let media=cachedMedia();let match=wanted?media.find(candidate=>candidate.id===wanted):undefined;
    if(!match){media=await listMedia();if(stopped)return;try{sessionStorage.setItem(`onyx-media-cache:${getActiveUserId()}`,JSON.stringify(media))}catch{}match=media.find(candidate=>{const candidateUrl=absolute(candidate.streamUrl);const decoded=decodeURIComponent(src);return candidate.id===wanted||candidateUrl===src||decoded.includes(encodeURIComponent(candidate.id))||decoded.includes(candidate.id)});}
    if(match){setItem(match);last=src;}
   }catch{if(!stopped)setItem(null)}finally{if(loading===src)loading='';}
  };
  const schedule=()=>window.setTimeout(()=>void discover(),0);
  void discover();document.addEventListener('click',schedule,true);const timer=window.setInterval(()=>void discover(),800);
  return()=>{stopped=true;document.removeEventListener('click',schedule,true);window.clearInterval(timer)};
 },[]);
 const target=useMemo(()=>toolbar??document.body,[toolbar]);
 const downloaded=(track:SubtitleTrack)=>{if(!video||!track.url)return;for(let i=0;i<video.textTracks.length;i++)video.textTracks[i].mode='disabled';const el=document.createElement('track');el.kind='subtitles';el.src=resolveMediaUrl(track.url)??track.url;el.srclang=track.language;el.label=track.label;el.default=true;video.appendChild(el);const activate=()=>{try{el.track.mode='showing'}catch{}};activate();el.addEventListener('load',activate,{once:true});const select=document.querySelector<HTMLSelectElement>('.player-toolbar .subtitle-control select');if(select&&!Array.from(select.options).some(option=>option.text===track.label)){const option=document.createElement('option');option.value=String(video.textTracks.length-1);option.text=track.label;select.add(option);select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));}window.dispatchEvent(new CustomEvent('onyx-subtitle-downloaded',{detail:{mediaId:item?.id}}));}
 if(!toolbar||!target)return null;
 const generate=async()=>{if(!item)return;setCaptionBusy(true);try{const queued=await generateCaptions(item.id,item.subtitles.length>0);setCaptionMessage(queued?'AI subtitles queued':'Already queued')}catch(error){setCaptionMessage(String(error).replace(/^Error:\s*/,''))}finally{setCaptionBusy(false)}};
 return <>{createPortal(<><button className="find-subtitles-button" title={item?'Find and download subtitles':'Preparing subtitle search…'} aria-label="Find subtitles" disabled={!item} onClick={()=>item&&setOpen(true)}><Search size={15}/><Subtitles size={16}/><span>Find subtitles</span></button>{isTauriDesktop()&&<button className="find-subtitles-button generate-subtitles-button" title={captionMessage} disabled={!item||captionBusy} onClick={()=>void generate()}><Sparkles size={16}/><span>{captionBusy?'Queueing…':'Generate AI subtitles'}</span></button>}</>,target)}{open&&item&&<SubtitleFinder item={item} onClose={()=>setOpen(false)} onDownloaded={downloaded}/>}</>;
}
