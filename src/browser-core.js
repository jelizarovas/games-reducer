import {unzipSync} from 'fflate';

export const SYSTEMS = {
  megadrive:{name:'Sega Genesis',extensions:['.gen','.md','.bin','.smd']},
  snes:{name:'Super Nintendo',extensions:['.smc','.sfc']},
  nes:{name:'Nintendo',extensions:['.nes']},
};
export const LIMIT=64*1024*1024;
export const statuses=['unreviewed','keep','discard','skip'];
export const cleanTitle = name => name.split('/').pop().replace(/\.[^.]+$/,'').replace(/\([^)]*\)|\[[^\]]*\]/g,'').replace(/\s+/g,' ').trim();
export const extension = name => name.slice(name.lastIndexOf('.')).toLowerCase();
export function safePath(value) {
  if(typeof value!=='string'||value.length>2000||/^[\/\\]|[:\x00-\x1f]/.test(value))throw new Error('Invalid relative ROM path.');
  const parts=value.replaceAll('\\','/').split('/');
  if(parts.some(p=>!p||p==='.'||p==='..'))throw new Error('Invalid relative ROM path.');
  return parts.join('/');
}
export const identity = game => `${game.system}|${safePath(game.relative_path).toLowerCase()}|${game.size}`;
export function safeMetadata(value={}) {
  const result={};
  for(const key of ['name','description','genre','players','released','publisher','source','yearSource','genreSource','coverSource']) {
    if(typeof value[key]==='string')result[key]=value[key].slice(0,key==='description'?12000:400);
  }
  if(typeof value.cover==='string'&&/^catalog\/covers\/[a-f0-9]+\.webp$/.test(value.cover))result.cover=value.cover;
  return result;
}
export function decodeRom(bytes,name,system) {
  if(bytes.byteLength>LIMIT)throw new Error('ROM exceeds the 64 MB cartridge limit.');
  if(extension(name)!=='.zip')return {bytes,name};
  let expanded=0;
  const files=unzipSync(bytes,{filter:entry=>{
    if(!SYSTEMS[system].extensions.includes(extension(entry.name)))return false;
    expanded+=entry.originalSize;if(expanded>LIMIT)throw new Error('ZIP expands beyond 64 MB.');return true;
  }});
  const entries=Object.entries(files);
  if(entries.length!==1)throw new Error('ZIP must contain exactly one supported ROM.');
  return {bytes:entries[0][1],name:entries[0][0].split(/[\\/]/).pop()};
}
export function validateBackup(input) {
  if(!input||input.format!=='games-reducer-backup'||input.version!==1||!Array.isArray(input.games)||input.games.length>50000)throw new Error('Not a supported Games Reducer backup.');
  const seen=new Set();
  const games=input.games.map(g=>{
    if(!g||!SYSTEMS[g.system]||!statuses.includes(g.status)||!Number.isSafeInteger(g.size)||g.size<0||g.size>LIMIT||!Number.isFinite(g.seconds)||g.seconds<0||g.seconds>1e10)throw new Error('Backup has an invalid game record.');
    const record={system:g.system,relative_path:safePath(g.relative_path),size:g.size,status:g.status,seconds:g.seconds,title:String(g.title||'').slice(0,400),metadata:safeMetadata(g.metadata)};
    const key=identity(record);if(seen.has(key))throw new Error('Backup has duplicate game records.');seen.add(key);return record;
  });
  return {games,current:typeof input.current==='string'?input.current:null};
}
