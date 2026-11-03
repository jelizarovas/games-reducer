import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initSync,WorkerCore} from '../public/engine/worker/reducer_worker.js';
import {genesisFixture,snesFixture} from './fixtures/worker-roms.mjs';
initSync({module:fs.readFileSync(new URL('../public/engine/worker/reducer_worker_bg.wasm',import.meta.url))});
for(const [system,fixture,key]of [['megadrive',genesisFixture,'ArrowUp'],['snes',snesFixture,'KeyX']]){
 test(`${system} worker preserves cartridge saves across boots and independent controller ports`,()=>{
  const bytes=new Uint8Array(8192);bytes[2]=41;
  const core=new WorkerCore(system,fixture(),48000,JSON.stringify({sav:Array.from(bytes)}));let persisted;
  try{
   for(let i=0;i<3;i++)core.frame();const initial=JSON.parse(core.take_saves()).sav;assert.equal(initial[2],42);
   core.key(key,true,1);core.frame();const p1=JSON.parse(core.take_saves()).sav;assert.notEqual(p1[0],initial[0]);assert.equal(p1[1],initial[1]);
   core.key(key,true,2);core.frame();const p2=JSON.parse(core.take_saves()).sav;assert.equal(p2[0],p1[0]);assert.notEqual(p2[1],initial[1]);
   core.release_keys();core.frame();persisted=JSON.parse(core.take_saves()).sav;assert.deepEqual(persisted.slice(0,2),initial.slice(0,2));
   core.frame();assert.deepEqual(JSON.parse(core.take_saves()),{},'Unchanged saves do not create repeated writes');
  }finally{core.free();}
  const restored=new WorkerCore(system,fixture(),48000,JSON.stringify({sav:persisted}));try{restored.frame();assert.equal(JSON.parse(restored.take_saves()).sav[2],43);}finally{restored.free();}
 });
 for(const rate of [44100,48000,96000])test(`${system} produces device-rate stereo audio at ${rate}Hz`,()=>{
  const core=new WorkerCore(system,fixture(),rate,'{}');try{let samples=0;for(let i=0;i<60;i++){core.frame();const audio=core.take_audio();assert.equal(audio.length%2,0);assert.ok(audio.every(Number.isFinite));samples+=audio.length/2;}assert.ok(Math.abs(samples-rate*60/core.fps())<rate*.025,`${samples} samples`);assert.equal(core.pixels().length,core.width()*core.height()*4);assert.ok(core.aspect()>1&&core.aspect()<2);}finally{core.free();}
 });
 test(`${system} retains PAL pacing instead of forcing 60Hz`,()=>{const core=new WorkerCore(system,fixture(true),48000,'{}');try{core.frame();assert.ok(core.fps()>49&&core.fps()<51);}finally{core.free();}});
}

for(const [system,fixture,key]of [['megadrive',genesisFixture,'ArrowUp'],['snes',snesFixture,'KeyX']]){
 test(`${system} snapshots restore CPU execution, battery RAM and device-rate audio`,()=>{
  const core=new WorkerCore(system,fixture(),48000,'{}');const other=new WorkerCore(system,fixture(),44100,'{}');
  try{
   for(let i=0;i<10;i++)core.frame();core.take_audio();const initial=JSON.parse(core.take_saves()).sav;
   const saved=core.save_state();assert.ok(saved.length>1000&&saved.length<10000000);
   core.key(key,true,1);for(let i=0;i<5;i++)core.frame();assert.notEqual(JSON.parse(core.take_saves()).sav[0],initial[0]);
   core.load_state(saved);assert.deepEqual(JSON.parse(core.take_saves()).sav,initial,'Battery state rolls back');
   for(let i=0;i<5;i++)core.frame();assert.deepEqual(JSON.parse(core.take_saves()),{},'Restoring resumes CPU after boot rather than rebooting the cartridge');
   const stable=core.save_state();for(const bad of [new Uint8Array([1,2,3]),saved.subarray(0,100),new Uint8Array(saved.length)]){assert.throws(()=>core.load_state(bad));assert.deepEqual(core.save_state(),stable,'Invalid snapshots leave the current machine intact');}
   other.load_state(saved);other.take_saves();let samples=0;for(let i=0;i<60;i++){other.frame();const audio=other.take_audio();assert.ok(audio.every(Number.isFinite));samples+=audio.length/2;}
   assert.ok(Math.abs(samples-44100*60/other.fps())<44100*.03,`${samples} restored audio samples`);assert.deepEqual(JSON.parse(other.take_saves()),{},'A portable state does not reboot');
  }finally{core.free();other.free();}
 });
}
test('native cores reject a snapshot for the other console',()=>{
 const genesis=new WorkerCore('megadrive',genesisFixture(),48000,'{}'),snes=new WorkerCore('snes',snesFixture(),48000,'{}');try{genesis.frame();snes.frame();assert.throws(()=>snes.load_state(genesis.save_state()));assert.throws(()=>genesis.load_state(snes.save_state()));}finally{genesis.free();snes.free();}
});
