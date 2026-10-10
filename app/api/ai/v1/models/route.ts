import {aiError,models,tokenUser} from '@/lib/ai';
import {withDatabase} from '@/lib/db';

export const dynamic='force-dynamic';

/** OpenAI-style model list: the Veyra AI models this server offers. */
export const GET=withDatabase(async(request:Request)=>{
  if(!await tokenUser(request)) return aiError('Sign in to Veyra AI again.',401,'authentication_error');
  return Response.json({object:'list',data:models().map(model=>({id:model.id,object:'model',owned_by:'veyra',name:model.label}))},{headers:{'Cache-Control':'no-store'}});
});
