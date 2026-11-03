import workletUrl from './nes-audio-worklet.js?worker&url';

export function createNesAudio(onError){
  const context=new AudioContext({latencyHint:'interactive'});
  let node=null,running=false,silent=false,disposed=false,position=0;
  const left=new Float32Array(2048),right=new Float32Array(2048);
  const update=()=>{position=0;node?.port.postMessage({type:'state',enabled:running&&!silent});};
  const resume=()=>{if(!disposed&&running&&context.state==='suspended')context.resume().catch(error=>{if(!disposed)onError(error);});};
  for(const event of ['keydown','pointerdown','touchstart'])document.addEventListener(event,resume,true);
  const audio={
    sampleRate:context.sampleRate,
    ready:context.audioWorklet.addModule(workletUrl).then(()=>{
      if(disposed)return;
      node=new AudioWorkletNode(context,'games-reducer-nes-audio',{outputChannelCount:[2]});
      node.port.onmessage=event=>{if(event.data.type==='health')audio.stats=event.data;};
      node.onprocessorerror=()=>onError(new Error('NES audio stopped unexpectedly. Restart the game to reconnect audio.'));
      node.connect(context.destination);update();
    }),
    start(){if(disposed||running)return;running=true;update();resume();},
    stop(){if(!running)return;running=false;update();},
    setSilent(value){if(silent===value)return;silent=value;update();},
    writeSample(l,r){if(disposed||!running||silent||!node||context.state!=='running')return;left[position]=l;right[position++]=r;if(position===left.length)audio.flush();},
    flush(){if(position&&node){node.port.postMessage({type:'samples',left:left.slice(0,position),right:right.slice(0,position)});position=0;}},
    destroy(){if(disposed)return;disposed=true;running=false;for(const event of ['keydown','pointerdown','touchstart'])document.removeEventListener(event,resume,true);node?.disconnect();node?.port.close();context.close().catch(()=>{});},
  };
  return audio;
}
