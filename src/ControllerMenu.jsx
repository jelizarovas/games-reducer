import { Maximize, Settings2, Download, RotateCcw, ChevronRight } from 'lucide-react';
import { consoleNames } from './library-view';

export function ControllerMenu({ system, filter, onSystem, onFilter, onFullscreen, onSettings, onFetch, canFetch, onUndo, onFinish, onClose }) {
  return <div className="controller-menu">
    <p className="help">D-pad or left stick moves focus. A chooses. B returns to your games.</p>
    <h3>Console</h3>
    <div className="controller-options">{Object.entries(consoleNames).map(([key, label]) =>
      <button key={key} aria-pressed={system === key} onClick={() => onSystem(key)}>{label}</button>)}</div>
    <h3>Show games</h3>
    <div className="controller-options">{Object.entries({ unreviewed: 'To try', keep: 'Keepers', discard: 'Marked', skip: 'Later', all: 'All games' }).map(([key, label]) =>
      <button key={key} aria-pressed={filter === key} onClick={() => onFilter(key)}>{label}</button>)}</div>
    <div className="controller-menu-actions">
      <button onClick={onClose}>Return to game list <span>A to play</span></button>
      <button onClick={onFullscreen}><Maximize size={17}/> Toggle fullscreen view <span>L3</span></button>
      <button onClick={onUndo}><RotateCcw size={17}/> Undo last decision <span>Y</span></button>
      <button disabled={!canFetch} onClick={onFetch}><Download size={17}/> Fetch game information</button>
      <button onClick={onSettings}><Settings2 size={17}/> Library settings</button>
      <button onClick={onFinish}>Finish session <ChevronRight size={17}/><span>Start</span></button>
    </div>
  </div>;
}
