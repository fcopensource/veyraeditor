import {NextResponse} from 'next/server';
import {authConfigured,burnPasswordCheck,clientIp,findUserByEmail,normalizeEmail,rateLimit,startSession,validEmail,verifyPassword} from '@/lib/auth';

export async function POST(request:Request){
  if(!authConfigured()) return NextResponse.json({error:'Accounts are not available yet.'},{status:503});
  const body=await request.json().catch(()=>null) as {email?:string;password?:string}|null;
  const email=normalizeEmail(body?.email);const password=typeof body?.password==='string'?body.password:'';
  if(!validEmail(email)||!password) return NextResponse.json({error:'Enter your email address and password.'},{status:400});
  // 10 tries per account and 30 per network every 15 minutes.
  if(!rateLimit('login:'+email,10,15*60*1000)||!rateLimit('login-ip:'+clientIp(request),30,15*60*1000))
    return NextResponse.json({error:'Too many attempts. Please wait 15 minutes or reset your password.'},{status:429});
  const user=await findUserByEmail(email);
  const valid=user?await verifyPassword(password,user.password_hash):await burnPasswordCheck(password);
  if(!user||!valid) return NextResponse.json({error:'That email and password do not match. Check them or reset your password.'},{status:401});
  await startSession(user.id);
  return NextResponse.json({ok:true});
}
