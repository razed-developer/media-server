import { useEffect, useState } from 'react';
import { ImageDown } from 'lucide-react';
import { createIbroadcastLogoBlob } from '../ibroadcastLogo';
import { saveIbroadcastDeveloperLogo } from '../adminTools';

export function IbroadcastLogoKit(){
  const[preview,setPreview]=useState<string>();const[message,setMessage]=useState<string|null>(null);const[error,setError]=useState<string|null>(null);
  useEffect(()=>{let url:string|undefined;void createIbroadcastLogoBlob().then(blob=>{url=URL.createObjectURL(blob);setPreview(url)});return()=>{if(url)URL.revokeObjectURL(url)}},[]);
  const download=async()=>{setError(null);setMessage(null);try{setMessage(await saveIbroadcastDeveloperLogo())}catch(c){setError(String(c))}};
  return <div className="ibroadcast-logo-kit">{preview?<img src={preview} width={128} height={128} alt="Onyx 128 by 128 iBroadcast developer logo"/>:<div className="logo-preview-placeholder">O</div>}<div><strong>Onyx iBroadcast app logo</strong><p>This is the exact <strong>128×128 PNG</strong> required when registering your developer app with iBroadcast.</p><button type="button" onClick={()=>void download()}><ImageDown size={16}/>Save 128×128 PNG</button>{message&&<p className="download-confirmation">{message}</p>}{error&&<p className="provider-error">{error}</p>}</div></div>;
}
