import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync} from 'fflate';
import Mappers from '../node_modules/jsnes/src/mappers/index.js';
import {inspectNesHeader,inspectNesFile,canQueue,compatibilityReport} from '../src/nes-compatibility.js';

function rom(mapper=0){const bytes=new Uint8Array(16+16384);bytes.set([0x4e,0x45,0x53,0x1a,1,0,(mapper&15)<<4,mapper&240]);return bytes;}
test('NES header checks agree with the installed mapper registry including mapper 33',()=>{
  for(let mapper=0;mapper<256;mapper++){const bytes=rom(mapper),result=inspectNesHeader(bytes.subarray(0,16),bytes.length);assert.equal(result.mapper,mapper);assert.equal(result.status,Mappers[mapper]?'supported':'unsupported');}
});
test('NES 2.0 mapper extension and legacy dirty headers match engine decoding',()=>{
  const bytes=rom(19);bytes[7]|=8;bytes[8]=0x21;
  let result=inspectNesHeader(bytes,bytes.length);assert.equal(result.mapper,275);assert.equal(result.submapper,2);assert.equal(result.status,'unsupported');
  bytes[7]&=~8;result=inspectNesHeader(bytes,bytes.length);assert.equal(result.mapper,3);assert.equal(result.dirtyHeader,true);
});
test('malformed and truncated NES ROMs are blocked without altering review decisions',()=>{
  assert.equal(inspectNesHeader(new Uint8Array(3),3).status,'invalid');
  const bytes=rom();assert.equal(inspectNesHeader(bytes,20).status,'invalid');bytes[6]|=4;assert.equal(inspectNesHeader(bytes,bytes.length).status,'invalid');
  const game={status:'keep',compatibility:inspectNesHeader(rom(19),16400)};
  assert.equal(canQueue(game),false);assert.equal(game.status,'keep');assert.equal(canQueue({status:'unreviewed'}),true);
});
test('loose-file scan reads only 16 bytes and ZIP scan uses the same classification',async()=>{
  const bytes=rom(19),file=new File([bytes],'game.nes');let read;
  const result=await inspectNesFile({name:file.name,size:file.size,slice:(start,end)=>{read=[start,end];return file.slice(start,end);},arrayBuffer(){throw new Error('Must not read whole loose ROM');}});
  assert.deepEqual(read,[0,16]);assert.equal(result.status,'unsupported');
  assert.equal((await inspectNesFile(new File([zipSync({'game.nes':bytes})],'game.zip'))).mapper,19);
  assert.equal((await inspectNesFile(new File([zipSync({'a.nes':bytes,'b.nes':bytes})],'multi.zip'))).status,'invalid');
});
test('compatibility report excludes other consoles and missing files, and separates unknowns',()=>{
  const records=[{system:'nes',title:'Unsupported',compatibility:inspectNesHeader(rom(19),16400)},{system:'nes',title:'Unchecked'},{system:'nes',missing:true},{system:'snes'}];
  const result=compatibilityReport(records);assert.deepEqual(result.counts,{total:2,supported:0,unsupported:1,invalid:0,unchecked:1});assert.equal(result.games[0].title,'Unsupported');
});
