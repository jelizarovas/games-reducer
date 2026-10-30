import { useEffect, useRef, useState } from 'react';
import {keyboardLabel} from './player-input';

const faceKeys = {
  nes: [['B','KeyZ'],['A','KeyX']],
  megadrive: [['A','KeyA'],['B','KeyS'],['C','KeyD'],['X','KeyQ'],['Y','KeyW'],['Z','KeyE']],
  snes: [['B','KeyX'],['A','KeyS'],['Y','KeyZ'],['X','KeyA'],['L','KeyD'],['R','KeyC']],
};

function Panel({ playerNumber, enabled, system, gameId, onKey }) {
  const node = useRef(null), drag = useRef(null), holds = useRef(new Map()), sent = useRef(new Set());
  const callback = useRef(onKey); callback.current = onKey;
  const [position, setPosition] = useState(null);
  const flush = () => {
    const desired = new Set([...holds.current.values()].filter(h => h.down).map(h => h.code));
    for (const code of sent.current) if (!desired.has(code)) callback.current(code,false,playerNumber);
    for (const code of desired) if (!sent.current.has(code)) callback.current(code,true,playerNumber);
    sent.current = desired;
  };
  const releaseAll = () => {
    for (const hold of holds.current.values()) clearInterval(hold.timer);
    holds.current.clear(); flush();
    node.current?.querySelectorAll('[data-held]').forEach(button => button.removeAttribute('data-held'));
  };
  useEffect(() => {
    releaseAll();
    const blur = () => releaseAll();
    const hidden = () => { if (document.hidden) releaseAll(); };
    window.addEventListener('blur',blur); document.addEventListener('visibilitychange',hidden);
    return () => { releaseAll(); window.removeEventListener('blur',blur); document.removeEventListener('visibilitychange',hidden); };
  }, [enabled, system, gameId]);
  const clamp = (x,y) => {
    const box = node.current.getBoundingClientRect();
    const top = document.querySelector('.topbar')?.getBoundingClientRect().bottom || 0;
    return {x:Math.max(0,Math.min(innerWidth-box.width,x)), y:Math.max(top,Math.min(innerHeight-box.height,y))};
  };
  useEffect(() => {
    const resize = () => { if(node.current) {const box=node.current.getBoundingClientRect();setPosition(clamp(box.x,box.y));} };
    resize();
    window.addEventListener('resize',resize); return () => window.removeEventListener('resize',resize);
  }, []);
  const end = event => {
    const hold = holds.current.get(event.pointerId);
    if (!hold) return;
    clearInterval(hold.timer); holds.current.delete(event.pointerId); flush();
    if (![...holds.current.values()].some(h=>h.button===event.currentTarget)) event.currentTarget.removeAttribute('data-held');
  };
  const button = (label,code,turbo=false,cls='') => <button key={label} className={cls} data-shortcut={playerNumber===1&&!turbo?keyboardLabel(system,code):undefined} aria-label={`Player ${playerNumber} ${label}`} disabled={!enabled} title={turbo ? `Hold for rapid ${label[0]}` : label}
    onPointerDown={event => {
      if (event.button !== 0 || !enabled) return;
      event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
      const hold={code,down:true,button:event.currentTarget}; holds.current.set(event.pointerId,hold); event.currentTarget.dataset.held='true'; flush();
      if(turbo) hold.timer=setInterval(()=>{hold.down=!hold.down;flush();},65);
    }} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} onContextMenu={event=>event.preventDefault()}>{label}</button>;
  const keys = faceKeys[system] || faceKeys.nes;
  return <div ref={node} className={`touch-panel player-${playerNumber}`} aria-label={`Player ${playerNumber} controller`} style={position ? {left:position.x,top:position.y,right:'auto',bottom:'auto'} : undefined}
    onPointerDown={event => {
      if(event.button!==0 || event.target.closest('button'))return;
      event.preventDefault(); const box=node.current.getBoundingClientRect();
      drag.current={id:event.pointerId,x:event.clientX-box.x,y:event.clientY-box.y};event.currentTarget.setPointerCapture(event.pointerId);
    }} onPointerMove={event => {const d=drag.current;if(d?.id===event.pointerId)setPosition(clamp(event.clientX-d.x,event.clientY-d.y));}}
    onPointerUp={event=>{if(drag.current?.id===event.pointerId)drag.current=null;}}
    onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={event=>{if(drag.current?.id===event.pointerId)drag.current=null;}}>
    <div className="panel-grip" aria-hidden="true">P{playerNumber} ···</div>
    <div className="controller-body">
      <div className="touch-dpad">{button('↑','ArrowUp',false,'up')}{button('←','ArrowLeft',false,'left-key')}{button('→','ArrowRight',false,'right-key')}{button('↓','ArrowDown',false,'down')}</div>
      <div className="controller-middle">{button(system==='megadrive'?'Mode':'Select',system==='nes'?'ControlRight':'ShiftRight',false,'small-key')}{button('Start','Enter',false,'small-key')}</div>
      <div className="controller-buttons">
      <div className="touch-turbo">{['B','A'].map(label=>button(`${label} turbo`,keys.find(k=>k[0]===label)[1],true,'small-key'))}</div>
      <div className="touch-face">{keys.map(([label,code])=>button(label,code))}</div>
      </div>
    </div>
  </div>;
}

export function TouchControls({panels,...props}) {
  return <>{panels.p1 && <Panel playerNumber={1} {...props}/>}{panels.p2 && <Panel playerNumber={2} {...props}/>}</>;
}
