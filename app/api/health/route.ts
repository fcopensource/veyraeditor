import {checkDatabase} from '@/lib/db';
import {checkMail} from '@/lib/mail';

export const dynamic='force-dynamic';

/** GET /api/health: is the site up, can it reach its database and mail server? Error codes only, never credentials. */
export async function GET(){
  const [database,mail]=await Promise.all([checkDatabase(),checkMail()]);
  return Response.json({ok:database.connected,database,mail},{status:database.connected?200:503,headers:{'Cache-Control':'no-store'}});
}
