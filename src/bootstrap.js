import {registerPwa} from './pwa';
async function start(){
  if(!window.isSecureContext||!window.showDirectoryPicker)throw new Error('Open this site in desktop Edge or Chrome over HTTPS to choose your ROM folder.');
  if(import.meta.env.PROD||!crossOriginIsolated)await registerPwa();
  if(!crossOriginIsolated){
    if(!navigator.serviceWorker)throw new Error('This browser cannot start the game engine. Use desktop Edge or Chrome.');
    document.getElementById('root').textContent='Preparing Games Reducer for offline use…';
    await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Offline setup could not finish. Reconnect to the internet and try again.')),120000))]);
    if(!navigator.serviceWorker.controller)await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Browser setup timed out. Reload to try again.')),10000);
      navigator.serviceWorker.addEventListener('controllerchange',()=>{clearTimeout(timer);resolve();},{once:true});
    });
    const key=`games-reducer-isolation:${import.meta.env.BASE_URL}`;
    if(sessionStorage.getItem(key))throw new Error('Browser isolation is unavailable. Open the site directly in Edge or Chrome, rather than inside another app.');
    sessionStorage.setItem(key,'1');location.reload();return;
  }
  sessionStorage.removeItem(`games-reducer-isolation:${import.meta.env.BASE_URL}`);
  await import('./main.jsx');
}
start().catch(error=>{
  const root=document.getElementById('root');root.style.cssText='font:16px system-ui;padding:32px;color:#e0e3eb;background:#1b1e24;min-height:100vh';
  const heading=document.createElement('h1');heading.textContent='Games Reducer';
  const text=document.createElement('p');text.textContent=error.message;
  const retry=document.createElement('button');retry.textContent='Try again';retry.onclick=()=>{sessionStorage.removeItem(`games-reducer-isolation:${import.meta.env.BASE_URL}`);location.reload();};
  root.replaceChildren(heading,text,retry);
});
