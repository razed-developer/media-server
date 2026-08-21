import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { getActiveUserId, listUsers } from '../api';
import type { MediaItem, UserProfile } from '../types';
import { SocialBar } from './SocialBar';

function idFromSource(src:string){
 try{const path=new URL(src,window.location.href).pathname;const match=path.match(/\/(?:play|stream)\/([^/]+)/)||path.match(/\/api\/playback\/resume\/([^/]+)/);return match?decodeURIComponent(match[1]):''}catch{return''}
}
function cachedMedia():MediaItem[]{try{const raw=sessionStorage.getItem(`onyx-media-cache:${getActiveUserId()}`);return raw?JSON.parse(raw) as MediaItem[]:[]}catch{return[]}}
let usersCache:UserProfile[]|null=null;

export function PlayerEpisodeSocial(){
 const[item,setItem]=useState<MediaItem|null>(null);const[users,setUsers]=useState<UserProfile[]>(usersCache??[]);const[target,setTarget]=useState<HTMLElement|null>(null);
 useEffect(()=>{
  let disposed=false;let lastSrc='';
  const resolve=()=>{
   const video=document.querySelector<HTMLVideoElement>('.player-content .video-stage video');
   const header=document.querySelector<HTMLElement>('.player-content .player-page-header>div:last-child');
   setTarget(current=>current===header?current:header);
   if(!video){lastSrc='';setItem(null);return;}
   const src=video.currentSrc||video.querySelector('source')?.src||'';
   if(!src||src===lastSrc)return;lastSrc=src;
   const id=idFromSource(src);const cached=cachedMedia().find(value=>value.id===id);
   if(cached?.kind==='episode')setItem(cached);
   else {
    const title=header?.querySelector('h1')?.textContent?.trim()||'Episode';
    const showTitle=header?.querySelector('.eyebrow')?.textContent?.trim()||'TV';
    setItem(id?({id,title,showTitle,kind:'episode',path:'',streamUrl:src,subtitles:[],progressSeconds:0,genres:[]} as MediaItem):null);
   }
  };
  resolve();const timer=window.setInterval(resolve,250);
  if(!usersCache)listUsers().then(value=>{usersCache=value;if(!disposed)setUsers(value)}).catch(()=>{});else setUsers(usersCache);
  return()=>{disposed=true;window.clearInterval(timer)};
 },[]);
 const content=useMemo(()=>item&&target?<div className="player-episode-social"><SocialBar targetType="episode" targetKey={item.metadataEntityId??`media:${item.id}`} title={`${item.showTitle??'TV'} · ${item.title}`} posterUrl={item.thumbnailUrl??item.posterUrl} users={users}/></div>:null,[item,target,users]);
 return content&&target?createPortal(content,target):null;
}
