import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const asArray = x => x == null ? [] : Array.isArray(x) ? x : [x];
const value = x => typeof x === 'string' ? x : x?.text || '';
const systemIds = { megadrive: 1, snes: 4, nes: 3 };
export const metadataConfigured = () => Boolean(process.env.SCREENSCRAPER_DEV_ID && process.env.SCREENSCRAPER_DEV_PASSWORD && process.env.SCREENSCRAPER_USER && process.env.SCREENSCRAPER_PASSWORD);

async function fetchImage(url, target) {
  for (let redirect = 0; redirect < 4; redirect++) {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !(u.hostname === 'screenscraper.fr' || u.hostname.endsWith('.screenscraper.fr'))) throw new Error('Unexpected artwork host.');
    const response = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
    if (response.status >= 300 && response.status < 400) { url = new URL(response.headers.get('location'), u).href; continue; }
    if (!response.ok || !/^image\/(png|jpeg|webp)/.test(response.headers.get('content-type') || '')) throw new Error('Artwork unavailable.');
    const chunks = []; let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > 10 * 1024 * 1024) throw new Error('Artwork exceeds 10 MB.');
      chunks.push(chunk);
    }
    fs.writeFileSync(target, Buffer.concat(chunks));
    return;
  }
  throw new Error('Too many artwork redirects.');
}

export async function scrapeGame(library, id) {
  if (!metadataConfigured()) throw new Error('Add ScreenScraper credentials to .env, then restart the server. Existing RetroBat metadata can be imported without these.');
  const game = library.get(id);
  const { bytes, name } = library.readRom(game);
  const url = new URL('https://api.screenscraper.fr/api2/jeuInfos.php');
  url.search = new URLSearchParams({ devid: process.env.SCREENSCRAPER_DEV_ID, devpassword: process.env.SCREENSCRAPER_DEV_PASSWORD,
    ssid: process.env.SCREENSCRAPER_USER, sspassword: process.env.SCREENSCRAPER_PASSWORD,
    softname: 'games-reducer', output: 'json', systemeid: String(systemIds[game.system]), romtype: 'rom',
    romnom: name, romtaille: String(bytes.length), md5: createHash('md5').update(bytes).digest('hex'), sha1: createHash('sha1').update(bytes).digest('hex') });
  let response;
  try { response = await fetch(url, { signal: AbortSignal.timeout(30000) }); }
  catch { throw new Error('ScreenScraper could not be reached. Try again later.'); }
  if (!response.ok) throw new Error(`ScreenScraper returned HTTP ${response.status}. Check your account, API access, or daily quota.`);
  let data;
  try { data = await response.json(); } catch { throw new Error('ScreenScraper did not return game data. Check your API credentials.'); }
  const result = data.response?.jeu;
  if (!result?.id) throw new Error('No exact ROM match found. Existing information was kept.');
  const names = asArray(result.noms);
  const english = asArray(result.synopsis).find(x => x.langue === 'en');
  const metadata = { source: 'ScreenScraper', providerId: String(result.id), match: 'ROM checksum',
    name: value(names.find(x => ['us', 'wor'].includes(x.region)) || names[0]),
    description: value(english || asArray(result.synopsis)[0]),
    genre: value(asArray(result.genres).find(x => x.langue === 'en') || asArray(result.genres)[0]),
    players: value(result.joueurs), publisher: value(result.editeur), released: value(asArray(result.dates)[0]) };
  const mediaFolder = path.join(library.dataDir, 'media');
  fs.mkdirSync(mediaFolder, { recursive: true });
  const warnings = [];
  for (const [field, type] of [['cover', 'box-2D'], ['screenshot', 'ss']]) {
    const choices = asArray(result.medias).filter(x => x.type === type);
    const choice = choices.find(x => ['us', 'wor'].includes(x.region)) || choices[0];
    if (!choice?.url) continue;
    const target = path.join(mediaFolder, `${id}-${field}.img`);
    try { await fetchImage(choice.url, target); metadata[field] = target; }
    catch { warnings.push(`${field} could not be downloaded`); }
  }
  library.updateMetadata(id, metadata);
  return { game: library.get(id), warnings };
}
