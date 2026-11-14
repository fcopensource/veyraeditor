import type {RowDataPacket} from 'mysql2';
import {authorized,clean,ensureLeadColumns,id,isLeadStatus,json,notFound} from '@/lib/admin-api';
import {query} from '@/lib/db';

export const dynamic='force-dynamic';

/** Project enquiries from veyraeditor.com/flightcoders, for the shared inbox. ?status= and ?q= filter; ?id= gets one. */
export async function GET(request:Request){
  if(!authorized(request)) return notFound();
  try{
    await ensureLeadColumns();
    const url=new URL(request.url);
    const one=id(url.searchParams.get('id'));
    if(one){const rows=await query<RowDataPacket[]>('SELECT * FROM leads WHERE id=?',[one]);return rows[0]?json({lead:rows[0]}):notFound();}
    const where:string[]=[],params:string[]=[];
    const status=url.searchParams.get('status');
    if(isLeadStatus(status)){where.push('status=?');params.push(status);}
    const q=clean(url.searchParams.get('q'),100);
    if(q){where.push('(name LIKE ? OR email LIKE ? OR company LIKE ? OR message LIKE ?)');const like=`%${q}%`;params.push(like,like,like,like);}
    const leads=await query<RowDataPacket[]>(`SELECT id,name,email,company,service,budget,timeline,source,status,emailed,created_at,message,admin_notes FROM leads ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY created_at DESC LIMIT 300`,params);
    const counts=await query<(RowDataPacket&{status:string;n:number})[]>('SELECT status,COUNT(*) n FROM leads GROUP BY status');
    return json({leads,counts:Object.fromEntries(counts.map(c=>[c.status,Number(c.n)]))});
  }catch(error){console.error('[admin] leads',error);return json({error:'Database unavailable'},503);}
}

/** { action: "status", id, status } · { action: "notes", id, notes } · { action: "delete", id } */
export async function POST(request:Request){
  if(!authorized(request)) return notFound();
  const body=await request.json().catch(()=>({})) as Record<string,unknown>;
  const lead=id(body.id);
  if(!lead) return json({error:'Missing id'},400);
  try{
    await ensureLeadColumns();
    if(body.action==='status'&&isLeadStatus(body.status)) await query('UPDATE leads SET status=? WHERE id=?',[body.status,lead]);
    else if(body.action==='notes') await query('UPDATE leads SET admin_notes=? WHERE id=?',[clean(body.notes,10000)||null,lead]);
    else if(body.action==='delete') await query('DELETE FROM leads WHERE id=?',[lead]);
    else return json({error:'Unknown action'},400);
    return json({ok:true});
  }catch(error){console.error('[admin] leads',error);return json({error:'Database unavailable'},503);}
}
