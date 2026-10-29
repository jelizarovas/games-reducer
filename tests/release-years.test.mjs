import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32 } from 'node:zlib';
import { parseYearDat, makeYearIndex, matchYearTitle, matchYearBytes, ReleaseYears } from '../server/release-years.mjs';

test('parses release years and ignores incomplete provider records', () => {
  const records=parseYearDat('game (\n comment "Example (USA)"\n releaseyear "1992"\n rom ( crc ABCDEF12 )\n)\ngame (\n comment "Missing date"\n rom ( crc 12345678 )\n)');
  assert.deepEqual(records,[{name:'Example (USA)',year:'1992',crc:'ABCDEF12'}]);
});
test('uses regional dates and refuses ambiguous or hacked title matches', () => {
  const index=makeYearIndex([{name:'Example, The (USA)',year:'1992',crc:'11111111'},{name:'Example, The (Japan)',year:'1991',crc:'22222222'}]);
  assert.equal(matchYearTitle({relative_path:'nes/The Example (U) [!].nes'},index).year,'1992');
  assert.equal(matchYearTitle({relative_path:'nes/The Example (J) [!].nes'},index).year,'1991');
  assert.equal(matchYearTitle({relative_path:'nes/The Example.nes'},index),null);
  assert.equal(matchYearTitle({relative_path:'nes/The Example (U) [h1].nes'},index),null);
  assert.equal(matchYearTitle({relative_path:'nes/The Example 2 (U).nes'},index),null);
});
test('matches renamed NES and SNES ROMs with copier headers using local CRCs', () => {
  const bytes=Buffer.alloc(1024,41);
  const index=makeYearIndex([{name:'Example (USA)',year:'1992',crc:crc32(bytes).toString(16).toUpperCase().padStart(8,'0')}]);
  const nesHeader=Buffer.alloc(16); Buffer.from([78,69,83,26]).copy(nesHeader);
  assert.equal(matchYearBytes(Buffer.concat([nesHeader,bytes]),'nes',index).year,'1992');
  assert.equal(matchYearBytes(Buffer.concat([Buffer.alloc(512),bytes]),'snes',index).year,'1992');
  assert.equal(matchYearBytes(Buffer.alloc(40),'nes',index),null);
});
test('fills missing dates while preserving existing metadata and review decisions', async () => {
  const games=[{id:'a',system:'nes',relative_path:'Example (U).nes',status:'keep',metadata:{cover:'cover.png'}},{id:'b',system:'nes',relative_path:'Other.nes',status:'discard',metadata:{released:'1989',description:'Existing'}}];
  const library={list:()=>games,get:id=>games.find(g=>g.id===id),updateMetadata:(id,data)=>Object.assign(games.find(g=>g.id===id).metadata,data)};
  const years=new ReleaseYears(library);
  years.index=async()=>makeYearIndex([{name:'Example (USA)',year:'1992',crc:'11111111'}]);
  assert.equal((await years.enrich()).updated,1);
  assert.equal(games[0].metadata.released,'1992'); assert.equal(games[0].metadata.cover,'cover.png'); assert.equal(games[0].status,'keep');
  assert.deepEqual(games[1].metadata,{released:'1989',description:'Existing'});
  assert.equal((await years.enrich()).updated,0);
});
