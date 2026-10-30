// Distinct physical key codes are understood by the two-player WASM adapter.
export const playerTwoKeys = {ArrowUp:'KeyI',ArrowDown:'KeyK',ArrowLeft:'KeyJ',ArrowRight:'KeyL',KeyA:'Digit1',KeyS:'Digit2',KeyD:'Digit3',KeyQ:'Digit4',KeyW:'Digit5',KeyE:'Digit6',KeyX:'Digit7',KeyZ:'Digit8',KeyC:'Digit9',Enter:'NumpadEnter',ShiftRight:'ShiftLeft',ControlRight:'ControlLeft'};
export const engineKey = (code,playerNumber) => playerNumber===2 ? playerTwoKeys[code] : code;
// Physical Genesis keys translate to the engine's logical controller bindings.
// Touch controls and gamepads keep sending those logical bindings directly.
export const genesisKeyboard={KeyZ:'KeyA',KeyX:'KeyS',KeyC:'KeyD',KeyA:'KeyQ',KeyS:'KeyW',KeyD:'KeyE',KeyQ:null,KeyW:null,KeyE:null};
export const keyboardCode=(system,code)=>system==='megadrive'&&Object.hasOwn(genesisKeyboard,code)?genesisKeyboard[code]:code;
export function keyboardLabel(system,code){
  const physical=system==='megadrive'?Object.keys(genesisKeyboard).find(key=>genesisKeyboard[key]===code)||code:code;
  return {ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',ControlRight:'R Ctrl',ShiftRight:'R Shift',Enter:'Enter'}[physical]||physical.replace('Key','');
}
