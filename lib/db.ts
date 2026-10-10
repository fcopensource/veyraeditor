import {existsSync} from 'node:fs';
import mysql from 'mysql2/promise';

/* MySQL connection (Hostinger database). Configure either DATABASE_URL=mysql://user:pass@host:3306/name
   or DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME. Tables are created on first use. */

type Pool=mysql.Pool;
type Route={via:string;options:mysql.ConnectionOptions};
type Attempt={via:string;code:string;detail:string};
const globalForDb=globalThis as unknown as {veyraPool?:Promise<{pool:Pool;via:string}>;veyraSchema?:Promise<void>};

export function databaseConfigured(){
  return !!(process.env.DATABASE_URL||(process.env.DB_HOST&&process.env.DB_USER&&process.env.DB_NAME));
}

/** Environment value without stray spaces or the quotes people sometimes paste around it. */
function env(name:string){
  const value=(process.env[name]||'').trim();
  return value.length>=2&&/^(["'])[\s\S]*\1$/.test(value)?value.slice(1,-1):value;
}

/** Ways to reach the server, most likely first. On shared hosting a "localhost" user may only be allowed
    through one of: the name localhost, IPv4 127.0.0.1, or the local socket, so try each. */
function routes():Route[]{
  if(process.env.DATABASE_URL) return [{via:'DATABASE_URL',options:{uri:env('DATABASE_URL')}}];
  const login={user:env('DB_USER'),password:env('DB_PASSWORD'),database:env('DB_NAME')};
  const host=env('DB_HOST'),port=Number(env('DB_PORT'))||3306;
  if(!['localhost','127.0.0.1','::1'].includes(host)) return [{via:host,options:{host,port,...login}}];
  const sockets=['/var/run/mysqld/mysqld.sock','/var/lib/mysql/mysql.sock','/tmp/mysql.sock','/run/mysqld/mysqld.sock'].filter(path=>existsSync(path));
  return [
    {via:'localhost',options:{host:'localhost',port,...login}},
    {via:'127.0.0.1',options:{host:'127.0.0.1',port,...login}},
    ...sockets.map(socketPath=>({via:socketPath,options:{socketPath,...login}})),
  ];
}

/** MySQL's own explanation, with the user name shortened so the health page doesn't publish it. */
const describe=(error:unknown)=>String((error as {sqlMessage?:string;message?:string})?.sqlMessage||(error as Error)?.message||'')
  .replace(/'([^']{0,3})[^']*'@/g,"'$1…'@").slice(0,200);

class ConnectError extends Error{
  constructor(readonly code:string,readonly attempts:Attempt[]){super('Could not connect to MySQL: '+attempts.map(a=>`${a.via} → ${a.code}`).join(', '));}
}

/** First route that accepts the login, turned into a pool. Failures are retried on the next request. */
async function connect(){
  const attempts:Attempt[]=[];
  for(const route of routes()){
    try{
      const connection=await mysql.createConnection({...route.options,connectTimeout:8000});
      await connection.ping();await connection.end();
      return {pool:mysql.createPool({...route.options,waitForConnections:true,connectionLimit:5,enableKeepAlive:true,connectTimeout:10000,timezone:'Z',charset:'utf8mb4'}),via:route.via};
    }catch(error){attempts.push({via:route.via,code:errorCode(error),detail:describe(error)});}
  }
  // Report the most informative failure: a rejected login beats "nothing listening on this route".
  const best=attempts.find(a=>a.code.startsWith('ER_'))||attempts[0];
  throw new ConnectError(best?.code||'UNKNOWN',attempts);
}
function pool(){
  globalForDb.veyraPool??=connect().catch(error=>{globalForDb.veyraPool=undefined;throw error;});
  return globalForDb.veyraPool.then(result=>result.pool);
}

const SCHEMA=[
  `CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    email VARCHAR(254) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login_at DATETIME NULL,
    UNIQUE KEY users_email (email)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash CHAR(64) NOT NULL PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    KEY sessions_user (user_id),
    KEY sessions_expiry (expires_at),
    CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS password_resets (
    token_hash CHAR(64) NOT NULL PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    expires_at DATETIME NOT NULL,
    KEY resets_user (user_id),
    CONSTRAINT resets_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

/** Create tables once per server process. */
function ensureSchema(){
  globalForDb.veyraSchema??=(async()=>{const db=await pool();for(const statement of SCHEMA) await db.query(statement);})()
    .catch(error=>{globalForDb.veyraSchema=undefined;throw error;});
  return globalForDb.veyraSchema;
}

export async function query<T=mysql.RowDataPacket[]>(sql:string,params:unknown[]=[]):Promise<T>{
  await ensureSchema();
  const [rows]=await (await pool()).execute(sql,params as (string|number|null)[]);
  return rows as T;
}

/* ---------- Errors: a clear message instead of an empty 500 ---------- */
const HINTS:Record<string,string>={
  ECONNREFUSED:'Nothing is accepting connections at DB_HOST:DB_PORT. On Hostinger, use the MySQL host shown in hPanel → Databases (for example srv123.hstgr.io), or localhost.',
  ENOTFOUND:'DB_HOST is not a known host name. Copy it exactly from hPanel → Databases.',
  ETIMEDOUT:'The database did not answer in time. If DB_HOST is a remote host, allow this server in hPanel → Databases → Remote MySQL.',
  ER_ACCESS_DENIED_ERROR:'MySQL rejected DB_USER / DB_PASSWORD. If the detail says "using password: NO", DB_PASSWORD is not reaching the app: re-add it and redeploy. Otherwise retype the password (or reset it in hPanel → Databases), and check DB_USER is the full name starting with u…_.',
  ER_DBACCESS_DENIED_ERROR:'DB_USER has no access to DB_NAME. Assign the user to the database in hPanel → Databases.',
  ER_BAD_DB_ERROR:'DB_NAME does not exist. Copy the full database name (it usually starts with u…_) from hPanel → Databases.',
  ER_HOST_NOT_PRIVILEGED:'This server is not allowed to connect. Add it in hPanel → Databases → Remote MySQL.',
  ER_TABLEACCESS_DENIED_ERROR:'DB_USER cannot create tables. Give the user all privileges on the database.',
};
export const errorCode=(error:unknown)=>String((error as {code?:string})?.code||'UNKNOWN');
export const errorHint=(code:string)=>HINTS[code]||'Unexpected database error. See the server logs for details.';

/** Wrap a route handler: database failures are logged and answered with a readable 503 instead of crashing. */
export function withDatabase<A extends unknown[]>(handler:(...args:A)=>Promise<Response>){
  return async(...args:A):Promise<Response>=>{
    try{return await handler(...args);}
    catch(error){
      const code=errorCode(error);
      console.error('[veyra] request failed:',code,error);
      return Response.json({error:'Accounts are temporarily unavailable. Please try again in a few minutes.',code},{status:503});
    }
  };
}

/** Connection check for /api/health: whether the database is configured, reachable and has its tables. */
export async function checkDatabase(){
  if(!databaseConfigured()) return {configured:false,connected:false,code:'NOT_CONFIGURED',hint:'Set DB_HOST, DB_PORT, DB_USER, DB_PASSWORD and DB_NAME (or DATABASE_URL) in the Node.js app settings, then redeploy.'};
  try{await ensureSchema();await (await pool()).query('SELECT 1');const via=(await globalForDb.veyraPool)?.via;return {configured:true,connected:true,code:'OK',via,hint:'Connected, and the users, sessions and password_resets tables are ready.'};}
  catch(error){const code=errorCode(error);console.error('[veyra] database check failed:',code,error);
    const attempts=error instanceof ConnectError?error.attempts:[{via:'query',code,detail:describe(error)}];
    return {configured:true,connected:false,code,hint:errorHint(code),attempts};}
}
