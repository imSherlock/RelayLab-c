import http from 'node:http';
import {createHash} from 'node:crypto';
import {verify} from './signature.js';
import type {SQL} from './postgres.js';
/** Optional SQL is required for durable deduplication; memory mode is test-only. */
export function receiver(secret:string,failFirst=0,db?:SQL){
 let count=0;const seen=new Map<string,string>();
 return http.createServer(async(req,res)=>{
  try{
   if(req.method!=='POST'||req.url!=='/events'){res.writeHead(404).end();return;}
   const chunks:Buffer[]=[];let size=0;
   for await(const c of req){size+=c.length;if(size>65536){res.writeHead(413).end();return;}chunks.push(c);}
   const ts=req.headers['x-timestamp'],sig=req.headers['x-signature'],id=req.headers['x-event-id'];
   const body=Buffer.concat(chunks);
   if(typeof ts!=='string'||typeof sig!=='string'||typeof id!=='string'||!id||id.length>128||!verify(secret,ts,body,sig,id)){res.writeHead(401).end();return;}
   const hash=createHash('sha256').update(body).digest('hex');
   let prior:string|undefined;
   if(db)prior=(await db.query('SELECT body_hash FROM receipts WHERE id=$1',[id])).rows[0]?.body_hash;
   else prior=seen.get(id);
   if(prior){res.writeHead(prior===hash?200:409).end(prior===hash?'duplicate':'conflict');return;}
   if(++count<=failFirst){res.writeHead(503).end();return;}
   if(db){
    const result=await db.query('INSERT INTO receipts(id,body_hash) VALUES($1,$2) ON CONFLICT(id) DO NOTHING RETURNING id',[id,hash]);
    if(!result.rows.length){const stored=(await db.query('SELECT body_hash FROM receipts WHERE id=$1',[id])).rows[0];res.writeHead(stored.body_hash===hash?200:409).end('duplicate');return;}
   }else seen.set(id,hash);
   res.writeHead(200).end('accepted');
  }catch{if(!res.headersSent)res.writeHead(503);res.end();}
 });
}
