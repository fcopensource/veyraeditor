import {NextResponse} from 'next/server';
import {authConfig,currentSession,supabase,supabaseError,validPassword} from '@/lib/auth';

/** Sets a new password for the signed-in user (also used right after a reset link signs them in). */
export async function POST(request:Request){
  if(!authConfig()) return NextResponse.json({error:'Accounts are not available yet.'},{status:503});
  const body=await request.json().catch(()=>null) as {password?:string}|null;
  if(!validPassword(body?.password)) return NextResponse.json({error:'Use a password between 8 and 72 characters.'},{status:400});
  const session=await currentSession();
  if(!session) return NextResponse.json({error:'Your session has expired. Log in again.'},{status:401});
  const {response,result}=await supabase('user',{method:'PUT',token:session.token,body:JSON.stringify({password:body!.password})});
  if(!response.ok) return NextResponse.json({error:supabaseError(result,'Unable to change the password.')},{status:response.status});
  return NextResponse.json({ok:true});
}
