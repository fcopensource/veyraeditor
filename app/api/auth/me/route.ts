import {NextResponse} from 'next/server';
import {currentUser,endSession} from '@/lib/auth';

export async function GET(){
  const user=await currentUser();
  if(!user){await endSession();return NextResponse.json({error:'Not signed in.'},{status:401});}
  return NextResponse.json({user:{name:user.name,email:user.email,createdAt:user.createdAt,lastLoginAt:user.lastLoginAt}});
}
