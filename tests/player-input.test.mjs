import {test} from 'node:test';
import assert from 'node:assert/strict';
import {engineKey,playerTwoKeys} from '../src/player-input.js';
import {GENESIS_KEYS,SNES_KEYS} from '../src/controller.js';
test('every Genesis and SNES P2 control has a distinct key channel',()=>{
  const p1=new Set([...Object.values(GENESIS_KEYS),...Object.values(SNES_KEYS)]);
  for(const code of p1) {
    assert.equal(engineKey(code,1),code);
    assert.ok(engineKey(code,2));assert.ok(!p1.has(engineKey(code,2)));
  }
  assert.equal(new Set(Object.values(playerTwoKeys)).size,Object.keys(playerTwoKeys).length);
});
