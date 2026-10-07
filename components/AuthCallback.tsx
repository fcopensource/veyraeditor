'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {ArrowRight,CircleAlert,Eye,EyeOff,LoaderCircle} from 'lucide-react';

/** Handles links from Supabase emails: confirms sign-up, or lets the user choose a new password after a reset. */
export function AuthCallback(){
  const router=useRouter();
  const [state,setState]=useState<'working'|'recovery'|'error'>('working');
  const [error,setError]=useState('');
  const [password,setPassword]=useState('');const [show,setShow]=useState(false);const [busy,setBusy]=useState(false);
  const handled=useRef(false);

  useEffect(()=>{
    if(handled.current)return;handled.current=true; // the link's tokens are single-use
    const hash=new URLSearchParams(location.hash.slice(1));
    const query=new URLSearchParams(location.search);
    const problem=hash.get('error_description')||query.get('error_description');
    // Tokens live in the URL fragment; remove them from the address bar and history straight away.
    history.replaceState(null,'',location.pathname);
    if(problem){setError(problem.replace(/\+/g,' '));setState('error');return;}
    const accessToken=hash.get('access_token');
    if(!accessToken){setError('This link is incomplete or has already been used.');setState('error');return;}
    fetch('/api/auth/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accessToken,refreshToken:hash.get('refresh_token'),expiresIn:hash.get('expires_in')})})
      .then(async response=>{const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||'This link has expired.');
        if(hash.get('type')==='recovery')setState('recovery');else{router.replace('/dashboard?welcome=1');router.refresh();}})
      .catch(reason=>{setError(reason instanceof Error?reason.message:'This link has expired.');setState('error');});
  },[router]);

  async function save(event:FormEvent){
    event.preventDefault();setBusy(true);setError('');
    try{
      const response=await fetch('/api/auth/password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password})});
      const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||'Unable to save the password.');
      router.replace('/dashboard?password=updated');router.refresh();
    }catch(reason){setError(reason instanceof Error?reason.message:'Unable to save the password.');}finally{setBusy(false);}
  }

  if(state==='working')return <p className="auth-working"><LoaderCircle className="spin"/>Verifying your link…</p>;
  if(state==='error')return <div className="auth-sent error" role="alert"><CircleAlert size={28}/><h3>That link didn't work</h3><p>{error}</p>
    <small><Link href="/forgot-password">Request a new reset link</Link> · <Link href="/login">Log in</Link></small></div>;
  return <form className="auth-form" onSubmit={save}>
    <p className="form-notice" role="status">Your identity is confirmed. Choose a new password.</p>
    <label>New password<span className="password">
      <input aria-label="New password" type={show?'text':'password'} required minLength={8} maxLength={72} autoComplete="new-password" value={password} onChange={event=>setPassword(event.target.value)} placeholder="At least 8 characters"/>
      <button type="button" aria-label={show?'Hide password':'Show password'} onClick={()=>setShow(value=>!value)}>{show?<EyeOff/>:<Eye/>}</button>
    </span></label>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <button className="auth-submit" disabled={busy}>{busy?<LoaderCircle className="spin"/>:<>Save new password<ArrowRight/></>}</button>
  </form>;
}
