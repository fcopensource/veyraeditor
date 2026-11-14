import type {RowDataPacket} from 'mysql2';
import {authorized,clean,id,json,notFound} from '@/lib/admin-api';
import {query} from '@/lib/db';

export const dynamic='force-dynamic';

/** Veyra accounts for the FlightCoders admin: newest first, ?q= searches name and email. */
export async function GET(request:Request){
  if(!authorized(request)) return notFound();
  try{
    const q=clean(new URL(request.url).searchParams.get('q'),100);
    const users=await query<RowDataPacket[]>(`SELECT u.id,u.name,u.email,u.created_at,u.last_login_at,
        (SELECT COUNT(*) FROM sessions s WHERE s.user_id=u.id AND s.expires_at>UTC_TIMESTAMP()) sessions,
        (SELECT COUNT(*) FROM api_tokens t WHERE t.user_id=u.id) devices,
        (SELECT COALESCE(SUM(requests),0) FROM ai_usage a WHERE a.user_id=u.id AND a.day > UTC_DATE() - INTERVAL 30 DAY) ai30
      FROM users u ${q?'WHERE u.name LIKE ? OR u.email LIKE ?':''} ORDER BY u.created_at DESC LIMIT 500`,q?[`%${q}%`,`%${q}%`]:[]);
    return json({users});
  }catch(error){console.error('[admin] users',error);return json({error:'Database unavailable'},503);}
}

/** { action: "signout", id }: ends every session and signs out every Veyra Studio device. { action: "delete", id }. */
export async function POST(request:Request){
  if(!authorized(request)) return notFound();
  const body=await request.json().catch(()=>({})) as Record<string,unknown>;
  const user=id(body.id);
  if(!user) return json({error:'Missing id'},400);
  try{
    if(body.action==='signout'){
      await query('DELETE FROM sessions WHERE user_id=?',[user]);
      await query('DELETE FROM api_tokens WHERE user_id=?',[user]);
    }else if(body.action==='delete'){
      for(const table of ['sessions','api_tokens','password_resets','ai_usage','ai_allowance']) await query(`DELETE FROM ${table} WHERE user_id=?`,[user]);
      await query('DELETE FROM users WHERE id=?',[user]);
    }else return json({error:'Unknown action'},400);
    return json({ok:true});
  }catch(error){console.error('[admin] users',error);return json({error:'Database unavailable'},503);}
}
