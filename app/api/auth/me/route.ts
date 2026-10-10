import {withDatabase,query} from '@/lib/db';
import {NextResponse} from 'next/server';
import {currentUser,endSession} from '@/lib/auth';

export const GET=withDatabase(async()=>{
  const user=await currentUser();
  if(!user){await endSession();return NextResponse.json({error:'Not signed in.'},{status:401});}
  return NextResponse.json({user:{name:user.name,email:user.email,createdAt:user.createdAt,lastLoginAt:user.lastLoginAt}});
});

/** Update the display name. */
export const PATCH=withDatabase(async(request:Request)=>{
  const user=await currentUser();
  if(!user) return NextResponse.json({error:'Your session has expired. Log in again.'},{status:401});
  const body=await request.json().catch(()=>null) as {name?:string}|null;
  const name=typeof body?.name==='string'?body.name.trim().replace(/\s+/g,' '):'';
  if(name.length<2||name.length>80) return NextResponse.json({error:'Use a name between 2 and 80 characters.'},{status:400});
  await query('UPDATE users SET name=? WHERE id=?',[name,user.id]);
  return NextResponse.json({ok:true,name});
});
