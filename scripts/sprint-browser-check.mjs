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
// Extra copies exist only in this disposable test profile.
for(let i=1;i<=3;i++)fixtures.push({...fixtures[2],name:`Sprint fixture ${i}${path.extname(fixtures[2].name)}`});
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
let page=await context.newPage();const errors=[];
const watch=p=>{p.on('console',m=>{if(m.type()==='error')console.log('Browser console:',m.text().slice(0,5000));});p.on('requestfailed',r=>console.log('Failed request:',r.url(),r.failure()?.errorText));p.on('request',r=>{if(new URL(r.url()).pathname.includes('/api/'))apiCalls.push(r.url());});p.on('pageerror',e=>{if(!e.message.includes('Using exceptions for control flow'))errors.push(e.message);});};watch(page);
const openSettings=async()=>{await page.getByRole('button',{name:'More actions',exact:true}).click();await page.getByRole('menuitem',{name:'Library settings',exact:true}).click();};
const playing=()=>page.locator('.screen[data-phase=playing]').waitFor({timeout:45000});
const addRoms=()=>page.evaluate(async files=>{
 const root=await(await navigator.storage.getDirectory()).getDirectoryHandle('roms',{create:true});
 for(const f of files){const dir=await root.getDirectoryHandle(f.system,{create:true}),h=await dir.getFileHandle(f.name,{create:true}),w=await h.createWritable();await w.write(Uint8Array.from(atob(f.bytes),c=>c.charCodeAt(0)));await w.close();}
 window.showDirectoryPicker=async()=>root;
},fixtures);

const home=async()=>{await page.getByRole('button',{name:'More actions',exact:true}).click();await page.getByRole('menuitem',{name:'Home',exact:true}).click();await page.getByRole('main',{name:'Dashboard',exact:true}).waitFor();};

