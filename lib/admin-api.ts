import 'server-only';
import {createHash,timingSafeEqual} from 'node:crypto';
import type {RowDataPacket} from 'mysql2';
import {query} from './db';

/* The private admin API that the FlightCoders admin panel (flightcoders.com/admin) uses to manage veyraeditor.com.
   It is server to server only: every request must carry `Authorization: Bearer <VEYRA_ADMIN_KEY>`, the same long
   random secret set on both websites. Without the key set here, the API answers 404 to everyone. */

/** True when the request carries the admin key. Compared in constant time. */
export function authorized(request:Request){
  const key=(process.env.VEYRA_ADMIN_KEY||'').trim();
  if(key.length<32) return false;
  const sent=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'').trim();
  const a=createHash('sha256').update(sent).digest(), b=createHash('sha256').update(key).digest();
  return sent.length>0&&timingSafeEqual(a,b);
}
export const notFound=()=>Response.json({error:'Not found'},{status:404,headers:{'Cache-Control':'no-store'}});
export const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});

export const LEAD_STATUSES=['new','contacted','in_progress','won','lost','archived'] as const;
export type LeadStatus=(typeof LEAD_STATUSES)[number];
export const isLeadStatus=(v:unknown):v is LeadStatus=>LEAD_STATUSES.includes(v as LeadStatus);

/** Older databases have leads without a status or notes: add the two columns once. */
const g=globalThis as unknown as {veyraLeadColumns?:Promise<void>};
export function ensureLeadColumns(){
  g.veyraLeadColumns??=(async()=>{
    const cols=await query<(RowDataPacket&{c:string})[]>("SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='leads'");
    const have=new Set(cols.map(r=>r.c));
    if(!have.has('status')) await query("ALTER TABLE leads ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'new', ADD KEY leads_status (status,created_at)");
    if(!have.has('admin_notes')) await query('ALTER TABLE leads ADD COLUMN admin_notes TEXT NULL');
  })().catch(error=>{g.veyraLeadColumns=undefined;throw error;});
  return g.veyraLeadColumns;
}

export const clean=(v:unknown,max:number)=>typeof v==='string'?v.trim().slice(0,max):'';
export const id=(v:unknown)=>{const n=Number(v);return Number.isInteger(n)&&n>0?n:0;};
