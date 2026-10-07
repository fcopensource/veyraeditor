import {NextResponse} from 'next/server';
import {authConfig,siteUrl,supabase,validEmail} from '@/lib/auth';

/** Sends a password-reset email. Always answers the same way so it never reveals who has an account. */
export async function POST(request:Request){
  if(!authConfig()) return NextResponse.json({error:'Accounts are not available yet.'},{status:503});
  const body=await request.json().catch(()=>null) as {email?:string}|null;
  const email=body?.email?.trim().toLowerCase();
  if(!email||!validEmail(email)) return NextResponse.json({error:'Please enter a valid email address.'},{status:400});
  const redirect=encodeURIComponent(`${siteUrl(request)}/auth/callback`);
  const {response}=await supabase(`recover?redirect_to=${redirect}`,{method:'POST',body:JSON.stringify({email})});
  if(response.status===429) return NextResponse.json({error:'Too many requests. Please wait a minute and try again.'},{status:429});
  return NextResponse.json({ok:true});
}
