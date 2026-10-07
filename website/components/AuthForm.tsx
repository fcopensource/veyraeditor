'use client';
import {useState,type FormEvent} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import Link from 'next/link';
import {ArrowRight,Download,Eye,EyeOff,Info,LoaderCircle,MailCheck} from 'lucide-react';

type Mode='login'|'register'|'forgot';

/** Only same-site paths are allowed as a post-login destination. */
const safeNext=(value:string|null)=>value&&value.startsWith('/')&&!value.startsWith('//')?value:'/dashboard';

function strength(password:string){
  let score=0;
  if(password.length>=8)score++;if(password.length>=12)score++;
  if(/[a-z]/.test(password)&&/[A-Z]/.test(password))score++;if(/\d/.test(password))score++;if(/[^A-Za-z0-9]/.test(password))score++;
  return Math.min(4,score);
}
const strengthLabel=['Too short','Weak','Okay','Good','Strong'];

export function AuthForm({mode,configured}:{mode:Mode;configured:boolean}){
  const router=useRouter();const params=useSearchParams();
  const [show,setShow]=useState(false);const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');const [sent,setSent]=useState('');const [password,setPassword]=useState('');
  const next=safeNext(params.get('next'));

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy)return;
    setBusy(true);setError('');
    const body=Object.fromEntries(new FormData(event.currentTarget));
    try{
      const response=await fetch('/api/auth/'+mode,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||'Something went wrong. Please try again.');
      if(mode==='forgot'){setSent(String(body.email));return;}
      router.push(next);router.refresh();
    }catch(reason){setError(reason instanceof Error?reason.message:'Something went wrong. Please try again.');}
    finally{setBusy(false);}
  }

  if(!configured)return <div className="auth-unavailable" role="status">
    <Info size={18}/>
    <div><b>Accounts are opening soon.</b><p>You don't need an account to use Veyra. Downloads are free and the app works fully offline.</p>
      <Link className="auth-submit" href="/download"><Download/>Download Veyra</Link></div>
  </div>;

  if(sent)return <div className="auth-sent" role="status">
    <MailCheck size={28}/>
    <h3>Check your inbox</h3>
    <p>If an account exists for <b>{sent}</b>, we've sent a link to choose a new password. It expires in one hour.</p>
    <small>Nothing there? Check your spam folder, or <button type="button" onClick={()=>setSent('')}>try again</button>.</small>
  </div>;

  const level=strength(password);
  return <form className="auth-form" onSubmit={submit} noValidate={false}>
    {params.get('expired')&&mode==='login'&&<p className="form-notice" role="status">Your session ended. Please log in again.</p>}
    {mode==='register'&&<label>Full name<input name="name" required minLength={2} maxLength={80} autoComplete="name" placeholder="Ada Lovelace"/></label>}
    <label>Email address<input name="email" type="email" required autoComplete="email" inputMode="email" placeholder="you@example.com"/></label>
    {mode!=='forgot'&&<label>
      <span className="label-row">Password{mode==='login'&&<Link href="/forgot-password">Forgot password?</Link>}</span>
      <span className="password">
        <input name="password" aria-label="Password" type={show?'text':'password'} required minLength={mode==='register'?8:1} maxLength={128} value={password} onChange={event=>setPassword(event.target.value)} autoComplete={mode==='login'?'current-password':'new-password'} placeholder={mode==='register'?'At least 8 characters':'Your password'}/>
        <button type="button" aria-label={show?'Hide password':'Show password'} onClick={()=>setShow(value=>!value)}>{show?<EyeOff/>:<Eye/>}</button>
      </span>
      {mode==='register'&&password&&<span className={'strength s'+level} aria-live="polite"><i/><i/><i/><i/><em>{strengthLabel[level]}</em></span>}
    </label>}
    {error&&<p className="form-error" role="alert">{error}</p>}
    <button className="auth-submit" disabled={busy}>{busy?<LoaderCircle className="spin"/>:<>{mode==='login'?'Log in':mode==='register'?'Create account':'Send reset link'}<ArrowRight/></>}</button>
    {mode==='register'&&<p className="fine">By creating an account you agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.</p>}
    <p>{mode==='login'?<>New to Veyra? <Link href="/register">Create an account</Link></>
      :mode==='register'?<>Already have an account? <Link href="/login">Log in</Link></>
      :<>Remembered it? <Link href="/login">Back to log in</Link></>}</p>
  </form>;
}
