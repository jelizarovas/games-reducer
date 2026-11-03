import fs from 'node:fs';import {createHash} from 'node:crypto';
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sources=['engine-worker/Cargo.toml','engine-worker/src/lib.rs','vendor/jgenesis/Cargo.lock','vendor/jgenesis/backend/snes-core/src/api.rs'];
const manifest={sourceRevision:'c9ff3184cf1515648576a6641c05a11ef4089fb5',adapter:'engine-worker',rust:'1.101.0-nightly (92ffebece 2026-10-28)',wasmBindgen:'0.2.114',builtAt:new Date().toISOString(),wasmSHA256:hash('public/engine/worker/reducer_worker_bg.wasm'),sourceSHA256:Object.fromEntries(sources.map(file=>[file,hash(file)])),build:'bash scripts/build-worker-engine.sh && node scripts/package-worker-engine.mjs'};
fs.writeFileSync('public/engine/worker/build.json',JSON.stringify(manifest,null,2)+'\n');console.log('Worker engine',manifest.wasmSHA256);
