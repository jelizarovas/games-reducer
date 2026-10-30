import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Search,LayoutGrid,List,Play} from 'lucide-react';
import {Dropdown} from './Dropdown';
import {thumbnail} from './assets';
import {cardDetails} from './library-view';
import {isBlocked} from './nes-compatibility';
import {LanguageFilter} from './LanguageFilter';
const statuses={unreviewed:'To try',keep:'Keepers',discard:'Marked',skip:'Later',all:'All games'};
export function GamesPage({games,query,onQuery,filter,onFilter,category,onCategory,categories,language,onLanguage,languages,sort,onSort,onPlay,busy,onSettings}){
  const [view,setView]=useState(()=>localStorage.getItem('games-reducer-view')||'grid');
  const viewport=useRef(null),[position,setPosition]=useState(0),[dimensions,setDimensions]=useState({width:800,height:600});
  const columns=view==='list'?1:Math.max(2,Math.floor(dimensions.width/166)),rowHeight=view==='list'?76:268;
  useLayoutEffect(()=>{const node=viewport.current,observer=new ResizeObserver(()=>setDimensions({width:node.clientWidth,height:node.clientHeight}));observer.observe(node);return()=>observer.disconnect();},[]);
  useEffect(()=>{viewport.current.scrollTop=0;setPosition(0);},[query,filter,category,sort,view,columns,games.length]);
  useEffect(()=>{localStorage.setItem('games-reducer-view',view);},[view]);
  const firstRow=Math.max(0,Math.floor(position/rowHeight)-3),lastRow=Math.min(Math.ceil(games.length/columns),Math.ceil((position+dimensions.height)/rowHeight)+3);
  return <section className="route-surface games-page" aria-label="Games library">
    <div className="library-page-toolbar">
      <label className="catalog-search"><Search size={18}/><input aria-label="Search library" placeholder="Search games" value={query} onChange={e=>onQuery(e.target.value)}/></label>
      <Dropdown label="Library category" value={category} options={categories} onChange={onCategory}><span>{categories.find(c=>c.value===category)?.label}</span></Dropdown>
      <LanguageFilter value={language} onChange={onLanguage} options={languages}/>
      <Dropdown label="Library review status" value={filter} onChange={onFilter} options={Object.entries(statuses).map(([value,label])=>({value,label}))}><span>{statuses[filter]}</span></Dropdown>
      <Dropdown label="Library sort" value={sort} onChange={onSort} options={[{value:'title',label:'Title A–Z'},{value:'title-desc',label:'Title Z–A'},{value:'year',label:'Oldest first'},{value:'year-desc',label:'Newest first'}]}><span>{sort==='title'?'A–Z':sort==='title-desc'?'Z–A':sort==='year'?'Oldest':'Newest'}</span></Dropdown>
      <div className="view-switch" role="group" aria-label="Library layout"><button aria-label="Grid view" aria-pressed={view==='grid'} onClick={()=>setView('grid')}><LayoutGrid size={18}/></button><button aria-label="List view" aria-pressed={view==='list'} onClick={()=>setView('list')}><List size={18}/></button></div>
    </div>
    <div className="catalog-summary">{games.length.toLocaleString()} games</div>
    <div className={`catalog-viewport view-${view}`} ref={viewport} onScroll={e=>setPosition(e.currentTarget.scrollTop)} tabIndex={-1}>
      <div className="catalog-items" style={{gridTemplateColumns:`repeat(${columns},minmax(0,1fr))`}}>
        <div aria-hidden="true" style={{gridColumn:'1 / -1',height:firstRow*rowHeight}}/>
        {games.slice(firstRow*columns,lastRow*columns).map(game=><button className="catalog-card" key={game.id} aria-label={`Play ${game.title}`} title={isBlocked(game)?game.compatibility.reason:game.title} disabled={busy||game.missing||isBlocked(game)} onClick={()=>onPlay(game)} style={{height:rowHeight}}>
          <span className="catalog-art"><img loading="lazy" src={thumbnail(game)} alt=""/></span>
          <span className="catalog-copy"><strong>{game.title}</strong><small title={cardDetails(game)}>{cardDetails(game)}</small><span className={`catalog-status status-${game.status}`}>{statuses[game.status]}{game.missing?' · Missing':''}</span></span>
          <Play className="catalog-play" size={18}/>
        </button>)}
        <div aria-hidden="true" style={{gridColumn:'1 / -1',height:Math.max(0,Math.ceil(games.length/columns)-lastRow)*rowHeight}}/>
      </div>
      {!games.length&&<div className="route-empty"><p>No games match these filters.</p><button onClick={onSettings}>Library settings</button></div>}
    </div>
  </section>;
}
