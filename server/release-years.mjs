import fs from 'node:fs';
import path from 'node:path';
import { crc32 } from 'node:zlib';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import { coverTitle } from './covers.mjs';
import { releaseYear } from '../src/library-view.js';

const systems = { megadrive:'Sega - Mega Drive - Genesis', snes:'Nintendo - Super Nintendo Entertainment System', nes:'Nintendo - Nintendo Entertainment System' };
const week = 7 * 86400000;
const titleKey = name => coverTitle(name.replace(/&/g, ' and '));
const variant = name => /\b(hack|beta|proto|prototype|sample|demo|aftermarket|homebrew)\b|\[(?:h|t|p|f|b)\d*[^\]]*\]/i.test(name);
const basename = name => name.split(/[\\/]/).pop();
export function parseYearDat(text) {
  const entries = [];
  for (const block of text.split(/^game\s*\(/m).slice(1)) {
    const name = block.match(/^\s*(?:comment|name)\s+"([^"\r\n]+)"/m)?.[1];
    const year = block.match(/^\s*releaseyear\s+"((?:19|20)\d{2})"/m)?.[1];
    const crc = block.match(/\bcrc\s+([a-f\d]{8})\b/i)?.[1]?.toUpperCase();
    if (name && year && crc) entries.push({name,year,crc});
  }
  return entries;
}
export function makeYearIndex(entries) {
  const titles = new Map(), hashes = new Map();
  for (const entry of entries) {
    const key = titleKey(entry.name);
    if (!titles.has(key)) titles.set(key, []);
    titles.get(key).push(entry);
    if (!hashes.has(entry.crc)) hashes.set(entry.crc, []);
    hashes.get(entry.crc).push(entry);
  }
  return {titles,hashes};
}
function regions(name) {
  const groups = [...name.matchAll(/\(([^)]+)\)/g)].map(match => match[1]);
  const result = new Set();
  for (const group of groups) {
    if (/\b(USA|United States)\b/.test(group) || /^[JUEW]+$/.test(group) && group.includes('U')) result.add('USA');
    if (/\bEurope\b/.test(group) || /^[JUEW]+$/.test(group) && group.includes('E')) result.add('Europe');
    if (/\bJapan\b/.test(group) || /^[JUEW]+$/.test(group) && group.includes('J')) result.add('Japan');
    if (/\bWorld\b/.test(group) || group === 'W') return [];
  }
  return [...result];
}
function agreed(entries, method) {
  return entries.length && new Set(entries.map(entry=>entry.year)).size === 1 ? {...entries[0],method} : null;
}
export function matchYearTitle(game, index) {
  const filename = basename(game.relative_path);
  if (variant(filename)) return null;
  const candidates = (index.titles.get(titleKey(filename)) || []).filter(entry=>!variant(entry.name));
  const wanted = regions(filename);
  const selected = wanted.length ? candidates.filter(entry => /\(World\)/.test(entry.name) || wanted.some(region => regions(entry.name).includes(region))) : candidates;
  return agreed(selected, 'console, title and region');
}
export function matchYearBytes(bytes, system, index) {
  const variants = [bytes];
  if (system === 'nes' && bytes.subarray(0,4).equals(Buffer.from([78,69,83,26]))) {
    const header = 16 + (bytes[6] & 4 ? 512 : 0);
    variants.push(bytes.subarray(header));
  }
  if (system === 'snes' && bytes.length % 1024 === 512) variants.push(bytes.subarray(512));
  for (const data of variants) {
    const crc = crc32(data).toString(16).toUpperCase().padStart(8, '0');
    const match = agreed(index.hashes.get(crc) || [], 'ROM CRC32');
    if (match) return match;
  }
  return null;
}
export class ReleaseYears {
  constructor(library) { this.library = library; this.indexes = new Map(); this.pending = null; this.retryAfter = 0; this.lastError = ''; }
  async index(system) {
    if (!systems[system]) return makeYearIndex([]);
    if (!this.indexes.has(system)) this.indexes.set(system, (async () => {
      const dir = path.join(this.library.dataDir, 'year-index'); fs.mkdirSync(dir, {recursive:true});
      const file = path.join(dir, `${system}.dat`);
      let text;
      if (fs.existsSync(file) && Date.now()-fs.statSync(file).mtimeMs < 30*86400000) text = fs.readFileSync(file, 'utf8');
      else {
        const url = `https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/releaseyear/${encodeURIComponent(systems[system])}.dat`;
        const response = await fetch(url, {signal:AbortSignal.timeout(20000),redirect:'error'});
        if (!response.ok) throw new Error(`Release-year download returned HTTP ${response.status}`);
        const parts=[]; let size=0;
        for await (const part of response.body) { size+=part.length; if(size>8*1024*1024) throw new Error('Release-year dataset is too large'); parts.push(part); }
        text=Buffer.concat(parts).toString('utf8');
        if (!parseYearDat(text).length) throw new Error('Release-year dataset has no entries');
        fs.writeFileSync(file,text);
      }
      return makeYearIndex(parseYearDat(text));
    })().catch(error=>{this.indexes.delete(system);throw error;}));
    return this.indexes.get(system);
  }
  enrich() {
    if (this.pending) return this.pending;
    if (Date.now()<this.retryAfter) return Promise.resolve({updated:0,error:this.lastError});
    this.pending = this.run().finally(()=>{this.pending=null;});
    return this.pending;
  }
  async run() {
    let updated=0,unmatched=0; const errors=[];
    const games=this.library.list().filter(game=>!game.missing && !releaseYear(game.metadata) && Date.now()-(game.metadata.yearCheckedAt||0)>week);
    const needed=[...new Set(games.map(game=>game.system))];
    const loaded=await Promise.allSettled(needed.map(system=>this.index(system)));
    for(const [position,system] of needed.entries()) {
      if(loaded[position].status==='rejected') { errors.push(loaded[position].reason.message); continue; }
      const index=loaded[position].value;
      for(const game of games.filter(game=>game.system===system)) {
        await yieldTurn();
        // A rescan or concurrent metadata lookup may have changed this record.
        let current; try {current=this.library.get(game.id);} catch {continue;}
        if(current.missing || releaseYear(current.metadata)) continue;
        let match=matchYearTitle(current,index);
        if(!match) {
          try { match=matchYearBytes(this.library.readRom(current).bytes,system,index); }
          catch { continue; }
        }
        if(match) {
          this.library.updateMetadata(current.id,{released:match.year,yearSource:'Libretro database',yearMatch:match.method,yearMatchedName:match.name,yearCheckedAt:Date.now()});
          updated++;
        } else {this.library.updateMetadata(current.id,{yearCheckedAt:Date.now()});unmatched++;}
      }
    }
    this.lastError=errors.join('; '); if(errors.length)this.retryAfter=Date.now()+60000;
    return {updated,unmatched,...errors.length?{error:this.lastError}:{}};
  }
}
