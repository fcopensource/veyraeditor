import type {ResultSetHeader,RowDataPacket} from 'mysql2';
import {newToken,tokenHash} from './auth';
import {query} from './db';

/* Veyra AI: the Veyra Studio app signs in with a Veyra account and sends OpenAI-style chat requests here.
   The provider keys stay on this server (environment variables) and never reach the app.

   OPENAI_API_KEY        required to turn Veyra AI on
   VEYRA_AI_MODEL        upstream OpenAI model (default gpt-4.1-mini)
   VEYRA_AI_DAILY_LIMIT  requests per user per day (default 100)
   OPENAI_BASE_URL       optional: another OpenAI-compatible endpoint (default https://api.openai.com/v1)

   More providers later: add an entry to models() for each key that is set (any OpenAI-compatible
   chat-completions API works with the same code), and the app lists it automatically. */

export type Model={id:string;label:string;endpoint:string;key:string;upstream:string};

/** Models offered to the app, from the provider keys configured on this server. */
export function models():Model[]{
  const list:Model[]=[];
  const openai=(process.env.OPENAI_API_KEY||'').trim();
  const endpoint=(process.env.OPENAI_BASE_URL||'https://api.openai.com/v1').trim();
  if(openai) list.push({id:'veyra-ai',label:'Veyra AI',endpoint:endpoint.endsWith('/')?endpoint.slice(0,-1):endpoint,key:openai,upstream:(process.env.VEYRA_AI_MODEL||'gpt-4.1-mini').trim()});
  return list;
}
export const dailyLimit=()=>Math.max(1,Number(process.env.VEYRA_AI_DAILY_LIMIT)||100);
export const MAX_OUTPUT_TOKENS=4096;

/* ---------- App sign-in tokens ---------- */
export type TokenUser={id:number;name:string;email:string};

/** A new device token for the app. Only its SHA-256 is stored. */
export async function createAppToken(userId:number,device:string){
  const token='vey_'+newToken();
  await query('INSERT INTO api_tokens (token_hash,user_id,device) VALUES (?,?,?)',[tokenHash(token),userId,device.slice(0,80)]);
  return token;
}
const bearer=(request:Request)=>{
  const header=request.headers.get('authorization')||'';
  const token=header.startsWith('Bearer ')?header.slice(7).trim():'';
  return token.startsWith('vey_')&&token.length<200?token:'';
};
/** The account behind an app token, or null. */
export async function tokenUser(request:Request):Promise<TokenUser|null>{
  const token=bearer(request);
  if(!token) return null;
  const rows=await query<(RowDataPacket&TokenUser)[]>('SELECT u.id,u.name,u.email FROM api_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=?',[tokenHash(token)]);
  if(!rows[0]) return null;
  await query('UPDATE api_tokens SET last_used_at=UTC_TIMESTAMP() WHERE token_hash=?',[tokenHash(token)]);
  return {id:rows[0].id,name:rows[0].name,email:rows[0].email};
}
export async function revokeAppToken(request:Request){
  const token=bearer(request);
  if(token) await query('DELETE FROM api_tokens WHERE token_hash=?',[tokenHash(token)]);
}

/* ---------- Daily usage ---------- */
export async function usageToday(userId:number){
  const rows=await query<(RowDataPacket&{requests:number;tokens:number})[]>('SELECT requests,tokens FROM ai_usage WHERE user_id=? AND day=UTC_DATE()',[userId]);
  const tomorrow=new Date();tomorrow.setUTCHours(24,0,0,0);
  return {used:rows[0]?.requests||0,tokens:rows[0]?.tokens||0,limit:dailyLimit(),resetsAt:tomorrow.toISOString()};
}
/** Count one request; false when the daily limit is already reached. */
export async function takeRequest(userId:number){
  // Today's row matches only while under the limit, so this counts the request or does nothing.
  const updated=await query<ResultSetHeader>('UPDATE ai_usage SET requests=requests+1 WHERE user_id=? AND day=UTC_DATE() AND requests<?',[userId,dailyLimit()]);
  if(updated.affectedRows>0) return true;
  // No row yet today: start one. If a row exists, the limit has been reached.
  const inserted=await query<ResultSetHeader>('INSERT IGNORE INTO ai_usage (user_id,day,requests) VALUES (?,UTC_DATE(),1)',[userId]);
  return inserted.affectedRows>0;
}
export async function addTokens(userId:number,tokens:number){
  if(tokens>0) await query('UPDATE ai_usage SET tokens=tokens+? WHERE user_id=? AND day=UTC_DATE()',[Math.min(tokens,1_000_000),userId]);
}

