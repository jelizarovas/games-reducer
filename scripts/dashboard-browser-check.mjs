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
try{
 await page.goto(url);await page.getByRole('button',{name:'Choose folder',exact:true}).waitFor();assert.equal(new URL(page.url()).pathname,new URL(url).pathname);await page.screenshot({path:path.join(run,'dashboard-empty.png')});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(run,'dashboard-empty-mobile.png')});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.setViewportSize({width:1440,height:900});
 await addRoms();await page.getByRole('button',{name:'Choose folder',exact:true}).click();await page.getByRole('button',{name:'Choose ROM folder',exact:true}).click();await page.getByRole('button',{name:'Play next game',exact:true}).waitFor();assert.equal(await page.getByRole('progressbar',{name:'Collection reviewed',exact:true}).getAttribute('aria-valuenow'),'0');await page.screenshot({path:path.join(run,'dashboard-populated.png')});
 await page.getByRole('button',{name:'Play next game',exact:true}).click();await playing();assert.ok(new URL(page.url()).pathname.endsWith('/play/'));assert.ok(new URL(page.url()).searchParams.has('game'));
 const engine=page.frames().find(f=>f.url().includes('/worker-player.html'));if(engine)await engine.evaluate(()=>window.dashboardSentinel='preserved');
 await home();if(engine)assert.equal(await engine.evaluate(()=>window.reducerRuntimeState().paused),true);await page.getByRole('button',{name:'Play next game',exact:true}).click();await playing();if(engine)assert.equal(await engine.evaluate(()=>window.dashboardSentinel),'preserved');
 await page.getByRole('button',{name:'Keep game',exact:true}).click();await playing();await home();await page.getByText('1 of 3 reviewed',{exact:true}).waitFor();await page.screenshot({path:path.join(run,'dashboard-progress.png')});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(run,'dashboard-progress-mobile.png')});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.getByRole('button',{name:'Backups & settings',exact:true}).click();await page.getByRole('dialog',{name:'Library settings',exact:true}).waitFor();await page.getByRole('button',{name:'Close dialog',exact:true}).click();await page.setViewportSize({width:1440,height:900});
 await page.getByRole('link',{name:'Games',exact:true}).click();await page.getByRole('region',{name:'Games library',exact:true}).waitFor();assert.ok(new URL(page.url()).pathname.endsWith('/games/'));await page.goBack();await page.getByRole('main',{name:'Dashboard',exact:true}).waitFor();await page.goForward();await page.getByRole('region',{name:'Games library',exact:true}).waitFor();
 await page.goto(url+'?game=super-mario-bros&console=nes');await page.getByRole('heading',{name:'Super Mario Bros.',exact:true}).waitFor();assert.ok(new URL(page.url()).pathname.endsWith('/play/'));assert.equal(await page.locator('.nes-canvas').count(),0);console.log('PASS old named bookmarks migrate to /play without launching');
 await context.setOffline(true);
 for(const [route,role,name]of [['','main','Dashboard'],['play/','heading','Super Mario Bros.'],['games/','region','Games library']]){await page.goto(url+route);await page.getByRole(role,{name,exact:true}).waitFor();await page.reload();await page.getByRole(role,{name,exact:true}).waitFor();}
 await context.setOffline(false);assert.deepEqual(errors,[]);assert.deepEqual(apiCalls,[]);console.log('PASS dashboard empty/populated/progress/mobile, next-game launch, active engine preservation, browser history, legacy links and offline direct routes. Evidence:',run);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
