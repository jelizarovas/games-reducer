import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLaunchboxIndex, matchLaunchbox, Launchbox } from '../server/launchbox.mjs';
const entry=(id,system,title,year='1992',aliases=[])=>({id,system,title,year,aliases,covers:[]});
test('fallback matches console-specific titles and aliases without guessing sequels or hacks',()=>{
  const rows=[entry('1','nes','10-Yard Fight','1985'),entry('2','megadrive','Streets of Rage','1991',['Bare Knuckle'])];
  const index=buildLaunchboxIndex(rows);
  assert.equal(matchLaunchbox({system:'nes',relative_path:'nes/10 Yard Fight (U).zip'},index)?.year,'1985');
  assert.equal(matchLaunchbox({system:'snes',relative_path:'snes/10 Yard Fight.zip'},index),null);
  assert.equal(matchLaunchbox({system:'megadrive',relative_path:'Bare Knuckle (J).bin'},index)?.id,'2');
  assert.equal(matchLaunchbox({system:'megadrive',relative_path:'Bare Knuckle 2 (J).bin'},index),null);
  assert.equal(matchLaunchbox({system:'nes',relative_path:'10 Yard Fight (U) [h1].zip'},index),null);
  index.get('nes:10yardfight').push(entry('3','nes','10 Yard Fight','2020'));
  assert.equal(matchLaunchbox({system:'nes',relative_path:'10 Yard Fight.zip'},index),null);
});
test('fallback fills only missing dates and preserves review state and existing covers',async()=>{
  const games=[{id:'a',system:'nes',relative_path:'Mario.zip',status:'keep',seconds:44,metadata:{released:'1986',cover:'existing.png',genre:'Puzzle'}},{id:'b',system:'nes',relative_path:'Zelda.zip',status:'discard',seconds:12,metadata:{}}];
  const library={list:()=>games,get:id=>games.find(g=>g.id===id),updateMetadata:(id,m)=>Object.assign(library.get(id).metadata,m)};
  const source=new Launchbox(library);source.index=async()=>buildLaunchboxIndex([{...entry('1','nes','Mario','1985'),genre:'Platform'}, {...entry('2','nes','Zelda','1987'),genre:'Adventure'}]);
  const result=await source.enrich();assert.equal(result.years,1);assert.equal(result.genres,1);assert.equal(games[0].metadata.genre,'Puzzle');assert.equal(games[1].metadata.genre,'Adventure');
  assert.equal(games[0].metadata.released,'1986');assert.equal(games[0].metadata.cover,'existing.png');
  assert.equal(games[1].metadata.released,'1987');assert.equal(games[1].status,'discard');assert.equal(games[1].seconds,12);
});
