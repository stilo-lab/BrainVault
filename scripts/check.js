import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const files=[];
function walk(path){for(const f of readdirSync(path,{withFileTypes:true})){const p=join(path,f.name);if(f.isDirectory())walk(p);else if(p.endsWith('.js'))files.push(p);}}
for(const root of ['src','scripts','test'])walk(root);
let failed=false;
for(const file of files){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(r.status!==0){failed=true;console.error(r.stderr);}}
if(failed)process.exitCode=1;else console.log(`${files.length} JavaScript-Dateien: Syntax gültig.`);
