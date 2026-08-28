export type RemoteCommand = 'up'|'down'|'left'|'right'|'ok'|'back'|'playPause'|'seekBack'|'seekForward'|'volumeUp'|'volumeDown'|'sleepNow'|'sleep30'|'sleep60'|'sleep120'|'wake';
export type RemoteSession = { token:string; code:string; remoteUrl:string; expiresAt:number };
export type RemoteState = { projectorConnected:boolean; controllerCount:number; sequence:number; command?:RemoteCommand; nowPlaying?:{title:string;subtitle?:string;artwork?:string;paused?:boolean;currentTime?:number;duration?:number;volume?:number;live?:boolean}; sleepUntil?:number; sleeping?:boolean };

const remoteBase=()=>`${location.protocol}//${location.hostname}:8767`;

const request=async<T>(path:string,init?:RequestInit,message='Remote request failed.'):Promise<T>=>{
  let response:Response;
  try{
    response=await fetch(`${remoteBase()}${path}`,{
      ...init,
      headers:{...((init?.headers as Record<string,string>|undefined)??{})},
    });
  }catch(error){
    throw new Error(error instanceof Error?`${message} ${error.message}`:message);
  }

  if(!response.ok){
    let detail='';
    try{detail=await response.text()}catch{}
    throw new Error(detail||`${message} (${response.status})`);
  }

  try{
    return await response.json() as T;
  }catch{
    throw new Error(`${message} The remote server returned an invalid response.`);
  }
};

export const createRemoteSession=()=>request<RemoteSession>('/api/remote/session',{method:'POST'},'Could not create remote session.');
export const getRemoteState=(token:string)=>request<RemoteState>(`/api/remote/${encodeURIComponent(token)}/state`,undefined,'Remote session unavailable.');
export const sendRemoteCommand=(token:string,command:RemoteCommand)=>request<RemoteState>(`/api/remote/${encodeURIComponent(token)}/command`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({command})},'Remote command failed.');
export const publishRemoteState=(token:string,state:Partial<RemoteState>)=>request<RemoteState>(`/api/remote/${encodeURIComponent(token)}/state`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(state)},'Could not update remote state.');
