import { invoke } from '@tauri-apps/api/core';
import type { AuthStatus, MediaItem, ServerStatus } from './types';
export const isTauriDesktop=()=>Boolean((window as Window&{__TAURI_INTERNALS__?:unknown}).__TAURI_INTERNALS__);
export const serverBaseUrl=()=>isTauriDesktop()?'http://127.0.0.1:8765':'';
export const resolveMediaUrl=(url?:string|null)=>{if(!url)return undefined;if(/^https?:\/\//i.test(url))return url;return `${serverBaseUrl()}${url.startsWith('/')?url:`/${url}`}`;};
const browserFetch=(input:string,init?:RequestInit)=>fetch(input,{...init,credentials:'include'});
export async function getAuthStatus():Promise<AuthStatus>{if(isTauriDesktop())return{required:false,authenticated:true};const r=await browserFetch(`${serverBaseUrl()}/api/auth/status`);if(!r.ok)throw new Error(`Could not check authentication (${r.status})`);return r.json();}
export async function login(password:string):Promise<void>{if(isTauriDesktop())return;const r=await browserFetch(`${serverBaseUrl()}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password})});if(!r.ok)throw new Error(r.status===401?'Incorrect password':`Login failed (${r.status})`);}
export async function logout():Promise<void>{if(!isTauriDesktop())await browserFetch(`${serverBaseUrl()}/api/auth/logout`,{method:'POST'});}
export async function listMedia():Promise<MediaItem[]>{if(isTauriDesktop())return invoke<MediaItem[]>('list_media');const r=await browserFetch(`${serverBaseUrl()}/api/library`);if(!r.ok)throw new Error(`Could not load media library (${r.status})`);return r.json();}
export async function getServerStatus():Promise<ServerStatus>{if(isTauriDesktop())return invoke<ServerStatus>('server_status');const r=await browserFetch(`${serverBaseUrl()}/api/status`);if(!r.ok)throw new Error(`Could not reach media server (${r.status})`);const status=await r.json() as ServerStatus;return{...status,localUrl:window.location.origin};}
export async function saveProgress(id:string,seconds:number):Promise<void>{if(isTauriDesktop()){await invoke('save_progress',{id,seconds});return;}const r=await browserFetch(`${serverBaseUrl()}/api/progress/${encodeURIComponent(id)}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({seconds})});if(!r.ok)throw new Error(`Could not save playback progress (${r.status})`);}
export async function rescanLibrary():Promise<void>{if(!isTauriDesktop())throw new Error('Library rescans are managed from the desktop server app.');await invoke('scan_library');}
export async function chooseLibraryPath():Promise<string|null>{if(!isTauriDesktop())return null;const{open}=await import('@tauri-apps/plugin-dialog');const selected=await open({directory:true,multiple:false});return typeof selected==='string'?selected:null;}
export async function setLibraryPath(path:string):Promise<void>{if(!isTauriDesktop())throw new Error('Library folders are managed from the desktop server app.');await invoke('set_library_path',{path});}
export async function setMoviePath(path:string):Promise<void>{if(!isTauriDesktop())throw new Error('Movie folders are managed from the desktop server app.');await invoke('set_movie_path',{path});}
export async function setTvPath(path:string):Promise<void>{if(!isTauriDesktop())throw new Error('TV folders are managed from the desktop server app.');await invoke('set_tv_path',{path});}
export async function setAccessPassword(password:string):Promise<void>{if(!isTauriDesktop())throw new Error('Access passwords are managed from the desktop server app.');await invoke('set_access_password',{password});}
export async function clearAccessPassword():Promise<void>{if(!isTauriDesktop())throw new Error('Access passwords are managed from the desktop server app.');await invoke('clear_access_password');}
export async function clearThumbnailCache():Promise<void>{if(!isTauriDesktop())throw new Error('Artwork cache is managed from the desktop server app.');await invoke('clear_thumbnail_cache');}
