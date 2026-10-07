import {NextResponse} from 'next/server';
import {authConfig,setSession,supabase,supabaseError,validEmail} from '@/lib/auth';

export async function POST(request:Request){
  if(!authConfig()) return NextResponse.json({error:'Accounts are not available yet.'},{status:503});
  const body=await request.json().catch(()=>null) as {email?:string;password?:string}|null;
  const email=body?.email?.trim().toLowerCase();
  if(!email||!validEmail(email)||!body?.password) return NextResponse.json({error:'Enter your email address and password.'},{status:400});
  const {response,result}=await supabase('token?grant_type=password',{method:'POST',body:JSON.stringify({email,password:body.password})});
  if(!response.ok) return NextResponse.json({error:supabaseError(result,'Unable to log in.')},{status:response.status===400?401:response.status});
  await setSession(result.access_token,result.refresh_token,result.expires_in);
  return NextResponse.json({user:result.user});
}
