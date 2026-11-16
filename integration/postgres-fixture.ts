import EmbeddedPostgres from 'embedded-postgres';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {existsSync} from 'node:fs';

/** Use PostgreSQL's own shutdown on Windows; taskkill may be blocked by a sandbox. */
export default class TestPostgres extends EmbeddedPostgres {
 override async start(){
  if(process.platform!=='win32')return super.start();
  // pg_ctl creates a restricted process token on elevated Windows runners.
  const entry=createRequire(import.meta.url).resolve('@embedded-postgres/windows-x64');
  const executable=resolve(dirname(entry),'../native/bin/pg_ctl.exe');
  const data=this.options.databaseDir;
  await new Promise<void>((done,fail)=>{
   const child=spawn(executable,['-D',data,'-l',resolve(data,'server.log'),
   '-o',`-p ${this.options.port} ${this.options.postgresFlags.join(' ')}`,
   'start','-w','-t','15'],{timeout:20000,windowsHide:true,stdio:'ignore'});
   child.once('error',fail);
   child.once('exit',code=>code===0?done():fail(new Error('pg_ctl startup failed; inspect disposable server.log')));
  });
 }
 override async stop(){
  if(process.platform!=='win32')return super.stop();
  const data=this.options.databaseDir;
  if(!existsSync(resolve(data,'postmaster.pid')))return;
  const entry=createRequire(import.meta.url).resolve('@embedded-postgres/windows-x64');
  const executable=resolve(dirname(entry),'../native/bin/pg_ctl.exe');
  await promisify(execFile)(executable,['-D',data,'stop','-m','fast','-w','-t','15'],{timeout:20000,windowsHide:true});
 }
}
