import fs from 'node:fs/promises';
import path from 'node:path';
import {inspectNesFile,compatibilityReport} from '../src/nes-compatibility.js';

const root=path.resolve(process.argv[2]||'C:/RetroBat/roms/nes');
const output=path.resolve(process.argv[3]||'test-results/nes-compatibility.json');
const games=[];
async function walk(directory){
  for(const entry of await fs.readdir(directory,{withFileTypes:true})){
    const filePath=path.join(directory,entry.name);
    if(entry.isDirectory()){if(!['images','media','videos','manuals','.git'].includes(entry.name))await walk(filePath);continue;}
    if(!entry.isFile()||! /\.(nes|zip)$/i.test(entry.name))continue;
    const stat=await fs.stat(filePath);
    // Read only the header for loose ROMs; inspect ZIPs using the app's bounded decoder.
    const file={name:entry.name,size:stat.size,arrayBuffer:()=>fs.readFile(filePath),slice:(start,end)=>({arrayBuffer:async()=>{
      const handle=await fs.open(filePath,'r');try{const bytes=Buffer.alloc(end-start);const {bytesRead}=await handle.read(bytes,0,bytes.length,start);return bytes.subarray(0,bytesRead);}finally{await handle.close();}
    }})};
    games.push({system:'nes',title:entry.name,relative_path:path.relative(root,filePath).replaceAll('\\','/'),compatibility:await inspectNesFile(file)});
  }
}
await walk(root);
const report=compatibilityReport(games);
const groups=new Map();
for(const game of report.games.filter(g=>g.status==='unsupported')){const group=groups.get(game.mapper)||{mapper:game.mapper,count:0,games:[]};group.count++;group.games.push(game.path);groups.set(game.mapper,group);}
report.unsupportedMappers=[...groups.values()].sort((a,b)=>b.count-a.count);
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2));
console.log(JSON.stringify({counts:report.counts,unsupportedMappers:groups.size,largestGroups:report.unsupportedMappers.slice(0,5).map(({mapper,count})=>({mapper,count})),report:output},null,2));