const library=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('games-reducer:/games-reducer/');r.onsuccess=()=>{const db=r.result,q=db.transaction('library').objectStore('library').get('state');q.onsuccess=()=>{db.close();resolve({sprint:q.result.sprint,games:q.result.games.map(({handle,...g})=>g)});};q.onerror=()=>reject(q.error);};r.onerror=()=>reject(r.error);}));
const badge=n=>page.getByRole('button',{name:`Sprint progress: ${n} of 5`,exact:true});
const modal=()=>page.getByRole('dialog',{name:'Sprint',exact:true});
const close=()=>page.getByRole('button',{name:'Close dialog',exact:true}).click();
async function chooseCount(label,status,count){await home();await page.getByRole('button',{name:`${label}: ${count}`,exact:true}).click();await page.getByRole('region',{name:'Games library',exact:true}).waitFor();assert.equal(new URL(page.url()).searchParams.get('filter'),status);assert.equal(await page.locator('.catalog-card').count(),count);}
try{
 await page.goto(url);await page.getByRole('button',{name:'Choose folder',exact:true}).waitFor();await addRoms();await page.getByRole('button',{name:'Choose folder',exact:true}).click();await page.getByRole('button',{name:'Choose ROM folder',exact:true}).click();await page.getByRole('button',{name:'Start sprint',exact:true}).waitFor();
 await chooseCount('To try','unreviewed',6);await page.reload();await page.locator('.catalog-card').first().waitFor();assert.equal(await page.locator('.catalog-card').count(),6);await home();
 await page.getByRole('spinbutton',{name:'Number of sprint games',exact:true}).fill('2');assert.equal(await page.getByRole('button',{name:'Start sprint',exact:true}).isDisabled(),true);assert.equal(await page.getByRole('slider',{name:'Sprint size slider',exact:true}).getAttribute('aria-valuetext'),'5 games');await page.getByRole('slider',{name:'Sprint size slider',exact:true}).press('ArrowRight');assert.equal(await page.getByRole('spinbutton',{name:'Number of sprint games',exact:true}).inputValue(),'6');await page.getByRole('slider',{name:'Sprint size slider',exact:true}).press('ArrowLeft');assert.equal(await page.getByRole('spinbutton',{name:'Number of sprint games',exact:true}).inputValue(),'5');await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('.sprint-setup').screenshot({path:path.join(run,'sprint-controls-mobile.png')});await page.setViewportSize({width:1440,height:900});await page.screenshot({path:path.join(run,'sprint-setup.png')});await page.getByRole('button',{name:'Start sprint',exact:true}).click();await playing();await badge(0).waitFor();const started=(await library()).sprint;assert.equal(started.target,5);
 for(let n=1;n<=4;n++){await page.getByRole('button',{name:'Keep game',exact:true}).click();await badge(n).waitFor();await playing();}assert.equal((await library()).sprint.entries[0].outcome,'keep');await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(run,'sprint-header-mobile.png')});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.setViewportSize({width:1440,height:900});
 await page.reload();await badge(4).waitFor();await badge(4).click();await modal().getByRole('button',{name:'Resume sprint',exact:true}).click();await playing();assert.equal((await library()).sprint.id,started.id);console.log('PASS sprint selection, unique progress, responsive header, reload and resume');
 await openSettings();const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export backup',exact:true}).click();const backup=path.join(run,'active-sprint.json');await(await download).saveAs(backup);assert.equal(JSON.parse(fs.readFileSync(backup,'utf8')).sprint.id,started.id);await close();
 await page.getByRole('button',{name:'Mark game for removal',exact:true}).click();await modal().waitFor();await modal().getByText('Sprint complete!',{exact:true}).waitFor();assert.equal((await library()).sprint.status,'completed');assert.equal(await page.locator('.emulator-frame,.nes-canvas').count(),0);await page.screenshot({path:path.join(run,'sprint-results.png')});
 await modal().getByRole('button',{name:'Sprint Marked for removal: 1',exact:true}).click();assert.equal(new URL(page.url()).searchParams.get('filter'),'discard');await page.locator('.catalog-card').first().waitFor();assert.equal(await page.locator('.catalog-card').count(),1);await page.reload();await page.locator('.catalog-card').first().waitFor();assert.equal(await page.locator('.catalog-card').count(),1);
 await page.getByRole('button',{name:'More actions',exact:true}).click();await page.getByRole('menuitem',{name:'Undo last decision',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.sprint-badge')?.textContent.includes('4/5'));await home();await page.getByRole('button',{name:'Resume sprint',exact:true}).click();await playing();await page.getByRole('button',{name:'Try game later',exact:true}).click();await modal().getByText('Sprint complete!',{exact:true}).waitFor();assert.equal((await library()).sprint.entries[4].outcome,'skip');await close();
 await chooseCount('Kept','keep',4);await chooseCount('Later','skip',1);await chooseCount('Marked for removal','discard',0);await chooseCount('To try','unreviewed',1);
 await page.getByRole('button',{name:'More actions',exact:true}).click();await page.getByRole('button',{name:'Kept: 4',exact:true}).click();assert.equal(new URL(page.url()).searchParams.get('filter'),'keep');assert.equal(await page.getByRole('menu').count(),0);await page.goBack();await page.waitForFunction(()=>new URL(location.href).searchParams.get('filter')==='unreviewed');assert.equal(await page.locator('.catalog-card').count(),1);console.log('PASS exact completion, undo/review, all progress links, menu clickaway and filter history');
 await home();assert.equal(await page.getByRole('button',{name:'Start sprint',exact:true}).isDisabled(),true);await page.getByText('At least 5 are needed for a sprint.',{exact:false}).waitFor();console.log('PASS sprint start disabled below five eligible games');
 await page.close();const fresh=await browser.newContext({viewport:{width:1440,height:900}});page=await fresh.newPage();watch(page);await page.goto(url);await page.getByRole('button',{name:'Choose folder',exact:true}).click();await page.locator('input[type=file]').setInputFiles(backup);await page.getByRole('button',{name:'Import these records',exact:true}).click();await page.getByRole('status').filter({hasText:'Restored'}).waitFor();assert.equal((await library()).sprint.id,started.id);await addRoms();await page.getByRole('button',{name:'Choose ROM folder',exact:true}).click();await page.getByRole('button',{name:'Resume sprint',exact:true}).click();await playing();await badge(4).waitFor();await page.getByRole('button',{name:'Mark game for removal',exact:true}).click();await modal().getByText('Sprint complete!',{exact:true}).waitFor();await close();await page.getByRole('button',{name:'More actions',exact:true}).click();await page.getByRole('menuitem',{name:'Undo last decision',exact:true}).click();await home();await page.getByRole('button',{name:'To try: 2',exact:true}).click();await page.getByRole('region',{name:'Games library',exact:true}).getByRole('checkbox',{name:'Select games (0 selected)',exact:true}).click();await page.getByRole('button',{name:'Try later (2 selected games)',exact:true}).click();await modal().getByText('Sprint complete!',{exact:true}).waitFor();const batch=(await library()).sprint;assert.equal(batch.entries.filter(e=>e.outcome).length,5);assert.equal(batch.entries.filter(e=>e.outcome==='skip').length,1);console.log('PASS batch review counts only sprint members and ends at the target');assert.deepEqual(errors,[]);console.log('PASS active sprint backup imports into a fresh browser and finishes at the original target. Evidence:',run);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
