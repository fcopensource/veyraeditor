import {createHash,timingSafeEqual} from 'node:crypto';
import {readdirSync,readFileSync,statSync} from 'node:fs';
import path from 'node:path';
import {complete,providerModels,UpstreamError,type ChatMessage,type Model,type Provider} from './ai';

/* The Veyra AI gateway (api.veyraeditor.com/v1): one API key for all of your own apps.

   Each app has a profile in content/ai-apps/<app>.md: its instructions and knowledge, which the gateway
   adds to every request, and optional settings at the top. An app picks its profile by sending its name
   as the model, e.g. model: "veyra-pdf". To teach an app something, edit its file; to add an app, add a file.

   Environment:
     VEYRA_API_KEY            the key your apps send (several, comma-separated, to rotate without downtime)
     VEYRA_API_DAILY_LIMIT    requests per app per day unless the profile sets daily_limit (default 1000)
     VEYRA_API_PER_MINUTE     requests per IP address per minute (default 30)
     VEYRA_AI_APPS_DIR        optional folder of profiles outside this public repository
   Provider keys are the same as Veyra AI's: OPENAI_API_KEY and/or ANTHROPIC_API_KEY (see lib/ai.ts). */

const env=(name:string)=>(process.env[name]||'').trim();
// This repository is public: keep private knowledge in a folder on the server and point VEYRA_AI_APPS_DIR at it.
const APPS_DIR=env('VEYRA_AI_APPS_DIR')||path.join(process.cwd(),'content','ai-apps');
export const DEFAULT_APP='general';

export type AppProfile={id:string;name:string;description:string;provider:Provider|'auto';model:string;dailyLimit:number;instructions:string};

