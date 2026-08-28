import { useEffect,useState } from 'react';
import { ArrowDown,ArrowLeft,ArrowRight,ArrowUp,ChevronLeft,Pause,Play,RotateCcw,RotateCw,Volume1,Volume2,Moon,Sunrise } from 'lucide-react';
import { getRemoteState,sendRemoteCommand,type RemoteCommand,type RemoteState } from './remoteApi';

const tokenFromPath=()=>decodeURIComponent(location.pathname.match(/^\/remote\/([^/]+)/)?.[1]??'');
const time=(seconds=0)=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
export function isPhoneRemoteRoute(){return Boolean(tokenFromPath())}
export function RemotePage(){const token=tokenFromPath();const[state,setState]=useState<RemoteState|null>(null);const[error,setError]=useState('');const[busy,setBusy]=useState(false);
 const refresh=async()=>{try{setState(await getRemoteState(token));setError('')}catch(c){setError(String(c))}};
 useEffect(()=>{void refresh();const timer=window.setInterval(()=>void refresh(),900);return()=>clearInterval(timer)},[token]);
 const command=async(value:RemoteCommand)=>{if(busy)return;setBusy(true);try{setState(await sendRemoteCommand(token,value));setError('')}catch(c){setError(String(c))}finally{setBusy(false)}};
 const playing=state?.nowPlaying;const pct=playing?.duration?Math.min(100,(playing.currentTime??0)/playing.duration*100):0;
 return <main className="phone-remote"><header><span className="remote-brand">ONYX</span><span className={`remote-status ${state?.projectorConnected?'online':''}`}>{state?.projectorConnected?'Projector connected':'Waiting for projector'}</span></header>{error&&<div className="remote-error">{error}</div>}
 <section className="remote-now"><p>NOW PLAYING</p>{playing?.artwork&&<img src={playing.artwork} alt=""/>}<div><h1>{playing?.title??'Nothing playing'}</h1>{playing?.subtitle&&<h2>{playing.subtitle}</h2>}{playing?.duration&&<><div className="remote-progress"><i style={{width:`${pct}%`}}/></div><small>{time(playing.currentTime)} / {time(playing.duration)}</small></>}</div></section>
 <section className="remote-transport"><button onClick={()=>void command('seekBack')}><RotateCcw/><span>10</span></button><button className="remote-play" onClick={()=>void command('playPause')}>{playing?.paused?<Play/>:<Pause/>}</button><button onClick={()=>void command('seekForward')}><RotateCw/><span>10</span></button></section>
 <section className="remote-pad" aria-label="Navigation"><button className="up" onClick={()=>void command('up')}><ArrowUp/></button><button className="left" onClick={()=>void command('left')}><ArrowLeft/></button><button className="ok" onClick={()=>void command('ok')}>OK</button><button className="right" onClick={()=>void command('right')}><ArrowRight/></button><button className="down" onClick={()=>void command('down')}><ArrowDown/></button></section>
 <button className="remote-back" onClick={()=>void command('back')}><ChevronLeft/> Back</button>
 <section className="remote-volume"><h3>Volume</h3><div><button onClick={()=>void command('volumeDown')}><Volume1/>−</button><button onClick={()=>void command('volumeUp')}><Volume2/>+</button></div></section>
 <section className="remote-sleep"><h3>Sleep Timer</h3><div><button onClick={()=>void command('sleepNow')}><Moon/>Now</button><button onClick={()=>void command('sleep30')}>30m</button><button onClick={()=>void command('sleep60')}>1h</button><button onClick={()=>void command('sleep120')}>2h</button>{state?.sleeping&&<button onClick={()=>void command('wake')}><Sunrise/>Wake</button>}</div></section>
 <section className="remote-browse"><h3>Browse Library</h3><p>Full second-screen browsing is the next remote phase.</p><button disabled>Browse Onyx — coming next</button></section></main>}
