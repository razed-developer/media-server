import { useEffect } from 'react';
import appIcon from '../../logos/app-icon.png';
import wordMark from '../../logos/word-mark.png';

export function BrandingEnhancer(){
 useEffect(()=>{const apply=()=>{document.querySelectorAll<HTMLElement>('.brand-mark,.startup-mark').forEach(node=>{node.textContent='';node.style.backgroundImage=`url(${appIcon})`;node.style.backgroundSize='cover';node.style.backgroundPosition='center';node.style.color='transparent'});const brand=document.querySelector<HTMLElement>('.brand.brand-button');if(brand&&!brand.querySelector('.onyx-wordmark')){const text=Array.from(brand.children).find(child=>child.tagName==='SPAN'&&!child.classList.contains('brand-mark')) as HTMLElement|undefined;if(text)text.style.display='none';const image=document.createElement('img');image.className='onyx-wordmark';image.src=wordMark;image.alt='Onyx';brand.appendChild(image)}};apply();const observer=new MutationObserver(apply);observer.observe(document.body,{childList:true,subtree:true});return()=>observer.disconnect()},[]);return null;
}
