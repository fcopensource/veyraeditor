import {NextResponse} from 'next/server';
import {currentUser} from '@/lib/auth';
import {listDevices,models,usageToday} from '@/lib/ai';
import {withDatabase} from '@/lib/db';

export const dynamic='force-dynamic';

/** Everything the account page shows about the signed-in user: profile, Veyra AI usage and signed-in devices. */
export const GET=withDatabase(async()=>{
  const user=await currentUser();
  if(!user) return NextResponse.json({error:'Not signed in.'},{status:401});
  const [usage,devices]=await Promise.all([usageToday(user.id),listDevices(user.id)]);
  return NextResponse.json({user,ai:{...usage,available:models().length>0},devices},{headers:{'Cache-Control':'no-store'}});
});
