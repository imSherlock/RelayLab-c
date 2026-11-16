import {secret as loadSecret} from './access.js';
import {migrate} from './migrations.js';
import {Pool} from 'pg';
import {createHmac} from 'node:crypto';
import {PostgresStore,type AttemptDetails} from './postgres.js';
const secret=loadSecret('RELAY_SECRET');
const destination=process.env.RECEIVER_URL??'http://127.0.0.1:4001/events';
const pool=new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:2000});
pool.on('error',()=>console.warn('Database connection lost; retrying'));
let stopping=false;
process.once('SIGTERM',()=>{stopping=true;});
process.once('SIGINT',()=>{stopping=true;});
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
let initialized=false;
const store=new PostgresStore(pool);
while(!stopping){
 try{
  if(!initialized){await migrate(pool);initialized=true;}
  const event=await store.claim();
  if(!event){await pause(250);continue;}
  let ok=false;const started=performance.now();const details:AttemptDetails={};
  try{
   const timestamp=String(Math.floor(Date.now()/1000));
   const signature=createHmac('sha256',secret).update(`${timestamp}.${event.id}.${event.body}`).digest('hex');
   const response=await fetch(destination,{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(3000),
    headers:{'content-type':'application/json','x-event-id':event.id,'x-timestamp':timestamp,'x-signature':signature},body:event.body
   });
   ok=response.ok;details.httpStatus=response.status;if(!ok)details.errorCode='http_error';
   // Responses are not business data; release the stream without unbounded buffering.
   await response.body?.cancel();
  }catch(error){details.errorCode=error instanceof Error&&error.name==='TimeoutError'?'timeout':'network_error';}
  details.durationMs=Math.round(performance.now()-started);
  await store.finish(event.id,event.token,ok,details);
 }catch{
  // A lost completion is safe to redeliver after lease expiry; the receiver deduplicates.
  console.warn('Worker database operation failed; retrying');await pause(500);
 }
}
await pool.end();
