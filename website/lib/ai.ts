import Anthropic from '@anthropic-ai/sdk';
import type {ResultSetHeader,RowDataPacket} from 'mysql2';
import {newToken,tokenHash} from './auth';
import {query} from './db';

/* Veyra AI: the Veyra Studio app signs in with a Veyra account and sends OpenAI-style chat requests here.
   Users always see one model, "Veyra AI". Which provider answers is decided here, from environment variables;
   the keys stay on this server and never reach the app.

   Set ONE of these (if several are set, VEYRA_AI_PROVIDER picks; otherwise the first in this order is used):
     OpenAI        OPENAI_API_KEY        model: VEYRA_OPENAI_MODEL (default gpt-4.1-mini)
     Claude        ANTHROPIC_API_KEY     model: VEYRA_CLAUDE_MODEL (default claude-opus-5-5),
                                         effort: VEYRA_CLAUDE_EFFORT (low | medium | high; default medium)
     Any other     VEYRA_AI_API_KEY + VEYRA_AI_BASE_URL + VEYRA_AI_MODEL
                   (any OpenAI-compatible API: Gemini, Groq, OpenRouter, DeepSeek, Mistral, xAI, Together…)
   VEYRA_AI_PROVIDER        optional: openai | anthropic | compatible
   VEYRA_AI_FREE_REQUESTS   requests each account can make, in total (default 10) */

type Provider='openai'|'anthropic'|'compatible';
export type Model={id:string;label:string;provider:Provider;endpoint:string;key:string;upstream:string};
const env=(name:string)=>(process.env[name]||'').trim();
const trimSlash=(url:string)=>url.endsWith('/')?url.slice(0,-1):url;

/** Every provider that has a key configured, in priority order. */
function configured():Model[]{
  const list:Model[]=[];
  const base={id:'veyra-ai',label:'Veyra AI'};
  if(env('OPENAI_API_KEY')) list.push({...base,provider:'openai',key:env('OPENAI_API_KEY'),endpoint:trimSlash(env('OPENAI_BASE_URL')||'https://api.openai.com/v1'),
    upstream:env('VEYRA_OPENAI_MODEL')||(!env('VEYRA_AI_API_KEY')&&env('VEYRA_AI_MODEL'))||'gpt-4.1-mini'});
  if(env('ANTHROPIC_API_KEY')) list.push({...base,provider:'anthropic',key:env('ANTHROPIC_API_KEY'),endpoint:'',upstream:env('VEYRA_CLAUDE_MODEL')||'claude-opus-5-5'});
  if(env('VEYRA_AI_API_KEY')&&env('VEYRA_AI_BASE_URL')&&env('VEYRA_AI_MODEL')) list.push({...base,provider:'compatible',key:env('VEYRA_AI_API_KEY'),endpoint:trimSlash(env('VEYRA_AI_BASE_URL')),upstream:env('VEYRA_AI_MODEL')});
  return list;
}

/** Every configured provider, chosen one first: for the API gateway, which picks per app and falls back. */
export function providerModels():Model[]{
  const all=configured(),preferred=env('VEYRA_AI_PROVIDER').toLowerCase();
  return [...all.filter(m=>m.provider===preferred),...all.filter(m=>m.provider!==preferred)];
}
export type {Provider};
/** The model offered to the app: one "Veyra AI", served by the chosen provider. */
export function models():Model[]{
  const all=configured();
  const chosen=all.find(model=>model.provider===env('VEYRA_AI_PROVIDER').toLowerCase())||all[0];
  return chosen?[chosen]:[];
}
/** For /api/health: which provider and upstream model are answering (never the key). */
export const aiStatus=()=>{const model=models()[0];return model?{enabled:true,provider:model.provider,model:model.upstream}:{enabled:false,provider:null,model:null};};
/** Free requests per account, in total. Unset or not a number = 10; 0 switches Veyra AI off for everyone. */
export const freeRequests=()=>{const value=Number.parseInt(env('VEYRA_AI_FREE_REQUESTS'),10);return Number.isFinite(value)&&value>=0?value:10;};
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

