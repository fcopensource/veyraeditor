import {NextResponse} from 'next/server';
import {clientIp,rateLimit} from '@/lib/auth';
import {databaseConfigured,query,withDatabase} from '@/lib/db';
import {leadsInbox,mailConfigured,sendLeadConfirmation,sendLeadNotification} from '@/lib/mail';
import {validateLead} from '@/lib/leads';

/**
 * A project enquiry from the FlightCoders form. It's stored first (so nothing is lost if email fails), then the team
 * is emailed (LEADS_EMAIL) and the person gets a confirmation. Bots are turned away by a hidden field and a rate limit.
 */
export const POST=withDatabase(async(request:Request)=>{
  const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
  if(!body) return NextResponse.json({error:'Please fill in the form.'},{status:400});
  // The "website" field is hidden from people; only bots fill it in. Pretend it worked so they don't retry.
  if(typeof body.website==='string'&&body.website.trim()) return NextResponse.json({ok:true});
  const checked=validateLead(body);
  if('error' in checked) return NextResponse.json({error:checked.error,field:checked.field},{status:400});
  if(!rateLimit('lead-ip:'+clientIp(request),5,60*60*1000))
    return NextResponse.json({error:'Thanks! We already have your messages. Please wait a little before sending another.'},{status:429});
  if(!databaseConfigured()) return NextResponse.json({error:'The form is not available right now. Please try again later, or use the contact details on our About page.'},{status:503});
  const lead=checked.lead;
  const result=await query<{insertId:number}>('INSERT INTO leads (name,email,company,service,budget,timeline,message,source) VALUES (?,?,?,?,?,?,?,?)',
    [lead.name,lead.email,lead.company,lead.service,lead.budget,lead.timeline,lead.message,lead.source]);
  const id=Number(result.insertId)||0;
  if(mailConfigured()){
    const sent=await Promise.allSettled([leadsInbox().length?sendLeadNotification(lead,id):Promise.reject(new Error('LEADS_EMAIL is not set')),sendLeadConfirmation(lead)]);
    if(sent[0].status==='fulfilled') await query('UPDATE leads SET emailed=1 WHERE id=?',[id]).catch(()=>{});
    sent.forEach(s=>{if(s.status==='rejected')console.error('[veyra] lead email failed:',s.reason);});
  }
  return NextResponse.json({ok:true,id},{headers:{'Cache-Control':'no-store'}});
});
