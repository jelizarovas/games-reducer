// One animation loop owns NES pacing. Never queue delayed catch-up frames:
// they can run after a later animation frame and put the old timer ahead of time.
export function createNesFrameTimer({onGenerateFrame,onWriteFrame,requestFrame=callback=>window.requestAnimationFrame(callback),cancelFrame=id=>window.cancelAnimationFrame(id)}){
  const interval=1000/60.098;
  let pending=null,last=null,accumulated=0,running=false,generation=0;
  const timer={onGenerateFrame,onWriteFrame,
    start(){if(running)return;running=true;last=null;accumulated=0;const token=++generation;pending=requestFrame(time=>tick(time,token));},
    stop(){running=false;generation++;if(pending!==null)cancelFrame(pending);pending=null;last=null;accumulated=0;},
  };
  function tick(time,token){
    if(!running||token!==generation)return;
    pending=null;
    if(last!==null){
      // Drop excess debt after a stalled tab instead of racing to catch up.
      accumulated=Math.min(interval*2,accumulated+Math.max(0,time-last));
      let frames=0;
      while(accumulated+1e-7>=interval&&running&&token===generation){accumulated-=interval;timer.onGenerateFrame();frames++;}
      if(frames&&running&&token===generation)timer.onWriteFrame();
    }
    last=time;
    if(running&&token===generation)pending=requestFrame(next=>tick(next,token));
  }
  return timer;
}
