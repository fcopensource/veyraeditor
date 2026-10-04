import {NextResponse} from 'next/server';
import {authConfig,setSession,supabaseError} from '@/lib/auth';

export async function POST(request:Request){
  const config=authConfig();
  if(!config) return NextResponse.json({error:'Authentication is not configured yet. Add the Supabase environment variables.'},{status:503});
  const body=await request.json().catch(()=>null) as {email?:string;password?:string}|null;
  const email=body?.email?.trim().toLowerCase();
  if(!email||!body?.password) return NextResponse.json({error:'Email and password are required.'},{status:400});
  const response=await fetch(`${config.url}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:config.key,Authorization:`Bearer ${config.key}`,'Content-Type':'application/json'},body:JSON.stringify({email,password:body.password}),cache:'no-store'});
  const result=await response.json().catch(()=>({}));
  if(!response.ok) return NextResponse.json({error:supabaseError(result,'Unable to log in.')},{status:response.status});
  await setSession(result.access_token,result.refresh_token,result.expires_in);
  return NextResponse.json({user:result.user});
}
