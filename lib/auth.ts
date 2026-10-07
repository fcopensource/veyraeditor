import {createHash,randomBytes,scrypt,timingSafeEqual,type ScryptOptions} from 'node:crypto';
import {cookies} from 'next/headers';
import type {ResultSetHeader,RowDataPacket} from 'mysql2';
import {databaseConfigured,query} from './db';

export const SESSION_COOKIE='veyra-session';
/** Readable (non-HttpOnly) flag so static pages can show "Account" instead of "Log in". Holds no secret. */
export const SIGNED_IN_COOKIE='veyra-signed-in';
const SESSION_DAYS=30;

export type User={id:number;name:string;email:string;createdAt:string;lastLoginAt:string|null};
export const authConfigured=databaseConfigured;

/* ---------- Passwords: scrypt with a per-user salt (Node built-in, no native modules) ---------- */
const SCRYPT:ScryptOptions={N:16384,r:8,p:1,maxmem:64*1024*1024};
const derive=(password:string,salt:Buffer)=>new Promise<Buffer>((resolve,reject)=>scrypt(password.normalize('NFKC'),salt,64,SCRYPT,(error,key)=>error?reject(error):resolve(key)));
export async function hashPassword(password:string){
  const salt=randomBytes(16);
  return `scrypt$${SCRYPT.N}$${salt.toString('base64')}$${(await derive(password,salt)).toString('base64')}`;
}
export async function verifyPassword(password:string,stored:string){
  const [scheme,,salt,hash]=stored.split('$');
  if(scheme!=='scrypt'||!salt||!hash) return false;
  const expected=Buffer.from(hash,'base64');
  const actual=await derive(password,Buffer.from(salt,'base64'));
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
/** Same cost as a real check, so unknown emails can't be detected by response time. */
const DUMMY_HASH='scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA==$'+Buffer.alloc(64).toString('base64');
export const burnPasswordCheck=(password:string)=>verifyPassword(password,DUMMY_HASH);

/* ---------- Tokens: random secrets in the browser, only their SHA-256 in the database ---------- */
export const newToken=()=>randomBytes(32).toString('base64url');
export const tokenHash=(token:string)=>createHash('sha256').update(token).digest('hex');

/* ---------- Sessions ---------- */
export async function startSession(userId:number){
  const token=newToken();
  await query('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? DAY))',[tokenHash(token),userId,SESSION_DAYS]);
  await query('UPDATE users SET last_login_at=UTC_TIMESTAMP() WHERE id=?',[userId]);
  const jar=await cookies();
  const base={secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/',maxAge:60*60*24*SESSION_DAYS};
  jar.set(SESSION_COOKIE,token,{...base,httpOnly:true});
  jar.set(SIGNED_IN_COOKIE,'1',{...base,httpOnly:false});
}

export async function endSession(){
  const jar=await cookies();const token=jar.get(SESSION_COOKIE)?.value;
  if(token&&authConfigured()) await query('DELETE FROM sessions WHERE token_hash=?',[tokenHash(token)]).catch(()=>undefined);
  for(const name of [SESSION_COOKIE,SIGNED_IN_COOKIE]) jar.set(name,'',{path:'/',maxAge:0});
}

type UserRow=RowDataPacket&{id:number;name:string;email:string;created_at:Date;last_login_at:Date|null;password_hash:string};
const toUser=(row:UserRow):User=>({id:row.id,name:row.name,email:row.email,createdAt:row.created_at.toISOString(),lastLoginAt:row.last_login_at?.toISOString()??null});

/** The signed-in user, or null. Expired sessions are cleaned up as they are encountered. */
export async function currentUser():Promise<User|null>{
  if(!authConfigured()) return null;
  const token=(await cookies()).get(SESSION_COOKIE)?.value;
  if(!token) return null;
  const rows=await query<UserRow[]>('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP()',[tokenHash(token)]);
  return rows[0]?toUser(rows[0]):null;
}

export async function findUserByEmail(email:string){
  const rows=await query<UserRow[]>('SELECT * FROM users WHERE email=?',[email]);
  return rows[0]||null;
}
export async function createUser(name:string,email:string,password:string){
  const result=await query<ResultSetHeader>('INSERT INTO users (name,email,password_hash) VALUES (?,?,?)',[name,email,await hashPassword(password)]);
  return result.insertId;
}
export async function passwordHashFor(userId:number){
  const rows=await query<UserRow[]>('SELECT password_hash FROM users WHERE id=?',[userId]);
  return rows[0]?.password_hash||'';
}
/** Change a password and sign out every other session for that user. */
export async function setPassword(userId:number,password:string,keepCurrentSession:boolean){
  await query('UPDATE users SET password_hash=? WHERE id=?',[await hashPassword(password),userId]);
  const current=(await cookies()).get(SESSION_COOKIE)?.value;
  if(keepCurrentSession&&current) await query('DELETE FROM sessions WHERE user_id=? AND token_hash<>?',[userId,tokenHash(current)]);
  else await query('DELETE FROM sessions WHERE user_id=?',[userId]);
}

/* ---------- Input checks and helpers ---------- */
export const normalizeEmail=(email:unknown)=>typeof email==='string'?email.trim().toLowerCase():'';
export const validEmail=(email:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&email.length<=254;
export const validPassword=(password:unknown):password is string=>typeof password==='string'&&password.length>=8&&password.length<=128;

/** Public origin for links in emails. */
export function siteUrl(request?:Request){
  // SITE_URL is read at runtime; NEXT_PUBLIC_SITE_URL is fixed at build time.
  const configured=(process.env.SITE_URL||process.env.NEXT_PUBLIC_SITE_URL)?.replace(/\/$/,'');
  if(configured) return configured;
  const host=request?.headers.get('host');
  return host?`https://${host}`:'https://veyraeditor.com';
}

/* ---------- Simple in-memory rate limiting (per server process) ---------- */
const attempts=new Map<string,{count:number;resetAt:number}>();
/** Returns true when the caller may proceed; allows `limit` attempts per `windowMs`. */
export function rateLimit(key:string,limit:number,windowMs:number){
  const now=Date.now();const entry=attempts.get(key);
  if(!entry||entry.resetAt<now){attempts.set(key,{count:1,resetAt:now+windowMs});if(attempts.size>10000)for(const [k,v] of attempts)if(v.resetAt<now)attempts.delete(k);return true;}
  entry.count++;return entry.count<=limit;
}
export const clientIp=(request:Request)=>(request.headers.get('x-forwarded-for')||'').split(',')[0].trim()||request.headers.get('x-real-ip')||'local';
