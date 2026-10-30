import {test} from 'node:test';
import assert from 'node:assert/strict';
import {engineKey,playerTwoKeys,keyboardCode,keyboardLabel} from '../src/player-input.js';
import {GENESIS_KEYS,SNES_KEYS} from '../src/controller.js';
test('every Genesis and SNES P2 control has a distinct key channel',()=>{
  const p1=new Set([...Object.values(GENESIS_KEYS),...Object.values(SNES_KEYS)]);
  for(const code of p1) {
    assert.equal(engineKey(code,1),code);
    assert.ok(engineKey(code,2));assert.ok(!p1.has(engineKey(code,2)));
  }
  assert.equal(new Set(Object.values(playerTwoKeys)).size,Object.keys(playerTwoKeys).length);
});
test('Genesis keyboard uses ZXC / ASD without changing SNES, NES, or controller bindings',()=>{
  for(const [physical,logical]of [['KeyZ','KeyA'],['KeyX','KeyS'],['KeyC','KeyD'],['KeyA','KeyQ'],['KeyS','KeyW'],['KeyD','KeyE']]){
    assert.equal(keyboardCode('megadrive',physical),logical);
    assert.equal(keyboardLabel('megadrive',logical),physical.slice(3));
    assert.equal(keyboardCode('snes',physical),physical);assert.equal(keyboardCode('nes',physical),physical);
  }
  assert.equal(keyboardCode('megadrive','KeyQ'),null);assert.equal(keyboardCode('megadrive','Enter'),'Enter');
  assert.equal(engineKey(GENESIS_KEYS[0],1),'KeyS');
});
