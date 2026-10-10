import {NextResponse} from 'next/server';
import {authConfigured,clientIp,findUserByEmail,newToken,normalizeEmail,rateLimit,siteUrl,tokenHash,validEmail} from '@/lib/auth';
import {query,withDatabase} from '@/lib/db';
import {mailConfigured,sendPasswordReset} from '@/lib/mail';

/** Emails a one-hour reset link. Answers the same way whether or not the account exists. */
export const POST=withDatabase(async(request:Request)=>{
  if(!authConfigured()) return NextResponse.json({error:'Accounts are not available yet.'},{status:503});
  if(!mailConfigured()) return NextResponse.json({error:'Password reset by email is not set up yet. Please contact support.'},{status:503});
  const body=await request.json().catch(()=>null) as {email?:string}|null;
  const email=normalizeEmail(body?.email);
  if(!validEmail(email)) return NextResponse.json({error:'Please enter a valid email address.'},{status:400});
  if(!rateLimit('forgot:'+email,3,60*60*1000)||!rateLimit('forgot-ip:'+clientIp(request),10,60*60*1000))
    return NextResponse.json({error:'Too many requests. Please wait a while and try again.'},{status:429});
  const user=await findUserByEmail(email);
  if(user){
    const token=newToken();
    await query('DELETE FROM password_resets WHERE user_id=? OR expires_at<UTC_TIMESTAMP()',[user.id]);
    await query('INSERT INTO password_resets (token_hash,user_id,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 HOUR))',[tokenHash(token),user.id]);
    try{await sendPasswordReset(user.email,user.name,`${siteUrl(request)}/reset-password?token=${token}`);}
    catch(error){console.error('Password reset email failed',error);return NextResponse.json({error:'We could not send the email right now. Please try again shortly.'},{status:502});}
  }
  return NextResponse.json({ok:true});
});
