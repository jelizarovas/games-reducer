import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Browser, Controller } from 'jsnes';
import { engineKey } from './player-input';
import {readRom,readCartridgeSave,writeCartridgeSave,SAVE_DATABASE} from './browser-library';
import {assetUrl} from './assets';
const buttons = { ArrowUp: Controller.BUTTON_UP, ArrowDown: Controller.BUTTON_DOWN, ArrowLeft: Controller.BUTTON_LEFT, ArrowRight: Controller.BUTTON_RIGHT,
  KeyX: Controller.BUTTON_A, KeyZ: Controller.BUTTON_B, Enter: Controller.BUTTON_START, ControlRight: Controller.BUTTON_SELECT };

export const Player = forwardRef(function Player({ game, paused, muted, onLoaded, onReview, onError, onFullscreen, onFastForward,onShortcutHints,onShortcuts,onShortcut }, ref) {
  const frame = useRef(null), container = useRef(null), nes = useRef(null);
  const speed = useRef(1);
  const silence = useRef(muted); silence.current = muted;
  const heldKeys = useRef(new Map());
  const nesSave=useRef({timer:null,pending:Promise.resolve(),dirty:false,error:null});
  const requests=useRef(new Map());
  function flushNes(){
    clearTimeout(nesSave.current.timer);
    if(nesSave.current.dirty&&nes.current?.nes.rom.batteryRam){
      const bytes=Uint8Array.from(nes.current.nes.cpu.mem.slice(0x6000,0x8000));nesSave.current.dirty=false;
      nesSave.current.pending=nesSave.current.pending.then(()=>writeCartridgeSave(`${game.id}-nes`,{sav:bytes})).catch(error=>{nesSave.current.error=error;});
    }
    return nesSave.current.pending.then(()=>{if(nesSave.current.error)throw nesSave.current.error;});
  }
  const callbacks = useRef({}); callbacks.current = { onLoaded, onReview, onError, onFullscreen, onFastForward,onShortcutHints,onShortcuts,onShortcut };
  const send = message => frame.current?.contentWindow?.postMessage({ source: 'games-reducer', ...message }, location.origin);
  useImperativeHandle(ref, () => ({
    async flushSaves(){
      if(game.system==='nes'){nes.current?.stop();return flushNes();}
      send({type:'pause'});
      const requestId=crypto.randomUUID();
      return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{requests.current.delete(requestId);reject(new Error('The game did not finish saving. Try exporting again.'));},5000);requests.current.set(requestId,{resolve,reject,timer});send({type:'flush-saves',requestId});});
    },
    fastForward(held) {
      speed.current = held ? 3 : 1;
      if (container.current) container.current.dataset.speed = speed.current;
      if (game.system !== 'nes') send({ type: 'fast-forward', held });
    },
    key(code, down, source = 'physical', playerNumber = 1) {
      const token = `${playerNumber}|${code}`;
      const sources = heldKeys.current.get(token) || new Set();
      const wasDown = sources.size > 0;
      down ? sources.add(source) : sources.delete(source);
      if(sources.size) heldKeys.current.set(token,sources); else heldKeys.current.delete(token);
      down = sources.size > 0;
      if(wasDown === down) return;
      if (game.system === 'nes') {
        if (buttons[code] !== undefined && nes.current) nes.current.nes[down ? 'buttonDown' : 'buttonUp'](playerNumber, buttons[code]);
      } else { const mapped=engineKey(code,playerNumber); if(mapped)send({ type: 'key', code:mapped, down }); }
    },
  }), [game.id]);
  useEffect(() => {
    if (game.system === 'nes') {
      let cancelled = false;
      (async () => {
        try {
          const {bytes} = await readRom(game.id);
          const saved=await readCartridgeSave(`${game.id}-nes`);
          if (cancelled) return;
          const emulator = new Browser({ container: container.current, onError: error => callbacks.current.onError(error.message),
            onBatteryRamWrite: () => {if(!nes.current?.nes.rom.batteryRam)return;nesSave.current.dirty=true;clearTimeout(nesSave.current.timer);nesSave.current.timer=setTimeout(()=>flushNes().catch(error=>callbacks.current.onError(error.message)),300);} });
          // The parent owns controller routing, including the review chord.
          emulator._gamepadPolling.stop();
          // Audio starvation must not change game speed. The frame timer owns pacing.
          emulator._speakers.onBufferUnderrun = null;
          document.removeEventListener('keydown', emulator.keyboard.handleKeyDown);
          document.removeEventListener('keyup', emulator.keyboard.handleKeyUp);
          document.removeEventListener('keypress', emulator.keyboard.handleKeyPress);
          const generate = emulator._frameTimer.onGenerateFrame;
          const audio = emulator.nes.opts.onAudioSample;
          emulator.nes.opts.onAudioSample = (left, right) => audio(silence.current || speed.current > 1 ? 0 : left, silence.current || speed.current > 1 ? 0 : right);
          let frames = 0;
          emulator._frameTimer.onGenerateFrame = () => {
            for (let i = 0; i < speed.current; i++) { generate(); frames++; }
            if (container.current) container.current.dataset.frames = frames;
          };
          emulator.nes.loadROM(bytes); nes.current = emulator;
          if(emulator.nes.rom.batteryRam&&saved.sav?.length===0x2000){emulator.nes.rom.batteryRam=Array.from(saved.sav);emulator.nes.mmap.loadBatteryRam();}
          emulator.start();
          container.current.dataset.speed = 1;
          callbacks.current.onLoaded();
        } catch (error) { callbacks.current.onError(error.message); }
      })();
      return () => { cancelled = true; flushNes().catch(()=>{});nes.current?.destroy();nes.current=null; };
    }
    let loaded = false, cancelled = false, requested = false;
    const listener = async event => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow || event.data?.source !== 'games-reducer-engine') return;
      const message = event.data;
      if (message.type === 'ready' && !requested) {
        requested = true;
        try {
          const {bytes,name}=await readRom(game.id);
          if(cancelled)return;
          send({ type: 'mute', muted: silence.current });
          frame.current?.contentWindow?.postMessage({source:'games-reducer',type:'load',id:game.id,name,bytes,saveDatabase:SAVE_DATABASE},location.origin,[bytes.buffer]);
        }catch(error){callbacks.current.onError(error.message);}
      }
      if (message.type === 'loaded') { loaded = true; callbacks.current.onLoaded(); }
      if(message.type==='saves-flushed'){const request=requests.current.get(message.requestId);if(request){clearTimeout(request.timer);requests.current.delete(message.requestId);message.error?request.reject(new Error(message.error)):request.resolve();}}
      if (message.type === 'review') callbacks.current.onReview();
      if(message.type==='shortcut-hints')callbacks.current.onShortcutHints?.(message.held);
      if(message.type==='shortcuts')callbacks.current.onShortcuts?.();
      if(message.type==='shortcut')callbacks.current.onShortcut?.(message.code);
      if (message.type === 'fullscreen') callbacks.current.onFullscreen?.();
      if (message.type === 'fast-forward') callbacks.current.onFastForward?.(message.held);
      if (message.type === 'error') callbacks.current.onError(message.message);
    };
    window.addEventListener('message', listener);
    const timeout = setTimeout(() => { if (!loaded) callbacks.current.onError('The emulator did not start within 25 seconds. Try another ROM, or check browser graphics support.'); }, 25000);
    return () => { cancelled = true; window.removeEventListener('message', listener); clearTimeout(timeout); };
  }, [game.id]);
  useEffect(() => {
    if (paused) {
      speed.current = 1;
      for(const token of heldKeys.current.keys()) {
        const [port,code]=token.split('|'), playerNumber=Number(port);
        if(game.system==='nes') {if(buttons[code]!==undefined)nes.current?.nes.buttonUp(playerNumber,buttons[code]);}
        else send({type:'key',code:engineKey(code,playerNumber),down:false});
      }
      heldKeys.current.clear();
    }
    if (game.system === 'nes') {
      if (nes.current) paused ? nes.current.stop() : nes.current.start();
    } else send({ type: paused ? 'pause' : 'resume' });
  }, [paused, game.id]);
  useEffect(() => { send({type:'mute',muted}); }, [muted,game.id]);
  return game.system === 'nes' ? <div className="nes-canvas" data-muted={muted} ref={container} /> :
    <iframe ref={frame} src={assetUrl(`${__ENGINE_DIRECTORY__}/play.html`)} title={`Playing ${game.title}`} allow="autoplay; gamepad" className="emulator-frame" />;
});
