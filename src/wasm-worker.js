import {createNesFrameTimer as createFrameTimer} from './nes-frame-timer';
let core,timer,canvas,ctx,port,speed=1,frames=0,drawn=0,lastReport=0,lastSave=0,desiredPaused=false,audioBuffered=null;
function report(type='stats'){lastReport=performance.now();postMessage({type,frames,drawn,speed,timestamp:lastReport,aspect:core?.aspect()});}
function saves(){return core?JSON.parse(core.take_saves()):{};}
function pause(){timer?.stop();speed=1;core?.release_keys();report('paused');}
self.onmessage=async({data})=>{
 try{
  if(data.type==='load'){
   desiredPaused=data.paused;
   const {default:init,WorkerCore}=await import(/* @vite-ignore */data.base+'worker/reducer_worker.js');await init();
   core=new WorkerCore(data.system,data.bytes,data.sampleRate,JSON.stringify(Object.fromEntries(Object.entries(data.saved).map(([key,value])=>[key,Array.from(value)]))));
   canvas=data.canvas;ctx=canvas.getContext('2d',{alpha:false});port=data.port;port.onmessage=({data:health})=>{if(health.type==='health')audioBuffered=health.enabled&&health.primed?health.buffered:null;};
   timer=createFrameTimer({frameRate:()=>core.fps(),requestFrame:fn=>setTimeout(()=>fn(performance.now()),4),cancelFrame:clearTimeout,
    onGenerateFrame(){
     for(let n=0;n<speed;n++){core.frame();frames++;if(speed===1&&audioBuffered!==null)core.adjust_audio(audioBuffered);}
     const interleaved=core.take_audio();
     if(speed===1&&interleaved.length){const left=new Float32Array(interleaved.length/2),right=new Float32Array(left.length);for(let i=0;i<left.length;i++){left[i]=interleaved[i*2];right[i]=interleaved[i*2+1];}port.postMessage({type:'samples',left,right},[left.buffer,right.buffer]);}
    },
    onWriteFrame(){
     const width=core.width(),height=core.height();if(width&&height){if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;ctx.putImageData(new ImageData(new Uint8ClampedArray(core.pixels()),width,height),0,0);drawn++;}
     const now=performance.now();if(now-lastReport>=100)report();if(now-lastSave>=300){lastSave=now;const files=saves();if(Object.keys(files).length)postMessage({type:'save',files});}
    }
   });
   postMessage({type:'loaded'});if(!desiredPaused)timer.start();else report('paused');
  }
  if(data.type==='key')core?.key(data.code,data.down,data.player);
  if(data.type==='pause'){desiredPaused=true;pause();}
  if(data.type==='resume'){desiredPaused=false;timer?.start();}
  if(data.type==='speed')speed=data.speed===3?3:1;
  if(data.type==='flush'){pause();postMessage({type:'flushed',requestId:data.requestId,files:saves()});}
 }catch(error){timer?.stop();postMessage({type:'error',message:error.message||String(error)});}
};
