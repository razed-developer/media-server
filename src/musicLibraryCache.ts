import { getActiveUserId, getIbroadcastLibrary, getIbroadcastStatus, syncIbroadcast } from './api';
import type { IbConnectionStatus, IbLibrary } from './types';

export type MusicLibrarySnapshot={status:IbConnectionStatus;library:IbLibrary};
const emptyLibrary:IbLibrary={tracks:[],albums:[],artists:[],playlists:[]};
const snapshots=new Map<string,MusicLibrarySnapshot>();
const pending=new Map<string,Promise<MusicLibrarySnapshot>>();

export function getPreloadedMusicLibrary(userId=getActiveUserId()){
 return snapshots.get(userId);
}

export async function preloadMusicLibrary(userId=getActiveUserId(),force=false):Promise<MusicLibrarySnapshot>{
 if(!force){
  const cached=snapshots.get(userId);
  if(cached)return cached;
  const existing=pending.get(userId);
  if(existing)return existing;
 }
 const request=(async()=>{
  const status=await getIbroadcastStatus();
  let library=emptyLibrary;
  if(status.connected){
   library=force?await syncIbroadcast():await getIbroadcastLibrary();
   if(!library.tracks.length&&force)library=await syncIbroadcast();
  }
  const snapshot={status,library};
  snapshots.set(userId,snapshot);
  return snapshot;
 })();
 pending.set(userId,request);
 try{return await request}finally{if(pending.get(userId)===request)pending.delete(userId)}
}

export function updatePreloadedMusicLibrary(snapshot:MusicLibrarySnapshot,userId=getActiveUserId()){
 snapshots.set(userId,snapshot);
}
