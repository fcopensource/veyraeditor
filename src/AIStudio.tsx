import {useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {ArrowUp,Check,ChevronDown,Code2,Copy,FileCode2,FolderSearch,KeyRound,MessageSquare,Plus,RefreshCw,Settings2,ShieldCheck,Sparkles,Square,Trash2,X} from 'lucide-react';
import {isMac,isWindows} from './platform';
export type AISnapshot={root:string;path:string;original:string;start:number;end:number;content:string};
export type AIProposal={snapshot:AISnapshot;replacement:string;model:string};
type Config={kind:string;endpoint:string};
type Message={role:'user'|'assistant';content:string;display?:string;proposal?:AIProposal};
type ContextFile={path:string;content:string;score:number};
type KeyStatus={kind:string;source:string;env:string;persisted:boolean};
/** Providers the native side knows about; the endpoint only matters for "custom". */
const PROVIDERS:{kind:string;label:string;name:string;endpoint:string;env?:string;model?:string}[]=[
  {kind:'ollama',label:'Ollama · local',name:'Ollama on this computer',endpoint:'http://127.0.0.1:11434'},
  {kind:'anthropic',label:'Anthropic · Claude',name:'Anthropic',endpoint:'https://api.anthropic.com/v1',env:'ANTHROPIC_API_KEY',model:'claude-opus-5-5'},
  {kind:'openai',label:'OpenAI',name:'OpenAI',endpoint:'https://api.openai.com/v1',env:'OPENAI_API_KEY'},
  {kind:'gemini',label:'Google Gemini',name:'Google Gemini',endpoint:'https://generativelanguage.googleapis.com/v1beta/openai',env:'GEMINI_API_KEY'},
  {kind:'openrouter',label:'OpenRouter',name:'OpenRouter',endpoint:'https://openrouter.ai/api/v1',env:'OPENROUTER_API_KEY'},
  {kind:'groq',label:'Groq',name:'Groq',endpoint:'https://api.groq.com/openai/v1',env:'GROQ_API_KEY'},
  {kind:'mistral',label:'Mistral',name:'Mistral',endpoint:'https://api.mistral.ai/v1',env:'MISTRAL_API_KEY'},
  {kind:'deepseek',label:'DeepSeek',name:'DeepSeek',endpoint:'https://api.deepseek.com/v1',env:'DEEPSEEK_API_KEY'},
  {kind:'xai',label:'xAI · Grok',name:'xAI',endpoint:'https://api.x.ai/v1',env:'XAI_API_KEY'},
  {kind:'together',label:'Together AI',name:'Together AI',endpoint:'https://api.together.xyz/v1',env:'TOGETHER_API_KEY'},
  {kind:'custom',label:'Compatible API',name:'',endpoint:'http://127.0.0.1:1234/v1'},
];
const info=(kind:string)=>PROVIDERS.find(p=>p.kind===kind)||PROVIDERS[0];
const vaultName=isWindows?'Windows Credential Manager':isMac?'macOS Keychain':'your system keyring';
function describe(status:KeyStatus|null){
  if(!status||status.source==='none')return '';
  if(status.source==='keychain')return `Saved in ${vaultName}`;
  if(status.source==='environment')return `Using ${status.env} from your environment`;
  if(status.source.startsWith('session-only'))return 'Connected for this session only: the system credential store was unavailable';
  return 'Connected for this session';
}
function saved(){try{return JSON.parse(localStorage.getItem('veyra.ai.settings')||'{}');}catch{return {};}}
export function AIStudio({root,active,visible,onClose,capture,onReview,intent}:{root:string;active:string;visible:boolean;onClose:()=>void;capture:(scope:string)=>AISnapshot|null;onReview:(proposal:AIProposal)=>void;intent:number}){
  const initial=useRef(saved());
  const [config,setConfig]=useState<Config>({kind:initial.current.kind||'ollama',endpoint:initial.current.endpoint||info(initial.current.kind||'ollama').endpoint});
  const [model,setModel]=useState<string>(initial.current.model||'');const [models,setModels]=useState<string[]>([]);
  const [key,setKey]=useState('');const [keyStatus,setKeyStatus]=useState<KeyStatus|null>(null);const keyReady=!!keyStatus&&keyStatus.source!=='none';const [keyList,setKeyList]=useState<KeyStatus[]>([]);const [settings,setSettings]=useState(false);
  const [prompt,setPrompt]=useState('');const [mode,setMode]=useState<'ask'|'edit'>('ask');const [scope,setScope]=useState('none');
  const [messages,setMessages]=useState<Message[]>([]);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [loading,setLoading]=useState(false);const [connected,setConnected]=useState(false);
  const [copied,setCopied]=useState<number|null>(null);const input=useRef<HTMLTextAreaElement>(null);const list=useRef<HTMLDivElement>(null);
  const request=useRef('');const generation=useRef(0);const alive=useRef(true);const loadingRef=useRef(false);
  const local=config.kind==='ollama'||(config.kind==='custom'&&/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?=[:/]|$)/.test(config.endpoint));
  const destination=config.kind==='custom'?config.endpoint:info(config.kind).name;
  function reset(){generation.current++;if(request.current)void invoke('ai_cancel',{id:request.current}).catch(()=>{});request.current='';setBusy(false);setMessages([]);setError('');}
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;if(request.current)void invoke('ai_cancel',{id:request.current}).catch(()=>{});};},[]);
  useEffect(()=>{reset();setScope('none');},[root]);
  useEffect(()=>setScope('none'),[active]);
  useEffect(()=>{if(intent){setMode('edit');setScope('selection');input.current?.focus();}},[intent]);
  useEffect(()=>{if(visible)input.current?.focus();},[visible]);
  useEffect(()=>{list.current?.scrollTo({top:list.current.scrollHeight,behavior:'smooth'});},[messages,busy]);
  useEffect(()=>{localStorage.setItem('veyra.ai.settings',JSON.stringify({...config,model}));},[config,model]);
  async function refresh(){
    if(loadingRef.current)return;loadingRef.current=true;setLoading(true);setError('');setConnected(false);
    const revision=generation.current;
    try{const result=await invoke<string[]>('ai_models',{config});if(!alive.current||revision!==generation.current)return;
      if(!Array.isArray(result))throw new Error('Model list unavailable. Open model settings and reconnect.');
      setModels(result);setConnected(true);const preferred=info(config.kind).model;if(!model&&result.length)setModel(preferred&&result.includes(preferred)?preferred:result[0]);if(!result.length)setError(config.kind==='ollama'?'No local models found. In Terminal, run: ollama pull qwen2.5-coder:3b':'No models returned. Enter a supported chat model ID manually.');
    }catch(e){if(alive.current&&revision===generation.current)setError(String(e));}finally{loadingRef.current=false;if(alive.current)setLoading(false);}
  }
  // Keys load in the background: the native side checks this session, the OS credential store, then environment variables.
  async function loadKeyStatus(target:Config=config){
    try{const status=await invoke<KeyStatus|null>('ai_key_status',{config:target});setKeyStatus(status&&status.source?status:null);return !!status&&status.source!=='none';}
    catch{setKeyStatus(null);return false;}
  }
  async function loadKeyList(){try{const list=await invoke<KeyStatus[]|null>('ai_key_statuses');setKeyList(Array.isArray(list)?list:[]);}catch{setKeyList([]);}}
  useEffect(()=>{void (async()=>{const ready=config.kind!=='ollama'&&await loadKeyStatus();if(config.kind==='ollama'||ready)void refresh();})();},[]);
  useEffect(()=>{if(settings)void loadKeyList();},[settings]);
  function provider(kind:string){
    reset();const next={kind,endpoint:info(kind).endpoint};setConfig(next);setModels([]);setModel('');setKey('');setKeyStatus(null);setConnected(false);setSettings(true);
    if(kind!=='ollama')void loadKeyStatus(next);
  }
  async function connect(){
    setError('');
    try{
      const status=await invoke<KeyStatus|null>('ai_set_key',{config,key});setKey('');
      if(status&&status.source)setKeyStatus(status);else setKeyStatus(key?{kind:config.kind,source:'session',env:'',persisted:false}:null);
      void loadKeyList();await refresh();
    }catch(e){setError(String(e));}
  }
  async function forget(){
    setError('');
    try{const status=await invoke<KeyStatus|null>('ai_set_key',{config,key:''});setKeyStatus(status&&status.source?status:null);setConnected(false);setModels([]);void loadKeyList();}
    catch(e){setError(String(e));}
  }
  async function send(){
    if(request.current||!prompt.trim()||!model.trim())return;
    let snapshot:AISnapshot|null=null;
    let contextFiles:ContextFile[]=[];
    if(scope==='workspace'){
      if(mode==='edit'){setError('Workspace context is available in Ask mode. Choose the current file or a selection for reviewed edits.');return;}
      try{contextFiles=await invoke<ContextFile[]>('ai_workspace_context',{query:prompt.trim(),active});}
      catch(e){setError(String(e));return;}
    }else if(scope!=='none'){snapshot=capture(scope);if(!snapshot){setError(scope==='selection'?'Select some code in the editor first.':'Open a code file to attach it.');return;}}
    if(mode==='edit'&&!snapshot){setError('Attach the current file or selected code to request an edit.');return;}
    if(snapshot&&new TextEncoder().encode(snapshot.content).length>48000){setError('This attachment is too large. Select a smaller block of code (48 KB maximum).');return;}
    const instruction=mode==='edit'?`Edit the attached ${scope==='selection'?'selection':'file'} as requested. Return its COMPLETE replacement in ONE fenced code block. Preserve unrelated code.\n\n`:'';
    const workspaceContext=contextFiles.length?`\n\nRelevant workspace context selected by Veyra:\n${contextFiles.map(file=>`<file path="${file.path}">\n${file.content}\n</file>`).join('\n')}`:'';
    const contextLabel=contextFiles.length?`\n↳ Smart context · ${contextFiles.map(file=>file.path).join(', ')}`:'';
    const content=instruction+prompt.trim()+(snapshot?`\n\nAttached ${scope} — ${snapshot.path}:\n<source>\n${snapshot.content}\n</source>`:'')+workspaceContext;
    const next:Message[]=[...messages,{role:'user',content,display:prompt.trim()+(snapshot?`\n↳ ${snapshot.path} · ${scope}`:'')+contextLabel}];
    if(next.length>22){setError('Start a new chat to keep the model context focused.');return;}
    const revision=generation.current;const id=crypto.randomUUID();request.current=id;setBusy(true);setError('');setPrompt('');setMessages(next);
    const requestedModel=model;const requestedMode=mode;
    try{
      const answer=await invoke<string>('ai_chat',{config,model:requestedModel,id,messages:next.map(({role,content})=>({role,content}))});
      if(!alive.current||revision!==generation.current||request.current!==id)return;
      const blocks=[...answer.matchAll(/```[^\n]*\n([\s\S]*?)\n?```/g)];
      const proposal=requestedMode==='edit'&&snapshot&&blocks.length===1?{snapshot,replacement:blocks[0][1],model:requestedModel}:undefined;
      setConnected(true);setMessages([...next,{role:'assistant',content:answer,proposal}]);
      if(requestedMode==='edit'&&!proposal)setError('The response did not contain one complete code block. Ask the model for a single replacement before applying.');
    }catch(e){if(alive.current&&revision===generation.current){setError(String(e));setMessages(messages);setPrompt(next.at(-1)?.display?.split('\n↳')[0]||'');}}
    finally{if(request.current===id){request.current='';if(alive.current)setBusy(false);}}
  }
  async function stop(){if(!request.current)return;try{await invoke('ai_cancel',{id:request.current});}catch(e){setError(String(e));}}
  return <aside className={'ai-studio '+(!visible?'ai-hidden':'')} aria-label="AI assistant">
    <header className="ai-header"><span className="ai-brand"><Sparkles size={16}/><b>Veyra AI</b><small>BETA</small></span><div><button title="New AI chat" aria-label="New AI chat" onClick={reset}><Plus size={16}/></button><button title="Model settings" aria-label="Model settings" onClick={()=>setSettings(!settings)}><Settings2 size={15}/></button><button title="Close AI" aria-label="Close AI" onClick={onClose}><X size={15}/></button></div></header>
    <div className="ai-modelbar"><select aria-label="AI provider" value={config.kind} disabled={busy||loading} onChange={e=>provider(e.target.value)}>{PROVIDERS.map(p=><option key={p.kind} value={p.kind}>{p.label}</option>)}</select><span className={'ai-connection '+(connected?'online':'')}>{connected?'Connected':'Not connected'}</span></div>
    {settings&&<section className="ai-settings"><h3>Choose your intelligence</h3><p>Switch models without leaving your workspace.</p>
      {config.kind==='custom'&&<label>API base URL<input aria-label="AI API base URL" disabled={busy||loading} value={config.endpoint} onChange={e=>{reset();setConfig({...config,endpoint:e.target.value});setKeyStatus(null);setConnected(false);setModels([]);}} placeholder="https://provider.example/v1"/></label>}
      {config.kind!=='ollama'&&<><label>API key<input aria-label="AI API key" type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} placeholder={keyReady?'Paste a new key to replace the current one':'Paste your provider API key'}/></label>
        {keyReady&&<p className="ai-key-state"><ShieldCheck size={13}/>{describe(keyStatus)}{keyStatus?.persisted&&<button type="button" title="Remove the saved key" aria-label="Remove saved API key" onClick={()=>void forget()}><Trash2 size={12}/></button>}</p>}
        <p className="ai-fine">Keys are encrypted in {vaultName} and load automatically in the background, like VS Code secrets. They are never written to your project or browser storage.{info(config.kind).env?` Veyra also picks up ${info(config.kind).env} from your environment.`:''}</p>
        <button className="secondary" disabled={busy||loading||(!key&&!keyReady)} onClick={()=>void connect()}>{loading?'Connecting…':'Connect provider'}</button></>}
      {config.kind==='ollama'&&<div className="ai-local-help"><span>Runs on this computer</span><code>ollama serve</code><code>ollama pull qwen2.5-coder:3b</code><p>Download another Ollama model, then refresh this list.</p></div>}
      <button className="secondary" disabled={busy||loading} onClick={()=>void refresh()}><RefreshCw size={13}/>{loading?'Loading models…':'Refresh models'}</button>
      <label>Model ID<input aria-label="AI model ID" disabled={busy} value={model} onChange={e=>{reset();setModel(e.target.value);}} placeholder="Choose from the list or enter a chat model ID"/></label>
      <p className="ai-fine">Cloud providers need your own API account and may charge per request. Compatible APIs must support text chat completions.</p>
      <div className="ai-keys"><h4><KeyRound size={13}/>API keys</h4>{keyList.map(item=><button key={item.kind} className={item.kind===config.kind?'active':''} disabled={busy||loading} onClick={()=>item.kind!==config.kind&&provider(item.kind)}><span>{info(item.kind).label}</span><i className={item.source==='none'?'':'ready'}>{item.source==='none'?'Not set':item.source==='environment'?item.env:'Saved'}</i></button>)}</div>
    </section>}
    <div className="ai-messages" ref={list} aria-live="polite">
      {!messages.length&&<div className="ai-welcome"><div className="ai-orb"><Sparkles size={28}/></div><span className="ai-eyebrow">A SECOND PAIR OF EYES</span><h2>Think it.<br/>Build it.</h2><p>Talk through an idea, understand your code, or review a suggested change.</p><div className="ai-starters"><button onClick={()=>{setMode('ask');setScope('workspace');setPrompt('Explain how this project is structured and identify the most important files.');input.current?.focus();}}><FolderSearch size={15}/><span>Explore this workspace<small>Find relevant files automatically</small></span></button><button onClick={()=>{setMode('ask');setScope(active?'file':'none');setPrompt('Explain this code and suggest what to improve.');input.current?.focus();}}><MessageSquare size={15}/><span>Understand this file<small>Explain the important parts</small></span></button><button onClick={()=>{setMode('edit');setScope(active?'file':'none');setPrompt('Improve readability while preserving behavior.');input.current?.focus();}}><Code2 size={15}/><span>Make a thoughtful edit<small>Review every change first</small></span></button></div></div>}
      {messages.map((message,i)=><article className={'ai-message '+message.role} key={i}><div className="ai-message-label">{message.role==='user'?'You':'Veyra AI'}{message.role==='assistant'&&<button aria-label="Copy AI response" onClick={()=>navigator.clipboard.writeText(message.content).then(()=>setCopied(i)).catch(()=>setError('Could not copy. Select the response text to copy it.'))}>{copied===i?<Check size={12}/>:<Copy size={12}/>}</button>}</div><pre>{message.display||message.content}</pre>{message.proposal&&<button className="ai-review-button" onClick={()=>onReview(message.proposal!)}><FileCode2 size={14}/>Review proposed edit</button>}</article>)}
      {busy&&<div className="ai-thinking" role="status"><i/><span>{model} is thinking…</span></div>}
    </div>
    {error&&<div className="ai-error" role="alert">{error}<button aria-label="Dismiss AI error" onClick={()=>setError('')}><X size={12}/></button></div>}
    <form className="ai-composer" onSubmit={e=>{e.preventDefault();void send();}}>
      <div className="ai-compose-tabs"><button type="button" className={mode==='ask'?'active':''} disabled={busy} onClick={()=>setMode('ask')}><MessageSquare size={12}/>Ask</button><button type="button" className={mode==='edit'?'active':''} disabled={busy} onClick={()=>setMode('edit')}><Code2 size={12}/>Edit</button><kbd>⌘↵</kbd></div>
      <label className="ai-context"><FileCode2 size={13}/><select aria-label="AI attachment" value={scope} disabled={busy} onChange={e=>setScope(e.target.value)}><option value="none">No file attached</option><option value="workspace">Smart workspace context</option><option value="file" disabled={!active}>Current file{active?' · '+active.split('/').pop():''}</option><option value="selection" disabled={!active}>Selected code</option></select></label>
      <textarea ref={input} aria-label="Ask Veyra AI" value={prompt} maxLength={8000} onChange={e=>setPrompt(e.target.value)} placeholder={mode==='edit'?'Describe the change you want…':'Ask anything about your code…'} onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();void send();}}}/>
      <div className="ai-compose-footer"><div className="ai-model-select"><select aria-label="AI model" value={model} disabled={busy} onChange={e=>{reset();setModel(e.target.value);}}><option value="">Select model</option>{model&&!models.includes(model)&&<option value={model}>{model}</option>}{models.map(m=><option key={m} value={m}>{m}</option>)}</select><ChevronDown size={12}/></div>{busy?<button type="button" className="ai-send" aria-label="Stop AI request" onClick={()=>void stop()}><Square size={14}/></button>:<button className="ai-send" aria-label="Send to AI" disabled={!prompt.trim()||!model.trim()}><ArrowUp size={17}/></button>}</div>
      <p className="ai-transmission">{local?'Local':'Cloud'} · Sends this chat{scope==='none'?'':` + ${scope}`} to {destination}. Edits require review.</p>
    </form>
  </aside>;
}
