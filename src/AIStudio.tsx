import {useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {ArrowUp,Check,Code2,Copy,FileCode2,FolderSearch,LogOut,MessageSquare,Plus,Sparkles,Square,UserRound,X} from 'lucide-react';
import {openUrl} from '@tauri-apps/plugin-opener';
import {accountChanged} from './AccountButton';
import {isSensitivePath,looksLikeSecret} from './privacy';
export type AISnapshot={root:string;path:string;original:string;start:number;end:number;content:string};
export type AIProposal={snapshot:AISnapshot;replacement:string;model:string};
type Message={role:'user'|'assistant';content:string;display?:string;proposal?:AIProposal};
type ContextFile={path:string;content:string;score:number};
type VeyraAccount={name:string;email:string;used:number;limit:number;available:boolean};
const SITE='https://veyraeditor.com';
const MODEL='Veyra AI';
/** Veyra AI is the only AI: answered on veyraeditor.com, with a fixed number of free requests per account. */
export function AIStudio({root,active,visible,onClose,capture,onReview,intent}:{root:string;active:string;visible:boolean;onClose:()=>void;capture:(scope:string)=>AISnapshot|null;onReview:(proposal:AIProposal)=>void;intent:number}){
  const [account,setAccount]=useState<VeyraAccount|null>(null);const [checked,setChecked]=useState(false);
  const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [signing,setSigning]=useState(false);
  const [prompt,setPrompt]=useState('');const [mode,setMode]=useState<'ask'|'edit'>('ask');const [scope,setScope]=useState('none');
  const [messages,setMessages]=useState<Message[]>([]);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const [copied,setCopied]=useState<number|null>(null);const input=useRef<HTMLTextAreaElement>(null);const list=useRef<HTMLDivElement>(null);
  const confirmedSensitive=useRef('');
  const request=useRef('');const generation=useRef(0);const alive=useRef(true);
  const left=account?Math.max(0,account.limit-account.used):0;
  const outOfRequests=!!account&&account.available&&left===0;
  function reset(){generation.current++;if(request.current)void invoke('ai_cancel',{id:request.current}).catch(()=>{});request.current='';setBusy(false);setMessages([]);setError('');}
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;if(request.current)void invoke('ai_cancel',{id:request.current}).catch(()=>{});};},[]);
  useEffect(()=>{reset();setScope('none');},[root]);
  useEffect(()=>setScope('none'),[active]);
  useEffect(()=>{if(intent){setMode('edit');setScope('selection');input.current?.focus();}},[intent]);
  useEffect(()=>{if(visible)input.current?.focus();},[visible]);
  useEffect(()=>{list.current?.scrollTo({top:list.current.scrollHeight,behavior:'smooth'});},[messages,busy]);
  useEffect(()=>{void loadAccount();},[]);
  /** The signed-in account and its free requests (null when signed out). */
  async function loadAccount(){
    try{const result=await invoke<VeyraAccount|null>('veyra_account');if(alive.current)setAccount(result??null);return !!result;}
    catch(e){if(alive.current)setError(String(e));return false;}
    finally{if(alive.current)setChecked(true);}
  }
  async function signIn(){
    setSigning(true);setError('');
    try{const result=await invoke<VeyraAccount>('veyra_sign_in',{email,password});setAccount(result);setPassword('');accountChanged();}
    catch(e){setError(String(e));}finally{setSigning(false);}
  }
  async function signOut(){
    setError('');
    try{await invoke('veyra_sign_out');reset();setAccount(null);accountChanged();}catch(e){setError(String(e));}
  }
  async function send(){
    if(request.current||!prompt.trim()||!account)return;
    if(outOfRequests){setError(`You've used all ${account.limit} free Veyra AI requests.`);return;}
    let snapshot:AISnapshot|null=null;
    let contextFiles:ContextFile[]=[];
    if(scope==='workspace'){
      if(mode==='edit'){setError('Workspace context is available in Ask mode. Choose the current file or a selection for reviewed edits.');return;}
      try{contextFiles=await invoke<ContextFile[]>('ai_workspace_context',{query:prompt.trim(),active});}
      catch(e){setError(String(e));return;}
    }else if(scope!=='none'){snapshot=capture(scope);if(!snapshot){setError(scope==='selection'?'Select some code in the editor first.':'Open a code file to attach it.');return;}}
    if(mode==='edit'&&!snapshot){setError('Attach the current file or selected code to request an edit.');return;}
    // Secrets never go to a cloud provider by accident: the first Send explains, a second Send confirms.
    if(snapshot&&(isSensitivePath(snapshot.path)||looksLikeSecret(snapshot.content))&&confirmedSensitive.current!==snapshot.path+':'+snapshot.content.length){
      confirmedSensitive.current=snapshot.path+':'+snapshot.content.length;
      setError(`${snapshot.path} looks like it contains secrets (keys, tokens or credentials). It would be sent to Veyra AI. Press Send again to send it anyway, or attach something else.`);return;
    }
    confirmedSensitive.current='';
    if(snapshot&&new TextEncoder().encode(snapshot.content).length>48000){setError('This attachment is too large. Select a smaller block of code (48 KB maximum).');return;}
    const instruction=mode==='edit'?`Edit the attached ${scope==='selection'?'selection':'file'} as requested. Return its COMPLETE replacement in ONE fenced code block. Preserve unrelated code.\n\n`:'';
    const workspaceContext=contextFiles.length?`\n\nRelevant workspace context selected by Veyra:\n${contextFiles.map(file=>`<file path="${file.path}">\n${file.content}\n</file>`).join('\n')}`:'';
    const contextLabel=contextFiles.length?`\n↳ Smart context · ${contextFiles.map(file=>file.path).join(', ')}`:'';
    const content=instruction+prompt.trim()+(snapshot?`\n\nAttached ${scope} — ${snapshot.path}:\n<source>\n${snapshot.content}\n</source>`:'')+workspaceContext;
    const next:Message[]=[...messages,{role:'user',content,display:prompt.trim()+(snapshot?`\n↳ ${snapshot.path} · ${scope}`:'')+contextLabel}];
    if(next.length>22){setError('Start a new chat to keep Veyra AI focused.');return;}
    const revision=generation.current;const id=crypto.randomUUID();request.current=id;setBusy(true);setError('');setPrompt('');setMessages(next);
    const requestedMode=mode;
    try{
      const answer=await invoke<string>('ai_chat',{id,messages:next.map(({role,content})=>({role,content}))});
      if(!alive.current||revision!==generation.current||request.current!==id)return;
      const blocks=[...answer.matchAll(/```[^\n]*\n([\s\S]*?)\n?```/g)];
      const proposal=requestedMode==='edit'&&snapshot&&blocks.length===1?{snapshot,replacement:blocks[0][1],model:MODEL}:undefined;
      setMessages([...next,{role:'assistant',content:answer,proposal}]);void loadAccount();
      if(requestedMode==='edit'&&!proposal)setError('The response did not contain one complete code block. Ask Veyra AI for a single replacement before applying.');
    }catch(e){if(alive.current&&revision===generation.current){setError(String(e));setMessages(messages);setPrompt(next.at(-1)?.display?.split('\n↳')[0]||'');void loadAccount();}}
    finally{if(request.current===id){request.current='';if(alive.current)setBusy(false);}}
  }
  async function stop(){if(!request.current)return;try{await invoke('ai_cancel',{id:request.current});}catch(e){setError(String(e));}}
  const usage=account&&account.available?<div className="veyra-account ai-account-bar">
        <div className="veyra-account-head"><span className="veyra-avatar"><UserRound size={16}/></span><span><b>{account.name||'Signed in'}</b><small>{account.email}</small></span><button type="button" title="Sign out of Veyra AI" aria-label="Sign out of Veyra AI" onClick={()=>void signOut()}><LogOut size={13}/></button></div>
        <div className="veyra-usage" role="meter" aria-label="Free Veyra AI requests used" aria-valuemin={0} aria-valuemax={account.limit} aria-valuenow={account.used}><i style={{width:`${Math.min(100,account.limit?account.used/account.limit*100:0)}%`}}/></div>
        <p className="ai-fine">{left} of {account.limit} free requests left. Your code goes to Veyra AI only when you send a message.</p>
      </div>:null;
  return <aside className={'ai-studio '+(!visible?'ai-hidden':'')} aria-label="AI assistant">
    <header className="ai-header"><span className="ai-brand"><Sparkles size={16}/><b>Veyra AI</b><small>BETA</small></span><div><button title="New AI chat" aria-label="New AI chat" onClick={reset}><Plus size={16}/></button><button title="Close AI" aria-label="Close AI" onClick={onClose}><X size={15}/></button></div></header>
    {checked&&!account&&<section className="ai-settings"><form className="veyra-signin" onSubmit={e=>{e.preventDefault();void signIn();}}>
        <h3>Sign in to Veyra AI</h3>
        <p>Use your free Veyra account. Every account includes free Veyra AI requests, with no API key needed.</p>
        <label>Email<input aria-label="Veyra account email" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label>
        <label>Password<input aria-label="Veyra account password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
        <button className="secondary" type="submit" disabled={signing||!email.trim()||!password}>{signing?'Signing in…':'Sign in to Veyra AI'}</button>
        <p className="ai-fine">No account? <button type="button" className="link-button" onClick={()=>void openUrl(SITE+'/register').catch(()=>{})}>Create one free on veyraeditor.com</button></p>
      </form></section>}
    {account&&!account.available&&<p className="ai-fine ai-notice">Veyra AI isn&apos;t switched on yet. Please check back soon.</p>}
    {usage}
    <div className="ai-messages" ref={list} aria-live="polite">
      {!messages.length&&<div className="ai-welcome"><div className="ai-orb"><Sparkles size={28}/></div><span className="ai-eyebrow">A SECOND PAIR OF EYES</span><h2>Think it.<br/>Build it.</h2><p>Talk through an idea, understand your code, or review a suggested change.</p><div className="ai-starters"><button onClick={()=>{setMode('ask');setScope('workspace');setPrompt('Explain how this project is structured and identify the most important files.');input.current?.focus();}}><FolderSearch size={15}/><span>Explore this workspace<small>Find relevant files automatically</small></span></button><button onClick={()=>{setMode('ask');setScope(active?'file':'none');setPrompt('Explain this code and suggest what to improve.');input.current?.focus();}}><MessageSquare size={15}/><span>Understand this file<small>Explain the important parts</small></span></button><button onClick={()=>{setMode('edit');setScope(active?'file':'none');setPrompt('Improve readability while preserving behavior.');input.current?.focus();}}><Code2 size={15}/><span>Make a thoughtful edit<small>Review every change first</small></span></button></div></div>}
      {messages.map((message,i)=><article className={'ai-message '+message.role} key={i}><div className="ai-message-label">{message.role==='user'?'You':'Veyra AI'}{message.role==='assistant'&&<button aria-label="Copy AI response" onClick={()=>navigator.clipboard.writeText(message.content).then(()=>setCopied(i)).catch(()=>setError('Could not copy. Select the response text to copy it.'))}>{copied===i?<Check size={12}/>:<Copy size={12}/>}</button>}</div><pre>{message.display||message.content}</pre>{message.proposal&&<button className="ai-review-button" onClick={()=>onReview(message.proposal!)}><FileCode2 size={14}/>Review proposed edit</button>}</article>)}
      {busy&&<div className="ai-thinking" role="status"><i/><span>Veyra AI is thinking…</span></div>}
    </div>
    {error&&<div className="ai-error" role="alert">{error}<button aria-label="Dismiss AI error" onClick={()=>setError('')}><X size={12}/></button></div>}
    <form className="ai-composer" onSubmit={e=>{e.preventDefault();void send();}}>
      <div className="ai-compose-tabs"><button type="button" className={mode==='ask'?'active':''} disabled={busy} onClick={()=>setMode('ask')}><MessageSquare size={12}/>Ask</button><button type="button" className={mode==='edit'?'active':''} disabled={busy} onClick={()=>setMode('edit')}><Code2 size={12}/>Edit</button><kbd>⌘↵</kbd></div>
      <label className="ai-context"><FileCode2 size={13}/><select aria-label="AI attachment" value={scope} disabled={busy} onChange={e=>setScope(e.target.value)}><option value="none">No file attached</option><option value="workspace">Smart workspace context</option><option value="file" disabled={!active}>Current file{active?' · '+active.split('/').pop():''}</option><option value="selection" disabled={!active}>Selected code</option></select></label>
      <textarea ref={input} aria-label="Ask Veyra AI" value={prompt} maxLength={8000} onChange={e=>setPrompt(e.target.value)} placeholder={mode==='edit'?'Describe the change you want…':'Ask anything about your code…'} onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();void send();}}}/>
      <div className="ai-compose-footer"><span className="ai-model-name"><Sparkles size={12}/>Veyra AI{account&&account.available?` · ${left} left`:''}</span>{busy?<button type="button" className="ai-send" aria-label="Stop AI request" onClick={()=>void stop()}><Square size={14}/></button>:<button className="ai-send" aria-label="Send to AI" disabled={!prompt.trim()||!account||!account.available||outOfRequests}><ArrowUp size={17}/></button>}</div>
      <p className="ai-transmission">{outOfRequests?`You've used all ${account!.limit} free Veyra AI requests.`:`Sends this chat${scope==='none'?'':` + ${scope}`} to Veyra AI. Edits require review.`}</p>
    </form>
  </aside>;
}
