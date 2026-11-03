import test from 'node:test';
import assert from 'node:assert/strict';
import {packState,unpackState,sha256,validateStateRecords,STATE_LIMIT} from '../src/save-state-codec.js';
import {validateBackup} from '../src/browser-core.js';
const hash=await sha256(new Uint8Array([1,2,3]));
const bytes=Uint8Array.from({length:250000},(_,i)=>i%251);
const snapshot=await packState(bytes,'nes',hash);
const record={...snapshot,gameId:'a'.repeat(24),slot:1,key:'a'.repeat(24)+':1',createdAt:new Date().toISOString()};
test('state compression round trips without ROM-specific or device paths',async()=>{
 for(const system of ['nes','snes','megadrive']){const s=await packState(bytes,system,hash);assert.deepEqual(await unpackState(s,system,hash),bytes);assert.ok(s.data.length<bytes.length);}
 assert.deepEqual(validateStateRecords([record]),[record]);
});
test('state restore rejects different ROMs, incompatible cores, damage and impossible sizes',async()=>{
 await assert.rejects(unpackState(record,'nes','b'.repeat(64)),/different ROM/);
 await assert.rejects(unpackState({...record,engine:'future'},'nes',hash),/incompatible/);
 await assert.rejects(unpackState({...record,digest:'0'.repeat(64)},'nes',hash),/damaged/);
 await assert.rejects(unpackState({...record,rawLength:STATE_LIMIT+1},'nes',hash),/size/);
 for(const patch of [{slot:4},{key:'wrong'},{rawLength:STATE_LIMIT+1},{data:'bad!'},{gameId:'bad'}])assert.throws(()=>validateStateRecords([{...record,...patch}]));
 assert.throws(()=>validateStateRecords([record,record]));
});
test('backup v3 includes validated state slots and accepts older backups without slots',()=>{
 const base={format:'games-reducer-backup',games:[],saves:[]};
 assert.deepEqual(validateBackup({...base,version:3,states:[record]}).states,[record]);
 for(const version of [1,2])assert.deepEqual(validateBackup({...base,version}).states,[]);
 assert.throws(()=>validateBackup({...base,version:3,states:[{...record,slot:0}]}));
});
