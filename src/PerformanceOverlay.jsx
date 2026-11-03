import {useEffect,useState} from 'react';
export function PerformanceOverlay({player,paused,gameId}){
 const [reading,setReading]=useState(null);
 useEffect(()=>{let previous=null;setReading(null);const sample=()=>{const value=player.current?.getDiagnostics?.();if(!value)return;const time=value.timestamp??performance.now();if(previous&&time>previous.time){const elapsed=(time-previous.time)/1000;setReading({...value,fps:Math.max(0,(value.frames-previous.frames)/elapsed),displayFps:value.drawn===undefined?null:Math.max(0,(value.drawn-previous.drawn)/elapsed)});}previous={...value,time};};sample();const timer=setInterval(sample,1000);return()=>clearInterval(timer);},[player,gameId,paused]);
 const audio=reading?.audio,gaps=audio?.underruns||0;
 return <output className="performance-overlay" aria-label="Performance counter" title={audio?`Audio buffer: ${Math.round(audio.buffered/audio.sampleRate*1000)} ms · ${gaps} gaps · ${audio.sampleRate} Hz${reading.worker?' · Worker emulation':''}`:'Rendered game frames per second'}>
  <strong>{paused?'Paused':reading?`${Math.round(reading.fps)} FPS`:'Measuring FPS…'}</strong>
  {reading?.speed>1&&!paused&&<span>{reading.speed}×</span>}
  {audio&&<small className={gaps?'performance-warning':''}>Audio {Math.round(audio.buffered/audio.sampleRate*1000)} ms · {gaps} gaps</small>}
 </output>;
}
