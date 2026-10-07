import {cookies} from 'next/headers';

export const ACCESS_COOKIE='veyra-access-token';
export const REFRESH_COOKIE='veyra-refresh-token';
/** Readable (non-HttpOnly) flag so static pages can show "Account" instead of "Log in". Holds no secret. */
export const SIGNED_IN_COOKIE='veyra-signed-in';

export type SupabaseUser={id:string;email?:string;created_at?:string;email_confirmed_at?:string|null;last_sign_in_at?:string;user_metadata?:{name?:string}};
type Tokens={access_token:string;refresh_token?:string;expires_in?:number};

export function authConfig(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,'');
  const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!key) return null;
  return {url,key};
}

/** Public origin for links in confirmation and password-reset emails. */
export function siteUrl(request?:Request){
  const configured=process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/,'');
  if(configured) return configured;
  if(request){const origin=request.headers.get('origin');if(origin) return origin;const host=request.headers.get('host');if(host) return `https://${host}`;}
  return 'https://veyraeditor.com';
}

export async function setSession(accessToken:string,refreshToken?:string,expiresIn=3600){
  const jar=await cookies();
  const base={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/'};
  jar.set(ACCESS_COOKIE,accessToken,{...base,maxAge:expiresIn});
  if(refreshToken) jar.set(REFRESH_COOKIE,refreshToken,{...base,maxAge:60*60*24*30});
  jar.set(SIGNED_IN_COOKIE,'1',{...base,httpOnly:false,maxAge:60*60*24*30});
}

export async function clearSession(){
  const jar=await cookies();
  for(const name of [ACCESS_COOKIE,REFRESH_COOKIE,SIGNED_IN_COOKIE]) jar.set(name,'',{path:'/',maxAge:0});
}

export function supabaseError(payload:unknown,fallback:string){
  if(payload&&typeof payload==='object'){
    const item=payload as Record<string,unknown>;
    for(const key of ['msg','message','error_description','error']) if(typeof item[key]==='string') return friendly(item[key] as string);
  }
  return fallback;
}
function friendly(message:string){
  if(/invalid login credentials/i.test(message)) return 'That email and password do not match. Check them or reset your password.';
  if(/email not confirmed/i.test(message)) return 'Please confirm your email first: open the link we sent you, then log in.';
  if(/already registered|already been registered/i.test(message)) return 'An account with this email already exists. Log in instead, or reset your password.';
  if(/rate limit|too many/i.test(message)) return 'Too many attempts. Please wait a minute and try again.';
  return message;
}

export async function supabase(path:string,init:RequestInit&{token?:string}={}){
  const config=authConfig();if(!config) throw new Error('not-configured');
  const {token,headers,...rest}=init;
  const response=await fetch(`${config.url}/auth/v1/${path}`,{...rest,cache:'no-store',headers:{apikey:config.key,Authorization:`Bearer ${token||config.key}`,'Content-Type':'application/json',...headers}});
  return {response,result:await response.json().catch(()=>({}))};
}

export async function userFor(token:string):Promise<SupabaseUser|null>{
  const {response,result}=await supabase('user',{token});
  return response.ok?result as SupabaseUser:null;
}

/** The signed-in user and a valid access token, refreshing an expired token when possible. */
export async function currentSession():Promise<{user:SupabaseUser;token:string}|null>{
  if(!authConfig()) return null;
  const jar=await cookies();
  const access=jar.get(ACCESS_COOKIE)?.value,refresh=jar.get(REFRESH_COOKIE)?.value;
  if(access){const user=await userFor(access);if(user) return {user,token:access};}
  if(!refresh) return null;
  const {response,result}=await supabase('token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:refresh})});
  if(!response.ok) return null;
  const tokens=result as Tokens&{user?:SupabaseUser};
  await setSession(tokens.access_token,tokens.refresh_token,tokens.expires_in);
  const user=tokens.user||await userFor(tokens.access_token);
  return user?{user,token:tokens.access_token}:null;
}
export async function currentUser(){return (await currentSession())?.user||null;}

export const validEmail=(email:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&email.length<=254;
export const validPassword=(password:unknown):password is string=>typeof password==='string'&&password.length>=8&&password.length<=72;
