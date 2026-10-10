import {withDatabase} from '@/lib/db';
import {NextResponse} from 'next/server';
import {authConfigured,currentUser,passwordHashFor,rateLimit,setPassword,validPassword,verifyPassword} from '@/lib/auth';

/** Change password while signed in. Requires the current password; other devices are signed out. */
export const POST=withDatabase(async(request:Request)=>{
  if(!authConfigured()) return NextResponse.json({error:'Accounts are not available yet.'},{status:503});
  const user=await currentUser();
  if(!user) return NextResponse.json({error:'Your session has expired. Log in again.'},{status:401});
  if(!rateLimit('password:'+user.id,10,15*60*1000)) return NextResponse.json({error:'Too many attempts. Please wait a few minutes.'},{status:429});
  const body=await request.json().catch(()=>null) as {currentPassword?:string;password?:string}|null;
  if(!body?.currentPassword||!await verifyPassword(body.currentPassword,await passwordHashFor(user.id))) return NextResponse.json({error:'Your current password is incorrect.'},{status:400});
  if(!validPassword(body.password)) return NextResponse.json({error:'Use a new password between 8 and 128 characters.'},{status:400});
  await setPassword(user.id,body.password,true);
  return NextResponse.json({ok:true});
});
