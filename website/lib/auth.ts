import {cookies} from 'next/headers';

export const ACCESS_COOKIE='veyra-access-token';
export const REFRESH_COOKIE='veyra-refresh-token';

export function authConfig(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,'');
  const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!key) return null;
  return {url,key};
}

export async function setSession(accessToken:string,refreshToken?:string,expiresIn=3600){
  const jar=await cookies();
  const base={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/'};
  jar.set(ACCESS_COOKIE,accessToken,{...base,maxAge:expiresIn});
  if(refreshToken) jar.set(REFRESH_COOKIE,refreshToken,{...base,maxAge:60*60*24*30});
}

export async function clearSession(){
  const jar=await cookies();
  jar.set(ACCESS_COOKIE,'',{path:'/',maxAge:0});
  jar.set(REFRESH_COOKIE,'',{path:'/',maxAge:0});
}

export function supabaseError(payload:unknown,fallback:string){
  if(payload&&typeof payload==='object'){
    const item=payload as Record<string,unknown>;
    for(const key of ['msg','message','error_description','error']) if(typeof item[key]==='string') return item[key] as string;
  }
  return fallback;
}
