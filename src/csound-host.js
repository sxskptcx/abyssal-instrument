import { Csound } from 'https://cdn.jsdelivr.net/npm/@csound/browser@7.0.0/dist/csound.js';

const surface = document.getElementById('touchSurface');
const statusEl = document.getElementById('status');

const ORC_MODULES = [
  'dsp/core/00_header.orc',
  'dsp/core/01_busses.orc',
  'dsp/physics/10_surface_radiation.orc',
  'dsp/physics/11_impact_cavity.orc',
  'dsp/physics/12_minnaert_bubble.orc',
  'dsp/space/20_open_night_lake.orc',
  'dsp/quadrants/glass_droplets/30_option_a_tap.orc',
  'dsp/core/99_master_bus.orc'
];

let csound = null;
let audioCtx = null;
let isBooting = false;
let isReady = false;
let needsTapUnmute = false;

function setStatus(text, hideAfterMs = 0) {
  statusEl.textContent = text;
  statusEl.classList.remove('hidden');
  clearTimeout(setStatus._t);
  if (hideAfterMs > 0) {
    setStatus._t = setTimeout(() => statusEl.classList.add('hidden'), hideAfterMs);
  }
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    )
  ]);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function primeAndroidAudio(ctx) {
  try {
    // 1-sample silent pulse unlocks Android Chrome WebAudio synchronously inside gesture
    const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch (_) {}
}

async function fetchOrcModules(sampleRate) {
  return Promise.all(
    ORC_MODULES.map(async (path) => {
      const res = await fetch(`./${path}?v=5`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed loading ${path} (${res.status})`);
      let code = await res.text();
      if (path === 'dsp/core/00_header.orc') {
        code = code.replace('__SAMPLE_RATE__', String(sampleRate));
      }
      return { path, code };
    })
  );
}

async function bootFromGesture() {
  if (isBooting) return;

  if (isReady && needsTapUnmute && audioCtx) {
    try {
      primeAndroidAudio(audioCtx);
      await Promise.race([audioCtx.resume(), sleep(400)]);
      if (audioCtx.state === 'running') {
        needsTapUnmute = false;
        setStatus('READY', 900);
      }
    } catch (_) {}
    return;
  }

  if (isReady) return;
  isBooting = true;

  const csoundLogs = [];

  try {
    setStatus('[1/5] Unlocking Android audio...');
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!audioCtx) {
      audioCtx = new AudioCtx({ latencyHint: 'interactive' });
    }
    primeAndroidAudio(audioCtx);
    // Never deadlock waiting indefinitely on resume()
    await Promise.race([audioCtx.resume().catch(() => {}), sleep(350)]);

    setStatus('[2/5] Loading Csound 7 WASM...');
    csound = await withTimeout(
      Csound({
        audioContext: audioCtx,
        useWorker: false,
        useSAB: false,
        autoConnect: true
      }),
      25000,
      'Csound WASM initialization'
    );

    if (!csound) {
      throw new Error('Csound() returned undefined (AudioWorklet unsupported?)');
    }

    csound.on('message', (msg) => {
      console.log('[csound]', msg);
      if (typeof msg === 'string' && msg.trim().length > 0) {
        csoundLogs.push(msg.trim());
        if (csoundLogs.length > 24) csoundLogs.shift();
      }
    });

    await csound.setOption('-odac');

    setStatus('[3/5] Fetching DSP modules...');
    const modules = await withTimeout(
      fetchOrcModules(audioCtx.sampleRate),
      15000,
      'DSP module fetch'
    );
    const fullOrc = modules.map((m) => `; === ${m.path} ===\n${m.code}`).join('\n\n');

    setStatus('[4/5] Compiling acoustic orchestra...');
    const compileCode = await withTimeout(
      csound.compileOrc(fullOrc),
      15000,
      'Csound compileOrc'
    );

    if (compileCode !== 0) {
      const errLine =
        csoundLogs.find((l) => /error|syntax|unexpected/i.test(l)) ||
        csoundLogs.slice(-3).join(' | ');
      throw new Error(`compileOrc(${compileCode}): ${errLine || 'check console'}`);
    }

    setStatus('[5/5] Starting audio worklet...');
    const startCode = await withTimeout(csound.start(), 15000, 'Csound start');
    if (startCode !== 0) {
      throw new Error(`Csound start returned ${startCode}`);
    }

    await csound.inputMessage('i 900 0 -1');
    await csound.inputMessage('i 999 0 -1');

    // Final check in case Android paused AudioContext during WASM fetch
    await Promise.race([audioCtx.resume().catch(() => {}), sleep(250)]);

    isReady = true;
    isBooting = false;

    if (audioCtx.state !== 'running') {
      needsTapUnmute = true;
      setStatus('ENGINE LOADED — TAP ONCE TO UNMUTE');
    } else {
      needsTapUnmute = false;
      setStatus('READY', 1000);
    }
  } catch (err) {
    isBooting = false;
    console.error(err);
    setStatus(`Audio error:\n${err.message}`);
  }
}

function triggerDroplet(e) {
  if (!isReady || !csound || needsTapUnmute) return;

  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }

  const rect = surface.getBoundingClientRect();
  const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

  const w = e.width && e.width > 0 ? e.width : 20;
  const h = e.height && e.height > 0 ? e.height : 20;
  const area = w * h;

  let sharpness = 1.0 - Math.max(0, Math.min(1, (area - 140) / 1400));
  if (e.pointerType === 'mouse') {
    sharpness = 0.65 + (Math.random() - 0.5) * 0.35;
  } else {
    sharpness = Math.max(0.08, Math.min(0.98, sharpness + (Math.random() - 0.5) * 0.16));
  }

  const pressure = e.pressure && e.pressure > 0 ? e.pressure : 0.5;
  const amp = Math.max(0.28, Math.min(0.95, 0.42 + pressure * 0.42 + (Math.random() - 0.5) * 0.14));

  const minFreq = 190;
  const maxFreq = 1480;
  const pitchNorm = 1.0 - ny;
  const baseFreq = minFreq * Math.pow(maxFreq / minFreq, pitchNorm);

  const richness = nx;
  const pan = 0.15 + nx * 0.70;

  const dur = 1.6;
  const msg = `i 10 0 ${dur.toFixed(3)} ${baseFreq.toFixed(2)} ${amp.toFixed(3)} ${pan.toFixed(3)} ${sharpness.toFixed(3)} ${richness.toFixed(3)}`;
  csound.inputMessage(msg);
}

surface.addEventListener('contextmenu', (e) => e.preventDefault());

// Android requires touchend / pointerup / click for initial AudioContext activation
surface.addEventListener('touchend', () => {
  if (!isReady || needsTapUnmute) bootFromGesture();
}, { passive: true });

surface.addEventListener('pointerup', () => {
  if (!isReady || needsTapUnmute) {
    bootFromGesture();
  } else if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
});

surface.addEventListener('click', () => {
  if (!isReady || needsTapUnmute) bootFromGesture();
});

// Once ready, multi-touch taps trigger immediately on pointerdown
surface.addEventListener('pointerdown', (e) => {
  if (!isReady || needsTapUnmute) return;
  e.preventDefault();
  triggerDroplet(e);
});

// Resume cleanly if switching back to Chrome on Fold 6
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && isReady && audioCtx && audioCtx.state === 'suspended') {
    needsTapUnmute = true;
    setStatus('TAP ONCE TO RESUME AUDIO');
  }
});