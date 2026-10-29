export const SNES_KEYS = { 0: 'KeyX', 1: 'KeyS', 2: 'KeyZ', 3: 'KeyA', 4: 'KeyD', 5: 'KeyC', 8: 'ShiftRight', 9: 'Enter', 12: 'ArrowUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight' };
export const GENESIS_KEYS = { 0: 'KeyS', 1: 'KeyD', 2: 'KeyA', 3: 'KeyW', 4: 'KeyQ', 5: 'KeyE', 9: 'Enter', 12: 'ArrowUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight' };
export const NES_KEYS = { 0: 'KeyX', 1: 'KeyZ', 2: 'KeyZ', 3: 'KeyX', 8: 'ControlRight', 9: 'Enter', 12: 'ArrowUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight' };

// All gameplay buttons must be released before a decision can be made.
// This prevents the same press from pausing and discarding a game.
export function makePadRouter() {
  let previous = new Set(), armed = false, lastMode = '', nextRepeat = 0, repeating = null;
  return (pad, mode, now = performance.now()) => {
    const down = new Set(pad ? pad.buttons.map((button, index) => button.pressed ? index : -1).filter(x => x >= 0) : []);
    if (pad?.axes[0] < -0.5) down.add(14); if (pad?.axes[0] > 0.5) down.add(15);
    if (pad?.axes[1] < -0.5) down.add(12); if (pad?.axes[1] > 0.5) down.add(13);
    if (mode !== lastMode) { armed = false; lastMode = mode; repeating = null; }
    if (!down.size) armed = true;
    const pressed = [...down].filter(button => !previous.has(button));
    const released = [...previous].filter(button => !down.has(button));
    let action = null;
    const repeat = (button, name) => {
      if (!down.has(button)) return false;
      if (pressed.includes(button) || repeating !== button) {
        repeating = button; nextRepeat = now + 400; action = name; return true;
      }
      if (now >= nextRepeat) { nextRepeat = now + 120; action = name; }
      return true;
    };
    if (!down.size) repeating = null;
    if (mode !== 'busy' && pressed.includes(10) && armed) action = 'fullscreen';
    else if (mode === 'playing') {
      if (down.has(8) && down.has(9)) action = 'review';
    } else if (armed) {
      if (mode === 'decision') {
        if (pressed.includes(0)) action = 'keep';
        else if (pressed.includes(1)) action = 'discard';
        else if (pressed.includes(2)) action = 'skip';
        else if (pressed.includes(3)) action = 'resume';
      } else if (mode === 'ready') {
        if (pressed.includes(0)) action = 'play';
        else if (pressed.includes(2) || pressed.includes(8)) action = 'menu';
        else if (pressed.includes(1)) action = 'clearSearch';
        else if (pressed.includes(3)) action = 'undo';
        else if (pressed.includes(9)) action = 'finish';
        else if (pressed.includes(4)) action = 'previousSystem';
        else if (pressed.includes(5)) action = 'nextSystem';
        else if (pressed.includes(14)) action = 'previousFilter';
        else if (pressed.includes(15)) action = 'nextFilter';
        else if (!repeat(6, 'pagePrevious') && !repeat(7, 'pageNext') && !repeat(12, 'previous')) repeat(13, 'next');
      } else if (mode === 'modal') {
        if (pressed.includes(1) || pressed.includes(8)) action = 'close';
        else if (pressed.includes(0)) action = 'activate';
        else if (!repeat(12, 'focusPrevious') && !repeat(14, 'focusPrevious') && !repeat(13, 'focusNext')) repeat(15, 'focusNext');
      }
    }
    previous = down;
    return { pressed, released, action, down, fastForward: mode === 'playing' && action !== 'review' && armed && down.has(7) };
  };
}
