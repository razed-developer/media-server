import { invoke } from '@tauri-apps/api/core';
import { isTauriDesktop } from './api';
import type { MetadataSearchResult } from './types';

export type SocialTargetType='movie'|'show'|'episode';
export interface UserAvatar { userId:string; avatarId:string; customUrl?:string; customPath?:string; }
export interface ReactionEntry { userId:string; userName:string; avatarId:string; customAvatarUrl?:string; customAvatarPath?:string; reaction:string; }
export interface RecommendationEntry { id:string; fromUserId:string; fromUserName:string; targetType:SocialTargetType; targetKey:string; title:string; posterUrl?:string; note?:string; createdAt:number; read:boolean; }
export interface WishlistEntry { id:string; userId:string; userName:string; mediaType:'movie'|'series'; provider:string; providerId:string; title:string; year?:number; posterUrl?:string; overview?:string; status:'requested'|'approved'|'declined'|'added'; requestedAt:number; }

export const BUILTIN_AVATARS=['onyx','moon','ember','wave','forest','violet','sun','ice'] as const;
export async function listUserAvatars():Promise<UserAvatar[]>{if(!isTauriDesktop())return[];return invoke<UserAvatar[]>('user_avatars');}
export async function setBuiltinUserAvatar(userId:string,avatarId:string):Promise<UserAvatar>{if(!isTauriDesktop())throw new Error('Avatar management is currently available from the desktop server app.');return invoke<UserAvatar>('user_avatar_set_builtin',{userId,avatarId});}
export async function chooseCustomAvatar():Promise<string|null>{if(!isTauriDesktop())return null;const{open}=await import('@tauri-apps/plugin-dialog');const selected=await open({multiple:false,directory:false,filters:[{name:'Images',extensions:['png','jpg','jpeg','webp']}]});return typeof selected==='string'?selected:null;}
export async function setCustomUserAvatar(userId:string,path:string):Promise<UserAvatar>{if(!isTauriDesktop())throw new Error('Avatar management is currently available from the desktop server app.');return invoke<UserAvatar>('user_avatar_set_custom',{userId,path});}
export async function getReactions(targetType:SocialTargetType,targetKey:string):Promise<ReactionEntry[]>{if(!isTauriDesktop())return[];return invoke<ReactionEntry[]>('user_reactions',{targetType,targetKey});}
export async function setReaction(userId:string,targetType:SocialTargetType,targetKey:string,reaction?:string):Promise<ReactionEntry[]>{if(!isTauriDesktop())throw new Error('Reactions are currently available from the desktop server app.');return invoke<ReactionEntry[]>('user_reaction_set',{userId,targetType,targetKey,reaction:reaction??null});}
export async function sendRecommendation(fromUserId:string,toUserId:string,targetType:SocialTargetType,targetKey:string,title:string,posterUrl?:string,note?:string):Promise<void>{if(!isTauriDesktop())throw new Error('Recommendations are currently available from the desktop server app.');await invoke('user_recommendation_send',{fromUserId,toUserId,targetType,targetKey,title,posterUrl:posterUrl??null,note:note??null});}
export async function listRecommendations(userId:string):Promise<RecommendationEntry[]>{if(!isTauriDesktop())return[];return invoke<RecommendationEntry[]>('user_recommendations',{userId});}
export async function markRecommendationRead(userId:string,id:string):Promise<void>{if(!isTauriDesktop())return;await invoke('user_recommendation_mark_read',{userId,id});}
export async function searchWishlistTmdb(kind:'movie'|'series',query:string):Promise<MetadataSearchResult[]>{if(!isTauriDesktop())return[];return invoke<MetadataSearchResult[]>('user_wishlist_search',{kind,query});}
export async function addWishlistItem(userId:string,item:MetadataSearchResult):Promise<void>{if(!isTauriDesktop())throw new Error('Wishlist changes are currently available from the desktop server app.');await invoke('user_wishlist_add',{userId,item});}
export async function listWishlist(userId:string,household=false):Promise<WishlistEntry[]>{if(!isTauriDesktop())return[];return invoke<WishlistEntry[]>('user_wishlist_list',{userId,household});}
export async function setWishlistStatus(adminUserId:string,id:string,status:'requested'|'approved'|'declined'):Promise<void>{if(!isTauriDesktop())throw new Error('Wishlist administration is currently available from the desktop server app.');await invoke('user_wishlist_set_status',{adminUserId,id,status});}
