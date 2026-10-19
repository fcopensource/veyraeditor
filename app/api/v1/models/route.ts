import {apiError,apps,CORS,gatewayReady,usageToday,validKey} from '@/lib/gateway';

export const dynamic='force-dynamic';

/** The apps this gateway serves, as OpenAI-style models: send an app's id as the model to use its profile. */
export function GET(request:Request){
  if(!gatewayReady()) return apiError('The Veyra API is not set up yet: set VEYRA_API_KEY on the server.',503,'api_error');
  if(!validKey(request)) return apiError('Invalid API key. Send it as "Authorization: Bearer <key>".',401,'authentication_error');
  const used=usageToday();
  return Response.json({object:'list',data:[...apps().values()].map(app=>({
    id:app.id,object:'model',owned_by:'veyra',name:app.name,description:app.description,
    provider:app.provider,daily_limit:app.dailyLimit,used_today:used[app.id]||0,
  }))},{headers:{...CORS,'Cache-Control':'no-store'}});
}

export const OPTIONS=()=>new Response(null,{status:204,headers:CORS});
