import {aiError,models,tokenUser,usageToday} from '@/lib/ai';
import {withDatabase} from '@/lib/db';

export const dynamic='force-dynamic';

/** Who is signed in and how much of today's Veyra AI allowance is left. */
export const GET=withDatabase(async(request:Request)=>{
  const user=await tokenUser(request);
  if(!user) return aiError('Sign in to Veyra AI again.',401,'authentication_error');
  return Response.json({user:{name:user.name,email:user.email},available:models().length>0,...await usageToday(user.id)},{headers:{'Cache-Control':'no-store'}});
});
