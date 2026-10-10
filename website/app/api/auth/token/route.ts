import {NextResponse} from 'next/server';
import {authConfigured,burnPasswordCheck,clientIp,findUserByEmail,normalizeEmail,rateLimit,validEmail,verifyPassword} from '@/lib/auth';
import {createAppToken,revokeAppToken} from '@/lib/ai';
import {withDatabase} from '@/lib/db';

/** Sign in from the Veyra Studio app: email + password in, a device token out (used for Veyra AI). */
export const POST=withDatabase(async(request:Request)=>{
  if(!authConfigured()) return NextResponse.json({error:'Accounts are not available yet.'},{status:503});
  const body=await request.json().catch(()=>null) as {email?:string;password?:string;device?:string}|null;
  const email=normalizeEmail(body?.email);const password=typeof body?.password==='string'?body.password:'';
  if(!validEmail(email)||!password) return NextResponse.json({error:'Enter your email address and password.'},{status:400});
  if(!rateLimit('login:'+email,10,15*60*1000)||!rateLimit('login-ip:'+clientIp(request),30,15*60*1000))
    return NextResponse.json({error:'Too many attempts. Please wait 15 minutes or reset your password on veyraeditor.com.'},{status:429});
  const user=await findUserByEmail(email);
  const valid=user?await verifyPassword(password,user.password_hash):await burnPasswordCheck(password);
  if(!user||!valid) return NextResponse.json({error:'That email and password do not match.'},{status:401});
  const token=await createAppToken(user.id,typeof body?.device==='string'?body.device:'Veyra Studio');
  return NextResponse.json({token,user:{name:user.name,email:user.email}},{headers:{'Cache-Control':'no-store'}});
});

/** Sign out from the app: the token stops working everywhere. */
export const DELETE=withDatabase(async(request:Request)=>{await revokeAppToken(request);return NextResponse.json({ok:true});});
