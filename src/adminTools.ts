import { invoke } from '@tauri-apps/api/core';
import type { ActivityEntry } from './types';
import { createIbroadcastLogoBlob } from './ibroadcastLogo';
import { isTauriDesktop } from './api';

export async function saveIbroadcastDeveloperLogo():Promise<string>{
  const blob=await createIbroadcastLogoBlob();
  if(isTauriDesktop()){
    const { save }=await import('@tauri-apps/plugin-dialog');
    const path=await save({defaultPath:'onyx-ibroadcast-128.png',filters:[{name:'PNG image',extensions:['png']}]});
    if(!path)return 'Save cancelled.';
    const bytes=Array.from(new Uint8Array(await blob.arrayBuffer()));
    const saved=await invoke<string>('save_ibroadcast_logo',{path,bytes});
    return `Saved the 128×128 PNG to ${saved}`;
  }
  const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='onyx-ibroadcast-128.png';document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
  return 'Downloaded onyx-ibroadcast-128.png using your browser’s configured download location.';
}

export async function activityEntries():Promise<ActivityEntry[]>{
  if(!isTauriDesktop())return[];
  return invoke<ActivityEntry[]>('activity_entries');
}
export async function clearActivity():Promise<void>{if(isTauriDesktop())await invoke('clear_activity');}
