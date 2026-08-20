import { invoke } from '@tauri-apps/api/core';
import { isTauriDesktop } from './api';

export async function addLibraryRoot(kind:'movie'|'tv', path:string):Promise<void>{
  if(!isTauriDesktop()) throw new Error('Library folders are managed from the desktop server app.');
  await invoke(kind==='movie'?'add_movie_path':'add_tv_path',{path});
}

export async function removeLibraryRoot(kind:'movie'|'tv', path:string):Promise<void>{
  if(!isTauriDesktop()) throw new Error('Library folders are managed from the desktop server app.');
  await invoke(kind==='movie'?'remove_movie_path':'remove_tv_path',{path});
}
