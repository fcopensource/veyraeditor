import {aiError,models,tokenUser,usage} from '@/lib/ai';
import {withDatabase} from '@/lib/db';

export const dynamic='force-dynamic';

/** Who is signed in and how many of their free Veyra AI requests are used. */
export const GET=withDatabase(async(request:Request)=>{
  const user=await tokenUser(request);
  if(!user) return aiError('Sign in to Veyra AI again.',401,'authentication_error');
  return Response.json({user:{name:user.name,email:user.email},available:models().length>0,...await usage(user.id)},{headers:{'Cache-Control':'no-store'}});
});
