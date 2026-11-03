// Runs on the audio thread; emulation remains paced by the video frame timer.
class NesAudioProcessor extends AudioWorkletProcessor {
  constructor(){
    super();this.capacity=Math.ceil(sampleRate*.25);this.prefill=Math.ceil(sampleRate*.05);this.fadeLength=Math.max(1,Math.round(sampleRate*.004));
    this.left=new Float32Array(this.capacity);this.right=new Float32Array(this.capacity);this.read=0;this.write=0;this.count=0;this.enabled=false;this.primed=false;this.fadeIn=0;this.tail=0;this.lastL=0;this.lastR=0;this.tailL=0;this.tailR=0;this.underruns=0;this.overruns=0;this.report=0;
    this.port.onmessage=({data})=>{
      if(data.type==='source'){this.source?.close();this.source=data.port;this.source.onmessage=this.port.onmessage;}
      if(data.type==='state'){this.enabled=data.enabled;this.read=this.write=this.count=0;this.primed=false;this.beginFade();}
      if(data.type==='samples'&&this.enabled){
        for(let i=0;i<data.left.length;i++){
          if(this.count===this.capacity){this.read=(this.read+1)%this.capacity;this.count--;this.overruns++;this.fadeIn=0;}
          this.left[this.write]=data.left[i];this.right[this.write]=data.right[i];this.write=(this.write+1)%this.capacity;this.count++;
        }
      }
    };
  }
  beginFade(){this.tail=this.fadeLength;this.tailL=this.lastL;this.tailR=this.lastR;}
  process(inputs,outputs){
    const out=outputs[0];if(!out?.[0]||!out[1])return true;
    if(this.enabled&&!this.primed&&this.count>=this.prefill){this.primed=true;this.fadeIn=0;this.tail=0;}
    for(let i=0;i<out[0].length;i++){
      if(this.primed&&!this.count){this.primed=false;this.underruns++;this.beginFade();}
      let left=0,right=0;
      if(this.enabled&&this.primed){const gain=Math.min(1,++this.fadeIn/this.fadeLength);left=this.left[this.read]*gain;right=this.right[this.read]*gain;this.read=(this.read+1)%this.capacity;this.count--;}
      else if(this.tail){const gain=--this.tail/this.fadeLength;left=this.tailL*gain;right=this.tailR*gain;}
      out[0][i]=this.lastL=left;out[1][i]=this.lastR=right;
    }
    this.report+=out[0].length;
    if(this.report>=sampleRate){this.report=0;this.port.postMessage({type:'health',sampleRate,buffered:this.count,underruns:this.underruns,overruns:this.overruns});}
    return true;
  }
}
registerProcessor('games-reducer-nes-audio',NesAudioProcessor);
