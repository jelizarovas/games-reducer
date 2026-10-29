import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

fs.mkdirSync('test-results/browser', { recursive: true });
const run = fs.mkdtempSync(path.resolve('test-results/browser/run-'));
const root = path.join(run, 'roms');
const sourceRoot = process.env.TEST_ROM_ROOT || 'C:\\RetroBat\\roms';
const choices = { megadrive: [/^Sonic The Hedgehog 2.*\[!\]/i, /^Sonic The Hedgehog \(.*\[!\]/i], snes: [/^Super Mario World \(U\).*\[!\]/i, /^Super Mario World 2.*\[!\]/i], nes: [/^Super Mario Bros\. \(.*\[!\]/i] };
for (const [system, patterns] of Object.entries(choices)) {
  fs.mkdirSync(path.join(root, system), { recursive: true });
  const names = fs.readdirSync(path.join(sourceRoot, system));
  for (const pattern of patterns) {
    const name = names.find(x => pattern.test(x));
    if (!name) throw new Error(`Test ROM not found: ${pattern}. Set TEST_ROM_ROOT to your prepared ROM library.`);
    fs.copyFileSync(path.join(sourceRoot, system, name), path.join(root, system, name));
  }
}
const env = { ...process.env, DATA_DIR: path.join(run, 'data'), ROM_ROOT: root, TRASH_ROOT: path.join(run, 'trash'), API_PORT: '4312', WEB_PORT: '5174' };
// Reuse only public metadata caches; fixture progress and ROMs remain isolated.
for (const folder of ['year-index','launchbox']) {
  fs.mkdirSync(path.join(env.DATA_DIR,folder),{recursive:true});
  const cache=path.resolve('data',folder);
  if(fs.existsSync(cache))for(const name of fs.readdirSync(cache).filter(n=>n.endsWith('.json')||n.endsWith('.dat')))fs.copyFileSync(path.join(cache,name),path.join(env.DATA_DIR,folder,name));
}
const apiProcess = spawn(process.execPath, ['server/index.mjs'], { env, stdio: 'pipe' });
const webProcess = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], { env, stdio: 'pipe' });
for (const child of [apiProcess, webProcess]) child.stderr.on('data', data => process.stderr.write(data));
let browser;
const endpoint = 'http://127.0.0.1:5174';
const request = async (route, body) => {
  const response = await fetch(`${endpoint}/api${route}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await response.json(); assert.ok(response.ok, JSON.stringify(data)); return data;
};
try {
  for (let n = 0; n < 50; n++) {
    try { if ((await fetch(`${endpoint}/api/health`)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], failures = [];
  page.on('pageerror', error => { if (!error.message.includes('Using exceptions for control flow')) errors.push(error.message); });
  page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('favicon.ico')) { failures.push(`${response.status()} ${response.url()}`); console.log('HTTP FAILURE', response.status(), response.url()); } });
  await page.addInitScript(() => {
    window.testPad = { id: 'Test controller', connected: true, index: 0, mapping: 'standard', axes: [0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0, touched: false })) };
    navigator.getGamepads = () => [window.testPad];
  });
  const pressPad = async (...buttons) => {
    await page.evaluate(buttons => { for (const i of buttons) { window.testPad.buttons[i].pressed = true; window.testPad.buttons[i].value = 1; } }, buttons);
    await page.waitForTimeout(130);
    await page.evaluate(() => { for (const button of window.testPad.buttons) { button.pressed = false; button.value = 0; } });
    await page.waitForTimeout(130);
  };
  const optionNames={'Console':{all:'All',megadrive:'Genesis',snes:'SNES',nes:'NES'},'Sort games':{title:'Title A\u2013Z','title-desc':'Title Z\u2013A',year:'Oldest first','year-desc':'Newest first'},'Review status':{unreviewed:'To try',keep:'Keepers',discard:'Marked',later:'Later',all:'All games'}};
  const choose=async(label,value)=>{await page.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('option',{name:optionNames[label][value],exact:true}).click();};
  const menuAction=async(name)=>{await page.getByRole('button',{name:'More actions',exact:true}).click();await page.getByRole('menuitem',{name,exact:true}).click();};
  const playing = () => page.locator('.screen[data-phase=playing]').waitFor({ timeout: 30000 });
  const ready = () => page.locator('.screen[data-phase=ready]').waitFor({ timeout: 10000 });
  const review = async () => { await pressPad(8, 9); await page.locator('.screen[data-phase=decision]').waitFor(); await page.getByRole('button', { name: 'Keep game', exact: true }).waitFor(); };
  const finish = async () => { await page.getByRole('button', { name: 'More actions' }).click(); await page.getByRole('menuitem', { name: 'Finish session' }).click(); await page.getByRole('dialog').waitFor(); };
  async function testTurbo(nes = false) {
    const frame = () => page.frames().find(f => f.url().includes('/engine/play.html'));
    const count = () => nes ? page.locator('.nes-canvas').getAttribute('data-frames').then(Number) : frame().evaluate(() => window.reducerRuntimeState().renderedFrames);
    const speed = () => nes ? page.locator('.nes-canvas').getAttribute('data-speed').then(Number) : frame().evaluate(() => window.reducerRuntimeState().speed);
    await page.waitForTimeout(700);
    let before = await count(); await page.waitForTimeout(1000); const normal = await count() - before;
    await page.evaluate(() => { window.testPad.buttons[7].pressed = true; });
    await page.waitForTimeout(250); assert.equal(await speed(), 3);
    before = await count(); await page.waitForTimeout(1000); const fast = await count() - before;
    await page.evaluate(() => { window.testPad.buttons[7].pressed = false; });
    await page.waitForTimeout(250); assert.equal(await speed(), 1);
    before = await count(); await page.waitForTimeout(1000); const restored = await count() - before;
    console.log('Frame counts normal/fast/restored:', normal, fast, restored);
    assert.ok(fast > normal * 1.6, 'Holding RT must advance materially more emulated frames');
    assert.ok(restored < fast * .8, 'Release must restore normal speed');
  }
  async function testMute(nes=false) {
    const muted=()=>nes?page.locator('.nes-canvas').getAttribute('data-muted').then(x=>x==='true'):page.frames().find(f=>f.url().includes('/engine/play.html')).evaluate(()=>window.reducerRuntimeState().muted);
    await page.getByRole('button',{name:'Mute sound',exact:true}).click();await page.waitForTimeout(200);assert.equal(await muted(),true);await playing();
    await page.getByRole('button',{name:'Review game',exact:true}).click();
    await page.getByRole('button',{name:'Resume game',exact:true}).click();await playing();assert.equal(await muted(),true);
    await page.getByRole('button',{name:'Unmute sound',exact:true}).click();await page.waitForTimeout(200);assert.equal(await muted(),false);
    console.log('PASS: mute, pause/resume while muted, and unmute',nes?'NES':'WASM');
  }
  async function testTouch() {
    const engine=page.frames().find(f=>f.url().includes('/engine/play.html'));
    await engine.evaluate(()=>{window.testKeys=[];for(const type of ['keydown','keyup'])document.querySelector('canvas').addEventListener(type,e=>window.testKeys.push([e.code,e.type]));});
    await page.getByRole('button',{name:'Player 1 controller',exact:true}).click();
    await page.getByRole('button',{name:'Player 2 controller',exact:true}).click();
    const left=page.locator('.touch-panel.player-1'),right=page.locator('.touch-panel.player-2');
    const box=await left.boundingBox();await page.mouse.move(box.x+12,box.y+10);await page.mouse.down();await page.mouse.move(box.x+90,box.y-80);await page.mouse.up();
    assert.ok((await left.boundingBox()).x>box.x+50,'Panel case drags');
    const arrow=await page.getByRole('button',{name:'Player 1 →',exact:true}).boundingBox();
    await page.mouse.move(arrow.x+18,arrow.y+18);await page.mouse.down();await page.waitForTimeout(200);await page.mouse.move(arrow.x-80,arrow.y-80);await page.mouse.up();
    const turbo=await page.getByRole('button',{name:'Player 1 A turbo',exact:true}).boundingBox();
    await page.mouse.move(turbo.x+20,turbo.y+12);await page.mouse.down();await page.waitForTimeout(400);await page.mouse.up();
    const events=await engine.evaluate(()=>window.testKeys);
    assert.ok(events.some(([code,type])=>code==='ArrowRight'&&type==='keydown'));assert.ok(events.some(([code,type])=>code==='ArrowRight'&&type==='keyup'));
    assert.ok(events.filter(([code,type])=>code==='KeyA'&&type==='keydown').length>=3,'A turbo repeats');
    // Real browser touch contacts, held together on the two panels.
    const client=await page.context().newCDPSession(page);
    const ab=await page.getByRole('button',{name:'Player 2 B',exact:true}).boundingBox();
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:arrow.x+18,y:arrow.y+18,id:1},{x:ab.x+20,y:ab.y+20,id:2}]});
    await page.waitForTimeout(150);assert.equal(await page.locator('.touch-panel [data-held]').count(),2);
    await client.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await page.waitForTimeout(100);assert.equal(await page.locator('.touch-panel [data-held]').count(),0);
    const twoPlayerEvents=await engine.evaluate(()=>window.testKeys);
    assert.ok(twoPlayerEvents.some(([code,type])=>code==='Digit2'&&type==='keydown'),'Blue controller sends a separate P2 B input');
    assert.ok(twoPlayerEvents.some(([code,type])=>code==='Digit2'&&type==='keyup'),'Cancelling touch releases P2 input');
    await page.screenshot({path:path.join(run,'touch-controls.png')});
    await page.getByRole('button',{name:'Player 1 controller',exact:true}).click();await page.getByRole('button',{name:'Player 2 controller',exact:true}).click();
    console.log('PASS: draggable panels, held mouse input, turbo, simultaneous touch and cancellation');
  }
  await page.goto(endpoint);
  await page.getByRole('button', { name: /Sonic The Hedgehog 2/ }).waitFor();
  assert.equal((await request('/games')).length, 5);
  assert.equal(await page.getByRole('combobox', {name:'Console',exact:true}).getAttribute('data-value'), 'all');
  await choose('Console','megadrive');
  await pressPad(13); await pressPad(12);
  await pressPad(2); await page.getByRole('dialog', { name: 'Controller menu' }).waitFor();
  await pressPad(13); assert.ok(await page.evaluate(() => document.activeElement.closest('[role=dialog]')));
  await pressPad(1); assert.equal(await page.getByRole('dialog').count(), 0);
  await pressPad(10); assert.ok(await page.locator('.is-expanded').count());
  await pressPad(10); assert.equal(await page.locator('.is-expanded').count(), 0);
  console.log('PASS: controller navigation, menu focus and fullscreen toggle');
  await page.waitForFunction(() => [...document.querySelectorAll('.row-art img')].some(img => img.naturalWidth > 100), { timeout: 25000 });
  console.log('PASS: downloaded cover images rendered in the game list');
  await page.screenshot({ path: path.join(run, 'covers.png'), fullPage: true });
  await choose('Console','all');
  await page.getByRole('button', { name: /Sonic The Hedgehog 2/ }).click();
  await page.screenshot({ path: path.join(run, 'library.png'), fullPage: true });
  await playing(); await page.waitForTimeout(1000);
  await page.evaluate(() => { window.updateSentinel = 'same-page'; });
  const loadedEngine = page.frames().find(frame => frame.url().includes('/engine/play.html'));
  await loadedEngine.evaluate(() => { window.updateSentinel = 'same-game'; });
    await page.getByRole('combobox',{name:'Game category',exact:true}).click();
    await page.getByRole('option',{name:'Uncategorized',exact:true}).click();
    await playing();assert.equal(await loadedEngine.evaluate(()=>window.updateSentinel),'same-game');
    await page.getByRole('combobox',{name:'Game category',exact:true}).click();
    await page.getByRole('option',{name:'Platformer',exact:true}).click();
    await playing();assert.equal(await loadedEngine.evaluate(()=>window.updateSentinel),'same-game');
    console.log('PASS: category changes preserve the running game');
  for(const name of ['Library settings','Controller menu']) {
    await menuAction(name);await page.getByRole('dialog',{name,exact:true}).waitFor();
    assert.equal(await loadedEngine.evaluate(()=>window.updateSentinel),'same-game');
    await page.locator('.modal-backdrop').click({position:{x:5,y:5}});
    await page.getByRole('button',{name:'Resume game',exact:true}).click();await playing();
  }
  assert.equal(await page.getByRole('button',{name:'Finish session',exact:true}).count(),0,'No one-click Finish button in header');
  await page.getByRole('button',{name:'More actions'}).click();await page.getByRole('menuitem',{name:'Finish session'}).waitFor();await playing();
  await page.keyboard.press('Escape');assert.equal(await page.getByRole('menu').count(),0);await playing();
  console.log('PASS: settings/menu preserve loaded game, Finish is tucked in dismissible overflow');
  await page.getByRole('textbox',{name:'Find a game'}).fill('nothing matches this');
  assert.equal(await page.locator('.game-row').count(),0);
  await choose('Sort games','year-desc');
  await choose('Review status','keep');
  await choose('Console','snes');
  assert.equal(await loadedEngine.evaluate(()=>window.updateSentinel),'same-game');
  assert.match(await page.locator('.header-title').textContent(),/Sonic The Hedgehog 2/);
  await choose('Console','all');
  await choose('Sort games','title');
  await page.getByRole('textbox',{name:'Find a game'}).fill('');
  await page.getByRole('button',{name:'Game information',exact:true}).click();
  await page.getByRole('dialog').waitFor();
  await page.locator('.modal-backdrop').click({position:{x:5,y:5}});assert.equal(await page.getByRole('dialog').count(),0);
  await page.getByRole('button',{name:'Resume game',exact:true}).click();await playing();
  console.log('PASS: live search, sort, console/filter changes preserve game; modals dismiss outside');
  await testMute(); await testTouch();
  for (const [width, height] of [[390, 844], [844, 390], [1440, 1000]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(200);
    const screen = await page.locator('.screen').boundingBox();
    assert.ok(Math.abs(screen.width / screen.height - 4 / 3) < .01, 'Playback stays 4:3');
    assert.equal(await loadedEngine.evaluate(() => window.updateSentinel), 'same-game', 'Resizing must preserve the emulator');
    await playing();
  }
  console.log('PASS: live game survives sidebar-to-dock resize at 4:3');
  for (const file of ['src/main.jsx', 'public/engine/bridge.js']) fs.utimesSync(file, new Date(), new Date());
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.updateSentinel), 'same-page');
  assert.equal(await loadedEngine.evaluate(() => window.updateSentinel), 'same-game');
  await playing(); console.log('PASS: source and engine edits do not reload the active game');
  await testTurbo(); await page.waitForTimeout(3500);
  // Controller Start is routed into the embedded emulator, not the surrounding menu.
  await pressPad(9); await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(run, 'genesis.png'), fullPage: true });
  console.log('PASS: Genesis embedded playback and controller Start');
  await review();
  assert.equal(await page.locator('.stage-heading,.stage-footer').count(), 0, 'No controls around the game');
  await page.locator('.topbar').getByText('Paused', { exact: true }).waitFor();
  await page.locator('.topbar').getByRole('button', { name: 'Stop game' }).waitFor();
  const engineFrame = page.frames().find(frame => frame.url().includes('/engine/play.html'));
  console.log('Engine revision:', await engineFrame.locator('#build-commit-link').textContent());
  await page.waitForTimeout(200);
  const pausedFrame = await engineFrame.evaluate(() => window.reducerRuntimeState());
  await page.waitForTimeout(500);
  assert.deepEqual(await engineFrame.evaluate(() => window.reducerRuntimeState()), pausedFrame, 'Emulation must stop while the decision overlay is open');
  assert.equal(pausedFrame.paused, true);
  assert.equal(await page.locator('.decision-overlay').count(),0);
  await page.setViewportSize({width:390,height:844});
  const header = await page.locator('.topbar').boundingBox();
  const decisions = await page.locator('.header-decisions').boundingBox();
  assert.ok(decisions.y >= header.y && decisions.y+decisions.height <= header.y+header.height);
  assert.ok((await page.locator('.screen').boundingBox()).y >= header.y+header.height);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(run,'paused-mobile.png')});
  await page.setViewportSize({width:1440,height:1000});
  console.log('PASS: paused game is unobscured; review buttons fit inside mobile header');
  assert.ok(pausedFrame.audio.every(state => state === 'suspended'));
  await page.locator('.topbar').getByRole('button', { name: 'Resume game' }).click(); await playing(); await page.waitForTimeout(500);
  await page.locator('.topbar').getByRole('button', { name: 'Review game' }).click(); await page.locator('.screen[data-phase=decision]').waitFor(); await page.getByRole('button', { name: 'Keep game', exact: true }).waitFor();
  console.log('PASS: pause freezes video, resume returns to gameplay');
  await page.screenshot({ path: path.join(run, 'decision.png'), fullPage: true });
  const markedFile = (await request('/games')).find(g => g.title === 'Sonic The Hedgehog 2');
  await pressPad(1); await playing();
  assert.equal((await request('/games')).find(g => g.id === markedFile.id).status, 'discard');
  assert.ok(fs.existsSync(path.join(root, markedFile.relative_path)));
  const nextId = (await request('/state')).currentId;
  assert.notEqual((await request('/games')).find(g=>g.id===nextId).system, 'megadrive');
  console.log('PASS: All queue advances across consoles; discard marks only');
  await menuAction('Undo last decision');
  await page.waitForFunction(async id=>(await (await fetch('/api/games')).json()).find(g=>g.id===id)?.status==='unreviewed',markedFile.id);
  await playing();assert.equal((await request('/state')).currentId,nextId,'Undo leaves the running game selected');
  assert.equal((await request('/games')).find(g=>g.id===markedFile.id).status,'unreviewed');
  console.log('PASS: undo restores a prior decision during gameplay without stopping it');
  await finish(); await page.getByRole('button', { name: 'Keep reviewing' }).click(); await ready();
  assert.equal((await request('/games')).find(g => g.id === markedFile.id).status, 'unreviewed');
  await choose('Console','snes');
  await page.locator('.game-row').filter({ hasText: 'Super Mario World' }).first().click();
  await playing(); await testMute(); await testTurbo(); await page.waitForTimeout(1500);
  await pressPad(9); await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(run, 'snes.png'), fullPage: true });
  console.log('PASS: SNES embedded playback');
  await review(); await pressPad(0); await playing();
  assert.equal((await request('/games')).filter(g => g.status === 'keep').length, 1);
  console.log('PASS: controller keep and next ROM');
  await finish(); await page.getByRole('button', { name: 'Keep reviewing' }).click();
  await choose('Console','nes');
  await pressPad(0); await playing(); await testMute(true); await testTurbo(true); await page.waitForTimeout(1000);
  await pressPad(9); await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(run, 'nes.png'), fullPage: true });
  console.log('PASS: NES embedded playback');
  await review(); await pressPad(1); await ready();
  await finish();
  await page.getByRole('button', { name: 'Move marked games to trash' }).click();
  await page.getByText('1 games moved to trash.', { exact: false }).waitFor();
  assert.equal((await request('/games')).length, 4);
  assert.equal(fs.readdirSync(path.join(root, 'nes')).length, 0);
  assert.ok(fs.existsSync(path.join(run, 'trash')));
  console.log('PASS: cleanup on disposable ROM copy, SQLite record removed');
  await page.getByRole('button', { name: 'Back to library' }).click();
  await page.reload();
  await page.getByRole('combobox', {name:'Console',exact:true}).waitFor();
  assert.equal((await request('/games')).filter(g => g.status === 'keep').length, 1);
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.equal(failures.length, 0, failures.join('\n'));
  console.log('PASS: persistence, zero unexpected browser errors');
  fs.writeFileSync(path.join(run, 'result.json'), JSON.stringify({ passed: true, errors, failures, screenshots: ['library.png', 'genesis.png', 'snes.png', 'nes.png', 'decision.png'] }, null, 2));
  console.log(`Evidence: ${run}`);
} finally {
  await browser?.close(); apiProcess.kill(); webProcess.kill();
}
