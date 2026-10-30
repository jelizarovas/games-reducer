import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Gamepad2, Search, Play, Check, Trash2, SkipForward, RotateCcw, FolderOpen, X, Download, Pause, Maximize, LoaderCircle, ChevronRight, Settings2, Info, Square, Menu, LogOut, ChevronDown, ArrowDownUp, ListFilter, Volume2, VolumeX, Move } from 'lucide-react';
import { api } from './api';
import {pickRomFolder} from './browser-library';
import {thumbnail} from './assets';
import {BrowserSettings} from './BrowserSettings';
import {GamesPage} from './LibraryPages';
import {useRoute,routePath} from './routes';
import {FastForward,PanelLeftClose,PanelLeftOpen,LayoutGrid,List} from 'lucide-react';
import {SidebarResize} from './SidebarResize';
import {KeyboardShortcuts} from './KeyboardShortcuts';
import './library-pages.css';
import { consoleNames, matchesConsole, releaseYear, sortGames, gameCategories, matchesCategory } from './library-view';
import { TouchControls } from './TouchControls';
import { SessionMenu } from './SessionMenu';
import { Dropdown } from './Dropdown';
import { GameList } from './GameList';
import { Player } from './Player';
import { makePadRouter, GENESIS_KEYS, SNES_KEYS, NES_KEYS } from './controller';
import './style.css';
import './controller-ui.css';
import './workspace.css';
import './sidebar.css';
import { ControllerMenu } from './ControllerMenu';

const labels = { unreviewed: 'To try', keep: 'Keepers', discard: 'Marked', skip: 'Later' };
const shortSystems = { megadrive: 'Genesis', snes: 'SNES', nes: 'NES' };
const size = bytes => bytes >= 1073741824 ? `${(bytes / 1073741824).toFixed(2)} GB` : `${(bytes / 1048576).toFixed(1)} MB`;
const Pad = ({ children, tone = '' }) => <span className={`pad ${tone}`}>{children}</span>;