/* ---------- Requests ---------- */
type ChatMessage={role:'system'|'user'|'assistant';content:string};
/** The parts of an OpenAI chat request Veyra AI accepts, validated and capped. */
export function readChat(body:unknown):{model:Model;messages:ChatMessage[];maxTokens:number}|string{
  const input=body as {model?:unknown;messages?:unknown;max_tokens?:unknown;max_completion_tokens?:unknown}|null;
  const available=models();
  if(!available.length) return 'Veyra AI is not set up on this server yet.';
  const model=available.find(m=>m.id===input?.model)||available[0];
  if(!Array.isArray(input?.messages)||!input.messages.length||input.messages.length>40) return 'Send between 1 and 40 messages.';
  const messages:ChatMessage[]=[];let size=0;
  for(const item of input.messages as {role?:unknown;content?:unknown}[]){
    if(!['system','user','assistant'].includes(String(item?.role))||typeof item?.content!=='string') return 'Each message needs a role (system, user or assistant) and text content.';
    size+=item.content.length;
    messages.push({role:item.role as ChatMessage['role'],content:item.content});
  }
  if(size>160_000) return 'The conversation is too long. Start a new chat or attach less code.';
  const requested=Number(input?.max_completion_tokens??input?.max_tokens)||MAX_OUTPUT_TOKENS;
  return {model,messages,maxTokens:Math.max(16,Math.min(requested,MAX_OUTPUT_TOKENS))};
}

/** Ask the upstream provider. Returns its JSON (OpenAI chat-completion shape) or throws with a safe message. */
export async function complete(model:Model,messages:ChatMessage[],maxTokens:number){
  const response=await fetch(model.endpoint+'/chat/completions',{
    method:'POST',
    headers:{'content-type':'application/json',authorization:`Bearer ${model.key}`},
    body:JSON.stringify({model:model.upstream,messages,max_completion_tokens:maxTokens,store:false}),
    signal:AbortSignal.timeout(170_000),
  }).catch(error=>{
    console.error('[veyra-ai] upstream unreachable',error);
    throw new UpstreamError((error as Error)?.name==='TimeoutError'?'Veyra AI took too long to answer. Try a shorter request.':'Veyra AI is unreachable right now. Please try again shortly.',504);
  });
  const data=await response.json().catch(()=>null) as {choices?:{index:number;message:{role:string;content:string|null};finish_reason:string}[];usage?:{total_tokens?:number};error?:{message?:string}}|null;
  if(!response.ok||!data?.choices){
    console.error('[veyra-ai] upstream error',response.status,data?.error?.message);
    throw new UpstreamError(response.status===429?'Veyra AI is busy right now. Please try again in a minute.':'Veyra AI could not answer this request. Please try again.',response.status===429?429:502);
  }
  return data;
}
export class UpstreamError extends Error{constructor(message:string,readonly status:number){super(message);}}

/** Errors in the shape OpenAI clients understand. */
export const aiError=(message:string,status:number,type='invalid_request_error')=>Response.json({error:{message,type}},{status,headers:{'Cache-Control':'no-store'}});

/* ---------- Devices (app sign-ins) for the account page ---------- */
export type Device={id:string;device:string;createdAt:string;lastUsedAt:string|null};
/** Devices signed in to the Veyra app. The id is a prefix of the token's hash: enough to revoke it, useless to sign in. */
export async function listDevices(userId:number):Promise<Device[]>{
  const rows=await query<(RowDataPacket&{token_hash:string;device:string;created_at:Date;last_used_at:Date|null})[]>(
    'SELECT token_hash,device,created_at,last_used_at FROM api_tokens WHERE user_id=? ORDER BY COALESCE(last_used_at,created_at) DESC LIMIT 20',[userId]);
  return rows.map(row=>({id:row.token_hash.slice(0,16),device:row.device||'Veyra Studio',createdAt:row.created_at.toISOString(),lastUsedAt:row.last_used_at?.toISOString()??null}));
}
export async function revokeDevice(userId:number,id:string){
  if(!/^[0-9a-f]{16}$/.test(id)) return false;
  const result=await query<ResultSetHeader>('DELETE FROM api_tokens WHERE user_id=? AND token_hash LIKE ?',[userId,id+'%']);
  return result.affectedRows>0;
}
