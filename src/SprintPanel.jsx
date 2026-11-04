import {useState} from 'react';
import {Play,Flag,Check,Trash2,SkipForward} from 'lucide-react';
import {sprintSummary} from './sprint';
import {sprintSliderMax,sprintSliderPosition,sprintSliderSize} from './sprint-scale';
import './sprint.css';
export function SprintSetup({available,busy,onStart}){
 const max=Math.max(1,available),[size,setSize]=useState(10),value=size===''?'':Math.min(max,Math.max(1,Number(size)||1));
 const sliderMax=sprintSliderMax(available),position=sprintSliderPosition(value||1,sliderMax),disabled=!available||busy;
 const ticks=[...new Set([1,5,10,25,50,sliderMax])].filter(n=>n<=sliderMax).sort((a,b)=>a-b);
 function sliderKey(e){
  const changes={ArrowRight:1,ArrowUp:1,ArrowLeft:-1,ArrowDown:-1,PageUp:5,PageDown:-5};
  if(e.key==='Home'||e.key==='End'||e.key in changes){e.preventDefault();setSize(e.key==='Home'?1:e.key==='End'?sliderMax:Math.min(sliderMax,Math.max(1,(Number(value)||1)+(changes[e.key]||0))));}
 }
 return <div className="sprint-setup"><div><h3>Try a sprint</h3><p>Pick a small batch and give each game a verdict.</p></div><div className="sprint-size-controls">
  <div className="sprint-slider-field"><input aria-label="Sprint size slider" aria-valuetext={`${value||1} games`} type="range" min="0" max="1000" step="1" value={position} style={{'--sprint-fill':`${position/10}%`}} disabled={disabled||sliderMax===1} onKeyDown={sliderKey} onChange={e=>setSize(sprintSliderSize(Number(e.target.value),sliderMax))}/><div className="sprint-slider-ticks" aria-hidden="true">{ticks.map(n=><span key={n} style={{left:`${sprintSliderPosition(n,sliderMax)/10}%`}}>{n}</span>)}</div></div>
  <label className="sprint-number-field"><input aria-label="Number of sprint games" type="number" min="1" max={max} step="1" value={value} disabled={disabled} onChange={e=>setSize(e.target.value===''?'':Math.floor(Number(e.target.value)))} onBlur={()=>setSize(value||1)}/><span>games</span></label><button className="primary" disabled={disabled||value===''} onClick={()=>onStart(Number(value))}><Flag size={17}/>Start sprint</button></div><small>{available.toLocaleString()} unreviewed games match your language selection.</small></div>;
}

export function SprintProgress({sprint}){
 const {done,target}=sprintSummary(sprint);return <div className="sprint-meter" role="progressbar" aria-label="Sprint progress" aria-valuemin={0} aria-valuemax={target} aria-valuenow={done}><span style={{width:`${target?done/target*100:0}%`}}/></div>;
}
export function SprintResults({sprint,busy,canResume,onResume,onEnd,onBrowse,onNew,compact=false}){
 if(!sprint)return null;const {done,target,remaining,counts}=sprintSummary(sprint),active=sprint.status==='active';
 return <div className={`sprint-results ${compact?'compact':''}`}><div className="sprint-summary-heading"><Flag size={20}/><h3>{active?'Your sprint':sprint.status==='completed'?'Sprint complete!':'Sprint ended'}</h3><strong>{done} / {target}</strong></div><SprintProgress sprint={sprint}/><p>{active?`${remaining} more ${remaining===1?'decision':'decisions'} to go.`:sprint.status==='completed'?`You gave ${done} ${done===1?'game':'games'} a verdict. Nice work.`:`${done} ${done===1?'game reviewed':'games reviewed'}. Your decisions are saved.`}</p><div className="sprint-outcomes">{[['keep','Kept',Check],['discard','Marked for removal',Trash2],['skip','Later',SkipForward]].map(([status,label,Icon])=><button key={status} disabled={busy} onClick={()=>onBrowse(status)} className={`status-${status}`} aria-label={`Sprint ${label}: ${counts[status]}`}><Icon size={17}/><strong>{counts[status]}</strong><span>{label}</span></button>)}</div>
  {active&&!canResume&&<p className="help">The remaining games are unavailable. Reconnect your ROM folder in settings, or end this sprint.</p>}
  <div className="sprint-actions">{active?<><button className="primary" disabled={busy||!canResume} onClick={onResume}><Play size={17}/>Resume sprint</button><button disabled={busy} onClick={onEnd}>End sprint</button></>:<button disabled={busy} onClick={onNew}>New sprint</button>}</div>
 </div>;
}
export function SprintBadge({sprint,onClick}){const {done,target}=sprintSummary(sprint);return <button className="sprint-badge" aria-label={`Sprint progress: ${done} of ${target}`} title="Sprint progress and results" onClick={onClick}><Flag size={13}/><span>{done}/{target}</span><span className="sprint-badge-fill" style={{width:`${target?done/target*100:0}%`}}/></button>;}
