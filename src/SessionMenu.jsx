import {Ellipsis,LogOut,RotateCcw,Menu,Settings2,LayoutGrid,Play,Keyboard} from 'lucide-react';
import {Dropdown} from './Dropdown';
import {summarizeGames,playTime} from './progress';

export function SessionMenu({onFinish,onUndo,onController,onSettings,onShortcuts,onNavigate,busy,games=[],saveCount=0,onRefresh}) {
  const summary=summarizeGames(games),percent=summary.total?Math.round(summary.reviewed/summary.total*100):0;
  const progress=<div className="menu-progress" aria-label="Collection progress">
    <div className="menu-progress-heading"><strong>Progress</strong><span>{summary.reviewed.toLocaleString()} / {summary.total.toLocaleString()} reviewed</span></div>
    <div className="collection-progress" role="progressbar" aria-label="Collection reviewed" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>{['keep','discard','skip'].map(status=><span key={status} className={`status-${status}`} style={{width:`${summary.total?summary.counts[status]/summary.total*100:0}%`}}/>)}</div>
    <div className="menu-progress-totals">{[['unreviewed','To try'],['keep','Kept'],['discard','Marked'],['skip','Later']].map(([status,label])=><div key={status} className={`status-${status}`}><strong>{summary.counts[status].toLocaleString()}</strong><span>{label}</span></div>)}</div>
    <small>{playTime(summary.seconds)} played · {saveCount} cartridge saves{summary.missing>0?` · ${summary.missing} missing`:''}</small>
  </div>;
  return <Dropdown label="More actions" menu triggerClassName="overflow-trigger" width={288} maxHeight={560} panelHeader={progress} onOpen={onRefresh} options={[
    {value:'games',label:'Games library',icon:<LayoutGrid size={17}/>,onSelect:()=>onNavigate('games')},
    {value:'player',label:'Player',icon:<Play size={17}/>,onSelect:()=>onNavigate('player')},
    {value:'undo',label:'Undo last decision',icon:<RotateCcw size={17}/>,disabled:busy,onSelect:onUndo},
    {value:'controller',label:'Controller menu',icon:<Menu size={17}/>,onSelect:onController},
    {value:'settings',label:'Library settings',icon:<Settings2 size={17}/>,onSelect:onSettings},
    {value:'shortcuts',label:'Keyboard shortcuts',icon:<Keyboard size={17}/>,onSelect:onShortcuts},
    {value:'finish',label:'Finish session',icon:<LogOut size={17}/>,disabled:busy,onSelect:onFinish},
  ]}><Ellipsis size={21}/></Dropdown>;
}
