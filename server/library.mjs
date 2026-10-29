import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import { unzipSync } from 'fflate';

export const SYSTEMS = {
  megadrive: { name: 'Sega Genesis', extensions: ['.gen', '.md', '.bin', '.smd'], engine: 'jgenesis' },
  snes: { name: 'Super Nintendo', extensions: ['.smc', '.sfc'], engine: 'jgenesis' },
  nes: { name: 'Nintendo', extensions: ['.nes'], engine: 'jsnes' },
};
const statuses = new Set(['unreviewed', 'keep', 'discard', 'skip']);
export const inside = (root, target) => {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
};
export function cleanTitle(filename) {
  return path.basename(filename, path.extname(filename)).replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const plain = value => String(value ?? '').replace(/<[^>]*>/g, '').slice(0, 12000);

export class Library {
  constructor({ dataDir, root = 'C:\\RetroBat\\roms', trash = 'C:\\files\\trash', move = fs.renameSync }) {
    this.dataDir = path.resolve(dataDir);
    this.trash = path.resolve(trash);
    this.move = move;
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.db = new DatabaseSync(path.join(this.dataDir, 'library.sqlite'));
    this.db.exec('PRAGMA busy_timeout=5000;');
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS games(
        id TEXT PRIMARY KEY, root TEXT NOT NULL, relative_path TEXT NOT NULL, system TEXT NOT NULL,
        title TEXT NOT NULL, size INTEGER NOT NULL, mtime REAL NOT NULL, status TEXT NOT NULL DEFAULT 'unreviewed',
        missing INTEGER NOT NULL DEFAULT 0, seconds INTEGER NOT NULL DEFAULT 0,
        metadata TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(root, relative_path));
      CREATE TABLE IF NOT EXISTS decisions(id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        before_status TEXT NOT NULL, after_status TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS cleanup_log(id TEXT PRIMARY KEY, game_id TEXT NOT NULL,
        source TEXT NOT NULL, destination TEXT NOT NULL, sha256 TEXT NOT NULL,
        state TEXT NOT NULL, error TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    `);
    this.root = this.setting('root') || path.resolve(root);
    this.previews = new Map();
    this.recoverCleanup();
  }
  setting(key, value) {
    if (value !== undefined) this.db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run(key, String(value));
    return this.db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value;
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  setRoot(root) {
    if (typeof root !== 'string' || !path.isAbsolute(root)) throw new Error('Choose an absolute ROM folder path.');
    const resolved = fs.realpathSync(root);
    if (!fs.statSync(resolved).isDirectory() || resolved === path.parse(resolved).root ||
        resolved.toLowerCase() === this.trash.toLowerCase() || inside(resolved, this.trash) || inside(this.trash, resolved)) {
      throw new Error('Choose a ROM library folder that does not include the trash folder.');
    }
    this.root = resolved;
    this.setting('root', this.root);
    return this.scan();
  }
  safeFile(game) {
    const root = fs.realpathSync(game.root);
    const source = path.resolve(root, game.relative_path);
    if (!inside(root, source)) throw new Error('ROM path is outside the library.');
    let part = root;
    for (const name of path.relative(root, source).split(path.sep)) {
      part = path.join(part, name);
      if (fs.lstatSync(part).isSymbolicLink()) throw new Error('Linked ROM paths are not supported.');
    }
    const real = fs.realpathSync(source);
    if (!inside(root, real) || !fs.statSync(real).isFile()) throw new Error('Invalid ROM file.');
    return real;
  }
  scan() {
    if (!fs.existsSync(this.root)) throw new Error(`ROM folder not found: ${this.root}`);
    const found = [];
    const warnings = [];
    for (const [system, config] of Object.entries(SYSTEMS)) {
      const directory = path.join(this.root, system);
      if (!fs.existsSync(directory) || fs.lstatSync(directory).isSymbolicLink()) continue;
      const metadata = this.readGamelist(directory, warnings);
      const walk = folder => {
        for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
          if (entry.isSymbolicLink() || ['images', 'videos', 'media', 'manuals', '.git'].includes(entry.name.toLowerCase())) continue;
          const filename = path.join(folder, entry.name);
          if (entry.isDirectory()) { walk(filename); continue; }
          const ext = path.extname(entry.name).toLowerCase();
          if (!config.extensions.includes(ext) && ext !== '.zip') continue;
          const stat = fs.statSync(filename);
          if (stat.size > 64 * 1024 * 1024) { warnings.push(`Too large for cartridge playback: ${entry.name}`); continue; }
          if (ext === '.zip') {
            try { this.readRom({ root: this.root, relative_path: path.relative(this.root, filename), system }); }
            catch { warnings.push(`ZIP must contain exactly one supported ROM: ${entry.name}`); continue; }
          }
          const relative = path.relative(this.root, filename);
          const id = hash(`${this.root.toLowerCase()}|${relative.toLowerCase()}`).slice(0, 24);
          found.push({ id, relative, system, size: stat.size, mtime: stat.mtimeMs,
            metadata: metadata.get(path.resolve(filename).toLowerCase()) || {} });
        }
      };
      walk(directory);
    }
    this.transaction(() => {
      this.db.prepare('UPDATE games SET missing=1 WHERE root=?').run(this.root);
      const insert = this.db.prepare(`INSERT INTO games(id,root,relative_path,system,title,size,mtime,metadata)
        VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
        missing=0, size=excluded.size, mtime=excluded.mtime,
        status=CASE WHEN games.size != excluded.size OR games.mtime != excluded.mtime THEN 'unreviewed' ELSE games.status END,
        metadata=CASE WHEN excluded.metadata != '{}' THEN excluded.metadata ELSE games.metadata END,
        title=CASE WHEN excluded.metadata != '{}' THEN excluded.title ELSE games.title END`);
      for (const game of found) {
        insert.run(game.id, this.root, game.relative, game.system,
          game.metadata.name || cleanTitle(game.relative), game.size, game.mtime, JSON.stringify(game.metadata));
      }
    });
    this.previews.clear();
    return { count: found.length, warnings };
  }
  readGamelist(directory, warnings) {
    const result = new Map();
    const file = path.join(directory, 'gamelist.xml');
    if (!fs.existsSync(file)) return result;
    try {
      if (fs.statSync(file).size > 30 * 1024 * 1024) throw new Error('Gamelist exceeds 30 MB');
      const parsed = new XMLParser({ ignoreAttributes: false, processEntities: false }).parse(fs.readFileSync(file, 'utf8'));
      const entries = (parsed.gameList || parsed.gamelist)?.game || [];
      for (const entry of Array.isArray(entries) ? entries : [entries]) {
        if (typeof entry.path !== 'string') continue;
        const rom = path.resolve(directory, entry.path);
        if (!inside(this.root, rom)) continue;
        const item = { name: plain(entry.name), description: plain(entry.desc), genre: plain(entry.genre),
          players: plain(entry.players), released: plain(entry.releasedate), publisher: plain(entry.publisher), source: 'RetroBat' };
        for (const [key, value] of Object.entries({ cover: entry.thumbnail || entry.image, screenshot: entry.screenshot })) {
          if (typeof value === 'string') {
            const media = path.resolve(directory, value);
            if (inside(this.root, media) && fs.existsSync(media) && inside(this.root, fs.realpathSync(media))) item[key] = media;
          }
        }
        result.set(rom.toLowerCase(), item);
      }
    } catch (error) { warnings.push(`${path.basename(directory)}/gamelist.xml: ${error.message}`); }
    return result;
  }
  get(id) {
    const game = this.db.prepare('SELECT * FROM games WHERE id=? AND root=?').get(id, this.root);
    if (!game) throw new Error('Game not found.');
    return { ...game, metadata: JSON.parse(game.metadata) };
  }
  list({ system = '', status = '', search = '' } = {}) {
    const rows = this.db.prepare(`SELECT * FROM games WHERE root=? AND (?='' OR system=?)
      AND (?='' OR status=?) AND title LIKE ? ORDER BY title COLLATE NOCASE,relative_path`).all(this.root, system, system, status, status, `%${search}%`);
    return rows.map(game => ({ ...game, metadata: JSON.parse(game.metadata) }));
  }
  stats() {
    return this.db.prepare('SELECT status,system,missing,COUNT(*) AS count,SUM(size) AS bytes FROM games WHERE root=? GROUP BY status,system,missing').all(this.root);
  }
  decision(id, status) {
    if (!statuses.has(status)) throw new Error('Invalid review status.');
    const game = this.get(id);
    this.transaction(() => {
      this.db.prepare('INSERT INTO decisions(game_id,before_status,after_status) VALUES (?,?,?)').run(id, game.status, status);
      this.db.prepare('UPDATE games SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status, id);
    });
    this.previews.clear();
    return this.get(id);
  }
  undo() {
    const last = this.db.prepare(`SELECT decisions.* FROM decisions JOIN games ON games.id=game_id WHERE games.root=? ORDER BY decisions.id DESC LIMIT 1`).get(this.root);
    if (!last) return null;
    this.transaction(() => {
      this.db.prepare('UPDATE games SET status=? WHERE id=?').run(last.before_status, last.game_id);
      this.db.prepare('DELETE FROM decisions WHERE id=?').run(last.id);
    });
    this.previews.clear();
    return this.get(last.game_id);
  }
  readRom(game) {
    const file = this.safeFile(game);
    if (fs.statSync(file).size > 64 * 1024 * 1024) throw new Error('ROM exceeds the 64 MB cartridge limit.');
    const bytes = fs.readFileSync(file);
    if (path.extname(file).toLowerCase() !== '.zip') return { bytes, name: path.basename(file) };
    let expanded = 0;
    const files = unzipSync(bytes, { filter: entry => {
      if (!SYSTEMS[game.system].extensions.includes(path.extname(entry.name).toLowerCase())) return false;
      expanded += entry.originalSize;
      if (expanded > 64 * 1024 * 1024) throw new Error('ZIP expands beyond 64 MB.');
      return true;
    } });
    const entries = Object.entries(files);
    if (entries.length !== 1) throw new Error('ZIP must contain exactly one game.');
    return { name: path.basename(entries[0][0]), bytes: Buffer.from(entries[0][1]) };
  }
  updateMetadata(id, metadata) {
    const game = this.get(id);
    this.db.prepare('UPDATE games SET metadata=?,title=? WHERE id=?').run(JSON.stringify({ ...game.metadata, ...metadata }), metadata.name || game.title, id);
  }
  cleanupPreview() {
    const games = this.list({ status: 'discard' });
    const token = randomUUID();
    this.previews.set(token, { ids: games.map(g => g.id), expires: Date.now() + 10 * 60_000 });
    return { token, games, bytes: games.reduce((sum, g) => sum + g.size, 0), trash: this.trash };
  }
  cleanup(token) {
    const preview = this.previews.get(token);
    if (!preview || preview.expires < Date.now()) throw new Error('Review the cleanup list again before continuing.');
    this.previews.delete(token);
    const results = [];
    for (const id of preview.ids) {
      let logId;
      try {
        const game = this.get(id);
        if (game.status !== 'discard') throw new Error('Game is no longer marked for removal.');
        const source = this.safeFile(game);
        const stat = fs.statSync(source);
        if (stat.size !== game.size || stat.mtimeMs !== game.mtime) throw new Error('ROM changed since scanning. Rescan and review it again.');
        if (inside(game.root, this.trash) || inside(this.trash, game.root)) throw new Error('Trash and library must be separate folders.');
        const sha256 = hash(fs.readFileSync(source));
        logId = randomUUID();
        fs.mkdirSync(this.trash, { recursive: true });
        const trashReal = fs.realpathSync(this.trash);
        if (trashReal.toLowerCase() !== path.resolve(this.trash).toLowerCase()) throw new Error('Trash must be a real folder, not a linked directory.');
        if (inside(fs.realpathSync(game.root), trashReal)) throw new Error('Trash resolves inside the ROM folder.');
        const appTrash = path.join(trashReal, 'games-reducer');
        if (fs.existsSync(appTrash) && fs.lstatSync(appTrash).isSymbolicLink()) throw new Error('Trash subfolder must not be a symbolic link.');
        const folder = path.join(trashReal, 'games-reducer', logId);
        fs.mkdirSync(folder, { recursive: true });
        if (!inside(trashReal, fs.realpathSync(folder))) throw new Error('Trash destination escaped its folder.');
        const destination = path.join(folder, path.basename(source));
        this.db.prepare('INSERT INTO cleanup_log(id,game_id,source,destination,sha256,state) VALUES (?,?,?,?,?,?)').run(logId, id, source, destination, sha256, 'pending');
        this.move(source, destination);
        if (fs.existsSync(source) || hash(fs.readFileSync(destination)) !== sha256) throw new Error('Move could not be verified; record retained.');
        this.transaction(() => {
          this.db.prepare('DELETE FROM games WHERE id=?').run(id);
          this.db.prepare("UPDATE cleanup_log SET state='complete' WHERE id=?").run(logId);
        });
        results.push({ id, ok: true, destination });
      } catch (error) {
        if (logId) this.db.prepare('UPDATE cleanup_log SET error=? WHERE id=?').run(error.message, logId);
        results.push({ id, ok: false, error: error.code === 'EXDEV' ? 'Trash must be on the same drive as this ROM. No file was removed.' : error.message });
      }
    }
    return results;
  }
  recoverCleanup() {
    for (const row of this.db.prepare("SELECT * FROM cleanup_log WHERE state='pending'").all()) {
      try {
        if (!fs.existsSync(row.source) && fs.existsSync(row.destination) && hash(fs.readFileSync(row.destination)) === row.sha256) {
          this.transaction(() => {
            this.db.prepare('DELETE FROM games WHERE id=?').run(row.game_id);
            this.db.prepare("UPDATE cleanup_log SET state='complete',error=NULL WHERE id=?").run(row.id);
          });
        }
      } catch { /* Keep the pending receipt and game record for a later retry. */ }
    }
  }
  clearMissing() {
    let count = 0;
    for (const game of this.list().filter(g => g.missing)) {
      const file = path.resolve(game.root, game.relative_path);
      if (inside(game.root, file) && !fs.existsSync(file)) {
        this.db.prepare('DELETE FROM games WHERE id=?').run(game.id); count++;
      }
    }
    return count;
  }
  close() { this.db.close(); }
}
