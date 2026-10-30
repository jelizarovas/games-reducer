import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarizeGames,playTime} from '../src/progress.js';
test('dashboard counts available games by decision, with missing games separate',()=>{
  const s=summarizeGames([{status:'unreviewed',seconds:30},{status:'keep',seconds:90},{status:'skip',seconds:60},{status:'discard',seconds:20},{status:'keep',seconds:10,missing:true}]);
  assert.equal(s.total,4);assert.equal(s.reviewed,3);assert.equal(s.missing,1);assert.equal(s.counts.keep,1);assert.equal(s.seconds,210);
  assert.equal(summarizeGames([]).reviewed,0);assert.equal(playTime(3665),'1 h 1 min');
});