function App() {
  const [route,setRoute]=useRoute();
  const activeGame=useRef(null),stopping=useRef(null);
  const [shortcutHints,setShortcutHints]=useState(false);
  useEffect(()=>{document.body.classList.toggle('show-shortcuts',shortcutHints);return()=>document.body.classList.remove('show-shortcuts');},[shortcutHints]);
  const [sidebarHidden,setSidebarHidden]=useState(()=>localStorage.getItem('games-reducer-sidebar-hidden')==='true');
  const [sidebarWidth,setSidebarWidth]=useState(()=>Math.max(224,Math.min(640,Number(localStorage.getItem('games-reducer-sidebar-width'))||256)));
  const [dockHeight,setDockHeight]=useState(()=>Number(localStorage.getItem('games-reducer-dock-height'))|| (innerHeight<=500?132:232));
  const [sidebarView,setSidebarView]=useState(()=>localStorage.getItem('games-reducer-sidebar-view')==='grid'?'grid':'list');
  useEffect(()=>{localStorage.setItem('games-reducer-sidebar-hidden',sidebarHidden);localStorage.setItem('games-reducer-sidebar-width',sidebarWidth);localStorage.setItem('games-reducer-dock-height',dockHeight);localStorage.setItem('games-reducer-sidebar-view',sidebarView);},[sidebarHidden,sidebarWidth,dockHeight,sidebarView]);
  const [state, setState] = useState(null), [games, setGames] = useState([]), [selected, setSelected] = useState(null);
  const [system, setSystem] = useState('all'), [filter, setFilter] = useState('unreviewed'), [query, setQuery] = useState('');
  const [phase, setPhase] = useState('ready'), [playing, setPlaying] = useState(null), [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null), [preview, setPreview] = useState(null), [cleanupResult, setCleanupResult] = useState(null);
  const [notice, setNotice] = useState(''), [error, setError] = useState('');
  const [controller, setController] = useState(''), [elapsed, setElapsed] = useState(0), [mediaBusy, setMediaBusy] = useState(false);
  const [expanded, setExpanded] = useState(false), [fullscreenHint, setFullscreenHint] = useState('');
  const [fastForward, setFastForward] = useState(false);
  const [sort, setSort] = useState('title');
  const [category, setCategory] = useState('all');
  const categoryOptions = useMemo(() => [{value:'all',label:'All categories'}, ...[...new Set(games.flatMap(g => gameCategories(g.metadata)))].sort((a,b)=>a.localeCompare(b)).map(value=>({value,label:value})), {value:'uncategorized',label:'Uncategorized'}], [games]);
  const [muted, setMuted] = useState(() => localStorage.getItem('games-reducer-muted') === 'true');
  const [touchPanels, setTouchPanels] = useState({p1:false,p2:false});
  useEffect(() => { localStorage.setItem('games-reducer-muted', String(muted)); }, [muted]);
  const turbo = useRef({ pad: false, keyboard: false, ui:false, active: false });
  const expanding = useRef(false);
  const player = useRef(null), actions = useRef({}), starting = useRef(false), dialog = useRef(null), activeKeys = useRef(new Set());
  const metadataAttempts = useRef(new Set());
  const mode = useRef('ready'), framePhase = useRef(phase); framePhase.current = phase;
  const current = games.find(g => g.id === selected);
  const visible = useMemo(() => sortGames(games.filter(g => matchesConsole(g, system) && matchesCategory(g, category) && (filter === 'all' || g.status === filter) &&
    g.title.toLowerCase().includes(query.toLowerCase())), sort), [games, system, category, filter, query, sort]);

  async function refresh() {
    const [info, all] = await Promise.all([api('/state'), api('/games')]);
    setState(info); setGames(all); return { info, all };
  }
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let { info, all } = await refresh();
        if (cancelled) return;
        setSystem('all');
        setSelected(all.find(g => g.id === info.currentId && !g.missing)?.id || all.find(g => g.status === 'unreviewed' && !g.missing)?.id);
      } catch (e) { if (!cancelled) { setError(e.message); setModal('settings'); } }
    })();
    return () => { cancelled = true; };
  }, []);

  function releaseKeys() {
    turbo.current.pad = false; turbo.current.keyboard = false; turbo.current.ui=false; updateSpeed();
    for (const code of activeKeys.current) player.current?.key(code, false);
    activeKeys.current.clear();
  }
  function updateSpeed() {
    const held = framePhase.current === 'playing' && (turbo.current.pad || turbo.current.keyboard || turbo.current.ui);
    if (held === turbo.current.active) return;
    turbo.current.active = held; player.current?.fastForward(held); setFastForward(held);
  }
  function keyboardSpeed(held) { turbo.current.keyboard = held; updateSpeed(); }
  function buttonSpeed(held){turbo.current.ui=held;updateSpeed();}
  function navigate(next){if(next!=='player')review();setModal(null);setExpanded(false);setRoute(next);refresh().catch(e=>setError(e.message));}
  useEffect(()=>{if(route!=='player'){review();refresh().catch(e=>setError(e.message));}},[route]);
  function review() {
    if (framePhase.current !== 'playing') return;
    releaseKeys(); setPhase('decision'); framePhase.current = 'decision';
    window.focus();
  }
  async function stopPlayer() {
    if(stopping.current)return stopping.current;
    const active=activeGame.current;if(!active)return;
    const operation=(async()=>{
      review();
      if(framePhase.current!=='loading')await player.current?.flushSaves?.();
      releaseKeys();activeGame.current=null;setPlaying(null);setPhase('ready');framePhase.current='ready';
      await api('/player/stop',{id:active.id});
    })();
    stopping.current=operation;
    try{await operation;}finally{stopping.current=null;}
  }
  async function playGame(game = current) {
    if (!game || game.missing || starting.current) return;
    setRoute('player');
    starting.current = true; setError('');
    try {
      if (activeGame.current?.id === game.id) { starting.current = false; if (framePhase.current === 'decision') resume(); return; }
      if (activeGame.current) await stopPlayer();
      await api('/player/start', { id: game.id });
      activeGame.current=game;
      setSelected(game.id); setPlaying(game); setPhase('loading'); framePhase.current = 'loading'; setElapsed(0);
    } catch (e) { setError(e.message); }
    finally { starting.current = false; }
  }
  async function decide(status) {
    if (!current || busy || starting.current) return;
    starting.current = true; setBusy(true); setError('');
    const id = current.id;
    try {
      await stopPlayer();
      await api(`/games/${id}/decision`, { status });
      const { all } = await refresh();
      const ordered = sortGames(all, sort);
      const candidates = ordered.filter(g => matchesConsole(g, system) && matchesCategory(g, category) && g.status === 'unreviewed' && !g.missing && g.id !== id && g.title.toLowerCase().includes(query.toLowerCase()));
      const previousIndex = ordered.findIndex(g => g.id === id);
      const next = candidates.find(g => ordered.indexOf(g) > previousIndex) || candidates[0];
      setNotice(`${current.title} ${status === 'discard' ? 'marked for cleanup' : status === 'keep' ? 'kept' : 'saved for later'}.`);
      starting.current = false;
      if (next) { setSelected(next.id); await playGame(next); }
      else { setSelected(id); setNotice('You reached the end of this queue.'); }
    } catch (e) { setError(e.message); }
    finally { setBusy(false); starting.current = false; }
  }
  async function undo() {
    if (busy) return;
    setBusy(true);
    try {
      const game = await api('/undo', {});
      if (game) { await refresh(); if(!playing){setSystem(game.system); setFilter('all'); setCategory('all'); setSelected(game.id);} setNotice(`Undid the decision for ${game.title}.`); }
      else setNotice('No decisions to undo yet.');
    } catch (e) { setError(e.message); }
    finally {setBusy(false);}
  }
  async function finish() {
    if (busy) return;
    try {
      await stopPlayer();
      const data = await api('/cleanup/preview', {}); setPreview(data); setCleanupResult(null); setModal('cleanup');
    } catch (e) { setError(e.message); }
  }
  async function scan(pick = false) {
    let chosen;
    try { if(pick) chosen = await pickRomFolder(); } catch(e) { if(e.name !== 'AbortError')setError(e.message); return; }
    setBusy(true); setError('');
    try {
      await stopPlayer();
      const result = await api('/scan', { handle: chosen });
      const { all } = await refresh(); setSelected(all.find(g => matchesConsole(g, system) && !g.missing)?.id);
      setNotice(`Scanned ${result.count.toLocaleString()} games.${result.warnings.length ? ` ${result.warnings.length} files need attention: ${result.warnings.slice(0, 2).join('; ')}` : ''}`);
      setModal(null);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  function appShortcut(code){
    const shortcuts={Digit1:()=>decide('keep'),Digit2:()=>decide('discard'),Digit3:()=>decide('skip'),KeyL:()=>{if(route!=='player'){navigate('player');setSidebarHidden(false);}else setSidebarHidden(v=>!v);},KeyV:()=>{if(route==='player')setSidebarView(v=>v==='list'?'grid':'list');},KeyG:()=>navigate('games'),KeyP:()=>navigate('player'),KeyS:()=>openPanel('settings'),KeyM:()=>setMuted(v=>!v),KeyU:undo,KeyK:()=>{if(route==='player')setSidebarHidden(false);requestAnimationFrame(()=>document.querySelector(route==='games'?'input[aria-label="Search library"]':'input[aria-label="Find a game"]')?.focus());}};
    shortcuts[code]?.();
  }
  function toggleShortcuts(){if(modal==='shortcuts')setModal(null);else openPanel('shortcuts');}
  function openPanel(name) {
    if(framePhase.current==='playing')review();
    setModal(name);
  }
  async function cleanup() {
    if (busy || !preview?.token) return;
    setBusy(true); setError('');
    try {
      const result = await api('/cleanup/execute', { token: preview.token });
      setCleanupResult(result.results); setPreview(null); await refresh();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function scrape() {
    if (!current || mediaBusy) return;
    setMediaBusy(true); setError('');
    try {
      const result = await api(`/games/${current.id}/metadata`, {}); await refresh();
      setNotice(result.warnings.length ? result.warnings.join('. ') : 'Game information and artwork updated.');
    } catch (e) { setError(e.message); }
    finally { setMediaBusy(false); }
  }
  useEffect(() => {
    if (!current || !state?.metadataConfigured || mediaBusy || current.metadata.source || metadataAttempts.current.has(current.id)) return;
    metadataAttempts.current.add(current.id);
    scrape();
  }, [current?.id, state?.metadataConfigured, mediaBusy]);
  function choose(game) {
    if (playing || !game) return;
    setSelected(game.id); setError(''); api('/current', { id: game.id, filter: system }).catch(e => setError(e.message));
  }
  function chooseSystem(next) {
    setSystem(next); setQuery(''); setFilter('unreviewed');
    if (playing) return;
    const game = games.find(g => matchesConsole(g, next) && matchesCategory(g, category) && g.status === 'unreviewed' && !g.missing);
    setSelected(game?.id); api('/current', { filter: next, id: game?.id }).catch(e => setError(e.message));
  }
  function chooseFilter(next) {
    setFilter(next);
    if (playing) return;
    const matches = games.filter(g => matchesConsole(g, system) && matchesCategory(g, category) && (next === 'all' || g.status === next) && g.title.toLowerCase().includes(query.toLowerCase()));
    if (!matches.some(g => g.id === selected)) {
      setSelected(matches[0]?.id);
      if (matches[0]) api('/current', { id: matches[0].id, filter: system }).catch(e => setError(e.message));
    }
  }
  function chooseCategory(next) {
    setCategory(next);
    if (playing) return;
    const matches = sortGames(games.filter(g => matchesConsole(g, system) && matchesCategory(g, next) && (filter === 'all' || g.status === filter) && !g.missing && g.title.toLowerCase().includes(query.toLowerCase())), sort);
    if (!matches.some(g => g.id === selected)) {
      setSelected(matches[0]?.id);
      if (matches[0]) api('/current', {id:matches[0].id,filter:system}).catch(e=>setError(e.message));
    }
  }
  function moveSelection(delta) {
    if (!visible.length) return;
    const index = visible.findIndex(g => g.id === selected);
    choose(visible[index < 0 ? (delta < 0 ? visible.length - 1 : 0) : Math.max(0, Math.min(visible.length - 1, index + delta))]);
  }
  async function toggleFullscreen() {
    if (expanding.current) return;
    expanding.current = true;
    try {
      if (expanded || document.fullscreenElement) {
        setExpanded(false); setFullscreenHint('');
        if (document.fullscreenElement) await document.exitFullscreen();
      } else {
        setExpanded(true);
        // Gamepad polling does not provide transient browser activation.
        // The viewport view always works; native fullscreen is an enhancement.
        if (navigator.userActivation?.isActive && document.fullscreenEnabled) {
          try { await document.documentElement.requestFullscreen(); setFullscreenHint(''); }
          catch { setFullscreenHint('Expanded view · press F or click Fullscreen to hide browser chrome.'); }
        } else setFullscreenHint('Expanded view · press F or click Fullscreen to hide browser chrome.');
      }
    } catch (e) { setError(e.message); }
    finally { expanding.current = false; }
  }
  async function nativeFullscreen() {
    try { await document.documentElement.requestFullscreen(); setFullscreenHint(''); }
    catch { setFullscreenHint('Fullscreen is unavailable here. Expanded view is still active.'); }
  }
  useEffect(() => {
    const changed = () => { setExpanded(Boolean(document.fullscreenElement)); setFullscreenHint(''); };
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  function resume() { setPhase('playing'); framePhase.current = 'playing'; }
  mode.current = busy ? 'busy' : modal || route!=='player' ? 'modal' : phase;
  actions.current = { review, play: () => playGame(), keep: () => decide('keep'), discard: () => decide('discard'), skip: () => decide('skip'), resume, undo, finish,
    next: () => moveSelection(1), previous: () => moveSelection(-1),
    pageNext: () => moveSelection(20), pagePrevious: () => moveSelection(-20),
    menu: () => setModal('controller'), fullscreen: toggleFullscreen,
    clearSearch: () => { setQuery(''); if (expanded) toggleFullscreen(); },
    previousFilter: () => { if (window.matchMedia('(max-width:900px)').matches) return moveSelection(-1); const keys = [...Object.keys(labels), 'all']; chooseFilter(keys[(keys.indexOf(filter) + keys.length - 1) % keys.length]); },
    nextFilter: () => { if (window.matchMedia('(max-width:900px)').matches) return moveSelection(1); const keys = [...Object.keys(labels), 'all']; chooseFilter(keys[(keys.indexOf(filter) + 1) % keys.length]); },
    previousSystem: () => { const keys = Object.keys(consoleNames); chooseSystem(keys[(keys.indexOf(system) + keys.length - 1) % keys.length]); },
    nextSystem: () => { const keys = Object.keys(consoleNames); chooseSystem(keys[(keys.indexOf(system) + 1) % keys.length]); },
    close: () => { if (!busy){if(modal)setModal(null);else navigate('player');} },
    activate: () => { if(document.querySelector('.dropdown-panel')?.contains(document.activeElement)||dialog.current?.contains(document.activeElement)||route!=='player')document.activeElement?.click(); },
    focusNext: () => focusDialog(1), focusPrevious: () => focusDialog(-1) };
  function focusDialog(delta) {
    const scope=document.querySelector('.dropdown-panel')||dialog.current||(route!=='player'?document.querySelector('.app-shell'):null);
    const nodes = [...(scope?.querySelectorAll('button:not(:disabled),input:not(:disabled),a[href]') || [])].filter(el=>el.getClientRects().length);
    if (!nodes.length) return;
    const target = nodes[(nodes.indexOf(document.activeElement) + delta + nodes.length) % nodes.length];
    target.focus(); target.scrollIntoView({ block: 'nearest' });
  }
  useEffect(() => { if (modal) dialog.current?.querySelector('button')?.focus(); }, [modal]);
  useEffect(() => {
    const route = makePadRouter(); let raf, previousController = '';
    const poll = () => {
      const pads = navigator.getGamepads?.() || [];
      const pad = [...pads].find(p => p?.connected);
      const name = pad?.id || '';
      if (name !== previousController) { previousController = name; setController(name); if (!name) releaseKeys(); }
      const result = route(pad, mode.current);
      turbo.current.pad = Boolean(result.fastForward); updateSpeed();
      if (mode.current === 'playing' && result.action !== 'review') {
        const config = playingSystem.current === 'snes' ? SNES_KEYS : playingSystem.current === 'nes' ? NES_KEYS : GENESIS_KEYS;
        // Derive held keys so two pad buttons mapped to one key don't release each other.
        const desired = new Set([...result.down].map(i => config[i]).filter(Boolean));
        for (const key of activeKeys.current) if (!desired.has(key)) player.current?.key(key, false);
        for (const key of desired) if (!activeKeys.current.has(key)) player.current?.key(key, true);
        activeKeys.current = desired;
      }
      if (result.action) actions.current[result.action]?.();
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, []);
  const playingSystem = useRef(system); playingSystem.current = playing?.system || system;
  useEffect(() => {
    const hints=e=>{
      if(e.code==='AltLeft'||e.code==='AltRight'){e.preventDefault();e.stopPropagation();setShortcutHints(e.type==='keydown');return;}
      if(e.type!=='keydown')return;
      if(e.altKey&&!e.ctrlKey&&!e.metaKey){e.preventDefault();e.stopPropagation();if(!e.repeat)appShortcut(e.code);return;}
      if(!['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)&&(e.key==='?'||(e.code==='Slash'&&e.shiftKey))){e.preventDefault();e.stopPropagation();if(!e.repeat)toggleShortcuts();}
    };
    const keydown = e => {
      const editing=['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName);
      if(!editing&&e.code==='Escape'&&modal){e.preventDefault();setModal(null);return;}
      if(!editing&&e.code==='KeyF'&&!e.repeat){e.preventDefault();expanded&&!document.fullscreenElement?nativeFullscreen():toggleFullscreen();return;}
      if(route!=='player')return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) && e.code !== 'Escape') return;
      if (e.code === 'Tab' && phase === 'playing') { e.preventDefault(); keyboardSpeed(true); return; }
      if (e.repeat) return;
      if (e.code === 'KeyF') { e.preventDefault(); expanded && !document.fullscreenElement ? nativeFullscreen() : toggleFullscreen(); return; }
      if (e.code === 'Escape') { e.preventDefault(); modal ? actions.current.close() : phase === 'playing' ? review() : phase === 'decision' ? resume() : null; return; }
      if (modal || busy) return;
      if (phase === 'ready') {
        const horizontal = window.matchMedia('(max-width:900px)').matches;
        const action = { Enter: 'play', ArrowDown: 'next', ArrowUp: 'previous', ArrowRight: horizontal ? 'next' : null, ArrowLeft: horizontal ? 'previous' : null, KeyU: 'undo' }[e.code];
        if (action) { e.preventDefault(); actions.current[action](); }
      } else if (phase === 'decision') {
        const action = { Digit1: 'keep', Digit2: 'discard', Digit3: 'skip', Enter: 'resume' }[e.code];
        if (action) { e.preventDefault(); actions.current[action](); }
      } else if (phase === 'playing') player.current?.key(e.code, true, 'keyboard');
    };
    const keyup = e => { if(e.code==='AltLeft'||e.code==='AltRight')setShortcutHints(false);if (e.code === 'Tab') keyboardSpeed(false); if (phase === 'playing') player.current?.key(e.code, false, 'keyboard'); };
    const visibility = () => { if (document.hidden){setShortcutHints(false);review();} };
    const blur=()=>{setShortcutHints(false);buttonSpeed(false);keyboardSpeed(false);};
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur',blur);window.addEventListener('keydown',hints,true);window.addEventListener('keyup',hints,true);
    return () => { window.removeEventListener('keydown',hints,true);window.removeEventListener('keyup',hints,true);window.removeEventListener('blur',blur);window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); document.removeEventListener('visibilitychange', visibility); };
  }, [phase, modal, busy, expanded,route]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      api('/player/tick', { id: playing.id, playing: framePhase.current === 'playing' }).catch(() => {});
      if (framePhase.current === 'playing') setElapsed(s => s + 5);
    }, 5000);
    const unload = () => api('/player/stop', {}).catch(() => {});
    window.addEventListener('pagehide', unload);
    return () => { clearInterval(timer); window.removeEventListener('pagehide', unload); };
  }, [playing?.id]);
  useEffect(() => { document.querySelector('.game-row.selected')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [selected]);
  useEffect(() => {
    const layout = window.matchMedia('(max-width:900px)');
    let frame;
    const reveal = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => document.querySelector('.game-row.selected')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })); };
    layout.addEventListener('change', reveal);
    return () => { layout.removeEventListener('change', reveal); cancelAnimationFrame(frame); };
  }, []);

  return <div style={{'--sidebar-width':sidebarWidth+'px','--dock-height':sidebarHidden?'0px':`min(${dockHeight}px, max(128px, calc(100dvh - 212px)))`}} className={`app-shell ${expanded ? 'is-expanded' : ''} ${phase === 'decision' ? 'is-review' : ''}`}>
    <header className="topbar">
      <div className="header-context">
      {route==='player'&&<button data-shortcut="Alt+L" className="icon-button sidebar-toggle" aria-label={sidebarHidden?'Show game library':'Hide game library'} title={sidebarHidden?'Show game library':'Hide game library'} aria-expanded={!sidebarHidden} aria-controls="game-library" onClick={()=>setSidebarHidden(value=>!value)}>{sidebarHidden?<PanelLeftOpen size={20}/>:<PanelLeftClose size={20}/>}</button>}
      <Dropdown label="Console" value={system} onChange={chooseSystem} triggerClassName="brand console-picker" options={Object.entries(consoleNames).map(([value,label])=>({value,label}))}><Gamepad2 size={22}/><span>{system === 'all' ? 'Games' : consoleNames[system]} Reducer</span></Dropdown>
      <ChevronRight className="header-separator" size={16}/>
      <h1 className="header-title" title={current?.title}>{route==='games'?'Games':current?.title || 'Choose a game'}</h1>
      {route==='player'&&<button className="icon-button" aria-label="Game information" title="Game information" disabled={!current} onClick={() => { if (phase === 'playing') review(); setModal('info'); }}><Info size={19}/></button>}
      </div>
      {route!=='player'&&<nav className="route-navigation" aria-label="Main navigation">{[['player','Player'],['games','Games']].map(([key,label])=><a key={key} href={routePath(key)} aria-current={route===key?'page':undefined} onClick={e=>{e.preventDefault();navigate(key);}}>{label}</a>)}</nav>}
      <div className="header-playback" role="group" aria-label="Playback controls" hidden={route!=='player'}>
      <span className={`header-status ${phase === 'decision' ? 'paused' : 'quiet-status'}`}>{playing ? phase === 'decision' ? 'Paused' : `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}` : current ? labels[current.status] : ''}</span>
      {(phase === 'playing' || phase === 'decision') && <div className="header-decisions" role="group" aria-label="Review game">
        <button className="keep" data-shortcut={phase==='decision'?'1':'Alt+1'} aria-label="Keep game" title="Keep · A / 1" disabled={busy} onClick={() => decide('keep')}><Check size={18}/><span>Keep</span></button>
        <button className="discard" data-shortcut={phase==='decision'?'2':'Alt+2'} aria-label="Mark game for removal" title="Mark for removal · B / 2" disabled={busy} onClick={() => decide('discard')}><Trash2 size={18}/><span>Remove</span></button>
        <button data-shortcut={phase==='decision'?'3':'Alt+3'} aria-label="Try game later" title="Later · X / 3" disabled={busy} onClick={() => decide('skip')}><SkipForward size={18}/><span>Later</span></button>
      </div>}
        {playing&&<button className="icon-button hold-turbo" data-shortcut="Tab" aria-label="Hold to fast-forward" title="Hold for 3× speed · RT / Tab" aria-pressed={fastForward} disabled={phase!=='playing'} onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);buttonSpeed(true);}} onPointerUp={()=>buttonSpeed(false)} onPointerCancel={()=>buttonSpeed(false)} onLostPointerCapture={()=>buttonSpeed(false)} onBlur={()=>buttonSpeed(false)} onKeyDown={e=>{if(['Space','Enter'].includes(e.code)){e.preventDefault();e.stopPropagation();buttonSpeed(true);}}} onKeyUp={e=>{if(['Space','Enter'].includes(e.code)){e.preventDefault();e.stopPropagation();buttonSpeed(false);}}}><FastForward size={18}/></button>}
        {phase === 'ready' && <button className="icon-button" data-shortcut="Enter" aria-label="Play game" title="Play" disabled={!current || busy || current.missing} onClick={() => playGame()}><Play size={20}/></button>}
        {playing && <button className="icon-button" title="Back to library" aria-label="Stop game" onClick={() => stopPlayer().catch(e => setError(e.message))}><Square size={18}/></button>}
        {phase === 'playing' && <button className="icon-button" data-shortcut="Esc" aria-label="Review game" title="Review · Back + Start / Esc" onClick={review}><Pause size={20}/></button>}
        {phase === 'decision' && <button className="icon-button" data-shortcut="Enter" aria-label="Resume game" title="Resume" onClick={resume}><Play size={20}/></button>}
      </div>
      <div className="top-actions">
        <button className="icon-button touch-toggle red" aria-label="Player 1 controller" title="Player 1 · red controller" aria-pressed={touchPanels.p1} onClick={() => setTouchPanels(p => ({...p,p1:!p.p1}))}><Gamepad2 size={19}/><small>1</small></button>
        <button className="icon-button touch-toggle blue" aria-label="Player 2 controller" title="Player 2 · blue controller" aria-pressed={touchPanels.p2} onClick={() => setTouchPanels(p => ({...p,p2:!p.p2}))}><Gamepad2 size={19}/><small>2</small></button>
        <button className="icon-button" data-shortcut="Alt+M" aria-label={muted ? 'Unmute sound' : 'Mute sound'} title={muted ? 'Unmute sound' : 'Mute sound'} aria-pressed={muted} onClick={() => setMuted(value => !value)}>{muted ? <VolumeX size={19}/> : <Volume2 size={19}/>}</button>
        {expanded && fullscreenHint && <button className="icon-button" aria-label="Enter browser fullscreen" title={fullscreenHint} onClick={nativeFullscreen}><Maximize size={15}/></button>}
        <button className="icon-button" data-shortcut="F" aria-label="Toggle fullscreen" title="Fullscreen · L3 / F" onClick={toggleFullscreen}><Maximize size={19}/></button>
        {controller && <Gamepad2 className="connected header-secondary" size={18} aria-label="Controller connected"/>}
        <SessionMenu onShortcuts={toggleShortcuts} games={games} saveCount={state?.saveCount} onRefresh={()=>refresh().catch(e=>setError(e.message))} onNavigate={navigate} onFinish={finish} onUndo={undo} onController={()=>openPanel('controller')} onSettings={()=>openPanel('settings')} busy={busy}/>
      </div>
    </header>
    {route==='games'&&<GamesPage games={visible} query={query} onQuery={setQuery} filter={filter} onFilter={chooseFilter} category={category} onCategory={chooseCategory} categories={categoryOptions} sort={sort} onSort={setSort} onPlay={playGame} busy={busy} onSettings={()=>openPanel('settings')}/>}
    {route!=='player'&&error&&!modal&&<div className="alert error" role="alert">{error}<button aria-label="Dismiss error" onClick={()=>setError('')}><X size={16}/></button></div>}
    <div className={`workspace ${sidebarHidden?'sidebar-hidden':''}`} hidden={route!=='player'}>
      <aside id="game-library" className="sidebar" aria-label="Game library" hidden={sidebarHidden}>
        <div className="library-tools">
          <div className="library-search"><div className="search" data-shortcut="Alt+K"><Search size={17}/><input placeholder="Search games" aria-label="Find a game" value={query} onChange={e => setQuery(e.target.value)}/>
            <Dropdown showArrow={false} label="Sort games" value={sort} onChange={setSort} triggerClassName="search-dropdown" options={[{value:'title',label:'Title A–Z'},{value:'title-desc',label:'Title Z–A'},{value:'year',label:'Oldest first'},{value:'year-desc',label:'Newest first'}]}><ArrowDownUp size={17}/></Dropdown>
            <Dropdown showArrow={false} label="Review status" value={filter} onChange={chooseFilter} triggerClassName="search-dropdown" options={Object.entries({...labels,all:'All games'}).map(([value,label])=>({value,label}))}><ListFilter size={18}/></Dropdown>
            <button data-shortcut="Alt+V" className="icon-button sidebar-view-toggle" aria-label={sidebarView==='list'?'Show grid view':'Show list view'} title={sidebarView==='list'?'Grid view':'List view'} onClick={()=>setSidebarView(value=>value==='list'?'grid':'list')}>{sidebarView==='list'?<LayoutGrid size={17}/>:<List size={17}/>}</button>
          </div></div>
          <Dropdown label="Game category" value={category} onChange={chooseCategory} triggerClassName={`category-filter ${category !== 'all' ? 'active' : ''}`} options={categoryOptions} width={256}><span>{categoryOptions.find(option=>option.value===category)?.label}</span></Dropdown>
        </div>
        <GameList view={sidebarView} games={visible} selected={selected} onPlay={playGame} busy={busy} loading={phase==='loading'} resetKey={JSON.stringify([system,category,filter,query,sort])}/>
        <SidebarResize width={sidebarWidth} height={dockHeight} onWidth={setSidebarWidth} onHeight={setDockHeight}/>
      </aside>
      <main>
        {error && !modal && <div className="alert error" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError('')}><X size={16}/></button></div>}
        <section className="game-stage" aria-label="Game player">
          <div className="stage-body"><div className="screen" data-phase={phase}>
            {playing ? <Player onShortcutHints={setShortcutHints} onShortcuts={toggleShortcuts} onShortcut={appShortcut} key={playing.id} ref={player} game={playing} muted={muted} paused={phase === 'decision'} onLoaded={() => { if(activeGame.current?.id!==playing.id)return;const next=route==='player'&&!modal?'playing':'decision';setPhase(next);framePhase.current=next;if(next==='playing')requestAnimationFrame(()=>{if(activeGame.current?.id===playing.id)player.current?.focus?.();}); }} onReview={review} onFastForward={keyboardSpeed} onFullscreen={() => expanded && !document.fullscreenElement ? nativeFullscreen() : toggleFullscreen()} onError={message => { setError(message); stopPlayer().catch(() => {}); }}/>
              : <div className="preview-screen"><div className="preview-content">
                {current ? <img className="preview-cover" src={thumbnail(current)} alt={`${current.title} cover`}/> : <Gamepad2 size={48}/>}
                {!current && <button className="play-button" onClick={() => setModal('settings')}>Choose folder</button>}
                {Boolean(current?.missing) && <p className="red">File missing. Rescan your library.</p>}
              </div></div>}
            {phase === 'loading' && <div className="loading-screen"><LoaderCircle className="spin" size={28}/><button onClick={() => stopPlayer().catch(e => setError(e.message))}>Cancel</button></div>}
          </div></div>
        </section>
        <TouchControls panels={touchPanels} enabled={phase === 'playing' && !modal} system={playing?.system || current?.system || system} gameId={playing?.id} onKey={(code,down,port) => player.current?.key(code,down,`touch-${port}`,port)}/>
        <span className="sr-only" aria-live="polite">{notice}</span>
      </main>
    </div>
    {modal && <div className="modal-backdrop" onPointerDown={e => { if(e.target===e.currentTarget && !busy)setModal(null); }}><div className={`modal ${modal === 'shortcuts'?'shortcuts-modal':modal === 'cleanup' ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={modal === 'shortcuts' ? 'Keyboard shortcuts' : modal === 'cleanup' ? 'Finish session' : modal === 'controller' ? 'Controller menu' : modal === 'info' ? 'Game information' : 'Library settings'} ref={dialog}>
      <div className="modal-heading"><div><h2>{modal === 'shortcuts' ? 'Keyboard shortcuts' : modal === 'cleanup' ? 'Review before cleanup.' : modal === 'controller' ? 'Controller menu' : modal === 'info' ? 'Game information' : 'Library settings'}</h2></div><button className="icon-button" aria-label="Close dialog" disabled={busy} onClick={() => setModal(null)}><X/></button></div>
      {error && <div className="alert error" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError('')}><X size={16}/></button></div>}
      {modal === 'shortcuts' ? <KeyboardShortcuts system={playing?.system||current?.system||'nes'}/> : modal === 'info' ? <div className="game-info"><img src={thumbnail(current)} alt={`${current?.title} cover`}/><div><h3>{current?.title}</h3><p>{shortSystems[current?.system]} · {size(current?.size || 0)}</p>{current?.metadata.description && <p>{current.metadata.description}</p>}<button disabled={!current || mediaBusy || !state?.metadataConfigured} onClick={scrape}><Download size={16}/> Fetch info</button></div></div> : modal === 'controller' ? <ControllerMenu system={system} filter={filter} onSystem={chooseSystem} onFilter={chooseFilter} onFullscreen={toggleFullscreen} onSettings={() => setModal('settings')} onFetch={scrape} canFetch={!!current && !mediaBusy && !!state?.metadataConfigured} onUndo={undo} onFinish={finish} onClose={() => setModal(null)}/> : modal === 'settings' ? <><BrowserSettings state={state} busy={busy} onScan={scan} onStop={stopPlayer} onRefresh={refresh} onError={setError} onFlush={()=>{if(framePhase.current==='loading')throw new Error('Wait for the game to finish loading before exporting.');return player.current?.flushSaves?.();}}/><div className="settings-section"><h3>Controls</h3><p>Browse: D-pad / left stick selects · A plays · LB/RB console · Left/Right filter · LT/RT jumps 20 · X menu · Y undo · Start finish session.</p><p>L3 toggles fullscreen view from any screen. F requests browser fullscreen. In game: hold RT/R2 or Tab for 3× fast forward, release for normal speed. Back + Start opens review. A keeps, B marks, X skips, Y resumes. Release buttons before choosing.</p><p className="help">Keyboard: arrows move; Genesis Z/X/C, A/S/D; SNES Z/X/A/S, D/C shoulders, Right Shift select; NES X/Z, Right Ctrl select. Enter starts games; Esc opens review.</p></div><div className="settings-section"><h3>Missing files</h3><p className="help">After you move games outside this app, scan again. Clear only the records whose files are still missing.</p><button disabled={busy || !games.some(g => g.missing)} onClick={async () => { try { await stopPlayer(); const result = await api('/missing/clear', {}); await refresh(); setNotice(`Cleared ${result.count} missing records.`); } catch (e) { setError(e.message); } }}>Clear missing records</button></div></>
      : <>{cleanupResult ? <><p>{cleanupResult.filter(r => r.ok).length} games moved to trash. Their game records and decision history were cleared.</p>{cleanupResult.filter(r => !r.ok).map(r => <p className="red" key={r.id}>{games.find(g => g.id === r.id)?.title || r.id}: {r.error}</p>)}<button className="primary" onClick={() => setModal(null)}>Back to library</button></> : <><p><strong>{preview?.games.length || 0} games</strong> marked · {size(preview?.bytes || 0)}</p><p className="help">Cleanup moves these files to <code>{preview?.trash}</code>. Each move is verified before its game record is cleared. Kept and undecided games stay in your library.</p><div className="cleanup-list">{preview?.games.map(game => <div key={game.id}><span>{game.title}<small>{shortSystems[game.system]} · {size(game.size)}</small></span><button disabled={busy} onClick={async () => { try { await api(`/games/${game.id}/decision`, { status: 'unreviewed' }); await refresh(); setPreview(await api('/cleanup/preview', {})); } catch (e) { setError(e.message); } }}>Unmark</button></div>)}</div><div className="modal-actions"><button disabled={busy} onClick={() => setModal(null)}>Keep reviewing</button><button className="danger" disabled={busy || !preview?.games.length} onClick={cleanup}>{busy ? <LoaderCircle className="spin" size={16}/> : <Trash2 size={16}/>} Move marked games to trash</button></div></> }</>}
    </div></div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
