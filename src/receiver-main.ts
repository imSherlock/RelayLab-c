import {secret as loadSecret} from './access.js';
import {gracefulShutdown} from './shutdown.js';
import {migrate} from './migrations.js';
import {Pool} from 'pg';
import {receiver} from './receiver.js';
import {schema} from './postgres.js';
const secret=loadSecret('RELAY_SECRET');
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL required for durable receiver');
const pool=new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:2000});
pool.on('error',()=>console.warn('Database connection lost')); 
await migrate(pool);
const server=receiver(secret,0,pool).listen(4001,process.env.HOST??'127.0.0.1');

gracefulShutdown(server,()=>pool.end());
