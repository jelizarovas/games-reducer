import fs from 'node:fs';
const file = 'public/engine/index.html';
let html = fs.readFileSync(file, 'utf8');
html = html.replace('</head>', `<style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#050707}
#header-text,#footer,#jgenesis-config,#jgenesis-rom-title,.jgenesis-controls,#loading-text{display:none!important}
#jgenesis,#jgenesis-wasm-and-controls,#jgenesis-wasm{width:100%;height:100%;margin:0;display:block}
canvas{width:100%!important;height:100%!important;object-fit:contain;margin:0!important;outline:0;image-rendering:pixelated}
</style><script src="./bridge.js"></script></head>`);
html = html.replace('let channel = new EmulatorChannel();', 'let channel = new EmulatorChannel(); window.reducerChannel = channel; config.set_prescale_factor(1);');
fs.writeFileSync('public/engine/play.html', html);
if (fs.existsSync('vendor/jgenesis/LICENSE')) fs.copyFileSync('vendor/jgenesis/LICENSE', 'public/engine/LICENSE');
const moduleFile = 'public/engine/pkg/jgenesis_web.js';
let module = fs.readFileSync(moduleFile, 'utf8');
for (const [native, wrapper] of [['requestAnimationFrame', 'reducerRuntimeRaf'], ['cancelAnimationFrame', 'reducerRuntimeCancelRaf'], ['setTimeout', 'reducerRuntimeTimeout'], ['clearTimeout', 'reducerRuntimeClearTimeout']]) {
  module = module.replaceAll(`arg0.${native}(`, `(arg0.${wrapper} || arg0.${native}.bind(arg0))(`);
}
fs.writeFileSync(moduleFile, module);
// Both Performance.now imports use the same continuous emulator clock.
module = module.replaceAll('const ret = arg0.now();', 'const ret = globalThis.reducerRuntimeNow ? globalThis.reducerRuntimeNow(arg0) : arg0.now();');
// Use winit's timer fallback so all emulation waits pass through the pause gate.
module = module.replaceAll('const ret = arg0.scheduler;', 'const ret = globalThis.reducerRuntimeTimeout ? undefined : arg0.scheduler;');
if (!module.includes('globalThis.reducerRenderedFrames')) module = module.replaceAll('            setSaveUiEnabled(arg0 !== 0);', '            globalThis.reducerRenderedFrames = (globalThis.reducerRenderedFrames || 0) + 1; setSaveUiEnabled(arg0 !== 0);');
fs.writeFileSync(moduleFile, module);
const audioFile = 'public/engine/js/audio-processor.js';
let audio = fs.readFileSync(audioFile, 'utf8');
if (!audio.includes("event.data.type === 'speed'")) {
  audio = audio.replace('this.processor = new AudioProcessor(audioQueue);', `this.processor = new AudioProcessor(audioQueue);
        this.speed = 1;
        this.port.onmessage = event => { if (event.data.type === 'speed') this.speed = event.data.speed === 3 ? 3 : 1; };`);
  audio = audio.replace('this.processor.process(outputs[0][0], outputs[0][1]);', `for (let i = 0; i < this.speed; i++) this.processor.process(outputs[0][0], outputs[0][1]);
        if (this.speed > 1) for (const channel of outputs[0]) channel.fill(0);`);
  fs.writeFileSync(audioFile, audio);
}
// Apply independently so previously prepared bundles also receive mute support.
audio = fs.readFileSync(audioFile, 'utf8');
if (!audio.includes("event.data.type === 'mute'")) {
  audio = audio.replace('this.speed = 1;', 'this.speed = 1; this.muted = false;');
  audio = audio.replace("this.port.onmessage = event => {", "this.port.onmessage = event => { if (event.data.type === 'mute') this.muted = Boolean(event.data.muted);");
  audio = audio.replace('if (this.speed > 1) for', 'if (this.muted || this.speed > 1) for');
  fs.writeFileSync(audioFile, audio);
}

// Share cartridge storage with atomic browser backups.
for (const [file,from] of [['public/engine/js/idb.js','../save-store.js'],['public/engine/pkg/snippets/jgenesis-web-84ddb6bbedfb3632/js/idb.js','../../../../save-store.js']]) {
  const source=fs.readFileSync(file,'utf8');
  fs.writeFileSync(file,"export {loadSaveFiles,writeSaveFile} from '"+from+"';\n\n"+source.slice(source.indexOf('export function loadBios')));
}
