// Offline build tool. Never publishes ROM paths, credentials, or review progress.
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {safeMetadata} from '../src/browser-core.js';
const db=new DatabaseSync('data/library.sqlite',{readOnly:true});
const rows=db.prepare('SELECT * FROM games').all();
const images=[],games=[];
for(const row of rows){
  const meta=JSON.parse(row.metadata),metadata=safeMetadata(meta);
  if(meta.cover&&fs.existsSync(meta.cover)){
    const name=createHash('sha256').update(fs.readFileSync(meta.cover)).digest('hex').slice(0,32);
    metadata.cover=`catalog/covers/${name}.webp`;
    images.push({source:meta.cover,destination:path.resolve('public',metadata.cover)});
  }
  games.push({system:row.system,relative_path:row.relative_path.replaceAll('\\','/'),title:row.title,metadata});
}
fs.mkdirSync('public/catalog/covers',{recursive:true});fs.mkdirSync('.validation',{recursive:true});
fs.writeFileSync('public/catalog/games.json',JSON.stringify({version:1,games}));
fs.writeFileSync('.validation/catalog-images.json',JSON.stringify(images));
const current=db.prepare("SELECT value FROM settings WHERE key='currentId'").get()?.value;
const selected=rows.find(g=>g.id===current);
fs.writeFileSync('.validation/desktop-progress-backup.json',JSON.stringify({format:'games-reducer-backup',version:1,exportedAt:new Date().toISOString(),current:selected?`${selected.system}|${selected.relative_path.replaceAll('\\','/').toLowerCase()}|${selected.size}`:null,games:rows.map(g=>({system:g.system,relative_path:g.relative_path.replaceAll('\\','/'),size:g.size,title:g.title,status:g.status,seconds:g.seconds,metadata:safeMetadata(JSON.parse(g.metadata))}))}));
db.close();console.log({games:games.length,images:images.length});
