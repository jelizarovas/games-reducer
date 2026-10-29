import fs from 'node:fs';
const file='vendor/jgenesis/frontend/jgenesis-web/src/config.rs';
let source=fs.readFileSync(file,'utf8');
if(!source.includes('// Games Reducer: independent player-two key channel.')) {
  const target='pub fn handle_input(&self, key: KeyCode, pressed: bool, inputs: &mut $inputs) {';
  if(!source.includes(target))throw new Error('Unexpected emulator input adapter');
  source=source.replace(target,`${target}
                // Games Reducer: independent player-two key channel.
                let (key, player) = match key {
                    KeyCode::KeyI => (KeyCode::ArrowUp, Player::Two),
                    KeyCode::KeyK => (KeyCode::ArrowDown, Player::Two),
                    KeyCode::KeyJ => (KeyCode::ArrowLeft, Player::Two),
                    KeyCode::KeyL => (KeyCode::ArrowRight, Player::Two),
                    KeyCode::Digit1 => (KeyCode::KeyA, Player::Two),
                    KeyCode::Digit2 => (KeyCode::KeyS, Player::Two),
                    KeyCode::Digit3 => (KeyCode::KeyD, Player::Two),
                    KeyCode::Digit4 => (KeyCode::KeyQ, Player::Two),
                    KeyCode::Digit5 => (KeyCode::KeyW, Player::Two),
                    KeyCode::Digit6 => (KeyCode::KeyE, Player::Two),
                    KeyCode::Digit7 => (KeyCode::KeyX, Player::Two),
                    KeyCode::Digit8 => (KeyCode::KeyZ, Player::Two),
                    KeyCode::Digit9 => (KeyCode::KeyC, Player::Two),
                    KeyCode::NumpadEnter => (KeyCode::Enter, Player::Two),
                    KeyCode::ShiftLeft => (KeyCode::ShiftRight, Player::Two),
                    _ => (key, Player::One),
                };`);
  source=source.replace('inputs.set_field($button_t::$button, Player::One, pressed);','inputs.set_field($button_t::$button, player, pressed);');
  fs.writeFileSync(file,source);
}
const buildConfig='vendor/jgenesis/frontend/jgenesis-web/.cargo/config.toml';
let config=fs.readFileSync(buildConfig,'utf8');
if(!config.includes('--export=__heap_base')) {
  config=config.replace('"-Clink-arg=--import-memory",','"-Clink-arg=--import-memory",\n    "-Clink-arg=--export=__heap_base",\n    "-Clink-arg=--export=__data_end",');
  fs.writeFileSync(buildConfig,config);
}
