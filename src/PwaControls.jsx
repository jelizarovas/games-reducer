import {useEffect,useState,useSyncExternalStore} from 'react';
import {Download,RefreshCw} from 'lucide-react';
import {subscribePwa,getPwaState,refreshOffline,installPwa,downloadCovers,applyUpdate} from './pwa';
export function usePwa(){return useSyncExternalStore(subscribePwa,getPwaState);}
export function PwaSettings({onStop,onError,busy}){
  const state=usePwa(),[updating,setUpdating]=useState(false);
  useEffect(()=>{refreshOffline();},[]);
  return <div className="settings-section"><h3>Install & offline</h3>
    <p role="status">{!state.available?'Offline mode is available on the published app.':state.ready?'App and emulators ready offline.':'Preparing offline app…'}{!state.online?' You are offline.':''}</p>
    <div className="settings-buttons">
      {state.installable&&<button onClick={installPwa}><Download size={17}/> Install app</button>}
      {state.update&&<button disabled={busy||updating} onClick={async()=>{setUpdating(true);try{await onStop();await applyUpdate();}catch(error){onError(error.message);setUpdating(false);}}}><RefreshCw size={17}/> Update & reload</button>}
      {state.ready&&<button disabled={state.downloading||!state.online||state.covers===state.totalCovers} onClick={downloadCovers}><Download size={17}/>{state.downloading?'Downloading covers…':state.covers===state.totalCovers?'All covers saved':'Download all covers'}</button>}
    </div>
    {state.installed?<p className="help">Installed on this device.</p>:!state.installable&&<p className="help">Install from the Edge or Chrome address bar or browser menu.</p>}
    {state.ready&&<p className="help">{state.covers.toLocaleString()} / {state.totalCovers.toLocaleString()} covers saved · {Math.ceil((state.coverBytes||0)/1048576)} MB for all covers. Covers also save as you browse.</p>}
    {state.error&&<p className="red" role="alert">{state.error}</p>}
    <p className="help">Choose a local ROM folder on each device. Folder permission may need reconnecting after reopening. Updates wait until you choose Update & reload or close all app windows. Keep backups: clearing browser storage removes offline files and local progress.</p>
  </div>;
}
