import {cookies} from 'next/headers';import {NextResponse} from 'next/server';
import {ACCESS_COOKIE,authConfig,clearSession,supabase} from '@/lib/auth';

export async function POST(){
  const token=(await cookies()).get(ACCESS_COOKIE)?.value;
  if(authConfig()&&token) await supabase('logout',{method:'POST',token}).catch(()=>undefined);
  await clearSession();return NextResponse.json({ok:true});
}
