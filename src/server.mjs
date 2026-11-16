import http from 'node:http';
import {MemoryStore,tick,sign} from './core.mjs';
const store=new MemoryStore(),secret=process.env.RELAY_SECRET;
if(!secret||secret.length<32)throw Error('Set RELAY_SECRET to at least 32 characters');
const target='http://127.0.0.1:4001/events';
http.createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json');
 if(req.method==='GET'&&req.url==='/events'){res.end(JSON.stringify([...store.jobs.values()]));return;}
 if(req.method!=='POST'||req.url!=='/events'){res.writeHead(404).end('{}');return;}
 let body='';try{for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>65536){res.writeHead(413).end('{}');return;}}
 const j=store.enqueue(req.headers['idempotency-key'],JSON.parse(body));res.writeHead(202).end(JSON.stringify({id:j.id,state:j.state}));
 }catch(e){res.writeHead(e.message==='idempotency conflict'?409:400).end(JSON.stringify({error:e.message}));}
}).listen(4000,'127.0.0.1');
let busy=false;setInterval(async()=>{if(busy)return;busy=true;try{await tick(store,async j=>{const ts=String(Math.floor(Date.now()/1000));const r=await fetch(target,{method:'POST',redirect:'error',signal:AbortSignal.timeout(3000),headers:{'content-type':'application/json','x-event-id':j.id,'x-timestamp':ts,'x-signature':sign(secret,ts,j.body)},body:j.body});return r.ok;});}finally{busy=false;}},250);
