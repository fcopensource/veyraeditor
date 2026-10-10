import {NextResponse} from 'next/server';
import type {RowDataPacket} from 'mysql2';
import {authConfigured,clientIp,rateLimit,setPassword,startSession,tokenHash,validPassword} from '@/lib/auth';
import {query,withDatabase} from '@/lib/db';

/** Completes a password reset from an emailed link, then signs the user in. */
export const POST=withDatabase(async(request:Request)=>{
  if(!authConfigured()) return NextResponse.json({error:'Accounts are not available yet.'},{status:503});
  if(!rateLimit('reset-ip:'+clientIp(request),20,60*60*1000)) return NextResponse.json({error:'Too many attempts. Please try again later.'},{status:429});
  const body=await request.json().catch(()=>null) as {token?:string;password?:string}|null;
  if(typeof body?.token!=='string'||body.token.length<20) return NextResponse.json({error:'This reset link is incomplete.'},{status:400});
  if(!validPassword(body.password)) return NextResponse.json({error:'Use a password between 8 and 128 characters.'},{status:400});
  const rows=await query<(RowDataPacket&{user_id:number})[]>('SELECT user_id FROM password_resets WHERE token_hash=? AND expires_at>UTC_TIMESTAMP()',[tokenHash(body.token)]);
  if(!rows[0]) return NextResponse.json({error:'This reset link has expired or was already used. Request a new one.'},{status:400});
  const userId=rows[0].user_id;
  await query('DELETE FROM password_resets WHERE user_id=?',[userId]);
  await setPassword(userId,body.password,false); // signs out everywhere
  await startSession(userId);
  return NextResponse.json({ok:true});
});
