import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {Check,Minus,Square,CheckSquare,FlipHorizontal2,Trash2,SkipForward} from 'lucide-react';
import {Dropdown} from './Dropdown';

export function useGameSelection(games){
  const [chosen,setChosen]=useState(()=>new Set()),anchor=useRef(null),press=useRef(null);
  const ids=useMemo(()=>games.map(g=>g.id),[games]);
  const selected=useMemo(()=>new Set(ids.filter(id=>chosen.has(id))),[ids,chosen]);
  const cancel=()=>{if(press.current){clearTimeout(press.current.timer);press.current.cancelled=true;}};
  useEffect(()=>{setChosen(previous=>new Set(ids.filter(id=>previous.has(id))));cancel();},[ids]);
  useEffect(()=>{window.addEventListener('scroll',cancel,true);window.addEventListener('blur',cancel);return()=>{cancel();window.removeEventListener('scroll',cancel,true);window.removeEventListener('blur',cancel);};},[]);
  const toggle=(id,range=false)=>{
    const start=ids.indexOf(anchor.current),end=ids.indexOf(id);
    setChosen(previous=>{const next=new Set(previous);if(range&&start>=0&&end>=0){for(const key of ids.slice(Math.min(start,end),Math.max(start,end)+1))next.add(key);}else if(next.has(id))next.delete(id);else next.add(id);return next;});
    if(!range||start<0)anchor.current=id;
  };
  const clear=()=>{setChosen(new Set());anchor.current=null;};
  return {selected,count:selected.size,total:ids.length,clear,all:()=>setChosen(new Set(ids)),invert:()=>setChosen(new Set(ids.filter(id=>!selected.has(id)))),
    bindings:(game,onPlay,blocked=false)=>({
      'aria-pressed':selected.size?selected.has(game.id):undefined,
      onPointerDown:e=>{if(e.button!==0)return;cancel();const p={id:game.id,x:e.clientX,y:e.clientY,cancelled:false,held:false};press.current=p;p.timer=setTimeout(()=>{if(!p.cancelled){p.held=true;toggle(game.id);}},550);},
      onPointerMove:e=>{const p=press.current;if(p&&Math.hypot(e.clientX-p.x,e.clientY-p.y)>10)cancel();},
      onPointerUp:()=>clearTimeout(press.current?.timer),onPointerCancel:cancel,onPointerLeave:cancel,
      onContextMenu:e=>e.preventDefault(),onDragStart:e=>e.preventDefault(),
      onClick:e=>{const p=press.current;press.current=null;if(p&&(p.held||p.cancelled)){e.preventDefault();return;}if(e.shiftKey||selected.size)toggle(game.id,e.shiftKey);else if(!blocked)onPlay(game);},
      onKeyDown:e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();clear();}if(e.key==='Enter'||e.key===' '){e.preventDefault();press.current=null;if(e.shiftKey||selected.size)toggle(game.id,e.shiftKey);else if(!blocked)onPlay(game);}},
      onKeyUp:e=>e.stopPropagation()
    })};
}

export function SelectionToolbar({selection,onDecide,busy=false}){
  const {count,total}=selection,all=total>0&&count===total;
  return <div className="selection-toolbar" onKeyDown={e=>e.stopPropagation()} onKeyUp={e=>e.stopPropagation()}>
    <button className="selection-toggle" role="checkbox" aria-label={`Select games (${count} selected)`} aria-checked={all?true:count?'mixed':false} disabled={!total} title={count?`${count} selected — clear selection`:'Select all filtered games'} onClick={()=>count?selection.clear():selection.all()}><span className="selection-box">{all?<Check size={14}/>:count?<Minus size={14}/>:null}</span><SelectionCount count={count}/></button>
    <Dropdown menu label="Selection actions" width={200} triggerClassName="selection-menu" options={[...(count?[{value:'keep',label:'Keep selected',icon:<Check size={16}/>,disabled:busy,onSelect:()=>onDecide('keep')},{value:'discard',label:'Mark selected for removal',icon:<Trash2 size={16}/>,disabled:busy,onSelect:()=>onDecide('discard')},{value:'skip',label:'Skip selected',icon:<SkipForward size={16}/>,disabled:busy,onSelect:()=>onDecide('skip')}]:[]),{value:'all',label:'Select all',icon:<CheckSquare size={16}/>,disabled:!total,onSelect:selection.all},{value:'clear',label:'Clear selection',icon:<Square size={16}/>,disabled:!count,onSelect:selection.clear},{value:'invert',label:'Invert selection',icon:<FlipHorizontal2 size={16}/>,disabled:!total,onSelect:selection.invert}]}/>
    <span className="selection-announcement" role="status">{count} games selected</span>
  </div>;
}
export const SelectionMark=({checked})=><span className={`game-selection-mark ${checked?'checked':''}`} aria-hidden="true">{checked&&<Check size={14}/>}</span>;

function SelectionCount({count}){
  const [last,setLast]=useState(count),badge=useRef(null),animation=useRef(null);
  useLayoutEffect(()=>{
    const node=badge.current,previous=animation.current;
    if(!node)return;
    const style=getComputedStyle(node),from={transform:style.transform,opacity:style.opacity};
    previous?.cancel();animation.current=null;
    if(count)setLast(count);
    if(matchMedia('(prefers-reduced-motion: reduce)').matches){if(!count)setLast(0);return;}
    const frames=count?[previous?from:{transform:'scale(.65)',opacity:0},{transform:'scale(1)',opacity:1}]:[from,{transform:'scale(1.12)',opacity:1,offset:.3},{transform:'scale(0)',opacity:0}];
    const running=node.animate(frames,{duration:count?220:260,easing:'ease-out',fill:'both'});animation.current=running;
    running.onfinish=()=>{if(animation.current!==running)return;animation.current=null;if(!count)setLast(0);else running.cancel();};
  },[count]);
  useEffect(()=>()=>animation.current?.cancel(),[]);
  const value=count||last;
  return value?<span ref={badge} className="selection-count" aria-hidden="true"><span key={value}>{value>99?'99+':value}</span></span>:null;
}
