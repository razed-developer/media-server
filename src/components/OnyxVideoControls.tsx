import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { getActiveUserId, serverBaseUrl } from '../api';
import type { MediaItem } from '../types';

const fmt=(seconds:number)=>{if(!Number.isFinite(seconds)||seconds<0)seconds=0;const h=Math.floor(seconds/3600),m=Math.floor((seconds%3600)/60),s=Math.floor(seconds%60);return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${m}:${String(s).padStart(2,'0')}`};
const mediaId=(video:HTMLVideoElement)=>{const raw=video.currentSrc||video.querySelector('source')?.src||'';try{const path=new URL(raw,window.location.href).pathname;const match=path.match(/\/(?:play|stream)\/([^/]+)/)||path.match(/\/api\/playback\/resume\/([^/]+)/);return match?decodeURIComponent(match[1]):''}catch{return''}};
const cachedItem=(id:string):MediaItem|undefined=>{try{const raw=sessionStorage.getItem(`onyx-media-cache:${getActiveUserId()}`);return raw?(JSON.parse(raw) as MediaItem[]).find(item=>item.id===id):undefined}catch{return undefined}};
const effectiveTime=(video:HTMLVideoElement)=>{const offset=Number(video.dataset.onyxResumeOffset||0),current=video.currentTime||0;return offset>0&&current<offset*.75?offset+current:current};

export function OnyxVideoControls(){
 const[video,setVideo]=useState<HTMLVideoElement|null>(null);const[item,setItem]=useState<MediaItem>();const[current,setCurrent]=useState(0);const[playing,setPlaying]=useState(false);const[volume,setVolume]=useState(1);const[visible,setVisible]=useState(true);const hideTimer=useRef<number>();
 useEffect(()=>{const discover=()=>{const next=document.querySelector<HTMLVideoElement>('.player-content .video-stage video');if(next===video)return;if(video)video.controls=false;if(!next){setVideo(null);setItem(undefined);return}next.controls=false;setVideo(next);setItem(cachedItem(mediaId(next)))};discover();const timer=window.setInterval(discover,300);return()=>{window.clearInterval(timer);if(video)video.controls=false}},[video]);
 useEffect(()=>{if(!video)return;video.controls=false;const update=()=>{setCurrent(effectiveTime(video));setPlaying(!video.paused);setVolume(video.muted?0:video.volume)};update();for(const event of['timeupdate','play','pause','volumechange','loadedmetadata'])video.addEventListener(event,update);return()=>{for(const event of['timeupdate','play','pause','volumechange','loadedmetadata'])video.removeEventListener(event,update)}},[video]);
 const total=item?.durationSeconds||0;const percent=total?Math.min(100,Math.max(0,current/total*100)):0;
 const show=()=>{setVisible(true);if(hideTimer.current)window.clearTimeout(hideTimer.current);hideTimer.current=window.setTimeout(()=>setVisible(false),2600)};
 useEffect(()=>()=>{if(hideTimer.current)window.clearTimeout(hideTimer.current)},[]);
 const seek=(value:number)=>{if(!video||!item||!total)return;const target=Math.max(0,Math.min(total,value));if(item.playbackMode==='directPlay'){video.currentTime=target;setCurrent(target);return}const source=video.querySelector<HTMLSourceElement>('source');if(!source)return;source.src=`${serverBaseUrl()}/api/playback/resume/${encodeURIComponent(item.id)}/${Math.floor(target)}`;video.dataset.onyxResumeOffset=String(Math.floor(target));video.load();void video.play().catch(()=>{});setCurrent(target)};
 const toggle=()=>{if(!video)return;if(video.paused)void video.play();else video.pause()};
 const mute=()=>{if(!video)return;video.muted=!video.muted};
 const fullscreen=()=>{const stage=video?.closest<HTMLElement>('.video-stage');if(stage?.requestFullscreen)void stage.requestFullscreen()};
 const controls=useMemo(()=>video?<div className={`onyx-video-controls ${visible?'visible':''}`} onMouseEnter={show} onMouseMove={show}><input className="onyx-video-seek" type="range" min={0} max={Math.max(1,total)} step={1} value={Math.min(current,Math.max(1,total))} onChange={event=>seek(Number(event.target.value))}/><div className="onyx-video-control-row"><button onClick={toggle} aria-label={playing?'Pause':'Play'}>{playing?<Pause size={19}/>:<Play size={19} fill="currentColor"/>}</button><span className="onyx-video-clock">{fmt(current)} <i>/</i> {total?fmt(total):'--:--'}</span><div className="onyx-video-spacer"/><button onClick={mute} aria-label={volume?'Mute':'Unmute'}>{volume?<Volume2 size={18}/>:<VolumeX size={18}/>}</button><input className="onyx-volume" type="range" min={0} max={1} step={.05} value={volume} onChange={event=>{if(!video)return;video.muted=false;video.volume=Number(event.target.value)}}/><button onClick={fullscreen} aria-label="Fullscreen"><Maximize size={18}/></button></div></div>:null,[video,visible,total,current,playing,volume]);
 useEffect(()=>{const stage=video?.closest<HTMLElement>('.video-stage');if(!stage)return;const move=()=>show();stage.addEventListener('mousemove',move);stage.addEventListener('mouseenter',move);return()=>{stage.removeEventListener('mousemove',move);stage.removeEventListener('mouseenter',move)}},[video]);
 if(!video)return null;
 const stage=video.closest('.video-stage');if(!stage)return null;
 return controls;
}
