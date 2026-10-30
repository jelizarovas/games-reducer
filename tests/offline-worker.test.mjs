import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const template=fs.readFileSync(new URL('../public/isolation-sw.js',import.meta.url),'utf8');
const base='https://example.test/games-reducer/';
function cacheStore(){
  const stores=new Map(),url=key=>typeof key==='string'?key:key.url;
  return {keys:async()=>[...stores.keys()],delete:async key=>stores.delete(key),open:async name=>{
    if(!stores.has(name))stores.set(name,new Map());const values=stores.get(name);
    return {put:async(key,response)=>values.set(url(key),response.clone()),match:async key=>values.get(url(key))?.clone(),keys:async()=>[...values.keys()].map(url=>({url}))};
  }};
}
function worker({version='one',caches=cacheStore(),fail}={}){
  const events={},calls=[],messages=[];let offline=false,skips=0,claims=0;
  const self={registration:{scope:base},addEventListener:(name,callback)=>events[name]=callback,skipWaiting:async()=>skips++,clients:{claim:async()=>claims++,matchAll:async()=>[{postMessage:message=>messages.push(message)}]}};
  vm.runInNewContext(template.replace('/* OFFLINE_CONFIG */ null',JSON.stringify({version,core:['index.html','games/index.html','engine/core.wasm'],covers:['catalog/cover.webp'],coverBytes:10})),{self,URL,Response,Headers,caches,fetch:async input=>{const url=typeof input==='string'?input:input.url;calls.push(url);if(offline)throw new Error('Offline');return new Response(url,{status:fail?.(url)?503:200});}});
  const dispatch=async(name,data={})=>{let result;events[name]({...data,waitUntil:p=>result=p,respondWith:p=>result=p});return result;};
  return {dispatch,caches,calls,messages,get skips(){return skips;},get claims(){return claims;},offline:()=>offline=true,request:(path,mode='cors')=>dispatch('fetch',{request:{url:base+path,method:'GET',mode}}),status:async()=>{let value;await dispatch('message',{data:{type:'OFFLINE_STATUS'},ports:[{postMessage:v=>value=v}]});return value;}};
}
test('offline navigation and emulator assets retain isolation headers; ROMs never enter cache',async()=>{
  const w=worker();await w.dispatch('install');await w.dispatch('activate');w.offline();
  for(const path of ['?filter=puzzle','games/','games']){const response=await w.request(path,'navigate');assert.equal(response.status,200);assert.equal(response.headers.get('Cross-Origin-Embedder-Policy'),'require-corp');assert.match(await response.text(),/index.html$/);}
  assert.equal((await w.request('engine/core.wasm')).status,200);
  assert.equal((await w.request('engine/core.wasm?r=123456')).status,200);
  await assert.rejects(w.request('private-game.nes'),/Offline/);
  const cache=await w.caches.open((await w.caches.keys())[0]);assert.equal(await cache.match(base+'private-game.nes'),undefined);
  assert.equal((await w.status()).ready,true);
});
test('failed installation cannot activate or delete the previous working version',async()=>{
  const old=worker();await old.dispatch('install');await old.dispatch('activate');
  const next=worker({version:'two',caches:old.caches,fail:url=>url.endsWith('.wasm')});
  await assert.rejects(next.dispatch('install'),/Download failed/);assert.equal(next.claims,0);assert.equal(next.skips,0);old.offline();assert.equal((await old.request('index.html')).status,200);
});
test('updates wait, preserve covers, and only clean this application scope',async()=>{
  const old=worker();await old.dispatch('install');await old.dispatch('activate');await old.request('catalog/cover.webp');
  await old.caches.open('other-site-cache');const next=worker({version:'two',caches:old.caches});await next.dispatch('install');
  assert.equal(next.skips,0);assert.equal(next.claims,0);
  await next.dispatch('message',{data:{type:'ACTIVATE_UPDATE'}});assert.equal(next.skips,1);await next.dispatch('activate');
  assert.ok((await next.caches.keys()).includes('other-site-cache'));assert.equal((await next.status()).covers,1);next.offline();assert.equal((await next.request('catalog/cover.webp')).status,200);
});
