import {NextResponse} from 'next/server';
import {authConfig,setSession,userFor} from '@/lib/auth';

/** Exchanges the tokens from an email link (confirmation or recovery) for Veyra's HttpOnly session cookies. */
export async function POST(request:Request){
  if(!authConfig()) return NextResponse.json({error:'Accounts are not available yet.'},{status:503});
  const body=await request.json().catch(()=>null) as {accessToken?:string;refreshToken?:string;expiresIn?:number}|null;
  if(!body?.accessToken) return NextResponse.json({error:'This link is incomplete.'},{status:400});
  const user=await userFor(body.accessToken);
  if(!user) return NextResponse.json({error:'This link has expired or was already used. Request a new one.'},{status:401});
  await setSession(body.accessToken,body.refreshToken,Number(body.expiresIn)||3600);
  return NextResponse.json({user:{email:user.email}});
}
