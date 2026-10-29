import {chromium} from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const prefix='/games-reducer/',out=path.resolve('dist');
const run=fs.mkdtempSync(path.resolve('test-results/browser/static-'));
const romRoot=process.env.TEST_ROM_ROOT||'C:/RetroBat/roms';
const patterns={megadrive:/^Sonic The Hedgehog 2.*\[!\]/i,snes:/^Super Mario World \(U\).*\[!\]/i,nes:/^Super Mario Bros\. \(.*\[!\]/i};
const fixtures=Object.entries(patterns).map(([system,pattern])=>{
  const name=fs.readdirSync(path.join(romRoot,system)).find(n=>pattern.test(n));assert.ok(name);
  return {system,name,bytes:fs.readFileSync(path.join(romRoot,system,name)).toString('base64')};
});
const apiCalls=[];
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname.includes('/api/'))apiCalls.push(pathname);
  if(!pathname.startsWith(prefix)){res.writeHead(404).end();return;}
  const file=path.resolve(out,pathname.slice(prefix.length)||'index.html');
  if(!file.startsWith(out+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.webp':'image/webp'};
  // Deliberately no COOP/COEP headers: this reproduces GitHub Pages hosting.
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}${prefix}`;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
let page=await context.newPage();const errors=[];
const watch=p=>p.on('pageerror',e=>{if(!e.message.includes('Using exceptions for control flow'))errors.push(e.message);});watch(page);
const openSettings=async()=>{await page.getByRole('button',{name:'More actions',exact:true}).click();await page.getByRole('menuitem',{name:'Library settings',exact:true}).click();};
const closeDialog=()=>page.getByRole('button',{name:'Close dialog',exact:true}).click();
const playing=()=>page.locator('.screen[data-phase=playing]').waitFor({timeout:45000});
const store=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('games-reducer:/games-reducer/',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('library').objectStore('library').get('state');q.onsuccess=()=>{const s=q.result;db.close();resolve({games:s.games.map(({handle,...g})=>g),pending:s.pending,history:s.history});};q.onerror=()=>reject(q.error);};}));
try{
  await page.goto(url);await page.getByRole('button',{name:'Choose folder',exact:true}).waitFor({timeout:30000});
  assert.equal(await page.evaluate(()=>crossOriginIsolated),true,'Service worker supplies isolation without host headers');
  assert.equal(await page.locator('.game-row').count(),0,'No implicit access to the old PC folder');
  await page.evaluate(async files=>{
    const opfs=await navigator.storage.getDirectory(),root=await opfs.getDirectoryHandle('roms',{create:true}),trash=await opfs.getDirectoryHandle('trash',{create:true});
    for(const f of files){const dir=await root.getDirectoryHandle(f.system,{create:true}),file=await dir.getFileHandle(f.name,{create:true}),writer=await file.createWritable();await writer.write(Uint8Array.from(atob(f.bytes),c=>c.charCodeAt(0)));await writer.close();}
    window.showDirectoryPicker=async options=>options.id==='games-reducer-trash'?trash:root;
  },fixtures);
  await page.getByRole('button',{name:'Choose folder',exact:true}).click();await page.getByRole('button',{name:'Choose ROM folder',exact:true}).click();
  await page.locator('.game-row').first().waitFor();assert.equal(await page.locator('.game-row').count(),3);
  let data=await store();assert.ok(data.games.every(g=>g.metadata.genre&&g.metadata.released&&g.metadata.cover));
  await page.screenshot({path:path.join(run,'library.png')});console.log('PASS folder scan, bundled metadata/artwork, and Pages subpath isolation');
  const order=['megadrive','snes','nes'];
  for(const system of order){
    const g=data.games.find(g=>g.system===system);
    await page.getByRole('button',{name:g.title,exact:true}).click();await playing();
    if(system!=='nes')assert.equal(await page.frames().find(f=>f.url().includes('/engine/play.html')).evaluate(()=>crossOriginIsolated),true);
    await page.waitForTimeout(1200);await page.screenshot({path:path.join(run,`${system}.png`)});
    await page.getByRole('button',{name:'Mute sound',exact:true}).click();await playing();await page.getByRole('button',{name:'Unmute sound',exact:true}).click();
    await page.getByRole('combobox',{name:'Game category',exact:true}).click();await page.getByRole('option',{name:'Uncategorized',exact:true}).click();await playing();assert.equal(await page.locator('.game-row').count(),0);
    await page.getByRole('combobox',{name:'Game category',exact:true}).click();await page.getByRole('option',{name:'All categories',exact:true}).click();
    await page.getByRole('button',{name:'Review game',exact:true}).click();await page.getByRole('button',{name:'Resume game',exact:true}).click();await playing();
    await page.getByRole('button',{name:'Stop game',exact:true}).click();console.log('PASS browser-only playback, mute, pause/resume and live filters:',system);
  }
  const nes=data.games.find(g=>g.system==='nes');await page.getByRole('button',{name:nes.title,exact:true}).click();await playing();await page.getByRole('button',{name:'Keep game',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.screen')?.dataset.phase==='playing'||document.querySelector('.screen')?.dataset.phase==='ready');
  if(await page.getByRole('button',{name:'Stop game',exact:true}).count())await page.getByRole('button',{name:'Stop game',exact:true}).click();
  assert.equal((await store()).games.find(g=>g.id===nes.id).status,'keep');
  await openSettings();const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Export backup',exact:true}).click();const download=await downloadEvent;const backupPath=path.join(run,'progress.json');await download.saveAs(backupPath);const backup=JSON.parse(fs.readFileSync(backupPath,'utf8'));
  assert.equal(backup.games.find(g=>g.system==='nes').status,'keep');assert.ok(!JSON.stringify(backup).includes('handle'));await closeDialog();
  await page.reload();await page.locator('.game-row').first().waitFor();assert.equal((await store()).games.find(g=>g.id===nes.id).status,'keep');
  const second=await context.newPage();await second.goto(url);await second.getByRole('alert').filter({hasText:'already open in another tab'}).waitFor();await second.close();
  console.log('PASS review persistence, backup export, reload, and protection against concurrent tabs');
  await openSettings();await page.locator('input[type=file]').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...backup,version:999}))});await page.getByRole('alert').filter({hasText:'Not a supported'}).waitFor();assert.equal((await store()).games.find(g=>g.id===nes.id).status,'keep');await page.getByRole('button',{name:'Dismiss error'}).click();await closeDialog();
  // Restore into a clean browser profile BEFORE selecting a ROM folder.
  await page.close();const fresh=await browser.newContext({viewport:{width:390,height:844}});page=await fresh.newPage();watch(page);await page.goto(url);await page.getByRole('button',{name:'Choose folder',exact:true}).waitFor({timeout:30000});await page.getByRole('button',{name:'Choose folder',exact:true}).click();
  await page.locator('input[type=file]').setInputFiles(backupPath);await page.getByRole('button',{name:'Import these records',exact:true}).click();await page.getByRole('status').filter({hasText:'3 will match'}).waitFor();assert.equal((await store()).pending.length,3);
  await page.evaluate(async files=>{const opfs=await navigator.storage.getDirectory(),root=await opfs.getDirectoryHandle('roms',{create:true}),trash=await opfs.getDirectoryHandle('trash',{create:true});for(const f of files){const dir=await root.getDirectoryHandle(f.system,{create:true}),h=await dir.getFileHandle(f.name,{create:true}),w=await h.createWritable();await w.write(Uint8Array.from(atob(f.bytes),c=>c.charCodeAt(0)));await w.close();}window.showDirectoryPicker=async options=>options.id==='games-reducer-trash'?trash:root;},fixtures);
  await page.getByRole('button',{name:'Choose ROM folder',exact:true}).click();await page.locator('.game-row').first().waitFor();assert.equal((await store()).games.find(g=>g.system==='nes').status,'keep');assert.equal((await store()).pending.length,0);await page.screenshot({path:path.join(run,'mobile.png')});
  console.log('PASS backup import before folder selection and portable progress matching');
  await openSettings();await page.getByRole('button',{name:'Choose trash folder',exact:true}).click();await closeDialog();
  const genesis=(await store()).games.find(g=>g.system==='megadrive');await page.getByRole('button',{name:genesis.title,exact:true}).click();await playing();await page.getByRole('button',{name:'Mark game for removal',exact:true}).click();
  await page.waitForTimeout(1500);await page.getByRole('button',{name:'More actions',exact:true}).click();await page.getByRole('menuitem',{name:'Finish session',exact:true}).click();await page.getByRole('button',{name:'Move marked games to trash',exact:true}).click();await page.getByText('1 games moved to trash.',{exact:false}).waitFor();
  assert.ok(!(await store()).games.some(g=>g.id===genesis.id));
  const moved=await page.evaluate(async name=>{const root=await navigator.storage.getDirectory(),trash=await root.getDirectoryHandle('trash'),files=[];for await(const [n,h]of trash.entries())files.push({name:n,size:(await h.getFile()).size});let exists=true;try{await(await(await root.getDirectoryHandle('roms')).getDirectoryHandle('megadrive')).getFileHandle(name);}catch(e){exists=e.name!=='NotFoundError';}return {files,exists};},fixtures[0].name);
  assert.equal(moved.exists,false);assert.equal(moved.files.length,1);assert.equal(moved.files[0].size,genesis.size);
  assert.deepEqual(apiCalls,[]);assert.deepEqual(errors,[]);
  console.log('PASS verified move and record cleanup on disposable browser files; zero API calls or browser errors');console.log('Evidence:',run);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
