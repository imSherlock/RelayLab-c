import {createHmac,timingSafeEqual,randomUUID} from 'node:crypto';
export function sign(secret,timestamp,body){return createHmac('sha256',secret).update(`${timestamp}.${body}`).digest('hex');}
export function verify(secret,timestamp,body,signature,now=Date.now()){
 if(!/^\d+$/.test(String(timestamp))||Math.abs(now-Number(timestamp)*1000)>300000||!/^[a-f0-9]{64}$/.test(signature??''))return false;
 return timingSafeEqual(Buffer.from(sign(secret,timestamp,body),'hex'),Buffer.from(signature,'hex'));
}
// Single-process reference store only. Not a distributed production database.
export class MemoryStore{
 jobs=new Map(); keys=new Map();
 enqueue(key,payload){
  if(typeof key!=='string'||!key.length||key.length>128||!payload||Array.isArray(payload)||typeof payload!=='object')throw Error('invalid input');
  const body=JSON.stringify(payload),existing=this.keys.get(key);
  if(existing){const j=this.jobs.get(existing);if(j.body!==body)throw Error('idempotency conflict');return j;}
  const j={id:randomUUID(),body,state:'pending',attempts:0,nextAt:0,leaseUntil:0,token:null,history:[]};this.keys.set(key,j.id);this.jobs.set(j.id,j);return j;
 }
 claim(now,lease=10000){for(const j of this.jobs.values())if((j.state==='pending'&&j.nextAt<=now)||(j.state==='processing'&&j.leaseUntil<=now)){j.state='processing';j.token=randomUUID();j.leaseUntil=now+lease;return {...j};}return null;}
 finish(id,token,ok,now,max=5){const j=this.jobs.get(id);if(!j||j.token!==token||j.state!=='processing'||j.leaseUntil<=now)return false;
 j.attempts++;j.history.push({at:now,ok});j.state=ok?'delivered':j.attempts>=max?'dead':'pending';j.nextAt=now+Math.min(60000,1000*2**j.attempts)+Math.floor(Math.random()*250);j.token=null;return true;}
}
export async function tick(store,send,now=Date.now){const j=store.claim(now());if(!j)return false;let ok=false;try{ok=await send(j);}catch{}store.finish(j.id,j.token,ok,now());return true;}
