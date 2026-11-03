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
