import {NextResponse} from 'next/server';
import {authConfigured,currentUser,endSession,passwordHashFor,verifyPassword} from '@/lib/auth';
import {query} from '@/lib/db';

/** Permanently deletes the signed-in account (sessions and reset links go with it via ON DELETE CASCADE). */
export async function DELETE(request:Request){
  if(!authConfigured()) return NextResponse.json({error:'Accounts are not available yet.'},{status:503});
  const user=await currentUser();
  if(!user) return NextResponse.json({error:'Your session has expired. Log in again.'},{status:401});
  const body=await request.json().catch(()=>null) as {password?:string}|null;
  if(!body?.password||!await verifyPassword(body.password,await passwordHashFor(user.id))) return NextResponse.json({error:'Your password is incorrect.'},{status:400});
  await query('DELETE FROM users WHERE id=?',[user.id]);
  await endSession();
  return NextResponse.json({ok:true});
}
