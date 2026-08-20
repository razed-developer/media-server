import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { isTauriDesktop } from './api';

export interface SubtitleProviderStatus{configured:boolean;provider:string;account:string;}
export interface SubtitleSearchResult{fileId:number;fileName:string;language:string;release:string;hearingImpaired:boolean;downloadCount:number;}
export interface DownloadedSubtitle{fileName:string;language:string;label:string;url?:string;localPath?:string;}

export async function getSubtitleProviderStatus():Promise<SubtitleProviderStatus>{if(!isTauriDesktop())return{configured:false,provider:'OpenSubtitles',account:''};return invoke<SubtitleProviderStatus>('subtitle_provider_status');}
export async function saveSubtitleProvider(apiKey:string,username:string,password:string):Promise<void>{if(!isTauriDesktop())throw new Error('Subtitle provider setup is managed from the desktop server app.');await invoke('subtitle_provider_save',{apiKey,username,password});}
export async function clearSubtitleProvider():Promise<void>{if(!isTauriDesktop())return;await invoke('subtitle_provider_clear');}
export async function testSubtitleProvider():Promise<void>{if(!isTauriDesktop())throw new Error('Subtitle provider setup is managed from the desktop server app.');await invoke('subtitle_provider_test');}
export async function searchOnlineSubtitles(mediaId:string,language:string):Promise<SubtitleSearchResult[]>{if(!isTauriDesktop())return[];return invoke<SubtitleSearchResult[]>('subtitle_search',{mediaId,language});}
export async function downloadOnlineSubtitle(mediaId:string,fileId:number,language:string):Promise<DownloadedSubtitle>{
 if(!isTauriDesktop())throw new Error('Subtitle downloads are currently managed from the desktop server app.');
 const saved=await invoke<DownloadedSubtitle>('subtitle_download',{mediaId,fileId,language});
 if(!saved.url&&saved.localPath)saved.url=convertFileSrc(saved.localPath);
 return saved;
}
