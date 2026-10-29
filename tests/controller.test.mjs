import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePadRouter } from '../src/controller.js';
const pad = (...held) => ({ buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: held.includes(i) })), axes: [0, 0] });
test('RT is held turbo only in gameplay; release, review and disconnect reset it', () => {
  const route = makePadRouter(); route(pad(), 'playing');
  assert.equal(route(pad(7), 'playing').fastForward, true);
  assert.equal(route(pad(), 'playing').fastForward, false);
  assert.equal(route(pad(7, 8, 9), 'playing').fastForward, false);
  assert.equal(route(pad(7), 'decision').fastForward, false);
  assert.equal(route(pad(7), 'playing').fastForward, false);
  route(pad(), 'playing'); assert.equal(route(pad(7), 'playing').fastForward, true);
  assert.equal(route(null, 'playing').fastForward, false);
  route(pad(), 'ready'); assert.equal(route(pad(7), 'ready').action, 'pageNext');
});
test('a held gameplay button cannot discard during the transition to review', () => {
  const route = makePadRouter(); route(pad(), 'playing');
  assert.equal(route(pad(1, 8, 9), 'playing').action, 'review');
  assert.equal(route(pad(1, 8, 9), 'decision').action, null);
  assert.equal(route(pad(1), 'decision').action, null);
  route(pad(), 'decision'); assert.equal(route(pad(1), 'decision').action, 'discard');
  assert.equal(route(pad(1), 'decision').action, null);
});
test('gameplay buttons do not trigger triage actions and disconnect releases input', () => {
  const route = makePadRouter(); route(pad(), 'playing');
  assert.equal(route(pad(0, 1, 2, 3), 'playing').action, null);
  assert.deepEqual(route(null, 'playing').released, [0, 1, 2, 3]);
});
test('decision and menu controls are separate and require a new press', () => {
  const route = makePadRouter(); route(pad(), 'decision');
  assert.equal(route(pad(0), 'decision').action, 'keep');
  assert.equal(route(pad(0), 'ready').action, null);
  route(pad(), 'ready'); assert.equal(route(pad(0), 'ready').action, 'play');
});
test('library traversal covers menus, filters, consoles, and page jumps', () => {
  const route = makePadRouter();
  for (const [button, action] of [[12, 'previous'], [13, 'next'], [14, 'previousFilter'], [15, 'nextFilter'], [4, 'previousSystem'], [5, 'nextSystem'], [6, 'pagePrevious'], [7, 'pageNext'], [2, 'menu'], [8, 'menu'], [1, 'clearSearch']]) {
    route(pad(), 'ready'); assert.equal(route(pad(button), 'ready').action, action);
  }
});
test('holding a direction pauses before repeating; analog stick also traverses', () => {
  const route = makePadRouter(); route(pad(), 'ready', 0);
  assert.equal(route(pad(13), 'ready', 20).action, 'next');
  assert.equal(route(pad(13), 'ready', 100).action, null);
  assert.equal(route(pad(13), 'ready', 420).action, 'next');
  assert.equal(route(pad(13), 'ready', 440).action, null);
  route(pad(), 'ready', 500);
  const stick = pad(); stick.axes[1] = -1;
  assert.equal(route(stick, 'ready', 520).action, 'previous');
});
test('fullscreen is edge-triggered in library, gameplay, review, and dialog', () => {
  for (const mode of ['ready', 'playing', 'decision', 'modal']) {
    const route = makePadRouter(); route(pad(), mode);
    assert.equal(route(pad(10), mode).action, 'fullscreen');
    assert.notEqual(route(pad(10), mode).action, 'fullscreen');
  }
});
test('modal focus and activation stay separate from game decisions', () => {
  const route = makePadRouter(); route(pad(), 'modal');
  assert.equal(route(pad(13), 'modal').action, 'focusNext');
  route(pad(), 'modal'); assert.equal(route(pad(0), 'modal').action, 'activate');
  route(pad(), 'modal'); assert.equal(route(pad(1), 'modal').action, 'close');
});
