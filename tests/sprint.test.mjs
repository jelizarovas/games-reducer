import test from 'node:test';
import assert from 'node:assert/strict';
import {createSprint,syncSprint,sprintSummary,nextSprintGame,validateSprint} from '../src/sprint.js';
import {validateBackup} from '../src/browser-core.js';
import {libraryFilter} from '../src/route-model.js';
const games=['a','b','c','d'].map((letter,i)=>({id:letter.repeat(24),title:'Game '+i,system:'nes',status:'unreviewed'}));
const start=()=>createSprint(games,games.slice(0,3).map(g=>g.id),100,'test-sprint');
test('sprint is a fixed eligible batch and rejects invalid or stale selections',()=>{
 const s=start();assert.equal(s.target,3);assert.equal(nextSprintGame(s,games).id,games[0].id);assert.deepEqual(validateSprint(s),s);
 for(const ids of [[],['missing'],[games[0].id,games[0].id]])assert.throws(()=>createSprint(games,ids));
 for(const patch of [{status:'keep'},{missing:true},{compatibility:{status:'unsupported'}}])assert.throws(()=>createSprint([{...games[0],...patch}],[games[0].id]));
});
test('sprint decisions count once, include later, and stop exactly at the target',()=>{
 const changed=games.map((g,i)=>({...g,status:['keep','discard','skip','keep'][i]})),s=syncSprint(start(),changed,200);
 assert.equal(s.status,'completed');assert.equal(s.finishedAt,200);assert.deepEqual(sprintSummary(s),{counts:{keep:1,discard:1,skip:1},done:3,target:3,remaining:0});assert.equal(nextSprintGame(s,changed),null);
 assert.equal(syncSprint(s,changed,300).finishedAt,200);
});
test('undo reopens a completed sprint and re-review changes its result without double counting',()=>{
 const finished=syncSprint(start(),games.map(g=>({...g,status:'keep'})),200);
 const undone=games.map((g,i)=>({...g,status:i===1?'unreviewed':'keep'}));const active=syncSprint(finished,undone,300);
 assert.equal(active.status,'active');assert.equal(active.finishedAt,null);assert.equal(sprintSummary(active).done,2);assert.equal(nextSprintGame(active,undone).id,games[1].id);
 undone[1].status='skip';assert.equal(sprintSummary(syncSprint(active,undone,400)).counts.skip,1);
});
test('missing sprint members do not get replaced with unrelated games and ended results stay saved',()=>{
 const changed=games.map((g,i)=>({...g,missing:i<3}));assert.equal(nextSprintGame(start(),changed),null);
 const ended={...start(),status:'ended',finishedAt:200};assert.deepEqual(syncSprint(ended,games.map(g=>({...g,status:'keep'}))),ended);
});
test('backups carry sprint progress and older backups preserve its absence',()=>{
 const base={format:'games-reducer-backup',version:3,games:[],saves:[],states:[]};assert.deepEqual(validateBackup({...base,sprint:start()}).sprint,start());assert.equal(validateBackup(base).sprint,undefined);
 assert.throws(()=>validateBackup({...base,sprint:{...start(),target:999}}));assert.throws(()=>validateSprint({...start(),status:'completed'}));assert.throws(()=>validateSprint({...start(),entries:[...start().entries.slice(0,2),start().entries[0]]}));
});
test('library filter links validate all review states and default safely',()=>{
 for(const status of ['unreviewed','keep','discard','skip','all'])assert.equal(libraryFilter('?filter='+status),status);
 assert.equal(libraryFilter('?filter=anything'),'unreviewed');assert.equal(libraryFilter(''),'unreviewed');
});
