import {SYSTEMS,LIMIT,statuses,cleanTitle,extension,safePath,identity,safeMetadata,decodeRom,validateBackup,validSaveKey} from './browser-core';
import {assetUrl} from './assets';

// Handles stay in IndexedDB; ROM bytes are read only when starting a game.
export const SAVE_DATABASE=`games-reducer:${new URL(import.meta.env.BASE_URL,location.href).pathname}`;
const DB_NAME=SAVE_DATABASE;
let db,initializing,library,player=null,preview=null,catalogPromise,releaseTab;
const empty=()=>({version:1,root:null,trash:null,games:[],history:[],pending:[],current:null});
function database(){return new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB_NAME,2);
  request.onupgradeneeded=()=>{for(const [name,options]of [['library',undefined],['files',{keyPath:'key'}]])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name,options);};
  request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};request.onerror=()=>reject(request.error);
  request.onblocked=()=>reject(new Error('Close other Games Reducer tabs and reload to upgrade local saves.'));
});}
function stored(mode,value){return new Promise((resolve,reject)=>{
  const tx=db.transaction('library',mode),store=tx.objectStore('library');
  const request=mode==='readonly'?store.get('state'):store.put(value,'state');
  tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Local storage transaction aborted.'));
});}
async function init(){
  if(!initializing)initializing=(async()=>{
    if(!navigator.locks)throw new Error('Use a current version of Edge or Chrome for local folder access.');
    await new Promise((resolve,reject)=>{
      navigator.locks.request(DB_NAME,{ifAvailable:true},lock=>{
        if(!lock){reject(new Error('Games Reducer is already open in another tab. Close that tab and reload.'));return;}
        resolve();return new Promise(done=>{releaseTab=done;});
      }).catch(reject);
    });
    db=await database();library=await stored('readonly')||empty();
    if(!library.legacySavesMigrated){
      const databases=await indexedDB.databases();
      if(databases.some(d=>d.name==='saves')){
        const legacy=await new Promise((resolve,reject)=>{const r=indexedDB.open('saves');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
        if(legacy.objectStoreNames.contains('files')){
          const records=await new Promise((resolve,reject)=>{const r=legacy.transaction('files').objectStore('files').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
          await new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite'),store=tx.objectStore('files');for(const record of records.filter(r=>validSaveKey(r.key))){const request=store.get(record.key);request.onsuccess=()=>{if(!request.result)store.put(record);};}tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
        }
        legacy.close();
      }
      library.legacySavesMigrated=true;await save();
    }
    window.addEventListener('pagehide',()=>{player=null;releaseTab?.();});
    window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
  })();
  return initializing;
}
async function save(){await stored('readwrite',library);}
const game=id=>{const value=library.games.find(g=>g.id===id);if(!value)throw new Error('Game not found.');return value;};
const publicGame=g=>{const {handle,...record}=g;return record;};
const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?new TextEncoder().encode(value):value))].map(b=>b.toString(16).padStart(2,'0')).join('');
async function permission(handle,mode='read'){
  if(!handle)throw new Error('Choose your ROM folder first.');
  if(handle.queryPermission&&await handle.queryPermission({mode})!=='granted'&&await handle.requestPermission({mode})!=='granted')throw new Error('Folder access was not granted. Choose the folder again in settings.');
}
const idle=()=>{if(player)throw new Error('Stop the running game before changing the library.');};
async function catalog(){
  if(!catalogPromise)catalogPromise=fetch(assetUrl('catalog/games.json')).then(r=>{if(!r.ok)throw new Error('Bundled catalog could not be loaded.');return r.json();}).then(data=>{
    const exact=new Map(),titles=new Map();
    for(const g of data.games){exact.set(`${g.system}|${g.relative_path.toLowerCase()}`,g);const key=`${g.system}|${cleanTitle(g.relative_path).toLowerCase()}`;const list=titles.get(key)||[];list.push(g);titles.set(key,list);}
    return {exact,titles};
  }).catch(error=>{catalogPromise=null;throw error;});
  return catalogPromise;
}
export function pickRomFolder(){
  if(!window.showDirectoryPicker)return Promise.reject(new Error('Folder access needs desktop Edge or Chrome over HTTPS (or localhost).'));
  // Invoke the native picker before any asynchronous work consumes user activation.
  return window.showDirectoryPicker({id:'games-reducer-roms',mode:'read'});
}
export async function pickTrashFolder(){
  const handle=await window.showDirectoryPicker({id:'games-reducer-trash',mode:'readwrite'});
  await init();library.trash=handle;preview=null;await save();return handle.name;
}
async function folderMetadata(handle,system){
  const map=new Map();
  try{
    const file=await(await handle.getFileHandle('gamelist.xml')).getFile();
    if(file.size>30*1024*1024)return map;
    const xml=new DOMParser().parseFromString(await file.text(),'text/xml');
    for(const entry of xml.querySelectorAll('game')){
      const text=key=>entry.querySelector(key)?.textContent?.trim()||'';
      try{
        const relative=safePath(text('path').replace(/^\.\//,''));
        map.set(`${system}/${relative}`.toLowerCase(),safeMetadata({name:text('name'),description:text('desc'),genre:text('genre'),released:text('releasedate'),publisher:text('publisher'),players:text('players'),source:'Local gamelist'}));
      }catch{/* Ignore paths outside the chosen directory. */}
    }
  }catch(error){if(error.name!=='NotFoundError')throw error;}
  return map;
}
export async function scanFolder(handle){
  await init();idle();const root=handle||library.root;await permission(root);
  const index=await catalog(),found=[],warnings=[],old=new Map(library.games.map(g=>[identity(g),g]));
  const pending=new Map(library.pending.map(g=>[identity(g),g]));
  for(const system of Object.keys(SYSTEMS)){
    let directory;
    try{directory=root.name.toLowerCase()===system?root:await root.getDirectoryHandle(system);}catch(error){if(error.name==='NotFoundError')continue;throw error;}
    const local=await folderMetadata(directory,system);
    const walk=async(dir,prefix)=>{
      for await(const [name,entry] of dir.entries()){
        if(['images','videos','media','manuals','.git'].includes(name.toLowerCase()))continue;
        const relative=`${prefix}/${name}`;
        if(entry.kind==='directory'){await walk(entry,relative);continue;}
        if(![...SYSTEMS[system].extensions,'.zip'].includes(extension(name)))continue;
        const file=await entry.getFile();
        if(file.size>LIMIT){warnings.push(`Too large: ${relative}`);continue;}
        // ZIP structure is checked on launch to avoid reading every ROM during scanning.
        const record={system,relative_path:relative,size:file.size,mtime:file.lastModified};
        const previous=old.get(identity(record)),imported=pending.get(identity(record));
        const same=previous&&previous.mtime===record.mtime;
        const exact=index.exact.get(`${system}|${relative.toLowerCase()}`);
        const alternatives=index.titles.get(`${system}|${cleanTitle(name).toLowerCase()}`)||[];
        const match=exact||(alternatives.length===1?alternatives[0]:null);
        const importedLocal=Object.fromEntries(Object.entries(local.get(relative.toLowerCase())||{}).filter(([,v])=>v));
        const metadata={...safeMetadata(match?.metadata),...safeMetadata(previous?.metadata),...safeMetadata(imported?.metadata),...importedLocal};
        found.push({...record,id:(await hash(`${system}|${relative.toLowerCase()}|${record.size}`)).slice(0,24),handle:entry,title:metadata.name||match?.title||cleanTitle(name),metadata,status:imported?.status||(same?previous.status:'unreviewed'),seconds:imported?.seconds??(same?previous.seconds:0),missing:false});
        pending.delete(identity(record));
      }
    };
    await walk(directory,system);
  }
  const sameRoot=library.root&&await library.root.isSameEntry(root);
  const foundKeys=new Set(found.map(identity));
  const missing=sameRoot?library.games.filter(g=>!foundKeys.has(identity(g))).map(g=>({...g,missing:true})):[];
  library={...library,root,games:[...found,...missing],history:sameRoot?library.history:[],pending:[...pending.values()]};
  if(library.pendingCurrent){library.current=found.find(g=>identity(g)===library.pendingCurrent)?.id||library.current;}
  if(!library.games.some(g=>g.id===library.current))library.current=found[0]?.id||null;
  preview=null;await save();navigator.storage?.persist?.().catch(()=>{});
  return {count:found.length,warnings};
}
export async function readRom(id){
  await init();const g=game(id);await permission(library.root);
  if(!g.handle||g.missing)throw new Error('Reconnect your ROM folder and scan before playing.');
  const file=await g.handle.getFile();
  if(file.size!==g.size||file.lastModified!==g.mtime)throw new Error('This ROM changed since scanning. Rescan your folder first.');
  return decodeRom(new Uint8Array(await file.arrayBuffer()),file.name,g.system);
}
export async function exportBackup(){
  await init();
  const records=await new Promise((resolve,reject)=>{const r=db.transaction('files').objectStore('files').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const encode=bytes=>{let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);};
  const saves=records.filter(r=>validSaveKey(r.key)).map(r=>({key:r.key,files:Object.fromEntries(Object.entries(r.data).map(([ext,bytes])=>[ext,encode(new Uint8Array(bytes))]))}));
  const backup={format:'games-reducer-backup',version:2,exportedAt:new Date().toISOString(),saves,current:library.games.find(g=>g.id===library.current)?identity(game(library.current)):null,games:[...library.games,...library.pending.filter(p=>!library.games.some(g=>identity(g)===identity(p)))].map(g=>({system:g.system,relative_path:g.relative_path,size:g.size,title:g.title,status:g.status,seconds:g.seconds,metadata:safeMetadata(g.metadata)}))};
  validateBackup(backup);return backup;
}
export async function importBackup(input){
  const backup=validateBackup(input);await init();idle();
  const records=new Map(backup.games.map(g=>[identity(g),g]));let matched=0;
  const games=library.games.map(g=>{const record=records.get(identity(g));if(!record)return g;records.delete(identity(g));matched++;return {...g,status:record.status,seconds:record.seconds,metadata:{...g.metadata,...record.metadata}};});
  const pending=new Map(library.pending.map(g=>[identity(g),g]));for(const [key,g]of records)pending.set(key,g);
  const next={...library,games,pending:[...pending.values()],history:[],pendingCurrent:backup.current,current:games.find(g=>identity(g)===backup.current)?.id||library.current};
  // Commit the whole import at once; malformed backups never partially apply.
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(['library','files'],'readwrite');tx.objectStore('library').put(next,'state');
    for(const record of backup.saves)tx.objectStore('files').put({key:record.key,data:Object.fromEntries(Object.entries(record.files).map(([ext,text])=>[ext,Uint8Array.from(atob(text),c=>c.charCodeAt(0))]))});
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Backup import was aborted.'));
  });library=next;preview=null;
  return {matched,pending:records.size,saves:backup.saves.length};
}
export async function readCartridgeSave(key){
  await init();return new Promise((resolve,reject)=>{const r=db.transaction('files').objectStore('files').get(key);r.onsuccess=()=>resolve(r.result?.data||{});r.onerror=()=>reject(r.error);});
}
export async function writeCartridgeSave(key,data){
  await init();if(!validSaveKey(key))throw new Error('Invalid cartridge save key.');
  await new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put({key,data});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
}
async function cleanup(token){
  idle();if(!preview||preview.token!==token||preview.expires<Date.now())throw new Error('Cleanup preview expired. Open Finish session again.');
  const items=preview.games;preview=null;
  const root=library.root,trash=library.trash;
  if(!trash)throw new Error('Choose a separate trash folder in settings first.');
  await permission(root,'readwrite');await permission(trash,'readwrite');
  if(await root.isSameEntry(trash)||await root.resolve(trash)!==null||await trash.resolve(root)!==null)throw new Error('Trash and ROM folders must be separate.');
  const results=[];
  for(const item of items){
    try{
      const g=game(item.id);if(g.status!=='discard'||g.size!==item.size||g.mtime!==item.mtime)throw new Error('Game changed since preview.');
      const source=await g.handle.getFile();if(source.size!==g.size||source.lastModified!==g.mtime)throw new Error('ROM changed. Rescan before moving it.');
      const bytes=await source.arrayBuffer(),digest=await hash(bytes);
      const destinationName=`${crypto.randomUUID()}-${source.name}`;
      const target=await trash.getFileHandle(destinationName,{create:true});
      const writable=await target.createWritable();await writable.write(bytes);await writable.close();
      if(await hash(await(await target.getFile()).arrayBuffer())!==digest)throw new Error('Trash copy could not be verified. Original kept.');
      // Persist a receipt BEFORE removing the verified source. A crash leaves a recoverable copy.
      library.receipts=library.receipts||[];library.receipts.push({id:g.id,relative_path:g.relative_path,destination:destinationName,sha256:digest,state:'copied'});await save();
      const latest=await g.handle.getFile();if(latest.lastModified!==source.lastModified||await hash(await latest.arrayBuffer())!==digest)throw new Error('Source changed during the move. Original kept.');
      const parts=g.relative_path.split('/');if(root.name.toLowerCase()===g.system)parts.shift();
      let parent=root;for(const part of parts.slice(0,-1))parent=await parent.getDirectoryHandle(part);
      if(!await(await parent.getFileHandle(parts.at(-1))).isSameEntry(g.handle))throw new Error('Source path changed. Original kept.');
      await parent.removeEntry(parts.at(-1));
      library.games=library.games.filter(entry=>entry.id!==g.id);library.history=library.history.filter(entry=>entry.id!==g.id);library.pending=library.pending.filter(entry=>identity(entry)!==identity(g));
      library.receipts.at(-1).state='moved';await save();results.push({id:g.id,ok:true});
    }catch(error){results.push({id:item.id,ok:false,error:error.message});}
  }
  return {results};
}
let operations=Promise.resolve();
export function browserApi(path,body){
  // Serialize writes and reads within the sole active tab, including heartbeat ticks.
  const result=operations.then(()=>dispatch(path,body));operations=result.catch(()=>{});return result;
}
async function dispatch(path,body){
  await init();
  if(path==='/state'){const saveCount=await new Promise((resolve,reject)=>{const r=db.transaction('files').objectStore('files').count();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return {root:library.root?.name||'',connected:!!library.root,trash:library.trash?.name||'',currentId:library.current,metadataConfigured:false,systems:SYSTEMS,stats:[],saveCount,playerActive:!!player};}
  if(path==='/games')return library.games.map(publicGame);
  if(path==='/scan')return scanFolder(body?.handle);
  if(path==='/current'){if(body.id){game(body.id);library.current=body.id;await save();}return {ok:true};}
  if(path==='/player/start'){if(player)throw new Error('A game is already running.');const g=game(body.id);await permission(library.root);if(g.missing)throw new Error('ROM is missing. Rescan your folder.');player={id:g.id,lastTick:Date.now()};library.current=g.id;await save();return {ok:true};}
  if(path==='/player/stop'){player=null;return {ok:true};}
  if(path==='/player/tick'){if(player?.id===body.id){const now=Date.now();if(body.playing)game(body.id).seconds+=Math.min(10,Math.floor((now-player.lastTick)/1000));player.lastTick=now;await save();}return {ok:true};}
  const decision=path.match(/^\/games\/([^/]+)\/decision$/);
  if(decision){idle();if(!statuses.includes(body.status))throw new Error('Invalid review status.');const g=game(decision[1]);library.history.push({id:g.id,before:g.status});g.status=body.status;preview=null;await save();return publicGame(g);}
  if(path==='/undo'){const last=library.history.pop();if(!last)return null;const g=game(last.id);g.status=last.before;preview=null;await save();return publicGame(g);}
  if(path==='/cleanup/preview'){idle();const games=library.games.filter(g=>g.status==='discard').map(publicGame);preview={token:crypto.randomUUID(),expires:Date.now()+600000,games};return {...preview,bytes:games.reduce((n,g)=>n+g.size,0),trash:library.trash?.name||'a trash folder you choose'};}
  if(path==='/cleanup/execute')return cleanup(body.token);
  if(path==='/missing/clear'){
    idle();await permission(library.root);const removable=[];
    for(const g of library.games.filter(g=>g.missing)){try{await g.handle.getFile();}catch(error){if(error.name==='NotFoundError')removable.push(g.id);else throw error;}}
    library.games=library.games.filter(g=>!removable.includes(g.id));library.history=library.history.filter(h=>!removable.includes(h.id));preview=null;await save();return {count:removable.length};
  }
  throw new Error('This action is not available in the browser edition.');
}
