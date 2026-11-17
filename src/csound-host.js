import { Csound } from 'https://cdn.jsdelivr.net/npm/@csound/browser@7.0.0/dist/csound.js';

const surface = document.getElementById('touchSurface');
const statusEl = document.getElementById('status');
const telemetryEl = document.getElementById('telemetry');

const ORC_MODULES = [
  'dsp/core/00_header.orc',
  'dsp/core/01_busses.orc',
  'dsp/physics/10_surface_radiation.orc',
  'dsp/physics/11_impact_cavity.orc',
  'dsp/physics/12_minnaert_bubble.orc',
  'dsp/physics/13_splash_turbulence.orc',
  'dsp/space/20_open_night_lake.orc',
  'dsp/quadrants/glass_droplets/30_option_a_tap.orc',
  'dsp/quadrants/glass_droplets/31_splash_clusters.orc',
  'dsp/core/99_master_bus.orc'
];

let csound = null;
let audioCtx = null;
let isBooting = false;
let isReady = false;
let needsTapUnmute = false;

const rawTouchQueue = [];

function setStatus(text, hideAfterMs = 0) {
  statusEl.textContent = text;
  statusEl.classList.remove('hidden');
  clearTimeout(setStatus._t);
  if (hideAfterMs > 0) {
    setStatus._t = setTimeout(() => statusEl.classList.add('hidden'), hideAfterMs);
  }
}

function showTelemetry(text) {
  telemetryEl.textContent = text;
  telemetryEl.classList.add('show');
  clearTimeout(showTelemetry._t);
  showTelemetry._t = setTimeout(() => telemetryEl.classList.remove('show'), 2200);
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
    const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch (_) {}
}

function matchTouchMeta(clientX, clientY) {
  const now = performance.now();
  while (rawTouchQueue.length && now - rawTouchQueue[0].ts > 150) {
    rawTouchQueue.shift();
  }
  let bestIdx = -1;
  let bestDist = 48;
  for (let i = 0; i < rawTouchQueue.length; i++) {
    const d = Math.hypot(rawTouchQueue[i].x - clientX, rawTouchQueue[i].y - clientY);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  if (bestIdx >= 0) {
    return rawTouchQueue.splice(bestIdx, 1)[0];
  }
  return null;
}

/**
 * Calibrated using real Z Fold 6 TouchEvent geometry (~437px² tip to ~2815px² flat thumb)
 * while still expanding dynamically if a lighter/wider touch occurs.
 */
const touchCal = {
  minArea: 420,
  maxArea: 2450,
  minForce: 0.06,
  maxForce: 0.38,

  measure(e, tc) {
    if (e.pointerType === 'mouse') {
      const isWide = e.shiftKey || e.button === 2;
      return {
        sharpness: isWide ? (0.06 + Math.random() * 0.12) : (0.78 + Math.random() * 0.18),
        debug: isWide ? 'mouse:wide' : 'mouse:sharp'
      };
    }

    const rx = tc ? tc.rx : 0;
    const ry = tc ? tc.ry : 0;
    const tcArea = Math.PI * rx * ry;
    const peArea = (e.width || 0) * (e.height || 0);
    const activeArea = tcArea > 4 ? tcArea : peArea;
    const force = tc && tc.force > 0 ? tc.force : (e.pressure > 0 ? e.pressure : 0);

    if (activeArea > 10) {
      if (activeArea < this.minArea) this.minArea = activeArea;
      if (activeArea > this.maxArea) this.maxArea = activeArea;
    }
    if (force > 0.005) {
      if (force < this.minForce) this.minForce = force;
      if (force > this.maxForce) this.maxForce = force;
    }

    const lMin = Math.log(Math.max(40, this.minArea));
    const lMax = Math.log(Math.max(this.minArea + 120, this.maxArea));
    const lVal = Math.log(Math.max(40, activeArea));
    const areaWide = Math.max(0, Math.min(1, (lVal - lMin) / Math.max(0.2, lMax - lMin)));

    let wideScore = areaWide;
    const fSpan = this.maxForce - this.minForce;
    if (fSpan > 0.05 && force > 0) {
      const forceWide = Math.max(0, Math.min(1, (force - this.minForce) / fSpan));
      wideScore = areaWide * 0.62 + forceWide * 0.38;
    }

    const sharpness = Math.max(0.04, Math.min(0.98, 1.0 - wideScore));
    const debug = `tc:${rx.toFixed(0)}x${ry.toFixed(0)} f:${force.toFixed(2)}`;
    return { sharpness, debug };
  }
};

/**
 * M-3: Dynamic Water Agitation Memory (Still Pool <-> Choppy Turbulent Surface)
 */
const waterMemory = {
  agitation: 0,
  lastTime: performance.now(),
  recentTaps: [], // { nx, ny, time }

  registerTap(nx, ny, sharpness) {
    const now = performance.now();
    const dtSec = Math.max(0, (now - this.lastTime) / 1000);
    this.lastTime = now;

    // Exponential calming back toward mirror-still water (~2.3s relaxation)
    this.agitation *= Math.exp(-dtSec / 2.3);

    // Prune taps older than 3 seconds
    this.recentTaps = this.recentTaps.filter((t) => now - t.time < 3000);

    // Tapping near recent ripples stirs up higher local agitation
    let proximityBoost = 0;
    for (const t of this.recentTaps) {
      const d = Math.hypot(t.nx - nx, t.ny - ny);
      if (d < 0.35) {
        proximityBoost += (1.0 - d / 0.35) * 0.14;
      }
    }

    const wide = 1.0 - sharpness;
    this.agitation = Math.min(
      1.0,
      this.agitation + 0.14 + wide * 0.22 + Math.min(0.28, proximityBoost)
    );
    this.recentTaps.push({ nx, ny, time: now });
    return this.agitation;
  }
};

const ARCH_NAMES = ['', 'clean plop', 'doublet', 'skimmer', 'submerged', 'effervescence'];
let lastArch = 0;

function pickArchetype(sharpness, agitation) {
  const wide = 1.0 - sharpness;
  const weights = [
    0.20 + sharpness * 0.16 + (1 - agitation) * 0.16, // 1: clean plop (more in calm water)
    0.22 + (1 - Math.abs(sharpness - 0.5)) * 0.14,    // 2: coupled doublet
    0.08 + sharpness * 0.22 + agitation * 0.22,       // 3: surface skimmer (choppy/sharp)
    0.06 + wide * 0.40 + (1 - agitation) * 0.10,      // 4: submerged pocket (wide thumb)
    0.10 + sharpness * 0.12 + agitation * 0.26        // 5: micro-effervescence (agitated)
  ];

  if (lastArch >= 1 && lastArch <= 5) {
    weights[lastArch - 1] *= 0.28;
  }

  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  let chosen = 1;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      chosen = i + 1;
      break;
    }
  }
  lastArch = chosen;
  return chosen;
}