/* ---------- Free requests (per account, in total) ---------- */
/** How many of the account's free Veyra AI requests are used, and how many tokens they took. */
export async function usage(userId:number){
  const [allowance,totals]=await Promise.all([
    query<(RowDataPacket&{used:number})[]>('SELECT used FROM ai_allowance WHERE user_id=?',[userId]),
    query<(RowDataPacket&{tokens:number|null})[]>('SELECT SUM(tokens) AS tokens FROM ai_usage WHERE user_id=?',[userId]),
  ]);
  const limit=freeRequests();
  return {used:Math.min(allowance[0]?.used||0,limit),limit,tokens:Number(totals[0]?.tokens||0)};
}
/** Use one free request; false when they are all used. Safe when several requests arrive at once. */
export async function takeRequest(userId:number){
  const limit=freeRequests();
  if(limit<1) return false;
  // The row matches only while under the limit, so this counts the request or does nothing.
  const updated=await query<ResultSetHeader>('UPDATE ai_allowance SET used=used+1 WHERE user_id=? AND used<?',[userId,limit]);
  let taken=updated.affectedRows>0;
  // No row yet: this is the account's first request. If a row exists, the requests are used up.
  if(!taken) taken=(await query<ResultSetHeader>('INSERT IGNORE INTO ai_allowance (user_id,used) VALUES (?,1)',[userId])).affectedRows>0;
  if(taken) await query('INSERT INTO ai_usage (user_id,day,requests) VALUES (?,UTC_DATE(),1) ON DUPLICATE KEY UPDATE requests=requests+1',[userId]);
  return taken;
}
/** Give a request back when Veyra AI could not answer it, so a failure never costs a free request. */
export async function refundRequest(userId:number){
  await query('UPDATE ai_allowance SET used=used-1 WHERE user_id=? AND used>0',[userId]);
}
export async function addTokens(userId:number,tokens:number){
  if(tokens>0) await query('UPDATE ai_usage SET tokens=tokens+? WHERE user_id=? AND day=UTC_DATE()',[Math.min(tokens,1_000_000),userId]);
}

/* ---------- Requests ---------- */
export type ChatMessage={role:'system'|'user'|'assistant';content:string};
/** The parts of an OpenAI chat request Veyra AI accepts, validated and capped. */
export function readChat(body:unknown):{model:Model;messages:ChatMessage[];maxTokens:number}|string{
  const available=models();
  if(!available.length) return 'Veyra AI is not set up on this server yet.';
  const model=available.find(m=>m.id===(body as {model?:unknown}|null)?.model)||available[0];
  const read=readMessages(body);
  return typeof read==='string'?read:{model,...read};
}
/** The messages and output limit of an OpenAI-style chat request, validated and capped. */
export function readMessages(body:unknown):{messages:ChatMessage[];maxTokens:number}|string{
  const input=body as {messages?:unknown;max_tokens?:unknown;max_completion_tokens?:unknown}|null;
  if(!Array.isArray(input?.messages)||!input.messages.length||input.messages.length>40) return 'Send between 1 and 40 messages.';
  const messages:ChatMessage[]=[];let size=0;
  for(const item of input.messages as {role?:unknown;content?:unknown}[]){
    if(!['system','user','assistant'].includes(String(item?.role))||typeof item?.content!=='string') return 'Each message needs a role (system, user or assistant) and text content.';
    size+=item.content.length;
    messages.push({role:item.role as ChatMessage['role'],content:item.content});
  }
  if(size>160_000) return 'The conversation is too long. Start a new chat or attach less code.';
  const requested=Number(input?.max_completion_tokens??input?.max_tokens)||MAX_OUTPUT_TOKENS;
  return {messages,maxTokens:Math.max(16,Math.min(requested,MAX_OUTPUT_TOKENS))};
}

