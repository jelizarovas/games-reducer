import NES from '../node_modules/jsnes/src/nes.js';
import './nes-mappers.js';
import {fixNesSpriteTiles} from './nes-sprites.js';
import {createNesFrameTimer} from './nes-frame-timer.js';
let nes,timer,ctx,pixels,sourcePort,speed=1,frames=0,drawn=0,lastReport=0,saveTimer=null,output=null;
let samplesL=[],samplesR=[];
const snapshot=()=>nes?.rom.batteryRam?Uint8Array.from(nes.cpu.mem.slice(0x6000,0x8000)):null;
function save(){saveTimer=null;const bytes=snapshot();if(bytes)postMessage({type:'save',bytes},[bytes.buffer]);}
function report(type='stats'){lastReport=performance.now();postMessage({type,frames,drawn,speed,timestamp:lastReport});}
function pause(){timer?.stop();speed=1;for(let port=1;port<=2;port++)for(let button=0;button<8;button++)nes?.buttonUp(port,button);report('paused');}
self.onmessage=({data})=>{
 try{
  if(data.type==='load'){
    sourcePort=data.audioPort;ctx=data.canvas.getContext('2d',{alpha:false});pixels=ctx.createImageData(256,240);
    nes=new NES({sampleRate:data.sampleRate,onFrame:buffer=>{output=buffer;},onAudioSample:(l,r)=>{if(speed===1){samplesL.push(l);samplesR.push(r);}},onBatteryRamWrite:()=>{if(!saveTimer)saveTimer=setTimeout(save,300);}});
    nes.loadROM(data.bytes);fixNesSpriteTiles(nes);
    if(nes.rom.batteryRam&&data.save?.length===8192){nes.rom.batteryRam=Array.from(data.save);nes.mmap.loadBatteryRam();}
    timer=createNesFrameTimer({requestFrame:fn=>setTimeout(()=>fn(performance.now()),4),cancelFrame:clearTimeout,
      onGenerateFrame(){
        for(let i=0;i<speed;i++){nes.frame();frames++;}
        if(samplesL.length){const left=Float32Array.from(samplesL),right=Float32Array.from(samplesR);sourcePort.postMessage({type:'samples',left,right},[left.buffer,right.buffer]);samplesL.length=samplesR.length=0;}
      },
      onWriteFrame(){if(output){for(let i=0;i<61440;i++){const value=output[i],offset=i*4;pixels.data[offset]=value&255;pixels.data[offset+1]=(value>>8)&255;pixels.data[offset+2]=(value>>16)&255;pixels.data[offset+3]=255;}ctx.putImageData(pixels,0,0);drawn++;}if(performance.now()-lastReport>=100)report();}
    });
    postMessage({type:'loaded'});if(!data.paused)timer.start();else report('paused');
  }
  if(data.type==='key'&&nes)nes[data.down?'buttonDown':'buttonUp'](data.player,data.button);
  if(data.type==='pause')pause();
  if(data.type==='resume')timer?.start();
  if(data.type==='speed'){speed=data.held?3:1;samplesL.length=samplesR.length=0;}
  if(data.type==='flush'){pause();clearTimeout(saveTimer);saveTimer=null;const bytes=snapshot();postMessage({type:'flushed',requestId:data.requestId,bytes},bytes?[bytes.buffer]:[]);}
 }catch(error){timer?.stop();postMessage({type:'error',message:error.message});}
};
