import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Library } from '../server/library.mjs';
import { zipSync, strToU8 } from 'fflate';
const base = path.resolve('test-results/unit'); fs.mkdirSync(base, { recursive: true });
function fixture(options = {}) {
  const directory = fs.mkdtempSync(path.join(base, 'case-'));
  const root = path.join(directory, 'roms'); fs.mkdirSync(path.join(root, 'snes'), { recursive: true });
  const file = path.join(root, 'snes', 'Sample (USA) [!].sfc'); fs.writeFileSync(file, 'sample rom bytes');
  const library = new Library({ root, dataDir: path.join(directory, 'data'), trash: path.join(directory, 'trash'), ...options });
  library.scan(); return { library, file, directory, root, game: library.list()[0] };
}
test('review decisions persist, remain reversible, and never touch the ROM', () => {
  const { library, file, game, directory, root } = fixture();
  library.decision(game.id, 'discard');
  assert.equal(fs.readFileSync(file, 'utf8'), 'sample rom bytes');
  library.close();
  const reopened = new Library({ root, dataDir: path.join(directory, 'data'), trash: path.join(directory, 'trash') });
  assert.equal(reopened.get(game.id).status, 'discard');
  assert.equal(reopened.undo().status, 'unreviewed'); reopened.close();
});
test('cleanup moves the exact file then clears its game and decision records', () => {
  const { library, file, game } = fixture(); library.decision(game.id, 'discard');
  const preview = library.cleanupPreview(); const results = library.cleanup(preview.token);
  assert.equal(results[0].ok, true); assert.equal(fs.existsSync(file), false);
  assert.equal(fs.readFileSync(results[0].destination, 'utf8'), 'sample rom bytes');
  assert.equal(library.list().length, 0); assert.equal(library.db.prepare('SELECT COUNT(*) AS n FROM decisions').get().n, 0);
  assert.equal(library.db.prepare('SELECT state FROM cleanup_log').get().state, 'complete');
  assert.throws(() => library.cleanup(preview.token)); library.close();
});
test('failed moves keep the ROM and database record', () => {
  const { library, file, game } = fixture({ move: () => { throw new Error('File locked'); } });
  library.decision(game.id, 'discard'); const result = library.cleanup(library.cleanupPreview().token);
  assert.equal(result[0].ok, false); assert.equal(library.get(game.id).status, 'discard'); assert.ok(fs.existsSync(file)); library.close();
});
test('changed files cannot be cleaned up using an earlier scan', () => {
  const { library, file, game } = fixture(); library.decision(game.id, 'discard');
  const preview = library.cleanupPreview(); fs.appendFileSync(file, 'changed');
  assert.equal(library.cleanup(preview.token)[0].ok, false); assert.ok(fs.existsSync(file)); library.close();
});
test('unmarking invalidates an earlier cleanup confirmation', () => {
  const { library, file, game } = fixture(); library.decision(game.id, 'discard'); const preview = library.cleanupPreview();
  library.decision(game.id, 'keep'); assert.throws(() => library.cleanup(preview.token)); assert.ok(fs.existsSync(file)); library.close();
});
test('missing records can be cleared without losing kept files', () => {
  const { library, file, game } = fixture();
  fs.renameSync(file, path.join(path.dirname(file), 'outside.txt')); library.scan();
  assert.equal(library.get(game.id).missing, 1); assert.equal(library.clearMissing(), 1); library.close();
});
test('reject paths escaping the library and extract single-ROM ZIPs in memory', () => {
  const { library, root } = fixture();
  assert.throws(() => library.safeFile({ root, relative_path: '../../outside' }));
  fs.writeFileSync(path.join(root, 'snes', 'Zipped.zip'), zipSync({ 'rom.sfc': strToU8('zipped rom') }));
  fs.writeFileSync(path.join(root, 'snes', 'Multi.zip'), zipSync({ '1.sfc': strToU8('one'), '2.sfc': strToU8('two') }));
  const scan = library.scan(); assert.equal(scan.count, 2); assert.equal(scan.warnings.length, 1);
  const zipped = library.list().find(g => g.relative_path.endsWith('.zip'));
  assert.equal(library.readRom(zipped).bytes.toString(), 'zipped rom'); library.close();
});
test('gamelist metadata imports and ignores image paths outside the library', () => {
  const { library, root } = fixture();
  fs.writeFileSync(path.join(root, 'snes', 'gamelist.xml'), `<gamelist><game><path>./Sample (USA) [!].sfc</path><name>Proper title</name><desc>A description</desc><image>../../outside.png</image></game></gamelist>`);
  library.scan(); assert.equal(library.list()[0].title, 'Proper title'); assert.equal(library.list()[0].metadata.description, 'A description'); assert.equal(library.list()[0].metadata.cover, undefined); library.close();
});
test('restart recovers a verified move interrupted before database cleanup', () => {
  const { library, game, file, directory, root } = fixture();
  library.decision(game.id, 'discard');
  const destination = path.join(directory, 'recovered.sfc');
  const { createHash } = process.getBuiltinModule('crypto');
  const hash = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  library.db.prepare('INSERT INTO cleanup_log(id,game_id,source,destination,sha256,state) VALUES (?,?,?,?,?,?)').run('recovery', game.id, file, destination, hash, 'pending');
  fs.renameSync(file, destination); library.close();
  const reopened = new Library({ root, dataDir: path.join(directory, 'data') });
  assert.equal(reopened.list().length, 0); assert.equal(reopened.db.prepare('SELECT state FROM cleanup_log').get().state, 'complete'); reopened.close();
});
