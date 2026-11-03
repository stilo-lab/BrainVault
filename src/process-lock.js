import {openSync,writeFileSync,readFileSync,closeSync,unlinkSync,mkdirSync,statSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
const processToken=randomUUID();
export function acquireLock(dbPath){
  mkdirSync(dirname(dbPath),{recursive:true});const path=`${dbPath}.lock`;
  const read=()=>{try{const raw=readFileSync(path,'utf8');try{return JSON.parse(raw);}catch{return{pid:Number(raw)};}}catch{return null;}};
  let fd;
  try{fd=openSync(path,'wx');}
  catch(e){
    if(e.code!=='EEXIST')throw e;
    const old=read(),pid=typeof old==='number'?old:old?.pid;
    if((!Number.isInteger(pid)||pid<=0)&&Date.now()-statSync(path).mtimeMs<5000)throw new Error('Eine andere Bot-Instanz startet gerade. Bitte kurz warten.');
    let alive=Number.isInteger(pid)&&pid>0;
    // Container-Neustarts verwenden oft wieder PID 1. Ein altes Token ist kein zweiter Prozess.
    if(pid===process.pid)alive=old?.token===processToken;
    else if(alive)try{process.kill(pid,0);}catch(err){alive=err.code!=='ESRCH';}
    if(alive)throw new Error('Ein SAB-Bot-Prozess verwendet diese Datenbank bereits.');
    unlinkSync(path);fd=openSync(path,'wx');
  }
  writeFileSync(fd,JSON.stringify({pid:process.pid,token:processToken}));
  return()=>{try{closeSync(fd);}catch{}if(read()?.token===processToken)try{unlinkSync(path);}catch{}};
}
