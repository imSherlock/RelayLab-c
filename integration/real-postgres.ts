import {migrate, migrateConnection, migrations} from '../src/migrations.js';
import EmbeddedPostgres from './postgres-fixture.js';import {Pool} from 'pg';import {randomBytes} from 'node:crypto';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import assert from 'node:assert/strict';import {PostgresStore,schema} from '../src/postgres.js';
const dir=await mkdtemp(join(tmpdir(),'relay-pg-')),password=randomBytes(24).toString('hex');
const pg=new EmbeddedPostgres({databaseDir:join(dir,'db'),user:'relaytest',password,port:55432,persistent:true,initdbFlags:['--encoding=UTF8','--locale=C'],authMethod:'scram-sha-256',postgresFlags:['-h','127.0.0.1','-c','unix_socket_directories=' ],onLog:console.log,onError:console.error});
const url=`postgresql://relaytest:${password}@127.0.0.1:55432/postgres`;
let p:Pool|undefined;
try{await pg.initialise();await pg.start();p=new Pool({connectionString:url});p.on('error',e=>console.error('pool error:',e.message));const client=await p.connect();try{await migrateConnection(client);}finally{client.release();};await Promise.all([migrate(p),migrate(p),migrate(p)]);assert.equal((await p.query("SELECT count(*) FROM schema_migrations")).rows[0].count,"2");const s=new PostgresStore(p);
 const t=performance.now();await Promise.all(Array.from({length:100},(_,i)=>s.enqueue('key'+i,{i})));
 const run=promisify(execFile);const results=await Promise.all(Array.from({length:4},()=>run(process.execPath,['--import','tsx','integration/claim.ts'],{env:{...process.env,DATABASE_URL:url}})));
 const ids=results.flatMap(r=>JSON.parse(r.stdout));assert.equal(ids.length,100);assert.equal(new Set(ids).size,100);console.log('PASS: 4 independent workers delivered 100 unique jobs');
 console.log('elapsed_ms='+Math.round(performance.now()-t));
 await p.query("INSERT INTO receipts(id,body_hash) VALUES('durable-test','hash')");const abandoned=await s.enqueue('crash',{});const old=await s.claim();assert.ok(old);await p.end();p=undefined;await pg.stop();await pg.start();p=new Pool({connectionString:url});p.on('error',e=>console.error('pool error:',e.message));const restored=new PostgresStore(p);
 assert.equal((await p.query('SELECT body_hash FROM receipts WHERE id=$1',['durable-test'])).rows[0].body_hash,'hash');
 assert.equal((await p.query('SELECT count(*) FROM deliveries')).rows[0].count,'101');
 await p.query("UPDATE deliveries SET lease_until=now()-interval '1 second' WHERE id=$1",[abandoned.id]);const recovered=await restored.claim();assert.equal(recovered.id,abandoned.id);assert.equal(await restored.finish(old.id,old.token,true),null);assert.ok(await restored.finish(recovered.id,recovered.token,true));console.log('PASS: server restart preserves 101 events; abandoned lease recovered; stale completion rejected');
}finally{if(p)await p.end();await pg.stop().catch(()=>{});await rm(dir,{recursive:true,force:true});}
