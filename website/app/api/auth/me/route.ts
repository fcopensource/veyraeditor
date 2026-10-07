import {NextResponse} from 'next/server';
import {clearSession,currentUser} from '@/lib/auth';

export async function GET(){
  const user=await currentUser();
  if(!user){await clearSession();return NextResponse.json({error:'Not signed in.'},{status:401});}
  return NextResponse.json({user:{id:user.id,email:user.email,name:user.user_metadata?.name||'',createdAt:user.created_at,confirmedAt:user.email_confirmed_at,lastSignInAt:user.last_sign_in_at}});
}
