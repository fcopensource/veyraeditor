import {cookies} from 'next/headers';import {NextResponse} from 'next/server';
import {ACCESS_COOKIE,authConfig,clearSession} from '@/lib/auth';

export async function POST(){
  const config=authConfig();const token=(await cookies()).get(ACCESS_COOKIE)?.value;
  if(config&&token) await fetch(`${config.url}/auth/v1/logout`,{method:'POST',headers:{apikey:config.key,Authorization:`Bearer ${token}`}}).catch(()=>undefined);
  await clearSession();return NextResponse.json({ok:true});
}