/** Ask the upstream provider. Returns its JSON (OpenAI chat-completion shape) or throws with a safe message. */
type Completion={choices:{index:number;message:{role:string;content:string|null};finish_reason:string}[];usage?:{total_tokens?:number}};

export async function complete(model:Model,messages:ChatMessage[],maxTokens:number):Promise<Completion>{
  return model.provider==='anthropic'?completeWithClaude(model,messages):completeOpenAICompatible(model,messages,maxTokens);
}

/* Claude, through the official Anthropic SDK. */
const CLAUDE_FALLBACK_MODELS=['claude-fable-5-1','claude-opus-5-5','claude-opus-5','claude-sonnet-5-5'];
async function completeWithClaude(model:Model,messages:ChatMessage[]):Promise<Completion>{
  const client=new Anthropic({apiKey:model.key,timeout:170_000,maxRetries:1});
  const system=messages.filter(m=>m.role==='system').map(m=>m.content).join('\n\n');
  const conversation=messages.filter(m=>m.role!=='system').map(m=>({role:m.role as 'user'|'assistant',content:m.content}));
  if(conversation[0]?.role!=='user') throw new UpstreamError('The conversation must start with a user message.',400);
  const effort=(['low','medium','high'] as const).find(level=>level===env('VEYRA_CLAUDE_EFFORT').toLowerCase())||'medium';
  // On a safety decline the API re-runs the request on Anthropic's recommended fallback model (supported models only).
  const fallback=CLAUDE_FALLBACK_MODELS.includes(model.upstream)?{betas:['server-side-fallback-2026-07-01'],fallbacks:'default' as const}:{};
  try{
    const response=await client.beta.messages.create({
      model:model.upstream,max_tokens:16000,messages:conversation,
      ...(system?{system}:{}),output_config:{effort},...fallback,
    });
    if(response.stop_reason==='refusal') throw new UpstreamError('Veyra AI declined this request.',400);
    const text=response.content.map(block=>block.type==='text'?block.text:'').join('');
    return {
      choices:[{index:0,message:{role:'assistant',content:text},finish_reason:response.stop_reason==='max_tokens'?'length':'stop'}],
      usage:{total_tokens:(response.usage.input_tokens||0)+(response.usage.output_tokens||0)},
    };
  }catch(error){
    if(error instanceof UpstreamError) throw error;
    if(error instanceof Anthropic.RateLimitError) throw new UpstreamError('Veyra AI is busy right now. Please try again in a minute.',429);
    if(error instanceof Anthropic.APIConnectionTimeoutError) throw new UpstreamError('Veyra AI took too long to answer. Try a shorter request.',504);
    if(error instanceof Anthropic.APIConnectionError) throw new UpstreamError('Veyra AI is unreachable right now. Please try again shortly.',504);
    if(error instanceof Anthropic.APIError){console.error('[veyra-ai] Claude error',error.status,error.message);throw new UpstreamError('Veyra AI could not answer this request. Please try again.',502);}
    throw error;
  }
}

/* OpenAI, or any OpenAI-compatible chat-completions API. */
async function completeOpenAICompatible(model:Model,messages:ChatMessage[],maxTokens:number):Promise<Completion>{
  // OpenAI wants max_completion_tokens (and store:false keeps conversations off OpenAI's dashboard);
  // other compatible providers expect the classic max_tokens.
  const limits=model.provider==='openai'?{max_completion_tokens:maxTokens,store:false}:{max_tokens:maxTokens};
  const response=await fetch(model.endpoint+'/chat/completions',{
    method:'POST',
    headers:{'content-type':'application/json',authorization:`Bearer ${model.key}`},
    body:JSON.stringify({model:model.upstream,messages,...limits}),
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
  return {choices:data.choices,usage:data.usage};
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
