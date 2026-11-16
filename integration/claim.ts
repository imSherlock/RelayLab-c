import {Pool} from 'pg';import {PostgresStore} from '../src/postgres.js';
const p=new Pool({connectionString:process.env.DATABASE_URL});const s=new PostgresStore(p);const ids:string[]=[];
for(;;){const j=await s.claim();if(!j)break;ids.push(j.id);await s.finish(j.id,j.token,true);}console.log(JSON.stringify(ids));await p.end();
