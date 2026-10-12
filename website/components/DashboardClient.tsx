'use client';
import {useEffect,useMemo,useState,type FormEvent} from 'react';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {
  ArrowRight,BookOpen,Check,ChevronDown,Download,FolderOpen,KeyRound,Laptop,LoaderCircle,LogOut,Monitor,Pencil,Puzzle,
  ShieldCheck,Sparkles,Trash2,UserRound,X,
} from 'lucide-react';
import {Markdown} from '@/components/Markdown';

type User={email:string;name:string;createdAt?:string;lastLoginAt?:string|null};
type Device={id:string;device:string;createdAt:string;lastUsedAt:string|null};
type Overview={user:User;ai:{used:number;limit:number;tokens:number;available:boolean};devices:Device[]};
type DownloadLink={os:string;label:string;detail:string;href:string};

const date=(value?:string|null)=>value?new Date(value).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}):'—';
function ago(value?:string|null){
  if(!value)return 'never';
  const minutes=Math.round((Date.now()-new Date(value).getTime())/60000);
  if(minutes<2)return 'just now';if(minutes<60)return `${minutes} min ago`;
  const hours=Math.round(minutes/60);if(hours<24)return `${hours} h ago`;
  const days=Math.round(hours/24);return days<30?`${days} day${days===1?'':'s'} ago`:date(value);
}
/** "Veyra Studio on macos" → "Veyra Studio on macOS". */
const deviceName=(name:string)=>name.replace(/macos/i,'macOS').replace(/windows/i,'Windows').replace(/linux/i,'Linux');
function greeting(){const h=new Date().getHours();return h<5?'Working late':h<12?'Good morning':h<18?'Good afternoon':'Good evening';}
/** Which installer fits this visitor: Windows, Apple silicon / Intel Mac, or Linux. */
function detectOs(){
  if(typeof navigator==='undefined')return '';
  const ua=navigator.userAgent;
  if(/Windows/i.test(ua))return 'windows';
  if(/Mac OS X|Macintosh/i.test(ua)){
    // Browsers report Intel even on Apple silicon; a WebGL renderer naming "Apple" means Apple silicon.
    try{const gl=document.createElement('canvas').getContext('webgl');const info=gl?.getExtension('WEBGL_debug_renderer_info');const renderer=info?String(gl!.getParameter(info.UNMASKED_RENDERER_WEBGL)):'';return /Apple M|Apple GPU/i.test(renderer)?'mac-arm':/Intel/i.test(renderer)?'mac-intel':'mac-arm';}catch{return 'mac-arm';}
  }
  if(/Linux|X11/i.test(ua)&&!/Android/i.test(ua))return 'linux';
  return '';
}

