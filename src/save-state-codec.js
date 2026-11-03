import {gzipSync,gunzipSync} from 'fflate';
export const STATE_ENGINES={nes:'jsnes-2.1-m33-v1',snes:'jgenesis-c9ff-worker-state-v1',megadrive:'jgenesis-c9ff-worker-state-v1'};
export const STATE_LIMIT=16*1024*1024;
export const toBase64=bytes=>{let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);};
export const fromBase64=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
export const sha256=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
export async function packState(bytes,system,romHash){
 if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>STATE_LIMIT)throw new Error('Save state is too large.');
 const compressed=gzipSync(bytes);
 return {version:1,system,engine:STATE_ENGINES[system],romHash,digest:await sha256(compressed),rawLength:bytes.length,data:toBase64(compressed)};
}
export function validateStateRecords(records){
 if(!Array.isArray(records)||records.length>30000)throw new Error('Invalid save-state collection.');
 let total=0;const seen=new Set();
 return records.map(r=>{
  if(!r||r.version!==1||!STATE_ENGINES[r.system]||!/^\w[\w.-]{0,79}$/.test(r.engine)||!/^\d{4}-\d\d-\d\dT/.test(r.createdAt)||!Number.isFinite(Date.parse(r.createdAt))||!/^[a-f0-9]{24}$/.test(r.gameId)||![1,2,3].includes(r.slot)||r.key!==`${r.gameId}:${r.slot}`||seen.has(r.key)||!Number.isSafeInteger(r.rawLength)||r.rawLength<1||r.rawLength>STATE_LIMIT||!/^[a-f0-9]{64}$/.test(r.romHash)||!/^[a-f0-9]{64}$/.test(r.digest)||typeof r.data!=='string'||!r.data.length||r.data.length>24*1024*1024||r.data.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(r.data))throw new Error('Invalid save-state record.');
  total+=r.data.length;if(total>48*1024*1024)throw new Error('Save states exceed the 36 MB backup limit.');seen.add(r.key);
  return {key:r.key,gameId:r.gameId,slot:r.slot,version:1,system:r.system,engine:r.engine,romHash:r.romHash,digest:r.digest,rawLength:r.rawLength,data:r.data,createdAt:r.createdAt};
 });
}
export async function unpackState(record,system,romHash){
 if(record.system!==system||record.romHash!==romHash)throw new Error('This save state belongs to a different ROM. Choose the same ROM version used when saving.');
 if(record.version!==1||record.engine!==STATE_ENGINES[system])throw new Error('This save state uses an incompatible emulator version.');
 const compressed=fromBase64(record.data);
 if(compressed.length<18||compressed[0]!==31||compressed[1]!==139||await sha256(compressed)!==record.digest)throw new Error('Save state is damaged.');
 const size=new DataView(compressed.buffer,compressed.byteOffset,compressed.byteLength).getUint32(compressed.length-4,true);
 if(size!==record.rawLength||size<1||size>STATE_LIMIT)throw new Error('Invalid save-state size.');
 const bytes=gunzipSync(compressed,{out:new Uint8Array(size)});if(bytes.length!==size)throw new Error('Invalid save-state payload.');return bytes;
}
