import {useEffect,useState} from 'react';
import {Save,Play} from 'lucide-react';
import {gameStates,writeStateSlot} from './browser-library';
export function SaveStates({game,player,busy,onBusy,onResume}){
 const [slots,setSlots]=useState([]),[message,setMessage]=useState(''),[error,setError]=useState('');
 useEffect(()=>{let live=true;gameStates(game.id).then(rows=>{if(live)setSlots(rows);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[game.id]);
 async function save(slot){onBusy(true);setMessage('');setError('');try{const snapshot=await player.current.saveState();await writeStateSlot(game,slot,snapshot);setSlots(await gameStates(game.id));setMessage(`Saved slot ${slot}.`);}catch(e){setError(e.message);}finally{onBusy(false);}}
 async function load(record){onBusy(true);setMessage('');setError('');try{await player.current.loadState(record);onResume();}catch(e){setError(e.message);}finally{onBusy(false);}}
 return <div className="save-states"><p className="state-game-title">{game.title}</p>
  {[1,2,3].map(slot=>{const record=slots.find(r=>r.slot===slot);return <div className="state-slot" key={slot}><div><strong>Slot {slot}</strong><small>{record?new Date(record.createdAt).toLocaleString():'Empty'}</small></div><button aria-label={`Save slot ${slot}`} disabled={busy} onClick={()=>save(slot)}><Save size={17}/>{record?'Overwrite':'Save'}</button><button aria-label={`Load slot ${slot}`} disabled={busy||!record} onClick={()=>load(record)}><Play size={17}/>Load</button></div>;})}
  <p className="help">Loading returns the game and its in-game saves to that point. Saved slots are included in Export backup.</p>
  {message&&<p role="status">{message}</p>}{error&&<p className="red" role="alert">{error}</p>}
  <button disabled={busy} onClick={onResume}><Play size={17}/>Resume game</button>
 </div>;
}
