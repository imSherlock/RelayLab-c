import {migrateConnection, migrations} from '../src/migrations.js';
import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {PostgresStore,schema} from '../src/postgres.js';
test('PostgreSQL engine: unique key, atomic claim, stale fencing, retry and dead letter',async()=>{
 const db=new PGlite();await migrateConnection(db);const s=new PostgresStore(db);const a=await s.enqueue('one',{x:1});assert.equal((await s.enqueue('one',{x:1})).id,a.id);await assert.rejects(s.enqueue('one',{x:2}));
 const j=await s.claim();assert.equal(await s.claim(),null);assert.equal(await s.finish(j.id,'00000000-0000-0000-0000-000000000000',true),null);
 await db.exec("UPDATE deliveries SET lease_until=now()-interval '1 second'");const recovered=await s.claim();assert.notEqual(j.token,recovered.token);assert.equal(await s.finish(j.id,j.token,true),null);
 await s.finish(recovered.id,recovered.token,false);
 for(let i=0;i<4;i++){await db.exec("UPDATE deliveries SET next_at=now()-interval '1 second'");const n=await s.claim();await s.finish(n.id,n.token,false);}
 assert.equal((await s.list())[0].state,'dead');await db.close();
});
