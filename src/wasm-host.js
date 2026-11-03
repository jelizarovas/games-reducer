import {createNesAudio as createAudio} from './nes-audio';
import {assetUrl} from './assets';
import {genesisKeyboard,playerTwoKeys} from './player-input';
const canvas=document.querySelector('canvas');
const base=new URL(assetUrl(`${__ENGINE_DIRECTORY__}/`),location.href).href;
const saves=await import(/* @vite-ignore */base+'save-store.js');
const flushStorage=window.reducerFlushSaves;
let worker,audio,filename,system,aspect=4/3,paused=false,muted=false,speed=1,closed=false,stats={frames:0},saveQueue=Promise.resolve(),saveError;
const requests=new Map(),held=new Map();
const send=(type,extra={})=>parent.postMessage({source:'games-reducer-engine',type,...extra},location.origin);
const command=message=>worker?.postMessage(message);
const fail=error=>send('error',{message:error.message||String(error)});
function fit(){const width=Math.min(innerWidth,innerHeight*aspect);canvas.style.width=`${width}px`;canvas.style.height=`${width/aspect}px`;}
new ResizeObserver(fit).observe(document.body);fit();
window.reducerChannel={current_file_name:()=>filename};
window.reducerRuntimeState=()=>({paused,muted,speed,renderedFrames:stats.frames,timestamp:stats.timestamp,worker:true,audioHealth:audio?.stats,saveStoreUrl:base+'save-store.js'});
function persist(files){
 if(Object.keys(files).length)saveQueue=saveQueue.then(()=>Promise.all(Object.entries(files).map(([ext,bytes])=>saves.writeSaveFile(filename,ext,new Uint8Array(bytes))))).catch(error=>{saveError=error;fail(error);});
 return saveQueue;
}
window.reducerFlushSaves=async()=>{
 if(worker){const requestId=crypto.randomUUID();await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{requests.delete(requestId);reject(new Error('Game save timed out.'));},5000);requests.set(requestId,{resolve,reject,timeout});command({type:'flush',requestId});});}
 await saveQueue;await flushStorage();if(saveError)throw saveError;
};
function fastForward(value){speed=value&&!paused?3:1;audio?.setSilent(muted||speed>1);command({type:'speed',speed});}
function pause(value){paused=value;if(value){held.clear();fastForward(false);audio?.stop();command({type:'pause'});}else{audio?.setSilent(muted);audio?.start();command({type:'resume'});canvas.focus();}}
function key(code,down,source){
 const token=code,sources=held.get(token)||new Set(),before=sources.size>0;
 down?sources.add(source):sources.delete(source);sources.size?held.set(token,sources):held.delete(token);
 if(before===!!sources.size||paused&&down)return;
 const p2=Object.entries(playerTwoKeys).find(([,value])=>value===code);
 command({type:'key',code:p2?p2[0]:code,player:p2?2:1,down:!!sources.size});
}
window.addEventListener('message',async event=>{
 if(event.origin!==location.origin||event.source!==parent||event.data?.source!=='games-reducer')return;
 const m=event.data;
 try{
  if(m.type==='load'){
   if(worker)throw new Error('A game is already loaded.');
   system=m.system;filename=`${m.id}-${m.name}`;window.reducerSaveDatabase=m.saveDatabase;
   const saved=await saves.loadSaveFiles(filename);if(closed)return;
   audio=createAudio(fail,system==='snes'?'SNES':'Genesis');await audio.ready;if(closed)return;
   const channel=new MessageChannel();audio.connectSource(channel.port1,true);
   worker=new Worker(new URL('./wasm-worker.js',import.meta.url),{type:'module'});worker.onerror=fail;
   worker.onmessage=async({data})=>{
    if(closed)return;
    if(data.type==='stats'||data.type==='paused'){stats=data;if(data.aspect&&data.aspect!==aspect){aspect=data.aspect;fit();}}
    if(data.type==='loaded'){send('loaded');if(!paused){audio.setSilent(muted);audio.start();}canvas.focus();}
    if(data.type==='save')persist(data.files);
    if(data.type==='flushed'){const request=requests.get(data.requestId);if(request){clearTimeout(request.timeout);requests.delete(data.requestId);await persist(data.files);saveError?request.reject(saveError):request.resolve();}}
    if(data.type==='state-result'){const r=requests.get(data.requestId);if(r){clearTimeout(r.timeout);requests.delete(data.requestId);if(data.error)r.reject(new Error(data.error));else{try{await persist(data.files||{});await flushStorage();saveError?r.reject(saveError):r.resolve(data.state);}catch(error){r.reject(error);}}}}
    if(data.type==='error')fail(new Error(data.message));
   };
   const offscreen=canvas.transferControlToOffscreen();worker.postMessage({type:'load',base,system,bytes:m.bytes,saved,sampleRate:audio.sampleRate,canvas:offscreen,port:channel.port2,paused},[m.bytes.buffer,offscreen,channel.port2]);
  }
  if(m.type==='pause')pause(true);
  if(m.type==='resume')pause(false);
  if(m.type==='fast-forward')fastForward(m.held);
  if(m.type==='mute'){muted=!!m.muted;audio?.setSilent(muted||speed>1);}
  if(m.type==='key')key(m.code,m.down,'parent');
  if(m.type==='capture-state'||m.type==='restore-state'){
   try{pause(true);const state=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{requests.delete(m.requestId);reject(new Error('Save-state operation timed out.'));},10000);requests.set(m.requestId,{resolve,reject,timeout});command({type:m.type,requestId:m.requestId,state:m.state});});send('state-result',{requestId:m.requestId,state});}
   catch(error){send('state-result',{requestId:m.requestId,error:error.message});}
  }
  if(m.type==='flush-saves'){try{audio?.stop();await window.reducerFlushSaves();send('saves-flushed',{requestId:m.requestId});}catch(error){send('saves-flushed',{requestId:m.requestId,error:error.message});}}
 }catch(error){fail(error);}
});
for(const type of ['keydown','keyup'])window.addEventListener(type,event=>{
 const down=type==='keydown',code=event.code;
 if(code==='AltLeft'||code==='AltRight'){event.preventDefault();send('shortcut-hints',{held:down});return;}
 if(down&&event.altKey&&!event.ctrlKey&&!event.metaKey){event.preventDefault();if(!event.repeat)send('shortcut',{code});return;}
 if(down&&(event.key==='?'||(code==='Slash'&&event.shiftKey))){event.preventDefault();if(!event.repeat)send('shortcuts');return;}
 if(code==='Tab'){event.preventDefault();if(!event.repeat)send('fast-forward',{held:down});return;}
 if(down&&['KeyF','Escape'].includes(code)){event.preventDefault();if(!event.repeat)send(code==='KeyF'?'fullscreen':'review');return;}
 if(event.repeat)return;
 event.preventDefault();const mapped=system==='megadrive'&&Object.hasOwn(genesisKeyboard,code)?genesisKeyboard[code]:code;if(mapped)key(mapped,down,'keyboard');
},true);
window.addEventListener('blur',()=>{for(const [code,sources] of held)if(sources.has('keyboard'))key(code,false,'keyboard');fastForward(false);send('fast-forward',{held:false});send('shortcut-hints',{held:false});});
window.addEventListener('pagehide',()=>{closed=true;worker?.terminate();audio?.destroy();for(const r of requests.values()){clearTimeout(r.timeout);r.reject(new Error('Game closed.'));}requests.clear();});
send('ready');