async function fetchOrcModules(sampleRate) {
  return Promise.all(
    ORC_MODULES.map(async (path) => {
      const res = await fetch(`./${path}?v=9`, { cache: 'no-store' });
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

  const tc = e.pointerType !== 'mouse' ? matchTouchMeta(e.clientX, e.clientY) : null;
  const { sharpness, debug } = touchCal.measure(e, tc);
  const agitation = waterMemory.registerTap(nx, ny, sharpness);
  const arch = pickArchetype(sharpness, agitation);

  const wideFactor = 1.0 - sharpness;
  const amp = Math.max(
    0.34,
    Math.min(0.95, 0.44 + wideFactor * 0.40 + (Math.random() - 0.5) * 0.12)
  );

  const minFreq = 185;
  const maxFreq = 1380;
  const pitchNorm = Math.max(0, Math.min(1, 1.0 - ny));
  const baseFreq = minFreq * Math.pow(maxFreq / minFreq, pitchNorm);

  const richness = nx;
  const pan = 0.15 + nx * 0.70;

  // p9 = arch, p10 = agitation (M-3)
  const dur = 1.75;
  const msg = `i 10 0 ${dur.toFixed(3)} ${baseFreq.toFixed(2)} ${amp.toFixed(3)} ${pan.toFixed(3)} ${sharpness.toFixed(3)} ${richness.toFixed(3)} ${arch} ${agitation.toFixed(3)}`;
  csound.inputMessage(msg);

  showTelemetry(`sharp ${Math.round(sharpness * 100)}% · chop ${Math.round(agitation * 100)}% · ${debug} · ${ARCH_NAMES[arch]}`);
}

surface.addEventListener('contextmenu', (e) => e.preventDefault());

surface.addEventListener('touchstart', (e) => {
  if (!isReady || needsTapUnmute) return;
  const now = performance.now();
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    rawTouchQueue.push({
      x: t.clientX,
      y: t.clientY,
      rx: t.radiusX || 0,
      ry: t.radiusY || 0,
      force: t.force || 0,
      ts: now
    });
  }
}, { passive: true });

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

surface.addEventListener('pointerdown', (e) => {
  if (!isReady || needsTapUnmute) return;
  e.preventDefault();
  triggerDroplet(e);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && isReady && audioCtx && audioCtx.state === 'suspended') {
    needsTapUnmute = true;
    setStatus('TAP ONCE TO RESUME AUDIO');
  }
});