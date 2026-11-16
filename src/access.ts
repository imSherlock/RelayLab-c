import {createHash,timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';

/** Environment or mounted UTF-8 secret file, never both. Never log the value. */
export function secret(name:string,env:NodeJS.ProcessEnv=process.env):string {
 const value=env[name],file=env[name+'_FILE'];
 if(value!==undefined&&file!==undefined)throw Error(`${name}: choose environment or file`);
 const result=file?readFileSync(file,'utf8').replace(/\r?\n$/,''):value;
 if(!result||result.length<32||/\s/.test(result))throw Error(`${name}: requires at least 32 non-whitespace characters`);
 return result;
}
const digest=(value:string)=>createHash('sha256').update(value).digest();
export function access(readToken:string,writeToken:string,limit=120,windowMs=60000,now=Date.now){
 if(readToken===writeToken)throw Error('Read and write credentials must differ');
 if(!Number.isSafeInteger(limit)||limit<1||!Number.isSafeInteger(windowMs)||windowMs<1)throw Error('Invalid rate limit');
 const read=digest(readToken),write=digest(writeToken);
 // Exactly three buckets: bounded memory; no trust in caller-controlled forwarding headers.
 const buckets=new Map<string,{start:number;count:number}>();
 return (authorization:string|undefined,scope:'read'|'write')=>{
  const token=authorization?.startsWith('Bearer ')?authorization.slice(7):'';
  const hash=digest(token),identity=timingSafeEqual(hash,read)?'read':timingSafeEqual(hash,write)?'write':'anonymous';
  const time=now();let bucket=buckets.get(identity);
  if(!bucket||time-bucket.start>=windowMs){bucket={start:time,count:0};buckets.set(identity,bucket);}
  const retryAfter=Math.max(1,Math.ceil((windowMs-(time-bucket.start))/1000));
  if(++bucket.count>(identity==='anonymous'?Math.min(limit,30):limit))return {status:429,retryAfter};
  return {status:identity==='anonymous'?401:identity!==scope?403:200,retryAfter:0};
 };
}
