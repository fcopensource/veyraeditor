import {cookies} from 'next/headers';import {NextResponse} from 'next/server';
import {ACCESS_COOKIE,authConfig,clearSession} from '@/lib/auth';

export async function GET(){
  const config=authConfig();const token=(await cookies()).get(ACCESS_COOKIE)?.value;
  if(!config||!token) return NextResponse.json({error:'Not authenticated.'},{status:401});
  const response=await fetch(`${config.url}/auth/v1/user`,{headers:{apikey:config.key,Authorization:`Bearer ${token}`},cache:'no-store'});
  if(!response.ok){await clearSession();return NextResponse.json({error:'Session expired.'},{status:401});}
  return NextResponse.json({user:await response.json()});
}
