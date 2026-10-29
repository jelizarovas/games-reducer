import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesConsole, releaseYear, consoleNames, sortGames, cardDetails, gameCategory, gameCategories, matchesCategory } from '../src/library-view.js';
test('All includes every supported console while specific choices filter it', () => {
  const games = ['megadrive','snes','nes'].map(system => ({system}));
  assert.equal(Object.keys(consoleNames)[0], 'all');
  assert.equal(games.filter(game => matchesConsole(game, 'all')).length, 3);
  assert.deepEqual(games.filter(game => matchesConsole(game, 'snes')), [{system:'snes'}]);
});

test('category matching spans consoles, checks every genre, and handles missing metadata', () => {
  const games=[{system:'nes',metadata:{genre:'Action; Platform'}},{system:'snes',metadata:{genre:'Puzzle; Strategy'}},{system:'megadrive',metadata:{genres:['Platformer','Adventure','Puzzle']}},{system:'nes',metadata:{}}];
  assert.deepEqual(games.filter(g=>matchesCategory(g,'Platformer')).map(g=>g.system),['nes','megadrive']);
  assert.deepEqual(games.filter(g=>matchesCategory(g,'Puzzle')).map(g=>g.system),['snes','megadrive']);
  assert.equal(games.filter(g=>matchesCategory(g,'all')).length,4);
  assert.equal(games.filter(g=>matchesCategory(g,'uncategorized')).length,1);
  assert.deepEqual(gameCategories({genre:'Platform; Platformer'}),['Platformer']);
  assert.equal(games.filter(g=>matchesConsole(g,'snes')&&matchesCategory(g,'Platformer')).length,0);
});
test('year sorting keeps unknown dates last in either direction and does not mutate the library',()=>{
  const games=[{id:'1',system:'nes',title:'Z',metadata:{}},{id:'2',system:'nes',title:'A',metadata:{released:'1992'}},{id:'3',system:'snes',title:'B',metadata:{released:'1985'}}];
  assert.deepEqual(sortGames(games,'year').map(g=>g.id),['3','2','1']);
  assert.deepEqual(sortGames(games,'year-desc').map(g=>g.id),['2','3','1']);
  assert.deepEqual(games.map(g=>g.id),['1','2','3']);
});
test('release years handle imported dates without inventing missing years', () => {
  for (const released of ['1992', '19921124T000000', '1992-11-24']) assert.equal(releaseYear({released}), '1992');
  for (const released of ['', 'unknown', '00000000T000000', 'N/A']) assert.equal(releaseYear({released}), null);
});

test('cards omit unknown years and put specific categories after the console',()=>{
  assert.equal(cardDetails({system:'nes',metadata:{released:'unknown',genre:'Action; Platform'}}),'NES \u00b7 Platformer');
  assert.equal(cardDetails({system:'snes',metadata:{released:'1992-01-01',genre:'Puzzle'}}),'1992 \u00b7 SNES \u00b7 Puzzle');
  assert.equal(cardDetails({system:'megadrive',metadata:{}}),'Genesis');
  assert.equal(gameCategory({genre:'Unknown'}),'');
  assert.equal(gameCategory({genre:"Action; Shoot \u2019em Up"}),'Shooter');
});
