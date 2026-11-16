import {Pool} from 'pg';
import {PostgresStore} from '../src/postgres.js';
const pool=new Pool({connectionString:process.env.DATABASE_URL});
await new PostgresStore(pool).claim();
setInterval(()=>{},1000);
