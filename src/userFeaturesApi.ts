import { invoke } from '@tauri-apps/api/core';
import { isTauriDesktop } from './api';

export interface UserAvatar { userId:string; avatarId:string; customUrl?:string; }
export interface ReactionEntry { userId:string; userName:string; avatarId:string; customAvatarUrl?:string; reaction:string; }
export interface RecommendationEntry { id:string; fromUserId:string; fromUserName:string; targetType:'movie'|'show'; targetKey:string; title:string; posterUrl?:string; note?:string; createdAt:number; read:boolean; }

export const BUILTIN_AVATARS=['onyx','moon','ember','wave','forest','violet','sun','ice'] as const;

export async function listUserAvatars():Promise<UserAvatar[]>{
  if(!isTauriDesktop())return[];
  return invoke<UserAvatar[]>('user_avatars');
}
export async function setBuiltinUserAvatar(userId:string,avatarId:string):Promise<UserAvatar>{
  if(!isTauriDesktop())throw new Error('Avatar management is currently available from the desktop server app.');
  return invoke<UserAvatar>('user_avatar_set_builtin',{userId,avatarId});
}
export async function chooseCustomAvatar():Promise<string|null>{
  if(!isTauriDesktop())return null;
  const{open}=await import('@tauri-apps/plugin-dialog');
  const selected=await open({multiple:false,directory:false,filters:[{name:'Images',extensions:['png','jpg','jpeg','webp']}]});
  return typeof selected==='string'?selected:null;
}
export async function setCustomUserAvatar(userId:string,path:string):Promise<UserAvatar>{
  if(!isTauriDesktop())throw new Error('Avatar management is currently available from the desktop server app.');
  return invoke<UserAvatar>('user_avatar_set_custom',{userId,path});
}
export async function getReactions(targetType:'movie'|'show',targetKey:string):Promise<ReactionEntry[]>{
  if(!isTauriDesktop())return[];
  return invoke<ReactionEntry[]>('user_reactions',{targetType,targetKey});
}
export async function setReaction(userId:string,targetType:'movie'|'show',targetKey:string,reaction?:string):Promise<ReactionEntry[]>{
  if(!isTauriDesktop())throw new Error('Reactions are currently available from the desktop server app.');
  return invoke<ReactionEntry[]>('user_reaction_set',{userId,targetType,targetKey,reaction:reaction??null});
}
export async function sendRecommendation(fromUserId:string,toUserId:string,targetType:'movie'|'show',targetKey:string,title:string,posterUrl?:string,note?:string):Promise<void>{
  if(!isTauriDesktop())throw new Error('Recommendations are currently available from the desktop server app.');
  await invoke('user_recommendation_send',{fromUserId,toUserId,targetType,targetKey,title,posterUrl:posterUrl??null,note:note??null});
}
export async function listRecommendations(userId:string):Promise<RecommendationEntry[]>{
  if(!isTauriDesktop())return[];
  return invoke<RecommendationEntry[]>('user_recommendations',{userId});
}
export async function markRecommendationRead(userId:string,id:string):Promise<void>{
  if(!isTauriDesktop())return;
  await invoke('user_recommendation_mark_read',{userId,id});
}
