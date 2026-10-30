import {assetUrl} from './assets';
let registration,promptEvent;
let state={ready:false,available:import.meta.env.PROD,installable:false,installed:matchMedia('(display-mode: standalone)').matches,update:false,online:navigator.onLine,covers:0,totalCovers:0,downloading:false,error:''};
const listeners=new Set();
const publish=patch=>{state={...state,...patch};for(const listener of listeners)listener();};
export const subscribePwa=listener=>{listeners.add(listener);return()=>listeners.delete(listener);};
export const getPwaState=()=>state;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();promptEvent=event;publish({installable:true});});
window.addEventListener('appinstalled',()=>{promptEvent=null;publish({installed:true,installable:false});});
window.addEventListener('online',()=>publish({online:true}));
window.addEventListener('offline',()=>publish({online:false}));
export async function refreshOffline(){
  const worker=navigator.serviceWorker?.controller;if(!worker)return;
  const value=await new Promise(resolve=>{const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();resolve(null);},3000);channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data);};worker.postMessage({type:'OFFLINE_STATUS'},[channel.port2]);});
  if(value)publish(value);
}
export async function registerPwa(){
  if(!navigator.serviceWorker)return null;
  try{registration=await navigator.serviceWorker.register(assetUrl('isolation-sw.js'),{scope:import.meta.env.BASE_URL,updateViaCache:'none'});}
  catch(error){registration=await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);if(!registration)throw error;}
  const checkUpdate=()=>publish({update:!!registration.waiting});
  checkUpdate();registration.addEventListener('updatefound',()=>{registration.installing?.addEventListener('statechange',checkUpdate);});
  navigator.serviceWorker.addEventListener('controllerchange',()=>refreshOffline());
  navigator.serviceWorker.addEventListener('message',event=>{
    const message=event.data;if(message?.source!=='games-reducer-offline')return;
    if(message.error)publish({error:message.error,downloading:false});
    else if(message.done){publish({downloading:false});refreshOffline();}
    else publish({downloading:true,covers:message.completed,totalCovers:message.total});
  });
  navigator.serviceWorker.ready.then(()=>refreshOffline());
  return registration;
}
export async function installPwa(){
  if(!promptEvent)return;
  const event=promptEvent;await event.prompt();await event.userChoice;promptEvent=null;publish({installable:false});
}
export async function downloadCovers(){
  publish({downloading:true,error:''});
  navigator.serviceWorker.controller?.postMessage({type:'DOWNLOAD_COVERS'});
  navigator.storage?.persist?.().catch(()=>{});
}
export async function applyUpdate(){
  if(!registration?.waiting)return;
  // Only called after the user stops the game and saves have finished flushing.
  navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true});
  registration.waiting.postMessage({type:'ACTIVATE_UPDATE'});
}
