import { createContext, useContext, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';

export type PromptOptions={title:string;message?:string;label?:string;defaultValue?:string;placeholder?:string;type?:'text'|'password'|'number';confirmLabel?:string;};
export type ConfirmOptions={title:string;message:string;confirmLabel?:string;cancelLabel?:string;danger?:boolean;};
type DialogState=
 |({kind:'prompt'}&PromptOptions)
 |({kind:'confirm'}&ConfirmOptions)
 |null;

type DialogApi={prompt:(options:PromptOptions)=>Promise<string|null>;confirm:(options:ConfirmOptions)=>Promise<boolean>;};
const Context=createContext<DialogApi|null>(null);

export function OnyxDialogProvider({children}:{children:ReactNode}){
 const[state,setState]=useState<DialogState>(null);const[value,setValue]=useState('');
 const resolver=useRef<((value:string|null|boolean)=>void)|null>(null);
 const finish=(result:string|null|boolean)=>{resolver.current?.(result);resolver.current=null;setState(null)};
 const api:DialogApi={
  prompt:options=>new Promise(resolve=>{resolver.current=resolve;setValue(options.defaultValue??'');setState({kind:'prompt',...options})}),
  confirm:options=>new Promise(resolve=>{resolver.current=resolve;setState({kind:'confirm',...options})}),
 };
 const submit=(event:FormEvent)=>{event.preventDefault();if(state?.kind==='prompt')finish(value)};
 return <Context.Provider value={api}>{children}{state&&<div className="onyx-dialog-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)finish(state.kind==='confirm'?false:null)}}><form className="onyx-dialog" onSubmit={submit} role="dialog" aria-modal="true" aria-label={state.title}><p className="eyebrow">ONYX</p><h2>{state.title}</h2>{state.message&&<p className="onyx-dialog-message">{state.message}</p>}{state.kind==='prompt'&&<label><span>{state.label??'Value'}</span><input autoFocus type={state.type??'text'} value={value} placeholder={state.placeholder} onChange={event=>setValue(event.target.value)} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();finish(null)}}}/></label>}<div className="onyx-dialog-actions"><button type="button" onClick={()=>finish(state.kind==='confirm'?false:null)}>{state.kind==='confirm'?(state.cancelLabel??'Cancel'):'Cancel'}</button><button type="submit" className={`${state.kind==='confirm'&&state.danger?'danger':''} primary`} onClick={state.kind==='confirm'?event=>{event.preventDefault();finish(true)}:undefined}>{state.confirmLabel??(state.kind==='prompt'?'Save':'Continue')}</button></div></form></div>}</Context.Provider>;
}

export function useOnyxDialog(){const value=useContext(Context);if(!value)throw new Error('useOnyxDialog must be used inside OnyxDialogProvider');return value;}
