import { browserFetch } from '../../api/core';

export type RemoteCommand = 'up'|'down'|'left'|'right'|'ok'|'back'|'playPause'|'seekBack'|'seekForward'|'volumeUp'|'volumeDown'|'sleepNow'|'sleep30'|'sleep60'|'sleep120'|'wake';
export type RemoteSession = { token:string; code:string; remoteUrl:string; expiresAt:number };
export type RemoteState = { connected:boolean; projectorConnected:boolean; controllerCount:number; sequence:number; command?:RemoteCommand; nowPlaying?:{title:string;subtitle?:string;artwork?:string;paused?:boolean;currentTime?:number;duration?:number;volume?:number;live?:boolean}; sleepUntil?:number; sleeping?:boolean };

const parse=async<T>(response:Response,message:string):Promise<T>=>{if(!response.ok)throw new Error((await response.text().catch(()=>''))||message);return response.json() as Promise<T>};
export const createRemoteSession=()=>parse<RemoteSession>(browserFetch('/api/remote/session',{method:'POST'}),'Could not create remote session.');
export const getRemoteState=(token:string)=>parse<RemoteState>(browserFetch(`/api/remote/${encodeURIComponent(token)}/state`),'Remote session unavailable.');
export const sendRemoteCommand=(token:string,command:RemoteCommand)=>parse<RemoteState>(browserFetch(`/api/remote/${encodeURIComponent(token)}/command`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({command})}),'Remote command failed.');
export const publishRemoteState=(token:string,state:Partial<RemoteState>)=>parse<RemoteState>(browserFetch(`/api/remote/${encodeURIComponent(token)}/state`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(state)}),'Could not update remote state.');
