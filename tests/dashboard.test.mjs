import test from 'node:test';
import assert from 'node:assert/strict';
import {routeName,pathForRoute} from '../src/route-model.js';
import {nextDashboardGame} from '../src/dashboard-queue.js';
test('home, player and library URLs work at root and GitHub project paths',()=>{
 for(const base of ['/','/games-reducer/']){
  assert.equal(routeName(base,'',base),'home');assert.equal(pathForRoute('home',base),base);
  for(const [name,path]of [['player','play'],['games','games']]){assert.equal(pathForRoute(name,base),base+path+'/');for(const suffix of ['','/','/index.html'])assert.equal(routeName(base+path+suffix,'',base),name);}
  assert.equal(routeName(base,'?game=mario&console=nes',base),'player');assert.equal(routeName(base+'games/','?game=mario',base),'games');
 }
});
test('dashboard queue respects languages and excludes reviewed, missing and blocked games',()=>{
 const game=(id,title,status='unreviewed',extra={})=>({id,title,status,system:'nes',filename:title+'.nes',metadata:{languages:['en']},...extra});
 const games=[game('z','Zelda'),game('a','Adventure'),game('k','Keeper','keep'),game('j','Japanese','unreviewed',{metadata:{languages:['ja']}}),game('m','Missing','unreviewed',{missing:true}),game('b','Blocked','unreviewed',{compatibility:{status:'unsupported'}})];
 assert.equal(nextDashboardGame(games,['en'])?.id,'a');assert.equal(nextDashboardGame(games,['en'],'z')?.id,'z');assert.equal(nextDashboardGame(games,['ja'])?.id,'j');assert.equal(nextDashboardGame(games,['fr']),null);assert.equal(nextDashboardGame([],['en']),null);
 assert.equal(games[0].id,'z','Queue ordering does not mutate the collection');
});
