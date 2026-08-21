import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw } from 'lucide-react';
import { autoMatchMetadata, isTauriDesktop, rescanLibrary } from '../api';

export function QuickLibraryRefresh(){
 const[target,setTarget]=useState<HTMLElement|null>(null);const[busy,setBusy]=useState(false);const[message,setMessage]=useState('');
 useEffect(()=>{if(!isTauriDesktop())return;const find=()=>setTarget(document.querySelector<HTMLElement>('.topbar-right'));find();const observer=new MutationObserver(find);observer.observe(document.body,{childList:true,subtree:true});return()=>observer.disconnect()},[]);
 if(!target||!isTauriDesktop())return null;
 const run=async()=>{if(busy)return;setBusy(true);setMessage('Scanning…');try{await rescanLibrary();setMessage('Finding metadata…');const matched=await autoMatchMetadata();setMessage(matched?`Added content · ${matched} metadata matches`:'Library up to date');sessionStorage.removeItem('onyx-live-guide');window.setTimeout(()=>window.location.reload(),850)}catch(c){setMessage(String(c));setBusy(false);window.setTimeout(()=>setMessage(''),3500)}};
 return createPortal(<div className="quick-library-wrap"><button className="quick-library-refresh" title="Rescan libraries and match missing metadata" aria-label="Rescan libraries and find missing metadata" disabled={busy} onClick={()=>void run()}><RefreshCw size={14} className={busy?'spin':''}/></button>{message&&<span className="quick-library-status">{message}</span>}</div>,target);
}
