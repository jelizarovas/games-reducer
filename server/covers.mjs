import fs from 'node:fs';
import path from 'node:path';
const systems = { megadrive: 'Sega - Mega Drive - Genesis', snes: 'Nintendo - Super Nintendo Entertainment System', nes: 'Nintendo - Nintendo Entertainment System' };
const baseUrl = system => `https://thumbnails.libretro.com/${encodeURIComponent(systems[system])}/Named_Boxarts/`;
export function coverTitle(name) {
  let title = name.replace(/\.(zip|png|nes|smc|sfc|bin|md|gen)$/i, '').replace(/\s*[([][^)\]]*[)\]]/g, '').trim();
  title = title.replace(/^(.*), The$/i, 'The $1');
  return title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
export function matchCover(game, names) {
  const filename = path.basename(game.relative_path);
  if (/\b(hack|beta|proto|prototype|sample|demo)\b/i.test(filename)) return null;
  const key = coverTitle(filename);
  const matches = names.filter(name => coverTitle(name) === key && !/\b(hack|beta|proto|prototype|sample|demo)\b/i.test(name));
  const region = /\((?:U|USA)\)/i.test(filename) ? 'USA' : /\((?:J|Japan)\)/i.test(filename) ? 'Japan' : /\((?:E|Europe)\)/i.test(filename) ? 'Europe' : 'World';
  return matches.find(name => name.includes(`(${region}`)) || matches.find(name => /\((USA|World)/.test(name)) || matches[0] || null;
}
async function download(url, limit) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Cover service returned ${response.status}`);
  const parts = []; let size = 0;
  for await (const part of response.body) { size += part.length; if (size > limit) throw new Error('Cover response too large'); parts.push(part); }
  return Buffer.concat(parts);
}
export class Covers {
  constructor(library) { this.library = library; this.indexes = new Map(); this.pending = new Map(); this.cooldown = new Map(); this.active = 0; this.waiters = []; }
  async limited(work) {
    if (this.active >= 3) await new Promise(resolve => this.waiters.push(resolve));
    else this.active++;
    try { return await work(); }
    finally { const next = this.waiters.shift(); if (next) next(); else this.active--; }
  }
  async index(system) {
    if (!systems[system]) return [];
    if (!this.indexes.has(system)) this.indexes.set(system, (async () => {
      const dir = path.join(this.library.dataDir, 'cover-index'); fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${system}.json`);
      if (fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < 7 * 86400000) return JSON.parse(fs.readFileSync(file, 'utf8'));
      const html = (await download(baseUrl(system), 10 * 1024 * 1024)).toString();
      const names = [...html.matchAll(/href="([^"/]+\.png)"/g)].map(match => decodeURIComponent(match[1])).filter(name => !/[\\/]/.test(name));
      if (!names.length) throw new Error('Cover index is empty');
      fs.writeFileSync(file, JSON.stringify(names)); return names;
    })().catch(error => { this.indexes.delete(system); throw error; }));
    return this.indexes.get(system);
  }
  async get(id) {
    if (this.pending.has(id)) return this.pending.get(id);
    const game = this.library.get(id);
    if (game.metadata.cover && fs.existsSync(game.metadata.cover)) return game.metadata.cover;
    if (game.missing || Date.now() - (game.metadata.coverCheckedAt || 0) < 7 * 86400000 || (this.cooldown.get(game.system) || 0) > Date.now()) return null;
    const work = this.limited(async () => {
      try {
        const name = matchCover(game, await this.index(game.system));
        if (!name) { this.library.updateMetadata(id, { coverCheckedAt: Date.now() }); return null; }
        const bytes = await download(`${baseUrl(game.system)}${encodeURIComponent(name)}`, 10 * 1024 * 1024);
        if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('Invalid cover image');
        const folder = path.join(this.library.dataDir, 'media'); fs.mkdirSync(folder, { recursive: true });
        const file = path.join(folder, `${id}-cover.png`); fs.writeFileSync(file, bytes);
        this.library.updateMetadata(id, { cover: file, coverSource: 'Libretro thumbnails', coverMatch: name, coverCheckedAt: Date.now() });
        return file;
      } catch (error) { this.cooldown.set(game.system, Date.now() + 60000); return null; }
    }).finally(() => this.pending.delete(id));
    this.pending.set(id, work); return work;
  }
}
