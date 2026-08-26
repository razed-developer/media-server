import { Camera, Frown, Ghost, Heart, Music2, Radio, Rocket, Smile, Trophy } from 'lucide-react';
import { resolveMediaUrl } from '../../../api';
import type { LiveChannel } from '../../../types';

export const CHANNEL_ART_OPTIONS=[
  {id:'smile',label:'Comedy',Icon:Smile},{id:'frown',label:'Drama',Icon:Frown},{id:'camera',label:'Documentary',Icon:Camera},
  {id:'music',label:'Musical',Icon:Music2},{id:'knife',label:'Horror',Icon:null},{id:'ghost',label:'Supernatural',Icon:Ghost},
  {id:'rocket',label:'Science fiction',Icon:Rocket},{id:'heart',label:'Romance',Icon:Heart},{id:'sports',label:'Sports',Icon:Trophy},{id:'radio',label:'General',Icon:Radio},
] as const;

function Knife({size=42}:{size?:number}){return <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true"><path fill="currentColor" d="M39 5c-7 3-14 8-20 15l6 6c7-6 12-13 15-20l-1-1ZM17 22l9 9-4 4-3-3-9 10-4-4 10-9-3-3 4-4Z"/></svg>}

export function ChannelArtwork({channel,className='',fallback=true}:{channel:LiveChannel;className?:string;fallback?:boolean}){
  if(channel.artUrl)return <img className={className} src={resolveMediaUrl(channel.artUrl)} alt=""/>;
  const option=CHANNEL_ART_OPTIONS.find(value=>value.id===(channel.artIcon??'radio'))??CHANNEL_ART_OPTIONS[9];const Icon=option.Icon;
  return <span className={`channel-art-symbol ${className}`} style={{backgroundColor:channel.artColor??'#7457a6'}} aria-hidden="true">{option.id==='knife'?<Knife/>:Icon?<Icon/>:fallback?<Radio/>:null}</span>;
}
