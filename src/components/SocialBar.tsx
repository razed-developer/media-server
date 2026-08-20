import { useEffect, useState } from 'react';
import { MessageCircleHeart, Send } from 'lucide-react';
import type { UserProfile } from '../types';
import { getActiveUserId } from '../api';
import { getReactions, sendRecommendation, setReaction, type ReactionEntry } from '../userFeaturesApi';
import { AvatarBadge } from './UserAvatarPicker';

const choices=[
 {id:'loved',label:'Loved it',icon:'♥'},
 {id:'liked',label:'Liked it',icon:'👍'},
 {id:'laugh',label:'Made me laugh',icon:'😄'},
 {id:'cry',label:'Made me cry',icon:'🥲'},
 {id:'scared',label:'Scared me',icon:'😱'},
 {id:'not_for_me',label:'Not for me',icon:'–'},
] as const;

export function SocialBar({targetType,targetKey,title,posterUrl,users}:{targetType:'movie'|'show';targetKey:string;title:string;posterUrl?:string;users:UserProfile[]}){
 const activeUserId=getActiveUserId();
 const[reactions,setReactions]=useState<ReactionEntry[]>([]);
 const[recommendOpen,setRecommendOpen]=useState(false);
 const[message,setMessage]=useState<string|null>(null);
 const mine=reactions.find(entry=>entry.userId===activeUserId)?.reaction;
 useEffect(()=>{let dead=false;getReactions(targetType,targetKey).then(value=>{if(!dead)setReactions(value)}).catch(()=>{});return()=>{dead=true}},[targetType,targetKey]);
 const react=async(id:string)=>{const next=mine===id?undefined:id;setReactions(await setReaction(activeUserId,targetType,targetKey,next));};
 const recommend=async(toUserId:string)=>{await sendRecommendation(activeUserId,toUserId,targetType,targetKey,title,posterUrl);setRecommendOpen(false);const user=users.find(value=>value.id===toUserId);setMessage(user?`Recommended to ${user.name}`:'Recommendation sent');window.setTimeout(()=>setMessage(null),2200)};
 const others=users.filter(user=>user.id!==activeUserId);
 return <div className="social-bar"><div className="social-reactions">{choices.map(choice=><button key={choice.id} className={mine===choice.id?'active':''} title={choice.label} aria-label={choice.label} onClick={()=>void react(choice.id)}><span>{choice.icon}</span>{choice.label}</button>)}</div>{reactions.filter(entry=>entry.userId!==activeUserId).length>0&&<div className="social-household" title="Household reactions">{reactions.filter(entry=>entry.userId!==activeUserId).map(entry=><AvatarBadge key={entry.userId} name={entry.userName} avatar={{userId:entry.userId,avatarId:entry.avatarId,customUrl:entry.customAvatarUrl,customPath:entry.customAvatarPath}} size="sm"/>)}</div>}{others.length>0&&<div className="social-recommend"><button title="Recommend" onClick={()=>setRecommendOpen(value=>!value)}><Send size={15}/>Recommend</button>{recommendOpen&&<div className="social-popover"><div className="context-label">Recommend to</div>{others.map(user=><button key={user.id} onClick={()=>void recommend(user.id)}><MessageCircleHeart size={16}/>{user.name}</button>)}</div>}</div>}{message&&<span className="social-toast">{message}</span>}</div>;
}
