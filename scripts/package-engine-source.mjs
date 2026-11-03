import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {zipSync,strToU8} from 'fflate';

const root=path.resolve('vendor/jgenesis');
const tracked=execFileSync('git',['-c',`safe.directory=${root.replaceAll('\\','/')}`,'-C',root,'ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const files={};
for(const file of tracked)if(fs.statSync(path.join(root,file)).isFile())files[`jgenesis/${file}`]=fs.readFileSync(path.join(root,file));
for(const file of ['prepare-two-player.mjs','prepare-cartridge-saves.mjs','prepare-engine.mjs','build-engine.sh','install-built-engine.mjs','package-engine-source.mjs','build-worker-engine.sh','package-worker-engine.mjs'])files[`scripts/${file}`]=fs.readFileSync(`scripts/${file}`);
for(const file of ['bridge.js','save-store.js','player-two-build.json','play.html','js/idb.js','pkg/snippets/jgenesis-web-84ddb6bbedfb3632/js/idb.js'])files[`public/engine/${file}`]=fs.readFileSync(`public/engine/${file}`);
for(const file of ['Cargo.toml','src/lib.rs']){const content=fs.readFileSync(`engine-worker/${file}`);files[`jgenesis/frontend/reducer-worker/${file}`]=content;files[`engine-worker/${file}`]=content;}
for(const file of ['save-state-codec.js','wasm-worker.js','wasm-host.js','nes-audio.js','nes-audio-worklet.js','nes-frame-timer.js','player-input.js','assets.js'])files[`src/${file}`]=fs.readFileSync(`src/${file}`);
files['public/engine/worker/build.json']=fs.readFileSync('public/engine/worker/build.json');
files['BUILD.txt']=strToU8(`Games Reducer corresponding source\n\nThe jgenesis tree includes the applied player-two, atomics configuration, and SNES per-frame SRAM patches. The manifest records the upstream revision, toolchain and exact WASM hash.\n\nFor a clean checkout, apply scripts/prepare-two-player.mjs and scripts/prepare-cartridge-saves.mjs with Node. scripts/build-engine.sh builds with the specified Rust nightly and wasm-bindgen 0.2.114; adjust its local paths to your checkout. scripts/install-built-engine.mjs installs the result, and scripts/prepare-engine.mjs applies the JavaScript runtime bridge and shared save adapter. The worker frontend is jgenesis/frontend/reducer-worker (engine-worker in the app repository). Run scripts/build-worker-engine.sh and then node scripts/package-worker-engine.mjs to rebuild it; it uses the same Rust/wasm-bindgen versions but does not require shared memory or the winit renderer. The source adapter, JS worker/audio bridge, native frame pacing, and exact artifact/source hashes are included. For an offline rebuild, retain Cargo.lock and vendor the crates with cargo vendor. The full application and scripts are at https://github.com/jelizarovas/games-reducer.\n`);
fs.writeFileSync('public/engine/corresponding-source.zip',zipSync(files,{level:6}));
console.log(`Packaged ${Object.keys(files).length} corresponding source files.`);
