import type {Server} from 'node:http';

/** Drain accepted requests before closing their database pool. */
export function gracefulShutdown(server:Server,closeResources:()=>Promise<void>,deadlineMs=5000){
 let stopping:Promise<void>|undefined;
 const stop=()=>stopping??=(async()=>{
  const deadline=setTimeout(()=>server.closeAllConnections(),deadlineMs);
  deadline.unref();
  try{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
  finally{
   clearTimeout(deadline);
   let timer:ReturnType<typeof setTimeout>|undefined;
   try{await Promise.race([Promise.resolve().then(closeResources),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Resource shutdown deadline exceeded')),deadlineMs);})]);}
   finally{clearTimeout(timer);}
  }
 })();
 const signal=()=>{void stop().catch(()=>{console.error('Shutdown failed');process.exit(1);});};
 process.once('SIGINT',signal);process.once('SIGTERM',signal);
 return {stop,dispose:()=>{process.removeListener('SIGINT',signal);process.removeListener('SIGTERM',signal);}};
}
