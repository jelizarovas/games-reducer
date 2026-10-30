import {useLayoutEffect,useRef,useState} from 'react';
import {Gamepad2,Check,Trash2} from 'lucide-react';
import {cardDetails} from './library-view';
import {thumbnail} from './assets';
import {isBlocked} from './nes-compatibility';

// Fixed row/card extents give continuous scrolling without shifting the viewport
// when preceding games enter the rendered window.
export function GameList({games,selected,onPlay,busy,loading,resetKey,view='list'}) {
  const viewport=useRef(null),previousKey=useRef(resetKey);
  const [horizontal,setHorizontal]=useState(()=>matchMedia('(max-width:900px)').matches);
  const [offset,setOffset]=useState(0),[extent,setExtent]=useState(800),[width,setWidth]=useState(256);
  const columns=!horizontal&&view==='grid'?Math.max(2,Math.floor(width/140)):1;
  const itemSize=horizontal?(view==='grid'?112:240):view==='grid'?218:64;
  useLayoutEffect(()=>{
    const media=matchMedia('(max-width:900px)');
    const measure=()=>{setHorizontal(media.matches);setWidth(viewport.current.clientWidth);setExtent(media.matches?viewport.current.clientWidth:viewport.current.clientHeight);setOffset(media.matches?viewport.current.scrollLeft:viewport.current.scrollTop);};
    const observer=new ResizeObserver(measure);observer.observe(viewport.current);media.addEventListener('change',measure);measure();
    return()=>{observer.disconnect();media.removeEventListener('change',measure);};
  },[]);
  useLayoutEffect(()=>{
    const list=viewport.current,index=games.findIndex(g=>g.id===selected),position=horizontal?list.scrollLeft:list.scrollTop,view=horizontal?list.clientWidth:list.clientHeight;
    const changed=previousKey.current!==resetKey;previousKey.current=resetKey;
    let next=position;
    if(changed || index<0)next=0;
    else {const row=Math.floor(index/columns);if(row*itemSize<position || (row+1)*itemSize>position+view)next=Math.max(0,row*itemSize-(view-itemSize)/2);}
    if(horizontal){list.scrollTop=0;list.scrollLeft=next;}else{list.scrollLeft=0;list.scrollTop=next;}
    setOffset(next);
  },[selected,resetKey,horizontal,itemSize,columns,games.length]);
  const rows=Math.ceil(games.length/columns),start=Math.max(0,Math.floor(offset/itemSize)-6),end=Math.min(rows,Math.ceil((offset+extent)/itemSize)+6);
  const spacer=count=>horizontal?{width:count*itemSize,flex:`0 0 ${count*itemSize}px`}:{height:count*itemSize,gridColumn:'1 / -1'};
  return <div className={`game-list virtual-list sidebar-${view}`} style={{'--list-columns':columns,'--list-item-size':itemSize+'px'}} ref={viewport} onScroll={e=>setOffset(horizontal?e.currentTarget.scrollLeft:e.currentTarget.scrollTop)}>
    <div className="list-spacer" aria-hidden="true" style={spacer(start)}/>
    {games.slice(start*columns,end*columns).map(game=><button key={game.id} className={`game-row ${selected===game.id?'selected':''}`} aria-label={game.title} aria-current={selected===game.id?'true':undefined} title={isBlocked(game)?game.compatibility.reason:game.title} disabled={busy||loading||game.missing||isBlocked(game)} onClick={()=>onPlay(game)}>
      <span className="row-art"><Gamepad2 size={22}/><img loading="lazy" src={thumbnail(game)} alt="" onError={e=>{e.currentTarget.hidden=true;}}/></span>
      <span className="row-copy"><span className="row-title">{game.title}</span><small className="row-meta" title={cardDetails(game)}>{cardDetails(game)}</small></span>
      {game.status==='keep'&&<Check size={16} className="green"/>}{game.status==='discard'&&<Trash2 size={15} className="red"/>}
    </button>)}
    <div className="list-spacer" aria-hidden="true" style={spacer(Math.max(0,rows-end))}/>
    {!games.length&&<div className="empty-list">No games found.</div>}
  </div>;
}
