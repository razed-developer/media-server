import { useEffect } from 'react';

const appIcon='/app-icon.png';
const landscape='/landscape.png';
const wordMark='/word-mark.png';

function applyBranding(){
  document.querySelectorAll<HTMLElement>('.brand-mark,.startup-mark').forEach(node=>{
    node.textContent='';
    node.style.backgroundImage=`url(${appIcon})`;
    node.style.backgroundSize='cover';
    node.style.backgroundPosition='center';
    node.style.color='transparent';
  });
  const brand=document.querySelector<HTMLElement>('.brand.brand-button');
  if(brand){
    const text=Array.from(brand.children).find(child=>child.tagName==='SPAN'&&!child.classList.contains('brand-mark')) as HTMLElement|undefined;
    if(text)text.style.display='none';
    let image=brand.querySelector<HTMLImageElement>('.onyx-wordmark');
    if(!image){image=document.createElement('img');image.className='onyx-wordmark';image.alt='Onyx';brand.appendChild(image)}
    image.src=wordMark;
  }
  const hero=document.querySelector<HTMLElement>('.onyx-hero');
  if(hero){
    hero.style.backgroundImage=`url(${landscape})`;
    hero.style.backgroundSize='cover';
    hero.style.backgroundPosition='center';
  }
}

export function BrandingEnhancer(){
 useEffect(()=>{
   let timers:number[]=[];
   const schedule=()=>{
     timers.forEach(window.clearTimeout);timers=[];
     for(const delay of [0,40,160])timers.push(window.setTimeout(applyBranding,delay));
   };
   schedule();
   document.addEventListener('click',schedule,true);
   window.addEventListener('onyx-theme-changed',schedule as EventListener);
   return()=>{document.removeEventListener('click',schedule,true);window.removeEventListener('onyx-theme-changed',schedule as EventListener);timers.forEach(window.clearTimeout)};
 },[]);
 return null;
}
