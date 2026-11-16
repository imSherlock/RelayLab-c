import {createHash} from 'node:crypto';
import type {Pool} from 'pg';
import {schema, type SQL} from './postgres.js';

export interface Migration {version:number; name:string; sql:string}
export const migrations:readonly Migration[]=[
 {version:1,name:'baseline',sql:schema},
 {version:2,name:'attempt telemetry',sql:`ALTER TABLE delivery_attempts
 ADD COLUMN http_status integer CHECK (http_status BETWEEN 100 AND 599),
 ADD COLUMN duration_ms integer CHECK (duration_ms >= 0),
 ADD COLUMN error_code text CHECK (error_code IN ('http_error','timeout','network_error'));`}
];

/** Caller owns an exclusive connection, never a pool that can switch sessions. */
export async function migrateConnection(db:SQL & {exec?:(sql:string)=>Promise<unknown>},steps:readonly Migration[]=migrations){
 await db.query('BEGIN');
 try{
  await db.query('SET LOCAL lock_timeout = \'10s\'');
  await db.query('SELECT pg_advisory_xact_lock(732104221)');
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations(
   version integer PRIMARY KEY,name text NOT NULL,checksum text NOT NULL,
   applied_at timestamptz NOT NULL DEFAULT now())`);
  const applied=(await db.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows;
  for(let i=0;i<steps.length;i++){
   if(steps[i].version!==i+1)throw Error('Migration versions must be contiguous');
  }
  if(applied.length>steps.length)throw Error('Database schema is newer than this application');
  for(let i=0;i<applied.length;i++){
   const step=steps[i];
   if(applied[i].version!==step.version||applied[i].checksum!==checksum(step))throw Error('Migration history mismatch');
  }
  for(const step of steps.slice(applied.length)){
   if(db.exec)await db.exec(step.sql);else await db.query(step.sql);
   await db.query('INSERT INTO schema_migrations(version,name,checksum) VALUES($1,$2,$3)',[step.version,step.name,checksum(step)]);
  }
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error;}
}
function checksum(step:Migration){return createHash('sha256').update(step.sql).digest('hex');}
export async function migrate(pool:Pool){
 const client=await pool.connect();
 try{await migrateConnection(client);}finally{client.release();}
}
