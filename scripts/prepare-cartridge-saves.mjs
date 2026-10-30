import fs from 'node:fs';
const file='vendor/jgenesis/backend/snes-core/src/api.rs';
let source=fs.readFileSync(file,'utf8');
const old='&& self.frame_count.is_multiple_of(30)';
if(!source.includes('// Games Reducer: browser backups must see SRAM at every pause boundary.')){
  if(!source.includes(old))throw new Error('Unexpected SNES save adapter');
  source=source.replace(old,'// Games Reducer: browser backups must see SRAM at every pause boundary.\n                && (cfg!(target_arch = "wasm32") || self.frame_count.is_multiple_of(30))');
  fs.writeFileSync(file,source);
}
