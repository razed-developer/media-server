import { useEffect } from 'react';
import { listMedia } from '../api';
import type { MediaItem } from '../types';

type JumpDetail={mediaId?:string;targetKey?:string;title?:string};
const socialKey=(item:MediaItem)=>item.metadataEntityId??(item.provider&&item.providerId?`${item.provider}:${item.providerId}`:`media:${item.id}`);
const text=(node:Element|null)=>node?.textContent?.trim()??'';
const waitFor=async<T extends Element>(find:()=>T|null,timeout=2200)=>{const started=Date.now();while(Date.now()-started<timeout){const found=find();if(found)return found;await new Promise(resolve=>window.setTimeout(resolve,60));}return null};
const clickSidebar=async(label:string)=>{const button=await waitFor(()=>Array.from(document.querySelectorAll<HTMLButtonElement>('.sidebar>button')).find(node=>text(node)===label)??null);button?.click();return Boolean(button)};
const highlight=(element:HTMLElement)=>{element.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'});element.focus?.();element.classList.add('library-jump-highlight');window.setTimeout(()=>element.classList.remove('library-jump-highlight'),1800)};

export function LibraryJumpBridge(){
 useEffect(()=>{
  const jump=async(event:Event)=>{
   const detail=(event as CustomEvent<JumpDetail>).detail??{};
   const media=await listMedia().catch(()=>[]);
   const item=media.find(candidate=>detail.mediaId===candidate.id||(detail.targetKey&&detail.targetKey===socialKey(candidate))||(detail.title&&detail.title.includes(candidate.title)));
   if(!item)return;
   if(item.kind==='movie'){
    if(!await clickSidebar('Movies'))return;
    const card=await waitFor(()=>Array.from(document.querySelectorAll<HTMLElement>('.media-card')).find(node=>text(node.querySelector('h3'))===item.title)??null);
    if(card)highlight(card);return;
   }
   if(!await clickSidebar('TV'))return;
   const showTitle=item.showTitle?.trim();if(!showTitle)return;
   const showCard=await waitFor(()=>Array.from(document.querySelectorAll<HTMLElement>('.show-card')).find(node=>text(node.querySelector('h3'))===showTitle)??null);
   showCard?.click();
   const seasonLabel=item.season==null?'':`S${String(item.season).padStart(2,'0')}`;
   const episodeLabel=item.episode==null?'':`E${String(item.episode).padStart(2,'0')}`;
   const episodeCard=await waitFor(()=>Array.from(document.querySelectorAll<HTMLElement>('.media-card')).find(node=>text(node.querySelector('h3'))===item.title&&(!seasonLabel||text(node).includes(seasonLabel))&&(!episodeLabel||text(node).replace(/\s/g,'').includes(episodeLabel)))??null);
   if(episodeCard)highlight(episodeCard);
  };
  window.addEventListener('onyx-open-library-item',jump);
  return()=>window.removeEventListener('onyx-open-library-item',jump);
 },[]);
 return null;
}
