import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=new URL('../public/engine/',import.meta.url),hash=createHash('sha256');
function walk(directory,prefix=''){
  for(const entry of fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
    const file=path.join(directory,entry.name),relative=prefix+entry.name;
    if(entry.isDirectory())walk(file,relative+'/');
    else if(/\.(js|wasm|html)$/.test(entry.name))hash.update(relative).update(entry.name.endsWith('.wasm')?fs.readFileSync(file):fs.readFileSync(file,'utf8').replaceAll('\r\n','\n'));
  }
}
walk(fileURLToPath(root));
export const engineDirectory=`engine-${hash.digest('hex').slice(0,16)}`;