/** Read a profile file: "key: value" settings between --- lines, then the instructions and knowledge. */
export function parseProfile(id:string,text:string):AppProfile{
  const match=text.replace(/^﻿/,'').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const settings:Record<string,string>={};
  for(const line of (match?.[1]??'').split(/\r?\n/)){
    const pair=line.match(/^\s*([a-z_]+)\s*:\s*(.*?)\s*$/i);
    if(pair) settings[pair[1].toLowerCase()]=pair[2].replace(/^(["'])(.*)\1$/,'$2');
  }
  const provider=(['openai','anthropic','claude'] as const).find(p=>p===settings.provider?.toLowerCase());
  const limit=Number.parseInt(settings.daily_limit||'',10);
  return {
    id,name:settings.name||id,description:settings.description||'',
    provider:provider==='claude'?'anthropic':provider||'auto',model:settings.model||'',
    dailyLimit:Number.isFinite(limit)&&limit>=0?limit:Number.parseInt(env('VEYRA_API_DAILY_LIMIT'),10)||1000,
    instructions:(match?match[2]:text).trim(),
  };
}

// Profiles are re-read when their files change, so editing a profile needs no restart.
let cache:{stamp:string;apps:Map<string,AppProfile>}|null=null;
export function apps():Map<string,AppProfile>{
  let files:string[]=[];
  try{files=readdirSync(APPS_DIR).filter(name=>/^[a-z0-9][a-z0-9-]{0,62}\.md$/.test(name)).sort();}catch{/* no profiles yet */}
  const stamp=files.map(name=>{try{return name+statSync(path.join(APPS_DIR,name)).mtimeMs;}catch{return name;}}).join('|');
  if(cache?.stamp===stamp) return cache.apps;
  const list=new Map<string,AppProfile>();
  for(const file of files){
    try{const id=file.slice(0,-3);list.set(id,parseProfile(id,readFileSync(path.join(APPS_DIR,file),'utf8')));}
    catch(error){console.error('[veyra-api] could not read profile',file,error);}
  }
  if(!list.has(DEFAULT_APP)) list.set(DEFAULT_APP,parseProfile(DEFAULT_APP,'---\nname: General\n---\nYou are Veyra AI, a helpful assistant.'));
  cache={stamp,apps:list};
  return list;
}
/** The app a request is for: the X-Veyra-App header, an "app" field, or the model name. Unknown names use "general". */
export function appFor(request:Request,body:{app?:unknown;model?:unknown}|null):AppProfile|string{
  const all=apps();
  const asked=String(request.headers.get('x-veyra-app')||body?.app||body?.model||DEFAULT_APP).trim().toLowerCase().replace(/^veyra\//,'');
  const named=request.headers.get('x-veyra-app')||body?.app;
  const found=all.get(asked);
  if(!found&&named) return `There is no app called "${asked}". Add content/ai-apps/${asked}.md to create it.`;
  return found||all.get(DEFAULT_APP)!;
}

/* ---------- The key ---------- */
const digest=(value:string)=>createHash('sha256').update(value).digest();
/** True when the request carries one of the configured keys (Authorization: Bearer, or x-api-key). */
export function validKey(request:Request):boolean{
  const keys=env('VEYRA_API_KEY').split(',').map(k=>k.trim()).filter(k=>k.length>=16);
  if(!keys.length) return false;
  const header=request.headers.get('authorization')||'';
  const sent=(header.startsWith('Bearer ')?header.slice(7):request.headers.get('x-api-key')||'').trim();
  if(!sent||sent.length>200) return false;
  const given=digest(sent);
  return keys.some(key=>timingSafeEqual(digest(key),given));
}
export const gatewayReady=()=>env('VEYRA_API_KEY').split(',').some(k=>k.trim().length>=16);

/* ---------- Limits (kept in memory: a safety net against a leaked key, reset on restart) ---------- */
const store=globalThis as unknown as {veyraLimits?:{day:string;perApp:Map<string,number>;perIp:Map<string,{minute:number;count:number}>}};
const limits=()=>{
  const day=new Date().toISOString().slice(0,10);
  if(store.veyraLimits?.day!==day) store.veyraLimits={day,perApp:new Map(),perIp:new Map()};
  return store.veyraLimits;
};
export const clientIp=(request:Request)=>(request.headers.get('x-forwarded-for')||'').split(',')[0].trim()||request.headers.get('x-real-ip')||'unknown';
/** Count a request; returns why it is refused, or null. */
export function takeSlot(app:AppProfile,ip:string):string|null{
  const state=limits();
  const minute=Math.floor(Date.now()/60000),perMinute=Number.parseInt(env('VEYRA_API_PER_MINUTE'),10)||30;
  const slot=state.perIp.get(ip);
  if(slot?.minute===minute&&slot.count>=perMinute) return `Too many requests: the limit is ${perMinute} a minute. Try again shortly.`;
  if((state.perApp.get(app.id)||0)>=app.dailyLimit) return `The app "${app.id}" has used its ${app.dailyLimit} requests for today.`;
  state.perIp.set(ip,slot?.minute===minute?{minute,count:slot.count+1}:{minute,count:1});
  state.perApp.set(app.id,(state.perApp.get(app.id)||0)+1);
  return null;
}
export function releaseSlot(app:AppProfile){
  const state=limits();
  state.perApp.set(app.id,Math.max(0,(state.perApp.get(app.id)||0)-1));
}
export const usageToday=()=>Object.fromEntries(limits().perApp);

/* ---------- Answering ---------- */
/** The providers to try for an app, in order: its chosen one first, then the others as a fallback. */
export function routeFor(app:AppProfile):Model[]{
  const all=providerModels();
  const preferred=app.provider==='auto'?all[0]?.provider:app.provider;
  const ordered=[...all.filter(m=>m.provider===preferred),...all.filter(m=>m.provider!==preferred)];
  // A model named in the profile belongs to the preferred provider; fallbacks use their own default model.
  return ordered.map(m=>app.model&&m.provider===preferred?{...m,upstream:app.model}:m);
}
/** The app's instructions go first, then whatever the caller sends. */
export const withInstructions=(app:AppProfile,messages:ChatMessage[]):ChatMessage[]=>
  app.instructions?[{role:'system',content:app.instructions},...messages]:messages;

/** Ask the app's provider, falling back to the next one when a provider is down or busy. */
export async function answer(app:AppProfile,messages:ChatMessage[],maxTokens:number){
  const route=routeFor(app);
  if(!route.length) throw new UpstreamError('No AI provider is set up on this server. Add OPENAI_API_KEY or ANTHROPIC_API_KEY.',503);
  let last:unknown;
  for(const model of route){
    try{return {model,data:await complete(model,withInstructions(app,messages),maxTokens)};}
    catch(error){
      last=error;
      // A bad request fails the same everywhere; only outages and rate limits move on to the next provider.
      if(!(error instanceof UpstreamError)||![429,502,503,504].includes(error.status)) throw error;
      console.error('[veyra-api] provider failed, trying the next',model.provider,error.status);
    }
  }
  throw last;
}

/** CORS, so browser-based apps and extensions can call the gateway with the key. */
export const CORS={
  'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':'authorization, content-type, x-api-key, x-veyra-app','Access-Control-Max-Age':'86400',
};
export const apiError=(message:string,status:number,type='invalid_request_error')=>
  Response.json({error:{message,type}},{status,headers:{...CORS,'Cache-Control':'no-store'}});
