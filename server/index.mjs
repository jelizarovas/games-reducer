import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Library, SYSTEMS, inside } from './library.mjs';
import { metadataConfigured, scrapeGame } from './metadata.mjs';
import { Covers } from './covers.mjs';
import { ReleaseYears } from './release-years.mjs';
import { Launchbox } from './launchbox.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(project, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const library = new Library({ dataDir: process.env.DATA_DIR || path.join(project, 'data'), root: process.env.ROM_ROOT || 'C:\\RetroBat\\roms', trash: process.env.TRASH_ROOT || 'C:\\files\\trash' });
const app = express();
const covers = new Covers(library);
const releaseYears = new ReleaseYears(library);
const launchbox = new Launchbox(library);
const port = Number(process.env.API_PORT || 4311);
const allowedPorts = new Set([String(port), String(process.env.WEB_PORT || 3001)]);
app.use((req, res, next) => {
  const host = (req.headers.host || '').split(':');
  if (!['localhost', '127.0.0.1'].includes(host[0]) || !allowedPorts.has(host[1])) return res.status(403).json({ error: 'Local access only.' });
  if (req.headers.origin) {
    try {
      const origin = new URL(req.headers.origin);
      if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname) || !allowedPorts.has(origin.port)) throw new Error();
    } catch { return res.status(403).json({ error: 'Origin not allowed.' }); }
  }
  res.set('Cross-Origin-Opener-Policy', 'same-origin');
  res.set('Cross-Origin-Embedder-Policy', 'require-corp');
  res.set('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET' && req.method !== 'HEAD' && !req.is('application/json')) return res.status(415).json({ error: 'JSON required.' });
  next();
});
app.use(express.json({ limit: '256kb' }));
let metadataBusy = false;
let player = null;
const liveGame = () => player && Date.now() - player.lastSeen < 12000;
const requireIdle = (req, res, next) => liveGame() ? res.status(409).json({ error: 'Stop the running game before changing the library.' }) : next();
const publicGame = game => ({ ...game, metadata: { ...game.metadata,
  cover: game.metadata.cover ? `/api/games/${game.id}/media/cover` : null,
  screenshot: game.metadata.screenshot ? `/api/games/${game.id}/media/screenshot` : null } });
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/state', (req, res) => res.json({ root: library.root, systems: SYSTEMS, stats: library.stats(),
  currentId: library.setting('currentId'), filter: library.setting('filter') || 'megadrive', metadataConfigured: metadataConfigured(),
  trash: library.trash, playerActive: Boolean(liveGame()) }));
app.get('/api/games', async (req, res) => {
  await releaseYears.enrich();
  // Cached fallback is fast; a first-time bulk download runs in the background.
  if(fs.existsSync(path.join(library.dataDir,'launchbox','index-v2.json'))) await launchbox.enrich();
  else void launchbox.enrich();
  res.json(library.list(req.query).map(publicGame));
});
app.post('/api/scan', requireIdle, (req, res) => res.json(req.body.root ? library.setRoot(req.body.root) : library.scan()));
app.post('/api/current', (req, res) => {
  if (req.body.id) { library.get(req.body.id); library.setting('currentId', req.body.id); }
  if (req.body.filter && SYSTEMS[req.body.filter]) library.setting('filter', req.body.filter);
  res.json({ ok: true });
});
app.post('/api/games/:id/decision', requireIdle, (req, res) => res.json(publicGame(library.decision(req.params.id, req.body.status))));
// Undo only updates review metadata; it never changes a ROM or the running player.
app.post('/api/undo', (req, res) => { const game = library.undo(); res.json(game ? publicGame(game) : null); });
app.post('/api/player/start', (req, res) => {
  if (liveGame()) return res.status(409).json({ error: 'A game is already running in another tab.' });
  const game = library.get(req.body.id);
  library.safeFile(game);
  player = { id: game.id, lastSeen: Date.now(), lastTick: Date.now() };
  library.setting('currentId', game.id);
  res.json({ ok: true });
});
app.post('/api/player/tick', (req, res) => {
  if (player && player.id === req.body.id) {
    const now = Date.now();
    if (req.body.playing) {
      const seconds = Math.min(10, Math.floor((now - player.lastTick) / 1000));
      library.db.prepare('UPDATE games SET seconds=seconds+? WHERE id=?').run(seconds, player.id);
    }
    player.lastSeen = now; player.lastTick = now;
  }
  res.json({ ok: true });
});
app.post('/api/player/stop', (req, res) => { if (player?.id === req.body.id) player = null; res.json({ ok: true }); });
app.get('/api/games/:id/rom', (req, res) => {
  const game = library.get(req.params.id);
  const rom = library.readRom(game);
  res.set('X-Rom-Name', encodeURIComponent(rom.name));
  res.type('application/octet-stream').send(rom.bytes);
});
app.get('/api/games/:id/media/:kind', (req, res) => {
  if (!['cover', 'screenshot'].includes(req.params.kind)) return res.sendStatus(404);
  const file = library.get(req.params.id).metadata[req.params.kind];
  if (!file || !fs.existsSync(file)) return res.sendStatus(404);
  const real = fs.realpathSync(file);
  if (!inside(library.root, real) && !inside(path.join(library.dataDir, 'media'), real)) return res.sendStatus(403);
  if (fs.statSync(real).size > 10 * 1024 * 1024) return res.sendStatus(413);
  const bytes = fs.readFileSync(real);
  let type;
  if (bytes[0] === 137 && bytes.subarray(1, 4).toString() === 'PNG') type = 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216) type = 'image/jpeg';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') type = 'image/webp';
  if (!type) return res.sendStatus(415);
  res.type(type).send(bytes);
});
app.get('/api/games/:id/thumbnail', async (req, res) => {
  const file = await covers.get(req.params.id) || await launchbox.cover(req.params.id);
  if (file) return res.redirect(`/api/games/${req.params.id}/media/cover`);
  res.set('Cache-Control', 'no-cache');
  res.type('image/svg+xml').send('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="80"><rect width="64" height="80" rx="5" fill="#263326"/><text x="32" y="45" text-anchor="middle" font-family="sans-serif" font-size="9" fill="#a4b998">NO COVER</text></svg>');
});
app.post('/api/games/:id/metadata', async (req, res) => {
  if (metadataBusy) return res.status(409).json({ error: 'Another metadata lookup is running.' });
  metadataBusy = true;
  try { const result = await scrapeGame(library, req.params.id); res.json({ ...result, game: publicGame(result.game) }); }
  finally { metadataBusy = false; }
});
app.post('/api/cleanup/preview', requireIdle, (req, res) => {
  const preview = library.cleanupPreview(); res.json({ ...preview, games: preview.games.map(publicGame) });
});
app.post('/api/cleanup/execute', requireIdle, (req, res) => res.json({ results: library.cleanup(req.body.token) }));
app.post('/api/missing/clear', requireIdle, (req, res) => res.json({ count: library.clearMissing() }));
app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
if (process.argv.includes('--production')) {
  app.use(express.static(path.join(project, 'dist')));
  app.get('/{*path}', (req, res) => res.sendFile(path.join(project, 'dist', 'index.html')));
}
app.use((error, req, res, next) => {
  // Do not expose provider request URLs or environment credentials.
  res.status(400).json({ error: error.message || 'Request failed.' });
});
const server = app.listen(port, '127.0.0.1', () => console.log(`Games Reducer API: http://127.0.0.1:${port}`));
server.on('error', error => { console.error(error.message); process.exit(1); });
const shutdown = () => server.close(() => { library.close(); process.exit(0); });
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
