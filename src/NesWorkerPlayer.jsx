import {forwardRef,useEffect,useImperativeHandle,useRef} from 'react';
import {createNesAudio} from './nes-audio';
import {readRom,readCartridgeSave,writeCartridgeSave} from './browser-library';
const buttons={KeyX:0,KeyZ:1,ControlRight:2,Enter:3,ArrowUp:4,ArrowDown:5,ArrowLeft:6,ArrowRight:7};
export const NesWorkerPlayer=forwardRef(function NesWorkerPlayer({game,paused,muted,onLoaded,onError},ref){
 const canvas=useRef(null),container=useRef(null),worker=useRef(null),audio=useRef(null),held=useRef(new Map()),requests=useRef(new Map());
 const latest=useRef({});latest.current={paused,muted,onLoaded,onError};
 const speed=useRef(1),stats=useRef({frames:0,drawn:0}),saveQueue=useRef(Promise.resolve()),saveError=useRef(null);
 const send=message=>worker.current?.postMessage(message);
 const persist=bytes=>{if(bytes)saveQueue.current=saveQueue.current.then(()=>writeCartridgeSave(`${game.id}-nes`,{sav:bytes})).catch(error=>{saveError.current=error;latest.current.onError(error.message);});return saveQueue.current;};
 useImperativeHandle(ref,()=>({
  focus(){canvas.current?.focus();},
  getDiagnostics(){return {...stats.current,speed:speed.current,audio:audio.current?.stats,worker:true};},
  fastForward(held){speed.current=held?3:1;if(container.current)container.current.dataset.speed=speed.current;audio.current?.setSilent(latest.current.muted||held);send({type:'speed',held});},
  key(code,down,source='physical',player=1){if(buttons[code]===undefined)return;const token=`${player}|${code}`,sources=held.current.get(token)||new Set(),before=sources.size>0;down?sources.add(source):sources.delete(source);sources.size?held.current.set(token,sources):held.current.delete(token);if(before!==Boolean(sources.size))send({type:'key',button:buttons[code],player,down:!!sources.size});},
  async flushSaves(){
   if(!worker.current)return;
   audio.current?.stop();const requestId=crypto.randomUUID();
   await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{requests.current.delete(requestId);reject(new Error('NES save timed out. Try stopping the game again.'));},5000);requests.current.set(requestId,{resolve,reject,timer});send({type:'flush',requestId});});
   await saveQueue.current;if(saveError.current)throw saveError.current;
  }
 }),[game.id]);
 useEffect(()=>{
  let cancelled=false,instance,output;
  const fail=error=>{if(!cancelled)latest.current.onError(error.message||String(error));};
  (async()=>{try{
   const [{bytes},saved]=await Promise.all([readRom(game.id),readCartridgeSave(`${game.id}-nes`)]);if(cancelled)return;
   output=createNesAudio(fail);audio.current=output;await output.ready;if(cancelled)return;
   const channel=new MessageChannel();output.connectSource(channel.port1);
   instance=new Worker(new URL('./nes-worker.js',import.meta.url),{type:'module'});worker.current=instance;
   instance.onerror=fail;
   instance.onmessage=async({data})=>{
    if(cancelled||!container.current)return;
    if(data.type==='stats'||data.type==='paused'){stats.current=data;container.current.dataset.frames=data.frames;container.current.dataset.paused=data.type==='paused'?'true':'false';}
    if(data.type==='loaded'){latest.current.onLoaded();if(!latest.current.paused){output.setSilent(latest.current.muted);output.start();}}
    if(data.type==='save')persist(data.bytes);
    if(data.type==='flushed'){const request=requests.current.get(data.requestId);if(request){clearTimeout(request.timer);requests.current.delete(data.requestId);await persist(data.bytes);saveError.current?request.reject(saveError.current):request.resolve();}}
    if(data.type==='error')fail(new Error(data.message));
   };
   const offscreen=canvas.current.transferControlToOffscreen();
   instance.postMessage({type:'load',bytes,save:saved.sav,canvas:offscreen,audioPort:channel.port2,sampleRate:output.sampleRate,paused:latest.current.paused},[bytes.buffer,offscreen,channel.port2]);
  }catch(error){fail(error);}})();
  return()=>{cancelled=true;instance?.terminate();output?.destroy();worker.current=null;audio.current=null;for(const r of requests.current.values()){clearTimeout(r.timer);r.reject(new Error('Game closed before save completed.'));}requests.current.clear();};
 },[game.id]);
 useEffect(()=>{if(paused){held.current.clear();speed.current=1;if(container.current)container.current.dataset.speed=1;audio.current?.stop();send({type:'pause'});}else{audio.current?.setSilent(muted);audio.current?.start();send({type:'resume'});}},[paused]);
 useEffect(()=>{audio.current?.setSilent(muted||speed.current>1);},[muted]);
 return <div className="nes-canvas" data-worker="true" data-muted={muted} data-speed="1" ref={container}><canvas ref={canvas} width="256" height="240" tabIndex="0"/></div>;
});
