// Distinct physical key codes are understood by the two-player WASM adapter.
export const playerTwoKeys = {ArrowUp:'KeyI',ArrowDown:'KeyK',ArrowLeft:'KeyJ',ArrowRight:'KeyL',KeyA:'Digit1',KeyS:'Digit2',KeyD:'Digit3',KeyQ:'Digit4',KeyW:'Digit5',KeyE:'Digit6',KeyX:'Digit7',KeyZ:'Digit8',KeyC:'Digit9',Enter:'NumpadEnter',ShiftRight:'ShiftLeft',ControlRight:'ControlLeft'};
export const engineKey = (code,playerNumber) => playerNumber===2 ? playerTwoKeys[code] : code;
