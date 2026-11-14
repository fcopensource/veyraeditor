import type {RowDataPacket} from 'mysql2';
import {authorized,ensureLeadColumns,json,notFound} from '@/lib/admin-api';
import {query} from '@/lib/db';

export const dynamic='force-dynamic';

/** Headline numbers for the FlightCoders admin overview. */
export async function GET(request:Request){
  if(!authorized(request)) return notFound();
  try{
    await ensureLeadColumns();
    const one=async(sql:string)=>Number((await query<(RowDataPacket&{n:number})[]>(sql))[0]?.n??0);
    const [users,newUsers,activeWeek,leads,newLeads,devices,aiToday,aiRequests]=await Promise.all([
      one('SELECT COUNT(*) n FROM users'),
      one('SELECT COUNT(*) n FROM users WHERE created_at > UTC_TIMESTAMP() - INTERVAL 7 DAY'),
      one('SELECT COUNT(DISTINCT user_id) n FROM sessions WHERE created_at > UTC_TIMESTAMP() - INTERVAL 7 DAY'),
      one('SELECT COUNT(*) n FROM leads'),
      one("SELECT COUNT(*) n FROM leads WHERE status='new'"),
      one('SELECT COUNT(*) n FROM api_tokens'),
      one('SELECT COALESCE(SUM(requests),0) n FROM ai_usage WHERE day=UTC_DATE()'),
      one('SELECT COALESCE(SUM(requests),0) n FROM ai_usage WHERE day > UTC_DATE() - INTERVAL 30 DAY'),
    ]);
    return json({users,newUsers,activeWeek,leads,newLeads,devices,aiToday,aiRequests});
  }catch(error){console.error('[admin] overview',error);return json({error:'Database unavailable'},503);}
}
