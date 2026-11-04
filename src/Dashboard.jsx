import {Play,FolderOpen,Gamepad2,Check,Library,Save} from 'lucide-react';
import {summarizeGames,playTime} from './progress';
import {canQueue} from './nes-compatibility';
import {thumbnail} from './assets';
import {cardDetails} from './library-view';
import './dashboard.css';
export function Dashboard({games,next,busy,loading,onPlay,onBrowse,onChoose,onSettings}){
 const progress=summarizeGames(games),percent=progress.total?Math.round(progress.reviewed/progress.total*100):0;
 return <main className="dashboard route-surface" aria-label="Dashboard"><div className="dashboard-content">
  <section className="dashboard-intro">
   <div className="dashboard-welcome"><h1>Find the games <br/>you want to keep.</h1><p>Games Reducer helps you work through your NES, SNES, and Genesis collection. Play a little, make a decision, and move on to the next game.</p>
    <div className="dashboard-cta">{next?<button className="primary" disabled={busy||loading} onClick={()=>onPlay(next)}><Play size={20}/>Play next game</button>:<button className="primary" disabled={busy||loading} onClick={progress.total?onBrowse:onChoose}>{progress.total?<Library size={20}/>:<FolderOpen size={20}/>} {loading?'Loading collection…':progress.total?'Browse games':'Choose folder'}</button>}
     {next&&<button className="dashboard-text-button" onClick={onBrowse}><Library size={18}/>Browse games</button>}
    </div>
    <small>{loading?'Reading your local progress.':next?`Up next: ${next.title}`:progress.total?(progress.counts.unreviewed?(games.some(g=>g.status==='unreviewed'&&canQueue(g))?'No unreviewed games match your language filter. Browse games to adjust it.':'The remaining unreviewed games are missing or cannot be launched.'):'You’ve reviewed your collection. Revisit your keepers or games saved for later.'):'Choose a folder containing your ROMs to get started. Your files stay on your device.'}</small>
   </div>
   <div className={`dashboard-preview ${next?'has-game':''}`}>
    {next?<><img src={thumbnail(next)} alt={`${next.title} cover`}/><div><strong>{next.title}</strong><span>{cardDetails(next)}</span></div></>:<><Gamepad2 size={70} strokeWidth={1.2}/><strong>Your collection, one game at a time.</strong><span>NES / SNES / Genesis</span></>}
   </div>
  </section>
  <section className="dashboard-progress" aria-labelledby="dashboard-progress-title"><div className="dashboard-section-heading"><h2 id="dashboard-progress-title">Your progress</h2><span>{progress.reviewed.toLocaleString()} of {progress.total.toLocaleString()} reviewed</span></div>
   <div className="collection-progress" role="progressbar" aria-label="Collection reviewed" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>{['keep','discard','skip'].map(status=><span key={status} className={`status-${status}`} style={{width:`${progress.total?progress.counts[status]/progress.total*100:0}%`}}/>)}</div>
   <dl className="dashboard-totals">{[['unreviewed','To try'],['keep','Kept'],['discard','Marked for removal'],['skip','Later']].map(([status,label])=><div key={status} className={`status-${status}`}><dt>{label}</dt><dd>{progress.counts[status].toLocaleString()}</dd></div>)}</dl>
   <p className="dashboard-progress-note">{playTime(progress.seconds)} played{progress.missing?` · ${progress.missing} missing files`:''}. Progress is saved in this browser.</p>
  </section>
  <section className="dashboard-guide" aria-labelledby="dashboard-guide-title"><h2 id="dashboard-guide-title">How it works</h2><ol>
   <li><FolderOpen size={22}/><div><h3>Choose your ROM folder</h3><p>Connect your games, then browse by console, category, or language. Games Reducer doesn’t include ROMs.</p></div></li>
   <li><Gamepad2 size={22}/><div><h3>Give each game a try</h3><p>Use a controller, keyboard, or the on-screen pads. Pause to decide; hold Tab to fast-forward.</p></div></li>
   <li><Check size={22}/><div><h3>Keep, remove, or try later</h3><p>Each decision takes you to the next game. Marked files stay in place until you choose Finish session and confirm cleanup.</p></div></li>
   </ol></section>
  <footer className="dashboard-backup"><Save size={22}/><p><strong>Pick up where you left off.</strong> Save states capture your place in a game. Export a backup to move your progress and saves to another device with the same ROMs.</p><button onClick={onSettings}>Backups & settings</button></footer>
 </div></main>;
}
