'use client';
import {useState,type FormEvent} from 'react';
import {ArrowRight,CheckCircle2,LoaderCircle} from 'lucide-react';
import {BUDGETS,SERVICES,TIMELINES} from '@/lib/leads';

/** The FlightCoders "work with us" form. Posts to /api/leads; the answers stay put if sending fails. */
export function LeadForm(){
  const [state,setState]=useState<'idle'|'sending'|'sent'>('idle');
  const [error,setError]=useState<{message:string;field?:string}|null>(null);
  const [name,setName]=useState('');

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(state==='sending')return;
    const data=Object.fromEntries(new FormData(event.currentTarget).entries());
    const params=new URLSearchParams(window.location.search);
    const source=[document.referrer&&!document.referrer.includes(window.location.host)?`from ${new URL(document.referrer).host}`:'',params.get('utm_source')?`utm ${params.get('utm_source')}`:'',window.location.pathname].filter(Boolean).join(' · ');
    setState('sending');setError(null);setName(String(data.name||'').split(' ')[0]);
    try{
      const response=await fetch('/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,source})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok){setError({message:result.error||'Something went wrong. Please try again.',field:result.field});setState('idle');
        if(result.field)(document.getElementById('lead-'+result.field) as HTMLElement|null)?.focus();return;}
      setState('sent');
    }catch{setError({message:'We could not reach the server. Check your connection and try again.'});setState('idle');}
  }

  if(state==='sent')return <div className="lead-done" role="status">
    <CheckCircle2 size={40}/>
    <h3>Thanks{name?`, ${name}`:''}! Your message is in.</h3>
    <p>A real person from FlightCoders will reply within one business day. We&apos;ve sent you a copy by email.</p>
  </div>;

  const invalid=(field:string)=>error?.field===field?{'aria-invalid':true,'aria-describedby':'lead-error'}:{};
  return <form className="lead-form" onSubmit={submit} onChange={()=>{if(error)setError(null);}} noValidate>
    <div className="lead-row">
      <label>Your name<input id="lead-name" name="name" autoComplete="name" required maxLength={100} placeholder="Priya Sharma" {...invalid('name')}/></label>
      <label>Work email<input id="lead-email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="priya@company.com" {...invalid('email')}/></label>
    </div>
    <label><span>Company <small>(optional)</small></span><input id="lead-company" name="company" autoComplete="organization" maxLength={120} placeholder="Company or project name"/></label>
    <fieldset className="lead-services" {...invalid('service')}>
      <legend>What should we build?</legend>
      <div>{SERVICES.map((service,i)=><label key={service} className="lead-chip"><input id={i===0?'lead-service':undefined} type="radio" name="service" value={service} required/><span>{service}</span></label>)}</div>
    </fieldset>
    <div className="lead-row">
      <label><span>Budget <small>(optional)</small></span><select id="lead-budget" name="budget" defaultValue=""><option value="">Choose…</option>{BUDGETS.map(b=><option key={b}>{b}</option>)}</select></label>
      <label><span>Timeline <small>(optional)</small></span><select id="lead-timeline" name="timeline" defaultValue=""><option value="">Choose…</option>{TIMELINES.map(t=><option key={t}>{t}</option>)}</select></label>
    </div>
    <label>Tell us about your project<textarea id="lead-message" name="message" required minLength={20} maxLength={5000} rows={5} placeholder="What do you want to build, who is it for, and what does success look like?" {...invalid('message')}/></label>
    {/* Hidden from people; bots fill it in and are ignored. */}
    <label className="lead-trap" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off"/></label>
    {error&&<p className="lead-error" id="lead-error" role="alert">{error.message}</p>}
    <button className="lead-submit" type="submit" disabled={state==='sending'}>{state==='sending'?<><LoaderCircle size={17} className="spin"/>Sending…</>:<>Send your project<ArrowRight size={17}/></>}</button>
    <p className="lead-fine">We reply within one business day. Your details are only used to answer you, never shared or sold.</p>
  </form>;
}
