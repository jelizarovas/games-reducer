// Cartridge saves share the app database so backups restore saves and reviews atomically.
const pending=new Set();let failure;
function open(){return new Promise((resolve,reject)=>{const r=indexedDB.open(globalThis.reducerSaveDatabase||'saves');r.onupgradeneeded=()=>r.result.createObjectStore('files',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function loadSaveFiles(key){
  const db=await open();try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction('files'),store=tx.objectStore('files'),request=store.get(key);
    request.onsuccess=()=>{
      if(request.result){resolve(request.result.data);return;}
      // The former desktop edition used root-dependent IDs. Reuse a unique exact
      // cartridge filename when migrating those saves; never guess between versions.
      const all=store.getAll();all.onsuccess=()=>{const suffix=key.slice(25),matches=all.result.filter(r=>r.key.slice(25)===suffix);resolve(matches.length===1?matches[0].data:{});};all.onerror=()=>reject(all.error);
    };request.onerror=()=>reject(request.error);
  });}finally{db.close();}
}
export function writeSaveFile(key,extension,bytes){
  const operation=(async()=>{const db=await open();try{await new Promise((resolve,reject)=>{
    const tx=db.transaction('files','readwrite'),store=tx.objectStore('files'),request=store.get(key);
    request.onsuccess=()=>{const record=request.result||{key,data:{}};record.data[extension]=new Uint8Array(bytes);store.put(record);};
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Save transaction aborted.'));
  });}finally{db.close();}})();
  pending.add(operation);operation.then(()=>pending.delete(operation),error=>{pending.delete(operation);failure=error;});return operation;
}
globalThis.reducerFlushSaves=async()=>{await Promise.all([...pending]);if(failure)throw failure;};
