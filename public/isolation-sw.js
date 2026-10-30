// The production build injects a versioned, same-scope asset allowlist.
const OFFLINE = /* OFFLINE_CONFIG */ null;
const scope=new URL(self.registration.scope);
const prefix=`games-reducer-offline:${scope.pathname}:`;
const cacheName=prefix+(OFFLINE?.version||'development');
const urlFor=path=>new URL(path,scope).href;
const core=new Set((OFFLINE?.core||[]).map(urlFor));
const covers=new Set((OFFLINE?.covers||[]).map(urlFor));
let coverDownload=null,downloaded=0;

function isolated(response){
  if(response.status===0)return response;
  const headers=new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy','same-origin');
  headers.set('Cross-Origin-Embedder-Policy','require-corp');
  headers.set('Cross-Origin-Resource-Policy','same-origin');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
async function store(cache,url){
  const response=await fetch(url,{cache:'reload'});
  if(!response.ok)throw new Error(`Download failed (${response.status}). Try again when online.`);
  await cache.put(url,response);
}
async function parallel(items,work){
  let index=0,failure;
  await Promise.all(Array.from({length:Math.min(6,items.length)},async()=>{while(index<items.length&&!failure){try{await work(items[index++]);}catch(error){failure=error;}}}));
  if(failure)throw failure;
}
self.addEventListener('install',event=>{
  if(!OFFLINE)return;
  // An incomplete download never replaces the working app. Updates wait.
  event.waitUntil((async()=>{const cache=await caches.open(cacheName);await parallel([...core],url=>store(cache,url));})());
});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  if(OFFLINE){
    const cache=await caches.open(cacheName);
    for(const key of await caches.keys())if(key.startsWith(prefix)&&key!==cacheName){
      const old=await caches.open(key);
      for(const request of await old.keys())if(covers.has(request.url)&&!await cache.match(request))await cache.put(request,await old.match(request));
      await caches.delete(key);
    }
  }
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
  if(request.cache==='only-if-cached'&&request.mode!=='same-origin')return;
  event.respondWith((async()=>{
    if(!OFFLINE)return isolated(await fetch(request));
    // The emulator adds a random query to its audio worklet on every launch.
    // These allowlisted static files have no query-dependent representations.
    const canonical=url.origin+url.pathname;
    let target=core.has(canonical)||covers.has(canonical)?canonical:url.href;
    if(request.mode==='navigate'){
      const relative=url.pathname.slice(scope.pathname.length);
      if(['','index.html','games','games/','games/index.html'].includes(relative))target=urlFor(relative.startsWith('games')?'games/index.html':'index.html');
    }
    if(!core.has(target)&&!covers.has(target))return isolated(await fetch(request));
    const cache=await caches.open(cacheName),hit=await cache.match(target);
    if(hit)return isolated(hit);
    const response=await fetch(target);
    if(response.ok)await cache.put(target,response.clone());
    return isolated(response);
  })());
});
async function status(){
  if(!OFFLINE)return {available:false,ready:false};
  const cache=await caches.open(cacheName),keys=new Set((await cache.keys()).map(r=>r.url));
  return {available:true,ready:[...core].every(url=>keys.has(url)),covers:[...covers].filter(url=>keys.has(url)).length,totalCovers:covers.size,coverBytes:OFFLINE.coverBytes,downloading:!!coverDownload,version:OFFLINE.version};
}
async function broadcast(message){for(const client of await self.clients.matchAll())client.postMessage({source:'games-reducer-offline',...message});}
self.addEventListener('message',event=>{
  if(event.data?.type==='ACTIVATE_UPDATE'){event.waitUntil(self.skipWaiting());return;}
  if(event.data?.type==='OFFLINE_STATUS'){event.waitUntil(status().then(value=>event.ports[0]?.postMessage(value)));return;}
  if(event.data?.type!=='DOWNLOAD_COVERS'||!OFFLINE)return;
  if(!coverDownload)coverDownload=(async()=>{
    const cache=await caches.open(cacheName);downloaded=0;
    await parallel([...covers],async url=>{if(!await cache.match(url))await store(cache,url);downloaded++;if(downloaded%25===0)await broadcast({completed:downloaded,total:covers.size});});
  })().then(()=>{coverDownload=null;return broadcast({done:true});}).catch(error=>{coverDownload=null;return broadcast({error:error.message});});
  event.waitUntil(coverDownload);
});
