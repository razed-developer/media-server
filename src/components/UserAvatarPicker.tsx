import { convertFileSrc } from '@tauri-apps/api/core';
import { ImagePlus } from 'lucide-react';
import onyxMark from '../../logos/app-icon.png';
import { BUILTIN_AVATARS, chooseCustomAvatar, setBuiltinUserAvatar, setCustomUserAvatar, type UserAvatar } from '../userFeaturesApi';
import '../userFeatures.css';

const avatarLabels:Record<string,string>={
 onyx:'Slate',
 moon:'Dusk blue',
 ember:'Muted clay',
 wave:'Coastal teal',
 forest:'Soft sage',
 violet:'Dusty violet',
 sun:'Warm ochre',
 ice:'Cool mist'
};

export function AvatarBadge({avatar,name,size='md'}:{avatar?:UserAvatar;name:string;size?:'sm'|'md'|'lg'}){
 const id=avatar?.avatarId??'onyx';
 const cls=`user-avatar avatar-${id} avatar-${size}`;
 const customSrc=id==='custom'?(avatar?.customPath?convertFileSrc(avatar.customPath):avatar?.customUrl):undefined;
 if(customSrc)return <span className={cls}><img src={customSrc} alt=""/></span>;
 return <span className={cls} aria-hidden="true"><img className="onyx-avatar-mark" src={onyxMark} alt=""/></span>;
}

export function UserAvatarPicker({userId,name,avatar,onChanged}:{userId:string;name:string;avatar?:UserAvatar;onChanged:(avatar:UserAvatar)=>void}){
 const chooseBuiltin=async(id:string)=>onChanged(await setBuiltinUserAvatar(userId,id));
 const chooseCustom=async()=>{const path=await chooseCustomAvatar();if(path)onChanged(await setCustomUserAvatar(userId,path));};
 return <div className="avatar-picker"><div className="avatar-current"><AvatarBadge avatar={avatar} name={name} size="lg"/><div><strong>{name}</strong><span>Profile avatar</span></div></div><div className="avatar-grid">{BUILTIN_AVATARS.map(id=>{const label=avatarLabels[id]??id;return <button key={id} className={avatar?.avatarId===id?'active':''} title={label} aria-label={`Use ${label} Onyx avatar`} onClick={()=>void chooseBuiltin(id)}><AvatarBadge avatar={{userId,avatarId:id}} name={name}/></button>})}<button className={avatar?.avatarId==='custom'?'active':''} title="Choose image" aria-label="Choose custom avatar" onClick={()=>void chooseCustom()}><span className="avatar-upload"><ImagePlus size={19}/></span></button></div></div>;
}
