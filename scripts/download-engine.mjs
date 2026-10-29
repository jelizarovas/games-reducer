import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const base = 'https://jsgroth.dev/jgenesis-webgl/';
const dest = 'public/engine';
try {
  await access(`${dest}/player-two-build.json`);
  if(!process.argv.includes('--upstream-only'))throw new Error('This engine includes local player-two support. Use the documented engine rebuild, or pass --upstream-only to explicitly replace it with the single-player upstream bundle.');
} catch(error) {if(error.code!=='ENOENT')throw error;}
const pending = ['index.html', 'js/ui.js', 'js/idb.js', 'js/audio-processor.js', 'js/polyfill.js', 'pkg/jgenesis_web.js', 'pkg/jgenesis_web_bg.wasm'];
const seen = new Set();
const manifest = [];
while (pending.length) {
  const name = pending.shift();
  if (seen.has(name)) continue;
  seen.add(name);
  const response = await fetch(new URL(name, base));
  if (!response.ok) { if (name === 'js/polyfill.js') continue; throw new Error(`${name}: ${response.status}`); }
  const bytes = Buffer.from(await response.arrayBuffer());
  const target = path.join(dest, name);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  manifest.push({ file: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  if (name.endsWith('.js')) {
    for (const match of bytes.toString().matchAll(/(?:from\s*|import\s*)['"](\.\.?\/[^'"]+)['"]/g)) {
      const relative = path.posix.normalize(path.posix.join(path.posix.dirname(name), match[1]));
      if (!relative.startsWith('../')) pending.push(relative);
    }
  }
  console.log(`${name}: ${bytes.length} bytes`);
}
await writeFile(`${dest}/manifest.json`, JSON.stringify({ source: base, downloadedAt: new Date().toISOString(), files: manifest }, null, 2));
