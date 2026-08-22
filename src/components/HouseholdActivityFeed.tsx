import { useEffect, useMemo, useState } from 'react';
import { Bell, ChevronLeft, ChevronRight, CloudRain, Frown, Heart, Laugh, Plus, Sparkles, ThumbsUp } from 'lucide-react';
import { listHouseholdFeed, type HouseholdFeedEntry } from '../userFeaturesApi';
import { AvatarBadge } from './UserAvatarPicker';

const reactions:Record<string,{label:string;Icon:typeof Heart}>={
 loved:{label:'Loved it',Icon:Heart},liked:{label:'Liked it',Icon:ThumbsUp},laugh:{label:'Made me laugh',Icon:Laugh},cry:{label:'Made me cry',Icon:CloudRain},scared:{label:'Scared me',Icon:Sparkles},not_for_me:{label:'Not for me',Icon:Frown},
};
const relative=(timestamp:number)=>{const seconds=Math.max(0,Math.floor(Date.now()/1000)-timestamp);if(seconds<60)return'now';if(seconds<3600)return`${Math.floor(seconds/60)}m`;if(seconds<86400)return`${Math.floor(seconds/3600)}h`;return`${Math.floor(seconds/86400)}d`};

function FeedRow({entry}:{entry:HouseholdFeedEntry}){
 const reaction=entry.reaction?reactions[entry.reaction]:undefined;const Icon=reaction?.Icon;
 return <div className="household-feed-row"><AvatarBadge name={entry.userName} avatar={{userId:entry.userId,avatarId:entry.avatarId,customUrl:entry.customAvatarUrl}} size="sm"/><div className="household-feed-copy"><div><strong>{entry.userName}</strong><time>{relative(entry.createdAt)}</time></div>{entry.kind==='reaction'?<p>{Icon&&<Icon size={14}/>}<span>{reaction?.label??entry.reaction}</span> <em>{entry.title}</em></p>:<p><Plus size={14}/><span>requested</span> <em>{entry.title}</em></p>}</div></div>;
}

export function HouseholdActivityFeed(){
 const[home,setHome]=useState(false);const[open,setOpen]=useState(false);const[entries,setEntries]=useState<HouseholdFeedEntry[]>([]);
 useEffect(()=>{const check=()=>setHome(Boolean(document.querySelector('.home-page')));check();const timer=window.setInterval(check,500);return()=>window.clearInterval(timer)},[]);
 useEffect(()=>{if(!home)return;let dead=false;const load=()=>void listHouseholdFeed(28).then(value=>{if(!dead)setEntries(value)}).catch(()=>{});load();const timer=window.setInterval(load,30000);window.addEventListener('onyx-household-feed-changed',load);return()=>{dead=true;window.clearInterval(timer);window.removeEventListener('onyx-household-feed-changed',load)}},[home]);
 const visible=useMemo(()=>entries.slice(0,20),[entries]);
 if(!home)return null;
 return <div className={`household-feed ${open?'open':''}`}><button className="household-feed-toggle" onClick={()=>setOpen(value=>!value)} title={open?'Hide household activity':'Show household activity'}>{open?<ChevronRight size={17}/>:<><Bell size={16}/>{entries.length>0&&<span>{Math.min(entries.length,99)}</span>}<ChevronLeft size={15}/></>}</button><aside><header><div><span>HOUSEHOLD</span><h3>Activity</h3></div><button onClick={()=>setOpen(false)} aria-label="Close activity"><ChevronRight size={18}/></button></header><div className="household-feed-list">{visible.length?visible.map(entry=><FeedRow key={entry.id} entry={entry}/>):<p className="household-feed-empty">Reactions and media requests will appear here.</p>}</div></aside></div>;
}
