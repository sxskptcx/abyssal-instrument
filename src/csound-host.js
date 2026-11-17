import { Csound } from 'https://cdn.jsdelivr.net/npm/@csound/browser@7.0.0/dist/csound.js';

const surface = document.getElementById('touchSurface');
const statusEl = document.getElementById('status');

// Ordered modular Csound orchestra files
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

function setStatus(text, hideAfterMs = 0) {
  statusEl.textContent = text;
  statusEl.classList.remove('hidden');
  if (hideAfterMs > 0) {
    clearTimeout(setStatus._t);
    setStatus._t = setTimeout(() => statusEl.classList.add('hidden'), hideAfterMs);
  }
}

async function fetchOrcModules(sampleRate) {
  const texts = await Promise.all(
    ORC_MODULES.map(async (path) => {
      const res = await fetch(`./${path}`);
      if (!res.ok) throw new Error(`Failed loading ${path} (${res.status})`);
      let code = await res.text();
      if (path === 'dsp/core/00_header.orc') {
        code = code.replace('__SAMPLE_RATE__', String(sampleRate));
      }
      return { path, code };
    })
  );
  return texts;
}

async function bootCsound() {
  if (isReady || isBooting) return isReady;
  isBooting = true;
  setStatus('initializing csound 7 wasm...');

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioCtx({ latencyHint: 'interactive' });
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    csound = await Csound({
      audioContext: audioCtx,
      inputChannelCount: 0,
      outputChannelCount: 2,
      autoConnect: true
    });

    await csound.setOption('-odac');
    await csound.setOption('-m0d');
    await csound.setOption('--sample-accurate');

    const modules = await fetchOrcModules(audioCtx.sampleRate);
    const encoder = new TextEncoder();

    // Mount modular files into Csound's virtual FS & assemble orchestra
    for (const m of modules) {
      await csound.fs.writeFile(`/${m.path}`, encoder.encode(m.code));
    }

    const fullOrc = modules.map((m) => `; === ${m.path} ===\n${m.code}`).join('\n\n');
    const compileCode = await csound.compileOrc(fullOrc);
    if (compileCode !== 0) {
      throw new Error(`Csound compileOrc returned ${compileCode}`);
    }

    const startCode = await csound.start();
    if (startCode !== 0) {
      throw new Error(`Csound start returned ${startCode}`);
    }

    // Boot persistent spatial & master instruments (ordered by instrument number)
    await csound.inputMessage('i 900 0 -1');
    await csound.inputMessage('i 999 0 -1');

    isReady = true;
    isBooting = false;
    setStatus('ready', 1200);
    return true;
  } catch (err) {
    isBooting = false;
    console.error(err);
    setStatus(`audio error: ${err.message}`);
    return false;
  }
}

/**
 * Computes 2C adaptive touch sharpness (0 = heavy/slow press, 1 = light sharp tap)
 * and physical fluid parameters from normalized touch position.
 */
function triggerDroplet(e) {
  if (!isReady || !csound) return;

  const rect = surface.getBoundingClientRect();
  const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

  // Estimate contact sharpness from capacitive touch area (Fold 6) or pressure
  const area = (e.width || 16) * (e.height || 16);
  let sharpness = 1.0 - Math.max(0, Math.min(1, (area - 140) / 1400));
  if (e.pointerType === 'mouse') {
    sharpness = 0.65 + (Math.random() - 0.5) * 0.35;
  } else {
    sharpness = Math.max(0.08, Math.min(0.98, sharpness + (Math.random() - 0.5) * 0.16));
  }

  // Velocity / dynamic amplitude subtly randomized for natural human feel
  const pressure = e.pressure && e.pressure > 0 ? e.pressure : 0.5;
  const amp = Math.max(0.28, Math.min(0.95, 0.42 + pressure * 0.42 + (Math.random() - 0.5) * 0.14));

  // Y maps droplet size: bottom = large deep cavity bubbles (~190Hz), top = tiny crisp drops (~1450Hz)
  const minFreq = 190;
  const maxFreq = 1480;
  const pitchNorm = 1.0 - ny;
  const baseFreq = minFreq * Math.pow(maxFreq / minFreq, pitchNorm);

  // X maps surface distance & liquid richness (0 = intimate close, 1 = wide submerged resonance)
  const richness = nx;
  const pan = 0.15 + nx * 0.70; // subtle stereo image across surface

  // Instrument 10: OptionADropletTap
  // p4 = baseFreq, p5 = amp, p6 = pan, p7 = sharpness (2C), p8 = richness
  const dur = 1.6;
  const msg = `i 10 0 ${dur.toFixed(3)} ${baseFreq.toFixed(2)} ${amp.toFixed(3)} ${pan.toFixed(3)} ${sharpness.toFixed(3)} ${richness.toFixed(3)}`;
  csound.inputMessage(msg);
}

surface.addEventListener('contextmenu', (e) => e.preventDefault());

surface.addEventListener('pointerdown', async (e) => {
  e.preventDefault();
  if (!isReady) {
    const ok = await bootCsound();
    if (!ok) return;
  } else if (audioCtx && audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }
  triggerDroplet(e);
});