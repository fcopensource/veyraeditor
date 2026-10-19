import {readMessages,UpstreamError} from '@/lib/ai';
import {answer,apiError,appFor,clientIp,CORS,gatewayReady,releaseSlot,takeSlot,validKey} from '@/lib/gateway';

export const dynamic='force-dynamic';
export const maxDuration=180;

/** The Veyra AI gateway: OpenAI-compatible chat completions for your own apps, with one API key.
    The model name picks the app profile (content/ai-apps/<app>.md), whose instructions are added to the chat. */
export async function POST(request:Request){
  if(!gatewayReady()) return apiError('The Veyra API is not set up yet: set VEYRA_API_KEY on the server.',503,'api_error');
  if(!validKey(request)) return apiError('Invalid API key. Send it as "Authorization: Bearer <key>".',401,'authentication_error');
  const body=await request.json().catch(()=>null) as {app?:unknown;model?:unknown;stream?:unknown}|null;
  const app=appFor(request,body);
  if(typeof app==='string') return apiError(app,404,'not_found_error');
  const read=readMessages(body);
  if(typeof read==='string') return apiError(read,400);
  const refused=takeSlot(app,clientIp(request));
  if(refused) return apiError(refused,429,'rate_limit_error');
  try{
    const {model,data}=await answer(app,read.messages,read.maxTokens);
    const id='veyra-'+Date.now().toString(36),created=Math.floor(Date.now()/1000);
    const choices=data.choices.map(choice=>({index:choice.index,message:{role:'assistant',content:choice.message.content??''},finish_reason:choice.finish_reason}));
    const headers={...CORS,'Cache-Control':'no-store','X-Veyra-App':app.id,'X-Veyra-Provider':model.provider};
    if(body?.stream===true){
      // Streaming clients get the whole answer as one chunk, in the server-sent events format they expect.
      const chunk=(delta:object,finish:string|null)=>`data: ${JSON.stringify({id,object:'chat.completion.chunk',created,model:app.id,choices:[{index:0,delta,finish_reason:finish}]})}\n\n`;
      const text=choices[0]?.message.content??'';
      return new Response(chunk({role:'assistant',content:text},null)+chunk({},choices[0]?.finish_reason||'stop')+'data: [DONE]\n\n',
        {headers:{...headers,'Content-Type':'text/event-stream; charset=utf-8'}});
    }
    return Response.json({id,object:'chat.completion',created,model:app.id,choices,usage:data.usage},{headers});
  }catch(error){
    releaseSlot(app);
    if(error instanceof UpstreamError) return apiError(error.message,error.status,'api_error');
    console.error('[veyra-api]',error);
    return apiError('Something went wrong. Please try again.',500,'api_error');
  }
}

export const OPTIONS=()=>new Response(null,{status:204,headers:CORS});
