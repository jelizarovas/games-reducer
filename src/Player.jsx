import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Browser, Controller } from 'jsnes';
import { engineKey } from './player-input';
import {readRom} from './browser-library';
import {assetUrl} from './assets';
const buttons = { ArrowUp: Controller.BUTTON_UP, ArrowDown: Controller.BUTTON_DOWN, ArrowLeft: Controller.BUTTON_LEFT, ArrowRight: Controller.BUTTON_RIGHT,
  KeyX: Controller.BUTTON_A, KeyZ: Controller.BUTTON_B, Enter: Controller.BUTTON_START, ControlRight: Controller.BUTTON_SELECT };

export const Player = forwardRef(function Player({ game, paused, muted, onLoaded, onReview, onError, onFullscreen, onFastForward }, ref) {
  const frame = useRef(null), container = useRef(null), nes = useRef(null);
  const speed = useRef(1);
  const silence = useRef(muted); silence.current = muted;
  const heldKeys = useRef(new Map());
  const callbacks = useRef({}); callbacks.current = { onLoaded, onReview, onError, onFullscreen, onFastForward };
  const send = message => frame.current?.contentWindow?.postMessage({ source: 'games-reducer', ...message }, location.origin);
  useImperativeHandle(ref, () => ({
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
          if (cancelled) return;
          const emulator = new Browser({ container: container.current, onError: error => callbacks.current.onError(error.message),
            onBatteryRamWrite: () => {} });
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
          emulator.loadROM(bytes); nes.current = emulator;
          container.current.dataset.speed = 1;
          callbacks.current.onLoaded();
        } catch (error) { callbacks.current.onError(error.message); }
      })();
      return () => { cancelled = true; nes.current?.destroy(); nes.current = null; };
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
          frame.current?.contentWindow?.postMessage({source:'games-reducer',type:'load',id:game.id,name,bytes},location.origin,[bytes.buffer]);
        }catch(error){callbacks.current.onError(error.message);}
      }
      if (message.type === 'loaded') { loaded = true; callbacks.current.onLoaded(); }
      if (message.type === 'review') callbacks.current.onReview();
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
    <iframe ref={frame} src={assetUrl('engine/play.html')} title={`Playing ${game.title}`} allow="autoplay; gamepad" className="emulator-frame" />;
});
