import TestPostgres from './postgres-fixture.js';
import {Pool} from 'pg';
import {randomBytes} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,type ChildProcess} from 'node:child_process';
import assert from 'node:assert/strict';
import {migrate} from '../src/migrations.js';
import {receiver} from '../src/receiver.js';

const seconds=Number(process.env.SOAK_SECONDS??300);
assert.ok(Number.isInteger(seconds)&&seconds>=10&&seconds<=3600);
const dir=await mkdtemp(join(tmpdir(),'relay-soak-'));
const password=randomBytes(24).toString('hex'),secret=randomBytes(32).toString('hex');
const pg=new TestPostgres({databaseDir:join(dir,'db'),user:'relaytest',password,port:55434,persistent:true,initdbFlags:['--encoding=UTF8','--locale=C'],authMethod:'scram-sha-256',postgresFlags:['-h','127.0.0.1','-c','unix_socket_directories='],onLog:()=>{},onError:()=>{}});
const env={...process.env,DATABASE_URL:`postgresql://relaytest:${password}@127.0.0.1:55434/postgres`,RELAY_SECRET:secret,API_READ_TOKEN:randomBytes(32).toString('hex'),API_WRITE_TOKEN:randomBytes(32).toString('hex'),API_RATE_LIMIT:'10000'};
const children:ChildProcess[]=[];let pool:Pool|undefined;let sink:ReturnType<typeof receiver>|undefined;
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function until(fn:()=>Promise<boolean>,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){if(await fn().catch(()=>false))return;await pause(100);}throw Error('soak condition timed out');}
try{
 await pg.initialise();await pg.start();pool=new Pool({connectionString:env.DATABASE_URL});await migrate(pool);
 sink=receiver(secret,0,pool);await new Promise<void>(r=>sink!.listen(4001,'127.0.0.1',r));
 for(const file of ['src/api.ts','src/worker.ts'])children.push(spawn(process.execPath,['--import','tsx',file],{env,stdio:'ignore',windowsHide:true}));
 await until(async()=> (await fetch('http://127.0.0.1:4000/healthz')).ok);
 const started=performance.now(),latencies:number[]=[];let sent=0,maxPending=0;
 for(let second=0;second<seconds;second++){
  const batch=performance.now();
  await Promise.all(Array.from({length:10},async(_,i)=>{
   const start=performance.now();const r=await fetch('http://127.0.0.1:4000/events',{method:'POST',headers:{authorization:'Bearer '+env.API_WRITE_TOKEN,'content-type':'application/json','idempotency-key':`soak-${second}-${i}`},body:JSON.stringify({second,i})});
   assert.equal(r.status,202);await r.arrayBuffer();latencies.push(performance.now()-start);sent++;
  }));
  const pending=Number((await pool.query("SELECT count(*) FROM deliveries WHERE state<>'delivered'")).rows[0].count);maxPending=Math.max(maxPending,pending);
  if((second+1)%60===0)console.log(JSON.stringify({progressSeconds:second+1,sent,pending}));
  await pause(Math.max(0,1000-(performance.now()-batch)));
 }
 await until(async()=>Number((await pool!.query("SELECT count(*) FROM deliveries WHERE state='delivered'")).rows[0].count)===sent);
 assert.equal(Number((await pool.query('SELECT count(*) FROM receipts')).rows[0].count),sent);
 assert.equal(Number((await pool.query('SELECT count(*) FROM delivery_attempts WHERE NOT ok')).rows[0].count),0);
 latencies.sort((a,b)=>a-b);
 console.log(JSON.stringify({test:'paced HTTP soak',durationSeconds:seconds,elapsedMs:Math.round(performance.now()-started),events:sent,offeredEventsPerSecond:10,workers:1,errors:0,maxObservedPending:maxPending,ingestP50Ms:Math.round(latencies[Math.floor(latencies.length*.5)]),ingestP95Ms:Math.round(latencies[Math.floor(latencies.length*.95)]),ingestP99Ms:Math.round(latencies[Math.floor(latencies.length*.99)]),limits:'Single local database, no injected failures or CPU/RSS sampling; not production capacity'}));
}finally{
 await Promise.all(children.map(child=>new Promise<void>(r=>{if(child.exitCode!==null||child.signalCode){r();return;}child.once('exit',()=>r());child.kill('SIGKILL');})));
 if(sink){sink.closeAllConnections();await new Promise<void>(r=>sink!.close(()=>r()));}
 if(pool)await pool.end();await pg.stop();await rm(dir,{recursive:true,force:true});
}
