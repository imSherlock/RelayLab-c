import {randomUUID} from 'node:crypto';
export interface SQL { query(text:string, values?:any[]):Promise<{rows:any[]}> }
export const schema=`CREATE TABLE IF NOT EXISTS deliveries(id uuid PRIMARY KEY,key text UNIQUE NOT NULL,body text NOT NULL,state text NOT NULL DEFAULT 'pending',attempts int NOT NULL DEFAULT 0,next_at timestamptz NOT NULL DEFAULT now(),lease_until timestamptz,token uuid);
CREATE TABLE IF NOT EXISTS delivery_attempts(delivery_id uuid NOT NULL REFERENCES deliveries(id),attempt int NOT NULL,ok boolean NOT NULL,completed_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(delivery_id,attempt));
CREATE TABLE IF NOT EXISTS receipts(id text PRIMARY KEY,body_hash text NOT NULL,accepted_at timestamptz NOT NULL DEFAULT now());`;
export interface AttemptDetails {httpStatus?:number; durationMs?:number; errorCode?:'http_error'|'timeout'|'network_error'}
export class PostgresStore {
 constructor(public db:SQL){}
 async enqueue(key:string,payload:unknown){
 if(!key||key.length>128||!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('invalid input');
 const body=JSON.stringify(payload);
 await this.db.query('INSERT INTO deliveries(id,key,body) VALUES($1,$2,$3) ON CONFLICT(key) DO NOTHING',[randomUUID(),key,body]);
 const {rows:[row]}=await this.db.query('SELECT * FROM deliveries WHERE key=$1',[key]);
 if(row.body!==body)throw Error('idempotency conflict');return row;
 }
 async claim(){const {rows}=await this.db.query(`UPDATE deliveries SET state='processing',token=$1,lease_until=now()+interval '10 seconds' WHERE id=(SELECT id FROM deliveries WHERE (state='pending' AND next_at<=now()) OR (state='processing' AND lease_until<=now()) ORDER BY next_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,[randomUUID()]);return rows[0]??null;}
 async finish(id:string,token:string,ok:boolean,details:AttemptDetails={}){
 if(details.httpStatus!==undefined&&(!Number.isInteger(details.httpStatus)||details.httpStatus<100||details.httpStatus>599))throw Error('invalid attempt status');
 if(details.durationMs!==undefined&&(!Number.isInteger(details.durationMs)||details.durationMs<0||details.durationMs>2147483647))throw Error('invalid attempt duration');
 const {rows}=await this.db.query(`WITH updated AS (UPDATE deliveries SET attempts=attempts+1,state=CASE WHEN $3 THEN 'delivered' WHEN attempts+1>=5 THEN 'dead' ELSE 'pending' END,next_at=now()+(LEAST(60,power(2,attempts+1))+random())*interval '1 second',token=NULL WHERE id=$1 AND token=$2 AND state='processing' AND lease_until>now() RETURNING *), logged AS (INSERT INTO delivery_attempts(delivery_id,attempt,ok,http_status,duration_ms,error_code) SELECT id,attempts,$3,$4,$5,$6 FROM updated) SELECT * FROM updated`,[id,token,ok,details.httpStatus??null,details.durationMs??null,details.errorCode??null]);return rows[0]??null;}
 async list(){return (await this.db.query('SELECT id,state,attempts,next_at FROM deliveries ORDER BY next_at DESC LIMIT 100')).rows;}
}
