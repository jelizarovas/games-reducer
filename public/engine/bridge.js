// Adapter for the bundled, unmodified jgenesis WebGL runtime. Its file-dialog API
// accepts a File. Supply only the ROM already selected by our same-origin parent.
(() => {
  const nativeRaf = window.requestAnimationFrame.bind(window);
  const nativeTimeout = window.setTimeout.bind(window);
  const nativeClick = HTMLInputElement.prototype.click;
  const contexts = [];
  const worklets = [];
  const rafs = new Map();
  const timers = new Map();
  const scheduledRafs = new Map();
  const scheduledTimers = new Map();
  let paused = false, muted = false, sequence = 0, file = null, loaded = false, deliveredFrames = 0;
  let speed = 1, realAnchor = performance.now(), virtualAnchor = realAnchor;
  window.reducerRuntimeNow = clock => clock === performance ? virtualAnchor + (paused ? 0 : performance.now() - realAnchor) * speed : clock.now();
  window.reducerRuntimeState = () => ({ paused, muted, speed, deliveredFrames, renderedFrames: window.reducerRenderedFrames || 0, audio: contexts.map(context => context.state) });
  function fastForward(held) {
    const next = held && !paused ? 3 : 1;
    if (next === speed) return;
    virtualAnchor = window.reducerRuntimeNow(performance); realAnchor = performance.now(); speed = next;
    for (const node of worklets) node.port.postMessage({ type: 'speed', speed });
    send('speed', { speed });
  }
  const send = (type, extra = {}) => parent.postMessage({ source: 'games-reducer-engine', type, ...extra }, location.origin);
  const Audio = window.AudioContext;
  window.AudioContext = class extends Audio { constructor(...args) { super(...args); contexts.push(this); } };
  const Worklet = window.AudioWorkletNode;
  window.AudioWorkletNode = class extends Worklet {
    constructor(...args) { super(...args); worklets.push(this); this.port.postMessage({ type: 'speed', speed }); this.port.postMessage({type:'mute',muted}); }
  };
  window.reducerRuntimeRaf = callback => {
    const id = ++sequence;
    const run = timestamp => { scheduledRafs.delete(id); if (paused) rafs.set(id, callback); else { deliveredFrames++; callback(timestamp); } };
    if (paused) rafs.set(id, callback); else scheduledRafs.set(id, nativeRaf(run));
    return id;
  };
  window.reducerRuntimeCancelRaf = id => { rafs.delete(id); if (scheduledRafs.has(id)) cancelAnimationFrame(scheduledRafs.get(id)); scheduledRafs.delete(id); };
  // Only winit's imported timers are gated; browser/UI timers keep running.
  window.reducerRuntimeTimeout = (callback, delay = 0) => {
    const id = ++sequence;
    scheduledTimers.set(id, nativeTimeout(() => {
      scheduledTimers.delete(id);
      if (paused) timers.set(id, callback); else callback();
    }, delay / speed));
    return id;
  };
  window.reducerRuntimeClearTimeout = id => { timers.delete(id); if (scheduledTimers.has(id)) clearTimeout(scheduledTimers.get(id)); scheduledTimers.delete(id); };
  function pause(value) {
    if (value === paused) return;
    virtualAnchor = window.reducerRuntimeNow(performance); realAnchor = performance.now();
    paused = value;
    if (value) fastForward(false);
    for (const context of contexts) (value ? context.suspend() : context.resume()).catch(() => {});
    if (!value) {
      for (const [id, callback] of rafs) scheduledRafs.set(id, nativeRaf(timestamp => { scheduledRafs.delete(id); callback(timestamp); }));
      rafs.clear();
      for (const [id, callback] of timers) scheduledTimers.set(id, nativeTimeout(() => { scheduledTimers.delete(id); callback(); }, 0));
      timers.clear();
      document.querySelector('canvas')?.focus();
    }
  }
  function inject(input) {
    if (!file || input.type !== 'file') return false;
    const transfer = new DataTransfer(); transfer.items.add(file);
    input.files = transfer.files;
    nativeTimeout(() => input.dispatchEvent(new Event('change', { bubbles: true })), 0);
    return true;
  }
  HTMLInputElement.prototype.click = function () { if (!inject(this)) nativeClick.call(this); };
  // rfd versions that display an HTML dialog insert a file input before awaiting selection.
  new MutationObserver(() => {
    for (const input of document.querySelectorAll('input[type=file]')) {
      if (!input.dataset.reducerInjected && file) { input.dataset.reducerInjected = '1'; inject(input); }
    }
    const title = document.getElementById('jgenesis-rom-title')?.textContent;
    if (file && title && title !== '(No ROM loaded)' && !loaded) { loaded = true; send('loaded'); }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  window.addEventListener('message', async event => {
    if (event.origin !== location.origin || event.source !== parent || event.data?.source !== 'games-reducer') return;
    const message = event.data;
    if(message.type==='flush-saves'){
      try{await window.reducerFlushSaves?.();send('saves-flushed',{requestId:message.requestId});}
      catch(error){send('saves-flushed',{requestId:message.requestId,error:error.message});}
    }
    if (message.type === 'load') {
      try {
        window.reducerSaveDatabase=message.saveDatabase;
        if (!(message.bytes instanceof Uint8Array) || typeof message.name !== 'string') throw new Error('No ROM was supplied by the library.');
        const name = message.name;
        // Prefix save keys with the ROM ID, preventing same-name versions sharing SRAM.
        file = new File([message.bytes], `${message.id}-${name}`);
        window.reducerChannel.request_open_file();
      } catch (error) { send('error', { message: error.message }); }
    }
    if (message.type === 'pause') pause(true);
    if (message.type === 'resume') pause(false);
    if (message.type === 'fast-forward') fastForward(message.held);
    if (message.type === 'mute') { muted=Boolean(message.muted); for(const node of worklets)node.port.postMessage({type:'mute',muted}); }
    if (message.type === 'key' && (!paused || !message.down)) {
      const canvas = document.querySelector('canvas');
      canvas?.dispatchEvent(new KeyboardEvent(message.down ? 'keydown' : 'keyup', {
        code: message.code, key: message.key || message.code.replace('Key', '').toLowerCase(), bubbles: true,
      }));
    }
  });
  window.addEventListener('keydown', event => {
    if(event.code==='AltLeft'||event.code==='AltRight'){event.preventDefault();send('shortcut-hints',{held:true});return;}
    if(event.altKey&&!event.ctrlKey&&!event.metaKey){event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)send('shortcut',{code:event.code});return;}
    if(event.key==='?'||(event.code==='Slash'&&event.shiftKey)){event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)send('shortcuts');return;}
    if (event.code === 'Tab') { event.preventDefault(); event.stopImmediatePropagation(); if (!event.repeat) send('fast-forward', { held: true }); }
    if (event.code === 'KeyF' && !event.repeat) { event.preventDefault(); event.stopImmediatePropagation(); send('fullscreen'); }
    if (event.code === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); send('review'); }
  }, true);
  window.addEventListener('keyup', event => { if(event.code==='AltLeft'||event.code==='AltRight')send('shortcut-hints',{held:false});if (event.code === 'Tab') { event.preventDefault(); send('fast-forward', { held: false }); } }, true);
  window.addEventListener('blur', () => { fastForward(false); send('fast-forward', { held: false });send('shortcut-hints',{held:false}); });
  // winit deliberately throws this sentinel after taking ownership of its event loop.
  const sentinel = "Using exceptions for control flow, don't mind me. This isn't actually an error!";
  window.addEventListener('error', event => { if (!event.message.includes(sentinel)) send('error', { message: event.message }); });
  window.addEventListener('unhandledrejection', event => { if (!String(event.reason).includes(sentinel)) send('error', { message: String(event.reason) }); });
  window.alert = message => send('error', { message: String(message) });
  const ready = () => {
    if (window.reducerChannel && document.querySelector('canvas') && !document.getElementById('loading-text')) send('ready');
    else nativeTimeout(ready, 60);
  };
  ready();
})();
