'use client';
import {useEffect,useState,type FormEvent} from 'react';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {BadgeCheck,Download,Github,KeyRound,LoaderCircle,LogOut,Mail,ShieldCheck,Sparkles} from 'lucide-react';

type User={email:string;name:string;createdAt?:string;confirmedAt?:string|null;lastSignInAt?:string};
type DownloadLink={os:string;label:string;href:string};
const date=(value?:string|null)=>value?new Date(value).toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'}):'—';

export function DashboardClient({version,downloads}:{version:string;downloads:DownloadLink[]}){
  const params=useSearchParams();
  const [user,setUser]=useState<User|null>(null);
  const [password,setPassword]=useState('');const [saving,setSaving]=useState(false);const [message,setMessage]=useState<{ok:boolean;text:string}|null>(null);

  useEffect(()=>{
    fetch('/api/auth/me').then(response=>response.ok?response.json():null).then(data=>{
      if(data?.user)setUser(data.user);else location.replace('/login?next=/dashboard');
    }).catch(()=>location.replace('/login?next=/dashboard'));
  },[]);

  async function logout(){await fetch('/api/auth/logout',{method:'POST'});location.href='/';}
  async function changePassword(event:FormEvent){
    event.preventDefault();setSaving(true);setMessage(null);
    try{
      const response=await fetch('/api/auth/password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||'Unable to change the password.');
      setPassword('');setMessage({ok:true,text:'Password updated.'});
    }catch(reason){setMessage({ok:false,text:reason instanceof Error?reason.message:'Unable to change the password.'});}finally{setSaving(false);}
  }

  if(!user)return <div className="dashboard"><p className="auth-working"><LoaderCircle className="spin"/>Loading your account…</p></div>;
  const first=user.name.split(' ')[0];
  return <div className="dashboard">
    <div className="page-head">
      <span>VEYRA ACCOUNT</span>
      <h1>{first?`Hello, ${first}.`:'Your workspace.'}</h1>
      <p>{params.get('welcome')?'Your email is confirmed and your account is ready.':params.get('password')?'Your new password is saved.':'Everything for your Veyra preview, in one place.'}</p>
    </div>
    <div className="dashboard-grid">
      <section className="dashboard-card wide">
        <header><Download size={18}/><h2>Download Veyra{version&&<small>v{version}</small>}</h2></header>
        <p>Installed copies update themselves, so you only need to download once.</p>
        <div className="download-links">{downloads.length?downloads.map(item=><a key={item.href} href={item.href}><b>{item.os}</b><span>{item.label}</span></a>)
          :<Link className="secondary" href="/download">See all downloads</Link>}</div>
      </section>
      <section className="dashboard-card">
        <header><BadgeCheck size={18}/><h2>Account</h2></header>
        <dl>
          <div><dt>Name</dt><dd>{user.name||'—'}</dd></div>
          <div><dt><Mail size={13}/>Email</dt><dd>{user.email}</dd></div>
          <div><dt>Status</dt><dd>{user.confirmedAt?<span className="ok">Verified</span>:'Awaiting confirmation'}</dd></div>
          <div><dt>Member since</dt><dd>{date(user.createdAt)}</dd></div>
        </dl>
        <button className="secondary" onClick={()=>void logout()}><LogOut size={15}/>Log out</button>
      </section>
      <section className="dashboard-card">
        <header><KeyRound size={18}/><h2>Change password</h2></header>
        <form className="auth-form" onSubmit={changePassword}>
          <label>New password<input type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={password} onChange={event=>setPassword(event.target.value)} placeholder="At least 8 characters"/></label>
          {message&&<p className={message.ok?'form-notice':'form-error'} role="status">{message.text}</p>}
          <button className="auth-submit" disabled={saving}>{saving?<LoaderCircle className="spin"/>:'Update password'}</button>
        </form>
      </section>
      <section className="dashboard-card">
        <header><Sparkles size={18}/><h2>What's new</h2></header>
        <p>Command palette 2.0, search & replace across files, searchable settings and smoother macOS installs.</p>
        <Link className="secondary" href="/changelog">Read the changelog</Link>
      </section>
      <section className="dashboard-card">
        <header><ShieldCheck size={18}/><h2>Your privacy</h2></header>
        <p>Your account holds only your name and email. Veyra never uploads your code; AI requests go only where you send them.</p>
        <a className="secondary" href="https://github.com/fcopensource/veyraeditor"><Github size={15}/>View the source</a>
      </section>
    </div>
  </div>;
}
