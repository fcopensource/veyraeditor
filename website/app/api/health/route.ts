import {checkDatabase} from '@/lib/db';

export const dynamic='force-dynamic';

/** GET /api/health: is the site up, and can it reach its database? Error codes only, never credentials. */
export async function GET(){
  const database=await checkDatabase();
  return Response.json({ok:database.connected,database},{status:database.connected?200:503,headers:{'Cache-Control':'no-store'}});
}
