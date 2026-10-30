import {useEffect,useRef,useState} from 'react';

export function SidebarResize({width,height,onWidth,onHeight}){
  const drag=useRef(null),[active,setActive]=useState(false);
  const [,update]=useState(0);
  useEffect(()=>{const change=()=>update(v=>v+1);window.addEventListener('resize',change);return()=>window.removeEventListener('resize',change);},[]);
  const mobile=()=>matchMedia('(max-width:900px)').matches;
  const limit=(value,docked)=>Math.round(Math.max(docked?128:224,Math.min(value,docked?Math.max(128,innerHeight-212):Math.min(640,innerWidth*.55))));
  function end(){drag.current=null;setActive(false);}
  return <div className={`sidebar-resize ${active?'dragging':''}`} role="separator" aria-label="Resize game library" aria-orientation={mobile()?'horizontal':'vertical'} aria-valuemin={mobile()?128:224} aria-valuemax={mobile()?Math.max(128,innerHeight-212):Math.min(640,innerWidth*.55)} aria-valuenow={mobile()?height:width} tabIndex={0}
    onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);const bounds=e.currentTarget.parentElement.getBoundingClientRect();drag.current={x:e.clientX,y:e.clientY,width:bounds.width,height:bounds.height,docked:mobile()};setActive(true);}}
    onPointerMove={e=>{const start=drag.current;if(!start)return;start.docked?onHeight(limit(start.height+start.y-e.clientY,true)):onWidth(limit(start.width+e.clientX-start.x,false));}}
    onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}
    onKeyDown={e=>{const docked=mobile(),keys=docked?['ArrowDown','ArrowUp']:['ArrowLeft','ArrowRight'];if(![...keys,'Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();const value=e.key==='Home'?0:e.key==='End'?Infinity:(docked?height:width)+(e.key===keys[0]?-24:24);(docked?onHeight:onWidth)(limit(value,docked));}}/>
}
