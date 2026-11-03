import {decodeRom} from '../src/browser-core.js';
import {unpackState} from '../src/save-state-codec.js';
import {chromium} from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const prefix='/games-reducer/',out=path.resolve('dist');
fs.mkdirSync('test-results/browser',{recursive:true});
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

  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.webmanifest':'application/manifest+json'};
  // Deliberately no COOP/COEP headers: this reproduces GitHub Pages hosting.
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=process.env.BROWSER_URL||`http://127.0.0.1:${server.address().port}${prefix}`;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
await context.addInitScript(()=>{const send=Worker.prototype.postMessage;Worker.prototype.postMessage=function(message,...rest){if(message?.type?.endsWith('-state'))setTimeout(()=>send.call(this,message,...rest),300);else send.call(this,message,...rest);};});
let page=await context.newPage();const errors=[];
const watch=p=>{p.on('console',m=>{if(m.type()==='error')console.log('Browser console:',m.text().slice(0,5000));});p.on('requestfailed',r=>console.log('Failed request:',r.url(),r.failure()?.errorText));p.on('request',r=>{if(new URL(r.url()).pathname.includes('/api/'))apiCalls.push(r.url());});p.on('pageerror',e=>{if(!e.message.includes('Using exceptions for control flow'))errors.push(e.message);});};watch(page);
const openSettings=async()=>{await page.getByRole('button',{name:'More actions',exact:true}).click();await page.getByRole('menuitem',{name:'Library settings',exact:true}).click();};
const playing=()=>page.locator('.screen[data-phase=playing]').waitFor({timeout:45000});
const addRoms=()=>page.evaluate(async files=>{
 const root=await(await navigator.storage.getDirectory()).getDirectoryHandle('roms',{create:true});
 for(const f of files){const dir=await root.getDirectoryHandle(f.system,{create:true}),h=await dir.getFileHandle(f.name,{create:true}),w=await h.createWritable();await w.write(Uint8Array.from(atob(f.bytes),c=>c.charCodeAt(0)));await w.close();}
 window.showDirectoryPicker=async()=>root;
},fixtures);
const states=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('games-reducer:/games-reducer/');r.onsuccess=()=>{const db=r.result,q=db.transaction('states').objectStore('states').getAll();q.onsuccess=()=>{db.close();resolve(q.result);};q.onerror=()=>reject(q.error);};r.onerror=()=>reject(r.error);}));
const names={nes:'Super Mario Bros.',snes:'Super Mario World',megadrive:'Sonic The Hedgehog 2'};
async function launch(system){await page.getByRole('button',{name:names[system],exact:true}).click();await playing();await page.waitForTimeout(600);await page.getByRole('button',{name:'Save states',exact:true}).click();await page.getByRole('dialog',{name:'Save states',exact:true}).waitFor();}
async function stop(){await page.getByRole('button',{name:'Stop game',exact:true}).click();await page.locator('.screen[data-phase=ready]').waitFor();}
try{
 await page.goto(url);await page.getByRole('button',{name:'Choose folder',exact:true}).waitFor();await addRoms();await page.getByRole('button',{name:'Choose folder',exact:true}).click();await page.getByRole('button',{name:'Choose ROM folder',exact:true}).click();await page.locator('.game-row').first().waitFor();
 for(const system of ['nes','snes','megadrive']){
  await launch(system);await page.getByRole('button',{name:'Save slot 1',exact:true}).click();await page.keyboard.press('Escape');await page.keyboard.press('Shift+Slash');await page.getByRole('dialog',{name:'Save states',exact:true}).waitFor();await page.getByRole('status').filter({hasText:'Saved slot 1.'}).waitFor();
  const saved=(await states()).find(s=>s.system===system);assert.ok(saved?.data.length>100);assert.equal(saved.slot,1);await page.screenshot({path:path.join(run,`${system}-save-states.png`)});
  await page.getByRole('button',{name:'Load slot 1',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await playing();await page.waitForTimeout(500);await stop();console.log(`PASS ${system} real game saves and resumes through header controls`);
 }
 await openSettings();const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Export backup',exact:true}).click();const file=path.join(run,'state-backup.json');await(await downloaded).saveAs(file);const backup=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(backup.version,3);assert.equal(backup.states.length,3);const before=await states();await page.close();
 const fresh=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});page=await fresh.newPage();watch(page);await page.goto(url);await page.getByRole('button',{name:'Choose folder',exact:true}).click();await page.locator('input[type=file]').setInputFiles(file);await page.getByRole('button',{name:'Import these records',exact:true}).click();await page.getByRole('status').filter({hasText:'Restored'}).waitFor();assert.deepEqual(await states(),before);
 await addRoms();await page.getByRole('button',{name:'Choose ROM folder',exact:true}).click();
 for(const system of ['nes','snes','megadrive']){await launch(system);assert.equal(await page.getByRole('button',{name:'Load slot 1',exact:true}).isEnabled(),true);await page.getByRole('button',{name:'Load slot 1',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await playing();await page.waitForTimeout(300);await stop();console.log(`PASS ${system} portable state loads in a fresh browser profile`);}
 await openSettings();const oldFile=path.join(run,'old-backup.json');fs.writeFileSync(oldFile,JSON.stringify({...backup,version:2,states:undefined}));await page.locator('input[type=file]').setInputFiles(oldFile);await page.getByRole('button',{name:'Import these records',exact:true}).click();await page.getByRole('status').filter({hasText:'Restored'}).waitFor();assert.deepEqual(await states(),before);console.log('PASS version-two import preserves existing state slots');
 const badFile=path.join(run,'damaged-backup.json');fs.writeFileSync(badFile,JSON.stringify({...backup,states:backup.states.map((s,i)=>i? s:{...s,digest:'0'.repeat(64)})}));await page.locator('input[type=file]').setInputFiles(badFile);await page.getByRole('button',{name:'Import these records',exact:true}).click();await page.getByText('Save state is damaged.',{exact:true}).waitFor();assert.deepEqual(await states(),before);console.log('PASS damaged snapshot backup is rejected without changing saved slots');

 // Exercise the actual NES worker protocol while paused, so a restored CPU/framebuffer
 // can be compared exactly rather than relying on a screenshot after it has resumed.
 const nesFixture=fixtures.find(f=>f.system==='nes');const rom=decodeRom(Buffer.from(nesFixture.bytes,'base64'),nesFixture.name,'nes').bytes;
 const workerFile=fs.readdirSync(path.join(out,'assets')).find(n=>n.startsWith('nes-worker-'));
 const snapshots=await page.evaluate(async({workerUrl,rom})=>{
  const w=new Worker(workerUrl,{type:'module'}),channel=new MessageChannel(),canvas=new OffscreenCanvas(256,240),pending=new Map();let loaded;
  const ready=new Promise((resolve,reject)=>{loaded={resolve,reject};});
  w.onmessage=({data})=>{if(data.type==='loaded')loaded.resolve();if(data.type==='error')loaded.reject(new Error(data.message));if(data.type==='state-result'){const r=pending.get(data.requestId);pending.delete(data.requestId);data.error?r.reject(new Error(data.error)):r.resolve(data.state);}};
  const request=(type,state)=>new Promise((resolve,reject)=>{const requestId=crypto.randomUUID();pending.set(requestId,{resolve,reject});w.postMessage({type,requestId,state});});
  try{
   const bytes=new Uint8Array(rom);w.postMessage({type:'load',bytes,canvas,audioPort:channel.port2,sampleRate:44100,paused:true},[bytes.buffer,canvas,channel.port2]);await ready;
   w.postMessage({type:'resume'});await new Promise(r=>setTimeout(r,400));const first=await request('capture-state');
   w.postMessage({type:'resume'});await new Promise(r=>setTimeout(r,300));const advanced=await request('capture-state');
   await request('restore-state',first);const restored=await request('capture-state');
   let rejected=false;try{await request('restore-state',{...first,romHash:'0'.repeat(64)});}catch{rejected=true;}
   const unchanged=await request('capture-state');return {first,advanced,restored,unchanged,rejected};
  }finally{w.terminate();channel.port1.close();}
 },{workerUrl:url+'assets/'+workerFile,rom:Array.from(rom)});
 const json=async state=>JSON.parse(new TextDecoder().decode(await unpackState(state,'nes',state.romHash)));
 const [first,advanced,restored,unchanged]=await Promise.all(['first','advanced','restored','unchanged'].map(k=>json(snapshots[k])));
 assert.notDeepEqual(advanced.cpu,first.cpu);assert.deepEqual(restored.cpu,first.cpu);assert.deepEqual(restored.ppu.buffer,first.ppu.buffer);assert.equal(restored.papu.sampleRate,44100);assert.ok(snapshots.rejected);assert.deepEqual(unchanged.cpu,restored.cpu);console.log('PASS NES exact CPU/framebuffer restoration and wrong-ROM rejection through actual worker');
 assert.deepEqual(errors,[]);console.log('Save-state browser checks passed. Evidence:',run);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
