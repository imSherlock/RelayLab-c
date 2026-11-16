import EmbeddedPostgres from './postgres-fixture.js';
import {Pool} from 'pg';
import {randomBytes,createHmac} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn, type ChildProcess} from 'node:child_process';
import assert from 'node:assert/strict';
import {receiver} from '../src/receiver.js';
const dir=await mkdtemp(join(tmpdir(),'relay-http-'));
const password=randomBytes(24).toString('hex'),secret=randomBytes(32).toString('hex');
const pg=new EmbeddedPostgres({databaseDir:join(dir,'db'),user:'relaytest',password,port:55433,persistent:true,initdbFlags:['--encoding=UTF8','--locale=C'],authMethod:'scram-sha-256',postgresFlags:['-h','127.0.0.1','-c','unix_socket_directories='],onLog:()=>{},onError:()=>{}});
const env={...process.env,DATABASE_URL:`postgresql://relaytest:${password}@127.0.0.1:55433/postgres`,RELAY_SECRET:secret,API_READ_TOKEN:randomBytes(32).toString('hex'),API_WRITE_TOKEN:randomBytes(32).toString('hex'),API_RATE_LIMIT:'10000'};
const children:ChildProcess[]=[];
function launch(file:string){const child=spawn(process.execPath,['--import','tsx',file],{env,stdio:'ignore'});children.push(child);return child;}
async function until(fn:()=>Promise<boolean>,ms=20000){const end=Date.now()+ms;while(Date.now()<end){if(await fn().catch(()=>false))return;await new Promise(r=>setTimeout(r,100));}throw Error('condition timed out');}
async function stop(child:ChildProcess){if(child.exitCode!==null||child.signalCode)return;const exited=new Promise<void>(r=>child.once('exit',()=>r()));child.kill('SIGKILL');await exited;}
let pool:Pool|undefined;let sink=receiver(secret,2,{query:(q,v)=>pool!.query(q,v)});
try{
 await pg.initialise();await pg.start();pool=new Pool({connectionString:env.DATABASE_URL});pool.on('error',()=>{});
 await new Promise<void>(r=>sink.listen(4001,'127.0.0.1',r));
 let api=launch('src/api.ts');await until(async()=> (await fetch('http://127.0.0.1:4000/healthz')).ok);
 const post=(key:string,body:string)=>fetch('http://127.0.0.1:4000/events',{method:'POST',headers:{authorization:'Bearer '+env.API_WRITE_TOKEN,'content-type':'application/json','idempotency-key':key},body});
 for(const method of ['GET','POST']){
  const response=await fetch('http://127.0.0.1:4000/events',{method});assert.equal(response.status,401);
  const wrong=method==='GET'?env.API_WRITE_TOKEN:env.API_READ_TOKEN;
  assert.equal((await fetch('http://127.0.0.1:4000/events',{method,headers:{authorization:'Bearer '+wrong}})).status,403);
 }
 assert.equal((await pool.query('SELECT count(*) FROM deliveries')).rows[0].count,'0');
 assert.equal((await fetch('http://127.0.0.1:4000/events',{headers:{authorization:'Bearer '+env.API_READ_TOKEN}})).status,200);
 let limited=false;
 for(let i=0;i<31;i++){const response=await fetch('http://127.0.0.1:4000/events');if(response.status===429){limited=true;assert.ok(Number(response.headers.get('retry-after'))>0);}}
 assert.ok(limited,'anonymous request quota enforced over HTTP');
 console.log('PASS security: anonymous denied, read/write scopes enforced, rejected requests create no deliveries');
 assert.equal((await post('bad','{')).status,400);
 assert.equal((await post('large',JSON.stringify({x:'x'.repeat(66000)}))).status,413);
 const responses=await Promise.all(Array.from({length:20},()=>post('one','{"x":1}')));
 assert.ok(responses.every(r=>r.status===202));const ids=await Promise.all(responses.map(r=>r.json().then(j=>j.id)));assert.equal(new Set(ids).size,1);
 assert.equal((await post('one','{"x":2}')).status,409);
 const start=performance.now();const workers=Array.from({length:3},()=>launch('src/worker.ts'));
 await until(async()=> (await pool!.query('SELECT state FROM deliveries WHERE id=$1',[ids[0]])).rows[0].state==='delivered');
 assert.equal((await pool.query('SELECT attempts FROM deliveries WHERE id=$1',[ids[0]])).rows[0].attempts,3);
 assert.equal((await pool.query('SELECT count(*) FROM delivery_attempts')).rows[0].count,'3');
 assert.equal((await pool.query('SELECT count(*) FROM receipts')).rows[0].count,'1');
 const telemetry=(await pool.query('SELECT http_status,duration_ms,error_code FROM delivery_attempts ORDER BY attempt')).rows;
 assert.deepEqual(telemetry.map(x=>x.http_status),[503,503,200]);assert.ok(telemetry.every(x=>x.duration_ms>=0));assert.deepEqual(telemetry.map(x=>x.error_code),['http_error','http_error',null]);
 console.log('PASS HTTP: 20 concurrent duplicate requests, validation, HMAC delivery, 2 retries, 3 worker processes; elapsed_ms='+Math.round(performance.now()-start));
 sink.closeAllConnections();await new Promise<void>(r=>sink.close(()=>r()));
 sink=receiver(secret,0,pool);await new Promise<void>(r=>sink.listen(4001,'127.0.0.1',r));
 const ts=String(Math.floor(Date.now()/1000)),body='{"x":1}';
 const replay=await fetch('http://127.0.0.1:4001/events',{method:'POST',body,headers:{'x-event-id':ids[0],'x-timestamp':ts,'x-signature':createHmac('sha256',secret).update(`${ts}.${ids[0]}.${body}`).digest('hex')}});
 assert.equal(await replay.text(),'duplicate');assert.equal(replay.status,200);
 console.log('PASS receiver: new HTTP listener reuses durable receipt and suppresses replay');
 await stop(api);api=launch('src/api.ts');await until(async()=> (await fetch('http://127.0.0.1:4000/healthz')).ok);
 assert.equal((await (await post('one','{"x":1}')).json()).id,ids[0]);
 assert.match(await (await fetch('http://127.0.0.1:4000/')).text(),/Delivery monitor/);
 console.log('PASS HTTP: API process restart preserves idempotency; dashboard HTML served (not browser-tested)');
 await Promise.all(workers.map(stop));
 const crash=await (await post('crash','{"crash":true}')).json();
 // A real separate process claims a job and stays alive until killed.
 const holder=launch('integration/hold-claim.ts');
 await until(async()=> (await pool!.query('SELECT state FROM deliveries WHERE id=$1',[crash.id])).rows[0].state==='processing');
 await stop(holder);launch('src/worker.ts');
 await until(async()=> (await pool!.query('SELECT state FROM deliveries WHERE id=$1',[crash.id])).rows[0].state==='delivered');
 console.log('PASS recovery: SIGKILL after durable claim; natural 10-second lease expiry; replacement worker delivered over HTTP');
 await pg.stop();await pg.start();
 await until(async()=> (await fetch('http://127.0.0.1:4000/healthz')).ok);
 const afterOutage=await (await post('after-outage','{"reconnected":true}')).json();
 await until(async()=> (await pool!.query('SELECT state FROM deliveries WHERE id=$1',[afterOutage.id])).rows[0].state==='delivered');
 console.log('PASS reconnect: database stopped/restarted while API and worker stayed alive; new event delivered');
 const loadStart=performance.now(),latencies:number[]=[];
 await Promise.all(Array.from({length:100},async(_,i)=>{const t=performance.now();const response=await post('load-'+i,JSON.stringify({i}));assert.equal(response.status,202);await response.arrayBuffer();latencies.push(performance.now()-t);}));
 await until(async()=> Number((await pool!.query("SELECT count(*) FROM deliveries WHERE key LIKE 'load-%' AND state='delivered'")).rows[0].count)===100,30000);
 latencies.sort((a,b)=>a-b);
 console.log(JSON.stringify({test:'HTTP load smoke',events:100,concurrentRequests:100,deliveryWorkers:1,elapsedMs:Math.round(performance.now()-loadStart),ingestP50Ms:Math.round(latencies[49]),ingestP95Ms:Math.round(latencies[94]),errors:0}));
 sink.closeAllConnections();await new Promise<void>(r=>sink.close(()=>r()));
 sink=receiver(secret,Infinity,pool);await new Promise<void>(r=>sink.listen(4001,'127.0.0.1',r));
 const doomed=await (await post('dlq-http','{"fail":true}')).json();
 await until(async()=> (await pool!.query('SELECT state FROM deliveries WHERE id=$1',[doomed.id])).rows[0].state==='dead',60000);
 assert.equal((await pool.query('SELECT attempts FROM deliveries WHERE id=$1',[doomed.id])).rows[0].attempts,5);
 assert.equal((await pool.query('SELECT count(*) FROM delivery_attempts WHERE delivery_id=$1 AND ok=false',[doomed.id])).rows[0].count,'5');
 console.log('PASS DLQ: five real HTTP 503 failures with natural exponential backoff; terminal dead state and five failed attempt records');


}finally{
 await Promise.all(children.map(stop));await new Promise<void>(r=>sink.close(()=>r()));if(pool)await pool.end();await pg.stop().catch(()=>{});await rm(dir,{recursive:true,force:true});
}
