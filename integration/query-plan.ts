import TestPostgres from './postgres-fixture.js';
import {Pool} from 'pg';
import {randomBytes} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {migrate} from '../src/migrations.js';
import {PostgresStore} from '../src/postgres.js';
const dir=await mkdtemp(join(tmpdir(),'relay-plan-')),password=randomBytes(24).toString('hex');
const pg=new TestPostgres({databaseDir:join(dir,'db'),user:'relaytest',password,port:55435,persistent:true,initdbFlags:['--encoding=UTF8','--locale=C'],authMethod:'scram-sha-256',postgresFlags:['-h','127.0.0.1','-c','unix_socket_directories='],onLog:()=>{},onError:()=>{}});
let pool:Pool|undefined;
try{
 await pg.initialise();await pg.start();pool=new Pool({connectionString:`postgresql://relaytest:${password}@127.0.0.1:55435/postgres`});await migrate(pool);
 await pool.query(`INSERT INTO deliveries(id,key,body,state,next_at) SELECT gen_random_uuid(), 'sample-'||i,'{}',CASE WHEN i<=19900 THEN 'delivered' ELSE 'pending' END,now()-i*interval '1 second' FROM generate_series(1,20000) i`);
 await pool.query('ANALYZE deliveries');
 const queries:{name:string;sql:string;values?:any[]}[]=[];
 const store=new PostgresStore({query:async(sql,values)=>{queries.push({name:queries.length?'list':'claim',sql,values});return {rows:[]};}});
 await store.claim();await store.list();
 for(const variant of ['baseline','candidate-indexes']){
  if(variant==='candidate-indexes'){
   await pool.query("CREATE INDEX candidate_ready ON deliveries(next_at) WHERE state IN ('pending','processing')");
   await pool.query('CREATE INDEX candidate_recent ON deliveries(next_at DESC)');await pool.query('ANALYZE deliveries');
  }
  for(const q of queries){
   const client=await pool.connect();try{await client.query('BEGIN');const result=await client.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+q.sql,q.values);console.log(JSON.stringify({variant,query:q.name,rows:20000,pending:100,plan:result.rows[0]['QUERY PLAN'][0]}));}finally{await client.query('ROLLBACK');client.release();}
  }
 }
}finally{if(pool)await pool.end();await pg.stop();await rm(dir,{recursive:true,force:true});}
