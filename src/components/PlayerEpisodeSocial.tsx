import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { listMedia, listUsers, resolveMediaUrl } from '../api';
import type { MediaItem, UserProfile } from '../types';
import { SocialBar } from './SocialBar';

function absolute(url?:string|null){if(!url)return'';const resolved=resolveMediaUrl(url);if(!resolved)return'';try{return new URL(resolved,window.location.href).href}catch{return resolved}}
function socialKey(item:MediaItem){return item.metadataEntityId??(item.provider&&item.providerId?`${item.provider}:${item.providerId}`:`media:${item.id}`)}

export function PlayerEpisodeSocial(){
 const[item,setItem]=useState<MediaItem|null>(null);const[users,setUsers]=useState<UserProfile[]>([]);const[target,setTarget]=useState<HTMLElement|null>(null);
 useEffect(()=>{let disposed=false;let loading='';
  const discover=async()=>{const video=document.querySelector<HTMLVideoElement>('.player-content .video-stage video');const header=document.querySelector<HTMLElement>('.player-content .player-page-header>div:last-child');setTarget(header);if(!video){setItem(null);return}const src=video.currentSrc||video.querySelector('source')?.src||'';if(!src||src===loading)return;loading=src;try{const[media,userData]=await Promise.all([listMedia(),listUsers()]);if(disposed)return;const decoded=decodeURIComponent(src);const match=media.find(candidate=>absolute(candidate.streamUrl)===src||decoded.includes(candidate.id));setItem(match?.kind==='episode'?match:null);setUsers(userData)}catch{if(!disposed)setItem(null)}finally{loading=''}};
  void discover();const observer=new MutationObserver(()=>void discover());observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});const timer=window.setInterval(()=>void discover(),500);return()=>{disposed=true;observer.disconnect();window.clearInterval(timer)};
 },[]);
 const content=useMemo(()=>item&&target?<div className="player-episode-social"><SocialBar targetType="episode" targetKey={socialKey(item)} title={`${item.showTitle??'TV'} · ${item.title}`} posterUrl={item.thumbnailUrl??item.posterUrl} users={users}/></div>:null,[item,target,users]);
 return content&&target?createPortal(content,target):null;
}
