import { useEffect } from 'react';

const appIcon='/app-icon.png';
function applyBranding(){
  document.querySelectorAll<HTMLElement>('.startup-mark').forEach(node=>{
    node.textContent='';
    node.style.backgroundImage=`url(${appIcon})`;
    node.style.backgroundSize='cover';
    node.style.backgroundPosition='center';
    node.style.color='transparent';
  });
}

export function BrandingEnhancer(){
 useEffect(()=>{
   const timers=[0,60,180].map(delay=>window.setTimeout(applyBranding,delay));
   return()=>timers.forEach(window.clearTimeout);
 },[]);
 return null;
}
