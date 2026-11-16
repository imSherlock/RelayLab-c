import {access,secret} from './access.js';
import {gracefulShutdown} from './shutdown.js';
import {migrate} from './migrations.js';
import {dashboard} from './dashboard.js';
import http from 'node:http';
import {Pool} from 'pg';
import {PostgresStore} from './postgres.js';

const authorize=access(secret('API_READ_TOKEN'),secret('API_WRITE_TOKEN'),Number(process.env.API_RATE_LIMIT??120));
const pool=new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:2000});
pool.on('error',()=>console.warn('Database connection lost')); 
await migrate(pool);
const store=new PostgresStore(pool);


const server=http.createServer(async(req,res)=>{
 try{
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('cache-control','no-store');
  if(req.url==='/'&&req.method==='GET'){
   res.setHeader('content-type','text/html; charset=utf-8');res.end(dashboard);return;
  }
  res.setHeader('content-type','application/json; charset=utf-8');
  if(req.url==='/healthz'&&req.method==='GET'){await pool.query('SELECT 1');res.end('{"ready":true}');return;}
  if(req.url==='/events'&&(req.method==='GET'||req.method==='POST')){
   const decision=authorize(req.headers.authorization,req.method==='GET'?'read':'write');
   if(decision.status!==200){
    if(decision.status===401)res.setHeader('www-authenticate','Bearer');
    if(decision.status===429)res.setHeader('retry-after',decision.retryAfter);
    res.writeHead(decision.status).end(JSON.stringify({error:decision.status===429?'rate limited':'access denied'}));return;
   }
  }
  if(req.url==='/events'&&req.method==='GET'){res.end(JSON.stringify(await store.list()));return;}
  if(req.url!=='/events'||req.method!=='POST'){res.writeHead(404).end('{}');return;}
  // Decode only after concatenation, so split UTF-8 characters are not corrupted.
  const chunks:Buffer[]=[];let size=0;
  for await(const chunk of req){
   size+=chunk.length;
   if(size>65536){res.writeHead(413).end('{}');return;}
   chunks.push(chunk);
  }
  const key=req.headers['idempotency-key'];
  if(typeof key!=='string')throw Error('invalid input');
  const event=await store.enqueue(key,JSON.parse(Buffer.concat(chunks).toString('utf8')));
  res.writeHead(202).end(JSON.stringify({id:event.id,state:event.state}));
 }catch(error){
  const message=error instanceof Error?error.message:'';
  const conflict=message==='idempotency conflict';
  if(!res.headersSent)res.writeHead(conflict?409:message==='invalid input'||error instanceof SyntaxError?400:500);
  res.end(JSON.stringify({error:conflict?message:'request failed'}));
 }
}).listen(4000,process.env.HOST??'127.0.0.1');

gracefulShutdown(server,()=>pool.end());
