'use client';
import {useState,type FormEvent} from 'react';
import Link from 'next/link';
import {useRouter,useSearchParams} from 'next/navigation';
import {ArrowRight,CircleAlert,Eye,EyeOff,LoaderCircle} from 'lucide-react';

/** The page an emailed reset link opens: choose a new password, then continue signed in. */
export function ResetPasswordForm(){
  const router=useRouter();const token=useSearchParams().get('token')||'';
  const [password,setPassword]=useState('');const [show,setShow]=useState(false);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');

  async function save(event:FormEvent){
    event.preventDefault();setBusy(true);setError('');
    try{
      const response=await fetch('/api/auth/reset',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token,password})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||'Unable to save the password.');
      router.replace('/dashboard?password=updated');router.refresh();
    }catch(reason){setError(reason instanceof Error?reason.message:'Unable to save the password.');}finally{setBusy(false);}
  }

  if(!token)return <div className="auth-sent error" role="alert"><CircleAlert size={28}/><h3>That link is incomplete</h3>
    <p>Open the link from the email exactly as it was sent, or request a new one.</p><small><Link href="/forgot-password">Request a new reset link</Link></small></div>;
  return <form className="auth-form" onSubmit={save}>
    <label>New password<span className="password">
      <input aria-label="New password" type={show?'text':'password'} required minLength={8} maxLength={128} autoComplete="new-password" value={password} onChange={event=>setPassword(event.target.value)} placeholder="At least 8 characters"/>
      <button type="button" aria-label={show?'Hide password':'Show password'} onClick={()=>setShow(value=>!value)}>{show?<EyeOff/>:<Eye/>}</button>
    </span></label>
    {error&&<p className="form-error" role="alert">{error}{/expired|used/.test(error)&&<> <Link href="/forgot-password">Request a new link</Link></>}</p>}
    <button className="auth-submit" disabled={busy}>{busy?<LoaderCircle className="spin"/>:<>Save new password<ArrowRight/></>}</button>
    <p className="fine">For your security, this signs you out on every other device.</p>
  </form>;
}
