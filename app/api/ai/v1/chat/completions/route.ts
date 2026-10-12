import {UpstreamError,addTokens,aiError,complete,freeRequests,readChat,refundRequest,takeRequest,tokenUser} from '@/lib/ai';
import {withDatabase} from '@/lib/db';

export const dynamic='force-dynamic';
export const maxDuration=180;

/** OpenAI-compatible chat completions for signed-in Veyra users, answered with the server's provider key.
    Each account has a fixed number of free requests; a request Veyra AI fails to answer is given back. */
export const POST=withDatabase(async(request:Request)=>{
  const user=await tokenUser(request);
  if(!user) return aiError('Sign in to Veyra AI again.',401,'authentication_error');
  const chat=readChat(await request.json().catch(()=>null));
  if(typeof chat==='string') return aiError(chat,chat.includes('not set up')?503:400);
  if(!await takeRequest(user.id)) return aiError(`You have used all ${freeRequests()} free Veyra AI requests for your account.`,429,'rate_limit_error');
  try{
    const data=await complete(chat.model,chat.messages,chat.maxTokens);
    await addTokens(user.id,data.usage?.total_tokens||0);
    return Response.json({
      id:'veyra-'+Date.now().toString(36),object:'chat.completion',created:Math.floor(Date.now()/1000),model:chat.model.id,
      choices:data.choices!.map(choice=>({index:choice.index,message:{role:'assistant',content:choice.message.content??''},finish_reason:choice.finish_reason})),
      usage:data.usage,
    },{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    await refundRequest(user.id).catch(()=>{});
    if(error instanceof UpstreamError) return aiError(error.message,error.status,'api_error');
    throw error;
  }
});
