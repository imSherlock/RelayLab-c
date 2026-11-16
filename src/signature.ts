import {createHmac,timingSafeEqual} from 'node:crypto';
export function verify(secret:string,ts:string,body:Buffer,sig:string,id:string):boolean{
 if(!/^\d+$/.test(ts)||Math.abs(Date.now()-Number(ts)*1000)>300000||!/^[a-f0-9]{64}$/.test(sig))return false;
 const expected=createHmac('sha256',secret).update(ts+'.'+id+'.').update(body).digest();return timingSafeEqual(expected,Buffer.from(sig,'hex'));
}
