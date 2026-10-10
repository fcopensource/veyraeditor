import mysql from 'mysql2/promise';

/* MySQL connection (Hostinger database). Configure either DATABASE_URL=mysql://user:pass@host:3306/name
   or DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME. Tables are created on first use. */

type Pool=mysql.Pool;
const globalForDb=globalThis as unknown as {veyraPool?:Pool;veyraSchema?:Promise<void>};

export function databaseConfigured(){
  return !!(process.env.DATABASE_URL||(process.env.DB_HOST&&process.env.DB_USER&&process.env.DB_NAME));
}

/** Node 18+ may resolve "localhost" to IPv6 ::1 while MySQL listens only on 127.0.0.1, so connect over IPv4. */
function dbHost(){
  const host=(process.env.DB_HOST||'').trim();
  return host==='localhost'?'127.0.0.1':host;
}

function pool():Pool{
  if(globalForDb.veyraPool) return globalForDb.veyraPool;
  const common={waitForConnections:true,connectionLimit:5,enableKeepAlive:true,connectTimeout:10000,timezone:'Z' as const,charset:'utf8mb4'};
  globalForDb.veyraPool=process.env.DATABASE_URL
    ?mysql.createPool({uri:process.env.DATABASE_URL,...common})
    :mysql.createPool({host:dbHost(),port:Number(process.env.DB_PORT)||3306,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,...common});
  return globalForDb.veyraPool;
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
  globalForDb.veyraSchema??=(async()=>{for(const statement of SCHEMA) await pool().query(statement);})()
    .catch(error=>{globalForDb.veyraSchema=undefined;throw error;});
  return globalForDb.veyraSchema;
}

export async function query<T=mysql.RowDataPacket[]>(sql:string,params:unknown[]=[]):Promise<T>{
  await ensureSchema();
  const [rows]=await pool().execute(sql,params as (string|number|null)[]);
  return rows as T;
}

/* ---------- Errors: a clear message instead of an empty 500 ---------- */
const HINTS:Record<string,string>={
  ECONNREFUSED:'Nothing is accepting connections at DB_HOST:DB_PORT. On Hostinger, use the MySQL host shown in hPanel → Databases (for example srv123.hstgr.io), or localhost.',
  ENOTFOUND:'DB_HOST is not a known host name. Copy it exactly from hPanel → Databases.',
  ETIMEDOUT:'The database did not answer in time. If DB_HOST is a remote host, allow this server in hPanel → Databases → Remote MySQL.',
  ER_ACCESS_DENIED_ERROR:'MySQL rejected DB_USER / DB_PASSWORD. Check both (the user usually starts with u…_), and that the user is assigned to the database.',
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
  try{await ensureSchema();await pool().query('SELECT 1');return {configured:true,connected:true,code:'OK',hint:'Connected, and the users, sessions and password_resets tables are ready.'};}
  catch(error){const code=errorCode(error);console.error('[veyra] database check failed:',code,error);return {configured:true,connected:false,code,hint:errorHint(code)};}
}
