import mysql from 'mysql2/promise';

/* MySQL connection (Hostinger database). Configure either DATABASE_URL=mysql://user:pass@host:3306/name
   or DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME. Tables are created on first use. */

type Pool=mysql.Pool;
const globalForDb=globalThis as unknown as {veyraPool?:Pool;veyraSchema?:Promise<void>};

export function databaseConfigured(){
  return !!(process.env.DATABASE_URL||(process.env.DB_HOST&&process.env.DB_USER&&process.env.DB_NAME));
}

function pool():Pool{
  if(globalForDb.veyraPool) return globalForDb.veyraPool;
  const common={waitForConnections:true,connectionLimit:5,enableKeepAlive:true,timezone:'Z' as const,charset:'utf8mb4'};
  globalForDb.veyraPool=process.env.DATABASE_URL
    ?mysql.createPool({uri:process.env.DATABASE_URL,...common})
    :mysql.createPool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT)||3306,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,...common});
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
