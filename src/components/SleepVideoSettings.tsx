import { useEffect, useState } from 'react';
import { FolderOpen, Trash2 } from 'lucide-react';
import { configureSleepVideos, getSleepVideos, isTauriDesktop } from '../api';
import type { SleepVideoStatus } from '../types';

export function SleepVideoSettings(){
 const[status,setStatus]=useState<SleepVideoStatus|null>(null);const[error,setError]=useState<string|null>(null);
 useEffect(()=>{if(isTauriDesktop())void getSleepVideos().then(setStatus).catch(c=>setError(String(c)))},[]);
 if(!isTauriDesktop())return null;
 const choose=async()=>{const{open}=await import('@tauri-apps/plugin-dialog');const path=await open({directory:true,multiple:false,title:'Choose sleep video folder'});if(typeof path!=='string')return;try{const value=await configureSleepVideos(path);setStatus(value);setError(null);window.dispatchEvent(new Event('onyx-sleep-videos-changed'))}catch(c){setError(String(c))}};
 const clear=async()=>{try{const value=await configureSleepVideos();setStatus(value);setError(null);window.dispatchEvent(new Event('onyx-sleep-videos-changed'))}catch(c){setError(String(c))}};
 return <div className="settings-card sleep-video-settings"><div><h3>Sleep-mode videos</h3><p>Choose a folder of MP4, M4V, MOV, WebM, or OGV videos. Onyx plays them muted in random order while the calm sleep audio continues.</p></div>{error&&<div className="error-banner">{error}</div>}<div className="caption-path-row"><code title={status?.folder}>{status?.folder??'No video folder selected — the generated star field will be used.'}</code><button onClick={()=>void choose()}><FolderOpen size={16}/>Choose folder</button>{status?.folder&&<button className="danger-text" onClick={()=>void clear()}><Trash2 size={16}/>Clear</button>}</div>{status?.folder&&<small>{status.videos.length} supported video{status.videos.length===1?'':'s'} found, including subfolders.</small>}</div>;
}