export function DashboardClient({version,publishedAt,downloads,notes}:{version:string;publishedAt:string;downloads:DownloadLink[];notes:string}){
  const params=useSearchParams();
  const [data,setData]=useState<Overview|null>(null);
  const [os,setOs]=useState('');
  const [editingName,setEditingName]=useState(false);const [name,setName]=useState('');const [nameError,setNameError]=useState('');
  const [currentPassword,setCurrentPassword]=useState('');const [password,setPassword]=useState('');const [saving,setSaving]=useState(false);const [message,setMessage]=useState<{ok:boolean;text:string}|null>(null);
  const [danger,setDanger]=useState(false);const [deletePassword,setDeletePassword]=useState('');const [deleteError,setDeleteError]=useState('');
  const [revoking,setRevoking]=useState('');

  async function load(){
    const response=await fetch('/api/account/overview',{cache:'no-store'}).catch(()=>null);
    if(response?.status===401){location.replace('/login?next=/dashboard');return;}
    const result=await response?.json().catch(()=>null) as Overview|null;
    if(result?.user){setData(result);setName(result.user.name);}
    else{
      // Older servers (or a database hiccup): fall back to the basic profile.
      const me=await fetch('/api/auth/me').then(r=>r.ok?r.json():null).catch(()=>null);
      if(me?.user)setData({user:me.user,ai:{used:0,limit:0,tokens:0,available:false},devices:[]});else location.replace('/login?next=/dashboard');
    }
  }
  useEffect(()=>{void load();setOs(detectOs());},[]);

  const primary=useMemo(()=>downloads.find(d=>d.os===os)||null,[downloads,os]);
  async function logout(){await fetch('/api/auth/logout',{method:'POST'});location.href='/';}
  async function saveName(event:FormEvent){
    event.preventDefault();setNameError('');
    const response=await fetch('/api/auth/me',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({name})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok){setNameError(result.error||'Could not save your name.');return;}
    setData(current=>current&&{...current,user:{...current.user,name:result.name}});setEditingName(false);
  }
  async function changePassword(event:FormEvent){
    event.preventDefault();setSaving(true);setMessage(null);
    try{
      const response=await fetch('/api/auth/password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({currentPassword,password})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||'Unable to change the password.');
      setCurrentPassword('');setPassword('');setMessage({ok:true,text:'Password updated. Other browsers have been signed out.'});
    }catch(reason){setMessage({ok:false,text:reason instanceof Error?reason.message:'Unable to change the password.'});}finally{setSaving(false);}
  }
  async function revoke(id:string){
    setRevoking(id);
    await fetch('/api/account/devices',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({id})}).catch(()=>null);
    setData(current=>current&&{...current,devices:current.devices.filter(d=>d.id!==id)});setRevoking('');
  }
  async function deleteAccount(event:FormEvent){
    event.preventDefault();setDeleteError('');
    const response=await fetch('/api/auth/account',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({password:deletePassword})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok){setDeleteError(result.error||'Unable to delete the account.');return;}
    location.href='/?account=deleted';
  }

  if(!data)return <div className="account"><p className="auth-working"><LoaderCircle className="spin"/>Loading your account…</p></div>;
  const {user,ai,devices}=data;
  const first=user.name.trim().split(/\s+/)[0]||'there';
  const days=user.createdAt?Math.max(1,Math.ceil((Date.now()-new Date(user.createdAt).getTime())/86400000)):1;
  const aiPercent=ai.limit?Math.min(100,Math.round(ai.used/ai.limit*100)):0;
  const steps=[
    {done:devices.length>0||ai.used>0,title:'Download and install Veyra',detail:'Native on Windows, macOS and Linux. It updates itself.',href:'/download',icon:Download},
    {done:devices.length>0,title:'Open a project',detail:'Ctrl+O (⌘O) opens any folder on your computer.',href:'/docs#first-project',icon:FolderOpen},
    {done:false,title:'Turn on language tools',detail:'Extensions → Built-in web tools: TypeScript, ESLint, Prettier…',href:'/extensions',icon:Puzzle},
    {done:devices.length>0,title:'Sign in to Veyra AI',detail:'AI panel → Veyra AI → sign in with this account.',href:'/docs#ai',icon:Sparkles},
  ];
  const doneCount=steps.filter(s=>s.done).length;
  const welcome=params.get('welcome')?'Your account is ready. Let\'s get you set up.':params.get('password')?'Your new password is saved.':'';

  return <div className="account">
    {/* Hero */}
    <section className="account-hero">
      <div className="account-hero-glow" aria-hidden="true"/>
      <div className="account-identity">
        <span className="account-avatar" aria-hidden="true">{first.slice(0,1).toUpperCase()}</span>
        <div>
          <span className="account-kicker">VEYRA ACCOUNT</span>
          <h1>{greeting()}, {first}.</h1>
          <p>{welcome||<>Member since {date(user.createdAt)} · {user.email}</>}</p>
        </div>
      </div>
      <div className="account-download">
        {primary?<a className="primary account-download-main" href={primary.href}><Download size={18}/><span><b>Download for {primary.label}</b><small>v{version} · {primary.detail}</small></span></a>
          :<Link className="primary account-download-main" href="/download"><Download size={18}/><span><b>Download Veyra</b><small>{version?`v${version} · `:''}Windows, macOS & Linux</small></span></Link>}
        <div className="account-download-others">{downloads.filter(d=>d!==primary).map(d=><a key={d.href} href={d.href}>{d.label}</a>)}</div>
      </div>
    </section>

    {/* At a glance */}
    <section className="account-stats" aria-label="At a glance">
      <div><Sparkles size={16}/><b>{ai.available?`${ai.used}/${ai.limit}`:'—'}</b><span>Veyra AI requests used</span></div>
      <div><Laptop size={16}/><b>{devices.length}</b><span>Device{devices.length===1?'':'s'} signed in</span></div>
      <div><UserRound size={16}/><b>{days}</b><span>Day{days===1?'':'s'} with Veyra</span></div>
      <div><Monitor size={16}/><b>{version?`v${version}`:'—'}</b><span>Latest{publishedAt?` · ${date(publishedAt)}`:''}</span></div>
    </section>

    <div className="account-grid">
      {/* Veyra AI */}
      <section className="account-card ai-card">
        <header><span className="account-card-icon violet"><Sparkles size={17}/></span><div><h2>Veyra AI</h2><p>Chat about your code in Veyra, no API key needed.</p></div></header>
        {ai.available?<>
          <div className="usage-ring" style={{['--p' as string]:aiPercent}}><div><b>{Math.max(0,ai.limit-ai.used)}</b><span>free left</span></div></div>
          <p className="account-fine">{ai.used} of {ai.limit} free requests used{ai.tokens?` · ${ai.tokens.toLocaleString()} tokens`:''}</p>
        </>:<p className="account-fine">Veyra AI is being switched on. You'll see your free requests here.</p>}
        <ol className="account-howto"><li>Open Veyra and click <b>Veyra AI</b> (top right)</li><li>Sign in with <b>{user.email}</b></li><li>Ask anything about your code</li></ol>
      </section>

      {/* Get started */}
      <section className="account-card">
        <header><span className="account-card-icon mint"><BookOpen size={17}/></span><div><h2>Get started</h2><p>{doneCount} of {steps.length} done</p></div></header>
        <div className="progress-bar"><i style={{width:`${doneCount/steps.length*100}%`}}/></div>
        <div className="account-steps">{steps.map(step=><Link key={step.title} href={step.href} className={'account-step'+(step.done?' done':'')}>
          <span className="step-check">{step.done?<Check size={13}/>:<step.icon size={14}/>}</span>
          <span><b>{step.title}</b><small>{step.detail}</small></span><ArrowRight size={14}/>
        </Link>)}</div>
      </section>

      {/* Devices */}
      <section className="account-card">
        <header><span className="account-card-icon blue"><Laptop size={17}/></span><div><h2>Your devices</h2><p>Where you're signed in to the Veyra app.</p></div></header>
        {devices.length?<ul className="device-list">{devices.map(device=><li key={device.id}>
          <Laptop size={16}/><span><b>{deviceName(device.device)}</b><small>Signed in {date(device.createdAt)} · active {ago(device.lastUsedAt)}</small></span>
          <button className="device-signout" disabled={revoking===device.id} onClick={()=>void revoke(device.id)} aria-label={`Sign out ${deviceName(device.device)}`}>{revoking===device.id?<LoaderCircle size={13} className="spin"/>:<X size={13}/>}Sign out</button>
        </li>)}</ul>:<p className="account-empty">No devices yet. Sign in to Veyra AI inside the app and it appears here.</p>}
      </section>

      {/* What's new */}
      <section className="account-card news-card">
        <header><span className="account-card-icon coral"><Sparkles size={17}/></span><div><h2>What's new{version?` in v${version}`:''}</h2><p>{publishedAt?`Released ${date(publishedAt)}`:'Latest release'}</p></div></header>
        <div className="account-notes">{notes?<Markdown source={notes}/>:<p className="account-empty">Release notes are on the changelog.</p>}</div>
        <Link className="text-link" href="/changelog">Full changelog <ArrowRight size={13}/></Link>
      </section>

      {/* Profile & security */}
      <section className="account-card">
        <header><span className="account-card-icon mint"><UserRound size={17}/></span><div><h2>Profile</h2><p>How you appear in Veyra.</p></div></header>
        <dl className="account-details">
          <div><dt>Name</dt><dd>{editingName?<form className="inline-form" onSubmit={saveName}><input aria-label="Your name" value={name} onChange={e=>setName(e.target.value)} maxLength={80} autoFocus/><button className="mini primary">Save</button><button type="button" className="mini" onClick={()=>{setEditingName(false);setName(user.name);setNameError('');}}>Cancel</button></form>
            :<>{user.name}<button className="icon-link" aria-label="Edit name" onClick={()=>setEditingName(true)}><Pencil size={13}/></button></>}</dd></div>
          {nameError&&<p className="form-error" role="alert">{nameError}</p>}
          <div><dt>Email</dt><dd>{user.email}</dd></div>
          <div><dt>Member since</dt><dd>{date(user.createdAt)}</dd></div>
          <div><dt>Last sign-in</dt><dd>{ago(user.lastLoginAt)}</dd></div>
        </dl>
        <button className="secondary account-logout" onClick={()=>void logout()}><LogOut size={15}/>Log out</button>
      </section>
      <section className="account-card">
        <header><span className="account-card-icon blue"><KeyRound size={17}/></span><div><h2>Security</h2><p>Change your password. Other browsers are signed out.</p></div></header>
        <form className="auth-form" onSubmit={changePassword}>
          <label>Current password<input type="password" required autoComplete="current-password" value={currentPassword} onChange={event=>setCurrentPassword(event.target.value)}/></label>
          <label>New password<input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={password} onChange={event=>setPassword(event.target.value)} placeholder="At least 8 characters"/></label>
          {message&&<p className={message.ok?'form-notice':'form-error'} role="status">{message.text}</p>}
          <button className="auth-submit" disabled={saving}>{saving?<LoaderCircle className="spin"/>:'Update password'}</button>
        </form>
        <p className="account-fine"><ShieldCheck size={13}/>Your account holds only your name and email. Your code never leaves your computer unless you send it to an AI.</p>
      </section>
    </div>

    {/* Danger zone, out of the way */}
    <section className={'account-danger'+(danger?' open':'')}>
      <button className="danger-toggle" aria-expanded={danger} onClick={()=>setDanger(v=>!v)}><Trash2 size={14}/>Delete account<ChevronDown size={14}/></button>
      {danger&&<form className="auth-form delete-form" onSubmit={deleteAccount}>
        <p>Permanently removes your account, signs out every device and stops Veyra AI. Veyra on your computer keeps working. This can't be undone.</p>
        <label>Confirm with your password<input type="password" required autoComplete="current-password" value={deletePassword} onChange={event=>setDeletePassword(event.target.value)}/></label>
        {deleteError&&<p className="form-error" role="alert">{deleteError}</p>}
        <div><button type="button" className="secondary" onClick={()=>{setDanger(false);setDeletePassword('');setDeleteError('');}}>Cancel</button><button className="danger-button">Delete my account</button></div>
      </form>}
    </section>
  </div>;
}
