import {NextResponse} from 'next/server';
import {authConfig,setSession,supabaseError} from '@/lib/auth';

export async function POST(request:Request){
  const config=authConfig();
  if(!config) return NextResponse.json({error:'Authentication is not configured yet. Add the Supabase environment variables.'},{status:503});
  const body=await request.json().catch(()=>null) as {name?:string;email?:string;password?:string}|null;
  const name=body?.name?.trim();const email=body?.email?.trim().toLowerCase();
  if(!name||name.length<2) return NextResponse.json({error:'Please enter your full name.'},{status:400});
  if(!email||!body?.password||body.password.length<8) return NextResponse.json({error:'Use a valid email and a password of at least 8 characters.'},{status:400});
  const response=await fetch(`${config.url}/auth/v1/signup`,{method:'POST',headers:{apikey:config.key,Authorization:`Bearer ${config.key}`,'Content-Type':'application/json'},body:JSON.stringify({email,password:body.password,data:{name}}),cache:'no-store'});
  const result=await response.json().catch(()=>({}));
  if(!response.ok) return NextResponse.json({error:supabaseError(result,'Unable to create the account.')},{status:response.status});
  if(result.access_token) await setSession(result.access_token,result.refresh_token,result.expires_in);
  return NextResponse.json({user:result.user,confirmationRequired:!result.access_token});
}
