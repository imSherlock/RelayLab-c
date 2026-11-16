import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {migrateConnection,migrations} from '../src/migrations.js';
import {PostgresStore,schema} from '../src/postgres.js';

test('migration upgrades legacy data, repeats safely and rejects changed history',async()=>{
 const db=new PGlite();
 try{
  await db.exec(schema);
  const store=new PostgresStore(db);
  const event=await store.enqueue('legacy',{value:1});
  await migrateConnection(db);await migrateConnection(db);
  assert.equal((await store.enqueue('legacy',{value:1})).id,event.id);
  assert.equal((await db.query('SELECT * FROM schema_migrations')).rows.length,2);
  await assert.rejects(migrateConnection(db,[{...migrations[0],sql:schema+' '},migrations[1]]),/history mismatch/);
  const claim=await store.claim();
  await store.finish(claim.id,claim.token,false,{httpStatus:503,durationMs:42,errorCode:'http_error'});
  const row=(await db.query<{http_status:number;duration_ms:number;error_code:string}>('SELECT * FROM delivery_attempts')).rows[0];
  assert.equal(row.http_status,503);assert.equal(row.duration_ms,42);assert.equal(row.error_code,'http_error');
  assert.equal(await store.finish(claim.id,claim.token,true),null);
  assert.equal((await db.query('SELECT * FROM delivery_attempts')).rows.length,1);
 }finally{await db.close();}
});

test('failed migration rolls back DDL and ledger, then can be retried',async()=>{
 const db=new PGlite();
 try{
  await migrateConnection(db);
  await assert.rejects(migrateConnection(db,[...migrations,{version:3,name:'broken',sql:'CREATE TABLE rollback_probe(id int); SELECT missing_column FROM receipts;'}]));
  assert.equal((await db.query<{name:string|null}>("SELECT to_regclass('rollback_probe') AS name")).rows[0].name,null);
  assert.equal((await db.query('SELECT * FROM schema_migrations')).rows.length,2);
  await migrateConnection(db);
  const store=new PostgresStore(db);await store.enqueue('atomic',{});const job=await store.claim();
  await assert.rejects(store.finish(job.id,job.token,false,{errorCode:'private error' as any}));
  assert.equal((await store.list())[0].attempts,0);
  assert.equal((await db.query('SELECT * FROM delivery_attempts')).rows.length,0);
 }finally{await db.close();}
});
