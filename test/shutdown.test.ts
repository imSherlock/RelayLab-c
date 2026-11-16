import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {gracefulShutdown} from '../src/shutdown.js';

test('shutdown drains accepted request before closing resources and is idempotent',async()=>{
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 let accepted!:()=>void;const started=new Promise<void>(r=>accepted=r);let closed=0;
 const server=http.createServer(async(_req,res)=>{accepted();await gate;assert.equal(closed,0);res.end('finished');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const address=server.address();assert.ok(address&&typeof address!=='string');
 const lifecycle=gracefulShutdown(server,async()=>{closed++;});
 try{
  const request=fetch(`http://127.0.0.1:${address.port}`).then(r=>r.text());await started;
  const stop=lifecycle.stop();assert.equal(lifecycle.stop(),stop);release();
  assert.equal(await request,'finished');await stop;assert.equal(closed,1);
 }finally{release();await lifecycle.stop();lifecycle.dispose();}
});

test('shutdown bounds a request that never completes',async()=>{
 let accepted!:()=>void;const started=new Promise<void>(r=>accepted=r);
 const server=http.createServer(()=>accepted());await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const address=server.address();assert.ok(address&&typeof address!=='string');let closed=false;
 const lifecycle=gracefulShutdown(server,async()=>{closed=true;},30);
 try{
  const request=fetch(`http://127.0.0.1:${address.port}`).catch(()=>null);await started;
  await lifecycle.stop();assert.equal(closed,true);assert.equal(await request,null);
 }finally{await lifecycle.stop();lifecycle.dispose();}
});

// A stuck pool must not leave a signalled process alive indefinitely.
test('shutdown rejects a resource that never closes',async()=>{
 const server=http.createServer();await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const lifecycle=gracefulShutdown(server,()=>new Promise(()=>{}),30);
 try{await assert.rejects(lifecycle.stop(),/Resource shutdown deadline/);}finally{lifecycle.dispose();}
});
