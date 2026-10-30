import {useRef,useState} from 'react';
import {FolderOpen,Download,Upload} from 'lucide-react';
import {pickTrashFolder,exportBackup,importBackup} from './browser-library';
import {validateBackup} from './browser-core';
import {assetUrl} from './assets';
import {api} from './api';

export function downloadJson(data,name){
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
export function BrowserSettings({state,busy,onScan,onStop,onRefresh,onError,onFlush}){
  const input=useRef(null),[backup,setBackup]=useState(null),[message,setMessage]=useState(''),[working,setWorking]=useState(false);
  const disabled=busy||working;
  async function exportData(){setWorking(true);try{await onFlush?.();downloadJson(await exportBackup(),`games-reducer-${new Date().toISOString().slice(0,10)}.json`);setMessage('Backup exported with cartridge saves.');}catch(e){onError(e.message);}finally{setWorking(false);}}
  async function readBackup(event){
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    try{if(file.size>128*1024*1024)throw new Error('Backup exceeds 128 MB.');const data=JSON.parse(await file.text());validateBackup(data);setBackup(data);setMessage('');}catch(e){setBackup(null);onError(e.message);}
  }
  async function restore(){
    setWorking(true);try{await onStop();const result=await importBackup(backup);await onRefresh();setBackup(null);setMessage(`Restored ${result.matched} games and ${result.saves} cartridge saves. ${result.pending} will match after you choose and scan their ROM folder.`);}catch(e){onError(e.message);}finally{setWorking(false);}
  }
  return <>
    <div className="settings-section"><h3>ROM folder</h3><p>{state?.root||'No folder selected'}</p>
      <div className="settings-buttons"><button className="primary" disabled={disabled} onClick={()=>onScan(true)}><FolderOpen size={17}/> Choose ROM folder</button><button disabled={disabled||!state?.connected} onClick={()=>onScan(false)}>Reconnect / rescan</button></div>
      <p className="help">Choose the folder containing megadrive, snes, and nes, or one of those console folders. ROMs stay on this device.</p>
    </div>
    {state?.compatibility?.total>0&&<div className="settings-section"><h3>NES compatibility</h3><p>{state.compatibility.supported} supported · {state.compatibility.unsupported} unsupported · {state.compatibility.invalid} invalid · {state.compatibility.unchecked} unchecked</p><p className="help">Unsupported and invalid ROMs stay in your library and are skipped in the next-game queue. Header checks do not verify gameplay. Reconnect / rescan to check new or changed files.</p><button disabled={disabled} onClick={async()=>{try{downloadJson(await api('/compatibility/report'),'nes-compatibility.json');}catch(e){onError(e.message);}}}><Download size={17}/> Export compatibility report</button></div>}
    <div className="settings-section"><h3>Backups</h3><div className="settings-buttons"><button disabled={disabled} onClick={exportData}><Download size={17}/> Export backup</button><button disabled={disabled} onClick={()=>input.current.click()}><Upload size={17}/> Import backup</button></div>
      <input ref={input} type="file" accept=".json,application/json" hidden aria-label="Backup file" onChange={readBackup}/>
      <p className="help">Includes review progress, metadata, and in-game cartridge saves. Save inside the game before exporting. ROMs and an exact paused-game snapshot are not included.</p>
      {backup&&<div className="backup-confirm"><p>Import {backup.games.length.toLocaleString()} games and {backup.saves?.length||0} cartridge saves? Matching records and save files will be replaced. Other games stay unchanged.</p><div className="settings-buttons"><button disabled={disabled} onClick={restore}>Import these records</button><button disabled={disabled} onClick={()=>setBackup(null)}>Cancel import</button></div></div>}
      {message&&<p role="status">{message}</p>}
    </div>
    <div className="settings-section"><h3>Trash folder</h3><p>{state?.trash||'Choose a destination before finishing a session.'}</p><button disabled={disabled} onClick={async()=>{try{await pickTrashFolder();await onRefresh();}catch(e){if(e.name!=='AbortError')onError(e.message);}}}><FolderOpen size={17}/> Choose trash folder</button><p className="help">Use a folder outside the ROM library. Cleanup copies and verifies each marked ROM before removing its original and review record.</p></div>
    <div className="settings-section"><h3>Local storage</h3><p className="help">Progress is saved in this browser on this device. Clearing site data removes it; export a backup before switching devices or browsers. The bundled catalog supplies titles, years, categories, and covers without a scraping account.</p><p className="help"><a href={assetUrl('engine/LICENSE')} target="_blank" rel="noreferrer">Emulator license</a> · <a href={assetUrl('engine/corresponding-source.zip')} download>Emulator source</a></p></div>
  </>;
}
