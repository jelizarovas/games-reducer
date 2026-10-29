import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchCover } from '../server/covers.mjs';
test('covers match titles within one console and prefer ROM region', () => {
  const names = ['Sonic The Hedgehog 2 (Japan).png', 'Sonic The Hedgehog 2 (USA, Europe).png', 'Sonic The Hedgehog (USA).png'];
  assert.equal(matchCover({ relative_path: 'Sonic The Hedgehog 2 (U) [!].bin' }, names), names[1]);
  assert.equal(matchCover({ relative_path: 'Sonic The Hedgehog 2 (J) [!].bin' }, names), names[0]);
  assert.equal(matchCover({ relative_path: 'Sonic The Hedgehog 3 (U).bin' }, names), null);
  assert.equal(matchCover({ relative_path: 'Sonic The Hedgehog 2 (Hack).bin' }, names), null);
});
