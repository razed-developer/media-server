import { useEffect, useState } from 'react';
import { MessageCircleHeart } from 'lucide-react';
import { markRecommendationRead, listRecommendations, type RecommendationEntry } from '../../../userFeaturesApi';
import { resolveMediaUrl } from '../../../api';

export function RecommendationsRail({userId,onOpen}:{userId:string;onOpen:(entry:RecommendationEntry)=>void}){
 const[entries,setEntries]=useState<RecommendationEntry[]>([]);
 useEffect(()=>{let dead=false;listRecommendations(userId).then(value=>{if(!dead)setEntries(value)}).catch(()=>{});return()=>{dead=true}},[userId]);
 if(!entries.length)return null;
 const open=async(entry:RecommendationEntry)=>{if(!entry.read){await markRecommendationRead(userId,entry.id);setEntries(current=>current.map(value=>value.id===entry.id?{...value,read:true}:value))}if(entry.targetType==='episode'){window.dispatchEvent(new CustomEvent('onyx-open-library-item',{detail:{targetKey:entry.targetKey,title:entry.title}}));return}onOpen(entry)};
 return <section className="home-rail recommendations-rail"><div className="rail-heading"><h2>Recommended for you</h2></div><div className="rail-scroll">{entries.slice(0,12).map(entry=><button className={`recommendation-card ${entry.read?'':'unread'}`} key={entry.id} onClick={()=>void open(entry)}>{entry.posterUrl?<img src={resolveMediaUrl(entry.posterUrl)} alt=""/>:<span className="recommendation-placeholder"><MessageCircleHeart size={30}/></span>}<strong>{entry.title}</strong><small>{entry.fromUserName}</small>{entry.note&&<p>{entry.note}</p>}</button>)}</div></section>;
}
