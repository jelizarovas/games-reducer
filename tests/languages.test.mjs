import test from 'node:test';
import assert from 'node:assert/strict';
import {gameLanguages,matchesLanguage,languageOptions} from '../src/languages.js';
import {safeMetadata,validateBackup} from '../src/browser-core.js';
const game=(name,metadata={})=>({relative_path:`nes/${name}.nes`,metadata});
test('region-based English estimates include US, Europe, world and combined releases',()=>{
  for(const tag of ['U','USA','E','Europe','W','World','UE','JU','JUE','USA, Europe']){const g=game(`Game (${tag})`);assert.ok(matchesLanguage(g,'en'),tag);assert.equal(gameLanguages(g).estimated,true);}
  assert.equal(matchesLanguage(game('Game (J)'),'en'),false);assert.equal(matchesLanguage(game('Game (J)'),'ja'),true);
});
test('explicit language and translation tags override release region',()=>{
  assert.deepEqual(gameLanguages(game('Game (Japan) (En,Fr)')).codes,['en','fr']);
  assert.deepEqual(gameLanguages(game('Game (U) (Fr,De)')).codes,['fr','de']);
  assert.deepEqual(gameLanguages(game('Game (J) [T+Eng1.0_team]')).codes,['en']);
  assert.equal(gameLanguages(game('Game (J) [T-Eng0.9]')).source,'Partial translation tag');
  assert.deepEqual(gameLanguages(game('Game (U)',{languages:['de','fr']})).codes,['de','fr']);
});
test('untagged games, multilingual counts and English titles are not language evidence',()=>{
  for(const name of ['English Title','Game (Unl)','Game (M5)','Game [!]','Game (Prototype)','Game (Sachen)','Game (constructor)'])assert.equal(matchesLanguage(game(name),'unknown'),true);
  assert.equal(matchesLanguage({relative_path:'English/Game.nes'},'unknown'),true);
  assert.equal(matchesLanguage(game('Game (Ch)'),'zh'),true);assert.equal(matchesLanguage(game('Game (R)'),'ru'),true);
  assert.equal(matchesLanguage(game('Game (J)'),'all'),true);
});
test('filters span systems and keep explicit language metadata in backups',()=>{
  const games=[{...game('One (U)'),system:'nes'},{...game('Two (E)'),system:'snes'},{...game('Three (J)'),system:'megadrive'}];
  assert.equal(games.filter(g=>matchesLanguage(g,'en')).length,2);
  assert.deepEqual(languageOptions(games).map(o=>o.value),['all','en','ja','unknown']);
  const metadata=safeMetadata({languages:['en','ja'],language:'en',unexpected:'ignored'});assert.deepEqual(metadata,{languages:'en,ja',language:'en'});
  const restored=validateBackup({format:'games-reducer-backup',version:1,games:[{...games[0],size:100,status:'keep',seconds:0,metadata}]});assert.equal(restored.games[0].metadata.languages,'en,ja');
});
