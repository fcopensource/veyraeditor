import {NextResponse} from 'next/server';
import {authConfig,setSession,siteUrl,supabase,supabaseError,validEmail,validPassword} from '@/lib/auth';

export async function POST(request:Request){
  if(!authConfig()) return NextResponse.json({error:'Accounts are not available yet.'},{status:503});
  const body=await request.json().catch(()=>null) as {name?:string;email?:string;password?:string}|null;
  const name=body?.name?.trim().slice(0,80);const email=body?.email?.trim().toLowerCase();
  if(!name||name.length<2) return NextResponse.json({error:'Please enter your full name.'},{status:400});
  if(!email||!validEmail(email)) return NextResponse.json({error:'Please enter a valid email address.'},{status:400});
  if(!validPassword(body?.password)) return NextResponse.json({error:'Use a password between 8 and 72 characters.'},{status:400});
  // The confirmation email links back to /auth/callback, which signs the user straight in.
  const redirect=encodeURIComponent(`${siteUrl(request)}/auth/callback`);
  const {response,result}=await supabase(`signup?redirect_to=${redirect}`,{method:'POST',body:JSON.stringify({email,password:body!.password,data:{name}})});
  if(!response.ok) return NextResponse.json({error:supabaseError(result,'Unable to create the account.')},{status:response.status});
  if(result.access_token) await setSession(result.access_token,result.refresh_token,result.expires_in);
  return NextResponse.json({confirmationRequired:!result.access_token});
}
