import {NextResponse} from 'next/server';
import {currentUser} from '@/lib/auth';
import {revokeDevice} from '@/lib/ai';
import {withDatabase} from '@/lib/db';

/** Sign one device out of the Veyra app (its Veyra AI access stops immediately). */
export const DELETE=withDatabase(async(request:Request)=>{
  const user=await currentUser();
  if(!user) return NextResponse.json({error:'Your session has expired. Log in again.'},{status:401});
  const body=await request.json().catch(()=>null) as {id?:string}|null;
  if(!await revokeDevice(user.id,String(body?.id||''))) return NextResponse.json({error:'That device is already signed out.'},{status:404});
  return NextResponse.json({ok:true});
});
