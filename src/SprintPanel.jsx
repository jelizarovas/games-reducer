import {useState} from 'react';
import {Play,Flag,Check,Trash2,SkipForward} from 'lucide-react';
import {sprintSummary} from './sprint';
import './sprint.css';
export function SprintSetup({available,busy,onStart}){
 const max=Math.max(1,available),[size,setSize]=useState(10),value=size===''?'':Math.min(max,Math.max(1,Number(size)||1));
 return <div className="sprint-setup"><div><h3>Try a sprint</h3><p>Pick a small batch and give each game a verdict.</p></div><div className="sprint-size-controls"><input aria-label="Sprint size slider" type="range" min="1" max={max} value={value||1} disabled={!available||busy} onChange={e=>setSize(Number(e.target.value))}/><label><input aria-label="Number of sprint games" type="number" min="1" max={max} step="1" value={value} disabled={!available||busy} onChange={e=>setSize(e.target.value===''?'':Math.floor(Number(e.target.value)))} onBlur={()=>setSize(value||1)}/>games</label><button className="primary" disabled={!available||busy||value===''} onClick={()=>onStart(Number(value))}><Flag size={17}/>Start sprint</button></div><small>{available.toLocaleString()} unreviewed games match your language selection.</small></div>;
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
