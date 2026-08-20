import { ImagePlus, UserRound } from 'lucide-react';
import { BUILTIN_AVATARS, chooseCustomAvatar, setBuiltinUserAvatar, setCustomUserAvatar, type UserAvatar } from '../userFeaturesApi';
import '../userFeatures.css';

const glyphs:Record<string,string>={onyx:'◆',moon:'☾',ember:'✦',wave:'≈',forest:'▲',violet:'✺',sun:'☀',ice:'✧'};

export function AvatarBadge({avatar,name,size='md'}:{avatar?:UserAvatar;name:string;size?:'sm'|'md'|'lg'}){
 const cls=`user-avatar avatar-${avatar?.avatarId??'onyx'} avatar-${size}`;
 if(avatar?.avatarId==='custom'&&avatar.customUrl)return <span className={cls}><img src={avatar.customUrl} alt=""/></span>;
 return <span className={cls} aria-hidden="true">{glyphs[avatar?.avatarId??'onyx']??name.slice(0,1).toUpperCase()||<UserRound size={18}/>}</span>;
}

export function UserAvatarPicker({userId,name,avatar,onChanged}:{userId:string;name:string;avatar?:UserAvatar;onChanged:(avatar:UserAvatar)=>void}){
 const chooseBuiltin=async(id:string)=>onChanged(await setBuiltinUserAvatar(userId,id));
 const chooseCustom=async()=>{const path=await chooseCustomAvatar();if(path)onChanged(await setCustomUserAvatar(userId,path));};
 return <div className="avatar-picker"><div className="avatar-current"><AvatarBadge avatar={avatar} name={name} size="lg"/><div><strong>{name}</strong><span>Profile avatar</span></div></div><div className="avatar-grid">{BUILTIN_AVATARS.map(id=><button key={id} className={avatar?.avatarId===id?'active':''} title={id} aria-label={`Use ${id} avatar`} onClick={()=>void chooseBuiltin(id)}><AvatarBadge avatar={{userId,avatarId:id}} name={name}/></button>)}<button className={avatar?.avatarId==='custom'?'active':''} title="Choose image" aria-label="Choose custom avatar" onClick={()=>void chooseCustom()}><span className="avatar-upload"><ImagePlus size={19}/></span></button></div></div>;
}
