import {NextResponse} from 'next/server';
import {authConfigured,clientIp,createUser,findUserByEmail,normalizeEmail,rateLimit,startSession,validEmail,validPassword} from '@/lib/auth';

const EXISTS='An account with this email already exists. Log in instead, or reset your password.';

export async function POST(request:Request){
  if(!authConfigured()) return NextResponse.json({error:'Accounts are not available yet.'},{status:503});
  if(!rateLimit('register:'+clientIp(request),10,60*60*1000)) return NextResponse.json({error:'Too many sign-ups from this network. Please try again later.'},{status:429});
  const body=await request.json().catch(()=>null) as {name?:string;email?:string;password?:string}|null;
  const name=body?.name?.trim().replace(/\s+/g,' ').slice(0,80)||'';const email=normalizeEmail(body?.email);
  if(name.length<2) return NextResponse.json({error:'Please enter your full name.'},{status:400});
  if(!validEmail(email)) return NextResponse.json({error:'Please enter a valid email address.'},{status:400});
  if(!validPassword(body?.password)) return NextResponse.json({error:'Use a password between 8 and 128 characters.'},{status:400});
  if(await findUserByEmail(email)) return NextResponse.json({error:EXISTS},{status:409});
  try{
    await startSession(await createUser(name,email,body!.password!));
  }catch(error){
    if((error as {code?:string}).code==='ER_DUP_ENTRY') return NextResponse.json({error:EXISTS},{status:409});
    throw error;
  }
  return NextResponse.json({ok:true});
}
