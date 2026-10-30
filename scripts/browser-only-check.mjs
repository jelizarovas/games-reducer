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
  let file=path.resolve(out,pathname.slice(prefix.length)||'index.html');
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!file.startsWith(out+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.webp':'image/webp'};
  // Deliberately no COOP/COEP headers: this reproduces GitHub Pages hosting.
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=process.env.BROWSER_URL||`http://127.0.0.1:${server.address().port}${prefix}`;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
let page=await context.newPage();const errors=[];
const watch=p=>{p.on('request',r=>{if(new URL(r.url()).pathname.includes('/api/'))apiCalls.push(r.url());});p.on('pageerror',e=>{if(!e.message.includes('Using exceptions for control flow'))errors.push(e.message);});};watch(page);
const openSettings=async()=>{await page.getByRole('button',{name:'More actions',exact:true}).click();await page.getByRole('menuitem',{name:'Library settings',exact:true}).click();};
const closeDialog=()=>page.getByRole('button',{name:'Close dialog',exact:true}).click();
const playing=()=>page.locator('.screen[data-phase=playing]').waitFor({timeout:45000});
const store=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('games-reducer:/games-reducer/');r.onsuccess=()=>{const db=r.result,q=db.transaction('library').objectStore('library').get('state');q.onsuccess=()=>{const s=q.result;db.close();resolve({games:s.games.map(({handle,...g})=>g),pending:s.pending,history:s.history});};q.onerror=()=>reject(q.error);};r.onerror=()=>reject(r.error);}));
try{
  await page.goto(url+'no-cover.svg');
  await page.evaluate(async()=>{
    await new Promise((resolve,reject)=>{const r=indexedDB.open('games-reducer:/games-reducer/',1);r.onupgradeneeded=()=>r.result.createObjectStore('library');r.onsuccess=()=>{r.result.close();resolve();};r.onerror=()=>reject(r.error);});
    await new Promise((resolve,reject)=>{const r=indexedDB.open('saves',1);r.onupgradeneeded=()=>r.result.createObjectStore('files',{keyPath:'key'});r.onsuccess=()=>{const db=r.result,tx=db.transaction('files','readwrite');tx.objectStore('files').put({key:'aaaaaaaaaaaaaaaaaaaaaaaa-Legacy.sfc',data:{sav:new Uint8Array([9,8,7])}});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});
  });
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
    if(system!=='nes')await page.frames().find(f=>f.url().includes('/engine/play.html')).waitForFunction(()=>window.reducerRuntimeState().renderedFrames>250,{},{timeout:30000});await page.waitForTimeout(300);await page.screenshot({path:path.join(run,`${system}.png`)});
    await page.getByRole('button',{name:'Mute sound',exact:true}).click();await playing();await page.getByRole('button',{name:'Unmute sound',exact:true}).click();
    await page.getByRole('combobox',{name:'Game category',exact:true}).click();await page.getByRole('option',{name:'Uncategorized',exact:true}).click();await playing();assert.equal(await page.locator('.game-row').count(),0);
    await page.getByRole('combobox',{name:'Game category',exact:true}).click();await page.getByRole('option',{name:'All categories',exact:true}).click();
    await page.getByRole('button',{name:'Review game',exact:true}).click();await page.getByRole('button',{name:'Resume game',exact:true}).click();await playing();
    const speed=()=>system==='nes'?page.locator('.nes-canvas').getAttribute('data-speed').then(Number):page.frames().find(f=>f.url().includes('/engine/play.html')).evaluate(()=>window.reducerRuntimeState().speed);
    const fast=await page.getByRole('button',{name:'Hold to fast-forward',exact:true}).boundingBox();await page.mouse.move(fast.x+15,fast.y+15);await page.mouse.down();await page.waitForTimeout(180);assert.equal(await speed(),3);await page.mouse.move(10,100);await page.mouse.up();await page.waitForTimeout(180);assert.equal(await speed(),1);
    if(system==='megadrive'){
      const engine=page.frames().find(f=>f.url().includes('/engine/play.html'));await engine.evaluate(()=>window.routeSentinel='preserved');
      await page.getByRole('button',{name:'More actions',exact:true}).click();await page.getByRole('menuitem',{name:'Games library',exact:true}).click();await page.getByRole('region',{name:'Games library',exact:true}).waitFor();assert.ok(page.url().endsWith('/games/'));assert.equal(await engine.evaluate(()=>window.reducerRuntimeState().paused),true);await page.getByRole('button',{name:'List view',exact:true}).click();await page.getByRole('button',{name:'Grid view',exact:true}).click();await page.getByRole('link',{name:'Player',exact:true}).click();assert.equal(await engine.evaluate(()=>window.routeSentinel),'preserved');await page.getByRole('button',{name:'Resume game',exact:true}).click();await playing();
    }
    if(system!=='nes'){
      await page.getByRole('button',{name:'Review game',exact:true}).click();
      await page.frames().find(f=>f.url().includes('/engine/play.html')).evaluate(async()=>{const saves=await import(new URL('save-store.js',location.href).href),bytes=new Uint8Array(8192);bytes.set([11,22,33,44]);await saves.writeSaveFile(window.reducerChannel.current_file_name(),'sav',bytes);await window.reducerFlushSaves();});
    }
    await page.getByRole('button',{name:'Stop game',exact:true}).click();console.log('PASS browser-only playback, mute, pause/resume and live filters:',system);
  }
  const nes=data.games.find(g=>g.system==='nes');await page.getByRole('button',{name:nes.title,exact:true}).click();await playing();await page.getByRole('button',{name:'Keep game',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.screen')?.dataset.phase==='playing'||document.querySelector('.screen')?.dataset.phase==='ready');
  if(await page.getByRole('button',{name:'Stop game',exact:true}).count())await page.getByRole('button',{name:'Stop game',exact:true}).click();
  assert.equal((await store()).games.find(g=>g.id===nes.id).status,'keep');
  await openSettings();const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Export backup',exact:true}).click();const download=await downloadEvent;const backupPath=path.join(run,'progress.json');await download.saveAs(backupPath);const backup=JSON.parse(fs.readFileSync(backupPath,'utf8'));
  assert.equal(backup.version,2);assert.equal(backup.saves.length,3);assert.equal(backup.saves.find(s=>s.key.endsWith('Legacy.sfc')).files.sav,'CQgH');assert.equal(backup.games.find(g=>g.system==='nes').status,'keep');assert.ok(!JSON.stringify(backup).includes('handle'));await closeDialog();
  await page.goto(url+'games/');await page.getByRole('region',{name:'Games library',exact:true}).waitFor();
  await page.getByRole('combobox',{name:'Library review status',exact:true}).click();await page.getByRole('option',{name:'All games',exact:true}).click();assert.equal(await page.locator('.catalog-card').count(),3);
  await page.getByRole('textbox',{name:'Search library'}).fill('Sonic');assert.equal(await page.locator('.catalog-card').count(),1);await page.getByRole('textbox',{name:'Search library'}).fill('');
  await page.screenshot({path:path.join(run,'games-grid.png')});await page.getByRole('button',{name:'List view',exact:true}).click();await page.screenshot({path:path.join(run,'games-list.png')});
  await page.getByRole('button',{name:'More actions',exact:true}).click();assert.equal(await page.getByRole('progressbar',{name:'Collection reviewed'}).getAttribute('aria-valuenow'),'33');await page.screenshot({path:path.join(run,'progress-menu.png')});await page.keyboard.press('Escape');
  for(const [width,height]of [[390,844],[320,568],[844,390]]){
    await page.setViewportSize({width,height});
    for(const view of ['Grid','List']){await page.getByRole('button',{name:view+' view',exact:true}).click();await page.screenshot({path:path.join(run,'games-'+view+'-'+width+'.png')});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
    await page.getByRole('button',{name:'More actions',exact:true}).click();await page.screenshot({path:path.join(run,'progress-menu-'+width+'.png')});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.keyboard.press('Escape');
  }
  await page.setViewportSize({width:1440,height:900});await page.getByRole('link',{name:'Player',exact:true}).click();await page.locator('.game-row').first().waitFor();assert.equal((await store()).games.find(g=>g.id===nes.id).status,'keep');
  const second=await context.newPage();await second.goto(url);await second.getByRole('alert').filter({hasText:'already open in another tab'}).waitFor();await second.close();
  console.log('PASS review persistence, backup export, reload, and protection against concurrent tabs');
  await openSettings();await page.locator('input[type=file]').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...backup,version:999}))});await page.getByRole('alert').filter({hasText:'Not a supported'}).waitFor();assert.equal((await store()).games.find(g=>g.id===nes.id).status,'keep');await page.getByRole('button',{name:'Dismiss error'}).click();await closeDialog();
  // Restore into a clean browser profile BEFORE selecting a ROM folder.
  await page.close();const fresh=await browser.newContext({viewport:{width:390,height:844}});page=await fresh.newPage();watch(page);await page.goto(url);await page.getByRole('button',{name:'Choose folder',exact:true}).waitFor({timeout:30000});await page.getByRole('button',{name:'Choose folder',exact:true}).click();
  await page.locator('input[type=file]').setInputFiles(backupPath);await page.getByRole('button',{name:'Import these records',exact:true}).click();await page.getByRole('status').filter({hasText:'3 will match'}).waitFor();assert.equal((await store()).pending.length,3);
  const restored=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('games-reducer:/games-reducer/');r.onsuccess=()=>{const db=r.result,q=db.transaction('files').objectStore('files').getAll();q.onsuccess=()=>{db.close();resolve(q.result.map(s=>({key:s.key,bytes:[...s.data.sav]})));};};}));
  assert.equal(restored.length,backup.saves.length);for(const save of backup.saves)assert.deepEqual(restored.find(r=>r.key===save.key).bytes,[...Buffer.from(save.files.sav,'base64')]);
  await page.evaluate(async files=>{const opfs=await navigator.storage.getDirectory(),root=await opfs.getDirectoryHandle('roms',{create:true}),trash=await opfs.getDirectoryHandle('trash',{create:true});for(const f of files){const dir=await root.getDirectoryHandle(f.system,{create:true}),h=await dir.getFileHandle(f.name,{create:true}),w=await h.createWritable();await w.write(Uint8Array.from(atob(f.bytes),c=>c.charCodeAt(0)));await w.close();}window.showDirectoryPicker=async options=>options.id==='games-reducer-trash'?trash:root;},fixtures);
  await page.getByRole('button',{name:'Choose ROM folder',exact:true}).click();await page.locator('.game-row').first().waitFor();assert.equal((await store()).games.find(g=>g.system==='nes').status,'keep');assert.equal((await store()).pending.length,0);await page.screenshot({path:path.join(run,'mobile.png')});
  console.log('PASS backup import before folder selection and portable progress matching');
  await openSettings();await page.getByRole('button',{name:'Choose trash folder',exact:true}).click();await closeDialog();
  const genesis=(await store()).games.find(g=>g.system==='megadrive');await page.getByRole('button',{name:genesis.title,exact:true}).click();await playing();await page.getByRole('button',{name:'Mark game for removal',exact:true}).click();
  await page.waitForTimeout(1500);await page.getByRole('button',{name:'More actions',exact:true}).click();await page.getByRole('menuitem',{name:'Finish session',exact:true}).click();await page.getByRole('button',{name:'Move marked games to trash',exact:true}).click();await page.getByText('1 games moved to trash.',{exact:false}).waitFor();
  assert.ok(!(await store()).games.some(g=>g.id===genesis.id));
  const moved=await page.evaluate(async name=>{const root=await navigator.storage.getDirectory(),trash=await root.getDirectoryHandle('trash'),files=[];for await(const [n,h]of trash.entries())files.push({name:n,size:(await h.getFile()).size});let exists=true;try{await(await(await root.getDirectoryHandle('roms')).getDirectoryHandle('megadrive')).getFileHandle(name);}catch(e){exists=e.name!=='NotFoundError';}return {files,exists};},fixtures[0].name);
  assert.equal(moved.exists,false);assert.equal(moved.files.length,1);assert.equal(moved.files[0].size,genesis.size);
  await closeDialog();
  // Original NROM test cartridge: battery-backed $6000 counts boots, $6001 is a marker.
  const battery=Buffer.alloc(16+16384+8192);battery.set([0x4e,0x45,0x53,0x1a,1,1,2]);
  battery.set([0x78,0xd8,0xa2,0xff,0x9a,0xee,0x00,0x60,0xa9,0x37,0x8d,0x01,0x60,0x4c,0x0d,0x80],16);
  for(const offset of [0x3ffa,0x3ffc,0x3ffe])battery.set([0,0x80],16+offset);
  const batteryFixture={system:'nes',name:'Battery test.nes',bytes:battery.toString('base64')};
  const addBattery=()=>page.evaluate(async f=>{const root=await(await navigator.storage.getDirectory()).getDirectoryHandle('roms',{create:true}),dir=await root.getDirectoryHandle('nes',{create:true}),h=await dir.getFileHandle(f.name,{create:true}),w=await h.createWritable();await w.write(Uint8Array.from(atob(f.bytes),c=>c.charCodeAt(0)));await w.close();window.showDirectoryPicker=async()=>root;},batteryFixture);
  const batteryBytes=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('games-reducer:/games-reducer/');r.onsuccess=()=>{const db=r.result,q=db.transaction('files').objectStore('files').getAll();q.onsuccess=()=>{db.close();resolve(q.result.filter(r=>r.key.endsWith('-nes')).map(r=>[...r.data.sav]));};r.onerror=()=>reject(r.error);};}));
  await addBattery();await openSettings();await page.getByRole('button',{name:'Reconnect / rescan',exact:true}).click();await page.getByRole('button',{name:'Battery test',exact:true}).click();await playing();await page.waitForTimeout(500);
  await openSettings();const batteryDownloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Export backup',exact:true}).click();const batteryPath=path.join(run,'battery-backup.json');await(await batteryDownloadEvent).saveAs(batteryPath);
  assert.deepEqual((await batteryBytes())[0].slice(0,2),[1,0x37]);assert.equal((await batteryBytes())[0].length,8192);
  await page.close();const batteryContext=await browser.newContext();page=await batteryContext.newPage();watch(page);await page.goto(url);await page.getByRole('button',{name:'Choose folder',exact:true}).click();await page.locator('input[type=file]').setInputFiles(batteryPath);await page.getByRole('button',{name:'Import these records',exact:true}).click();await page.getByRole('status').filter({hasText:'Restored'}).waitFor();
  assert.deepEqual((await batteryBytes())[0].slice(0,2),[1,0x37]);
  // Importing an older review-only backup must leave existing cartridge data intact.
  const oldBackup=JSON.parse(fs.readFileSync(batteryPath,'utf8'));oldBackup.version=1;delete oldBackup.saves;
  await page.locator('input[type=file]').setInputFiles({name:'v1.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(oldBackup))});await page.getByRole('button',{name:'Import these records',exact:true}).click();await page.getByRole('status').filter({hasText:'Restored'}).waitFor();assert.deepEqual((await batteryBytes())[0].slice(0,2),[1,0x37]);
  await addBattery();await page.getByRole('button',{name:'Choose ROM folder',exact:true}).click();await page.getByRole('button',{name:'Battery test',exact:true}).click();await playing();await page.waitForTimeout(500);await page.getByRole('button',{name:'Stop game',exact:true}).click();assert.deepEqual((await batteryBytes())[0].slice(0,2),[2,0x37]);
  console.log('PASS real NES battery writes, export while paused, fresh-profile restore and next-boot SRAM load; v1 preserves saves');
  // Large-library rendering uses synthetic records in this disposable profile only.
  await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('games-reducer:/games-reducer/');r.onsuccess=()=>{const db=r.result,tx=db.transaction('library','readwrite'),store=tx.objectStore('library'),get=store.get('state');get.onsuccess=()=>{const state=get.result,base=state.games[0];state.games=Array.from({length:5000},(_,i)=>({...base,id:i.toString(16).padStart(24,'0'),relative_path:'nes/Fixture '+i+'.nes',title:'Fixture '+String(i).padStart(4,'0'),status:'unreviewed'}));store.put(state,'state');};tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};}));
  await page.goto(url+'games/');await page.getByRole('region',{name:'Games library',exact:true}).waitFor();
  for(const view of ['Grid','List']){await page.getByRole('button',{name:view+' view',exact:true}).click();await page.locator('.catalog-card').first().waitFor();assert.ok(await page.locator('.catalog-card').count()<100);await page.locator('.catalog-viewport').evaluate(el=>{el.scrollTop=el.scrollHeight;});await page.getByRole('button',{name:'Play Fixture 4999',exact:true}).waitFor();assert.ok(await page.locator('.catalog-card').count()<100);}
  await page.getByRole('textbox',{name:'Search library'}).fill('Fixture 1234');await page.getByRole('button',{name:'Play Fixture 1234',exact:true}).waitFor();assert.equal(await page.locator('.catalog-card').count(),1);
  console.log('PASS 5,000-game grid/list virtualization, scrolling to the last game and search');
  assert.deepEqual(apiCalls,[]);assert.deepEqual(errors,[]);
  console.log('PASS verified move and record cleanup on disposable browser files; zero API calls or browser errors');console.log('Evidence:',run);
}catch(error){console.log('Browser errors:',errors);console.log('Alerts:',await page.getByRole('alert').allTextContents());await page.screenshot({path:path.join(run,'failure.png')});console.log('Evidence:',run);throw error;}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
