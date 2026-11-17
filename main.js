/**
 * Main Instrument Controller:
 *  - Multi-touch pointer tracking (10+ fingers + S Pen)
 *  - Pitch Engines (Magnetic Gravity 4B, Continuous Ocean 4C, Scales 4A)
 *  - All 4 Hidden Combos (Double-Tap, Anchor & Spark, Stillness Charge, Two-Finger Converge)
 *  - Psychoacoustic Consonance & Sound-Driven Curated Color Palette Engine
 */
(function () {
  const canvas = document.getElementById('waterCanvas');
  const introPrompt = document.getElementById('introPrompt');
  const menuDot = document.getElementById('menuDot');
  const panel = document.getElementById('panel');
  const statusToast = document.getElementById('statusToast');

  const pitchModeBtns = document.getElementById('pitchModeBtns');
  const pitchModeVal = document.getElementById('pitchModeVal');
  const gravityRow = document.getElementById('gravityRow');
  const gravitySlider = document.getElementById('gravitySlider');
  const gravityVal = document.getElementById('gravityVal');
  const scaleSelect = document.getElementById('scaleSelect');
  const spaceSlider = document.getElementById('spaceSlider');
  const spaceVal = document.getElementById('spaceVal');
  const paletteSelect = document.getElementById('paletteSelect');

  // Register offline PWA service worker if available
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  const water = new window.WaterEngine(canvas);
  const audio = new window.AudioEngine();

  // Keep screen awake on Fold 6 while playing
  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        await navigator.wakeLock.request('screen');
      }
    } catch (_) {}
  }

  function showToast(text, duration = 2400) {
    statusToast.textContent = text;
    statusToast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => statusToast.classList.remove('show'), duration);
  }

  // Scales in semitone offsets from root C2 (65.41 Hz)
  const SCALES = {
    minor9:     [0, 2, 3, 7, 10, 12, 14, 15, 19, 22, 24, 26, 27, 31, 34, 36, 38],
    lydian:     [0, 2, 4, 6, 7, 11, 12, 14, 16, 18, 19, 23, 24, 26, 28, 30, 31],
    hirajoshi:  [0, 2, 3, 7, 8, 12, 14, 15, 19, 20, 24, 26, 27, 31, 32, 36, 38],
    pentatonic: [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24, 27, 29, 31, 34, 36, 39]
  };

  // Curated non-muddy mood palettes [primary, secondary, accent]
  const PALETTES = {
    abyss: {
      primary:   [0.06, 0.18, 0.58],
      secondary: [0.10, 0.08, 0.42],
      accent:    [0.24, 0.62, 0.92]
    },
    aurora: {
      primary:   [0.05, 0.52, 0.58],
      secondary: [0.36, 0.14, 0.68],
      accent:    [0.32, 0.95, 0.72]
    },
    glass: {
      primary:   [0.18, 0.58, 0.85],
      secondary: [0.35, 0.42, 0.78],
      accent:    [0.75, 0.92, 1.00]
    },
    twilight: {
      primary:   [0.52, 0.16, 0.54],
      secondary: [0.14, 0.28, 0.68],
      accent:    [0.95, 0.48, 0.66]
    }
  };

  const state = {
    started: false,
    pitchMode: 'magnetic', // 'magnetic' (4B) | 'continuous' (4C) | 'scale' (4A)
    gravity: 0.60,
    scaleKey: 'minor9',
    spaceMix: 0.72,
    paletteMode: 'auto',
    paletteShiftBoost: 0,

    // Multi-touch active pointers
    pointers: new Map(), // pointerId -> pointer data
    lastTap: { time: 0, x: -999, y: -999 },
    lastTouchEndTime: performance.now(),
    stillnessCharge: 0,
    convergeCooldown: 0,

    // Live mood interpolation
    moodPrimary:   [0.06, 0.18, 0.58],
    moodSecondary: [0.10, 0.08, 0.42],
    moodAccent:    [0.24, 0.62, 0.92],
    consonance: 0.5,
    energy: 0.15,
    tapImpulseEnergy: 0
  };

  let synthIdCounter = 1000;

  function computeQuadrants(nx, ny) {
    // TL: Mist, TR: Glass, BL: Shimmer, BR: Abyss
    return {
      wMist:    (1 - nx) * (1 - ny),
      wGlass:   nx * (1 - ny),
      wShimmer: (1 - nx) * ny,
      wAbyss:   nx * ny
    };
  }

  function computeFrequency(nx, ny, anchorFreq = null) {
    // Bottom (ny=1) = low (~55Hz), Top (ny=0) = high (~660Hz)
    const pitchNorm = 1.0 - ny;
    const minMidi = 33; // A1 (~55Hz)
    const spanSemi = 40; // ~3.3 octaves
    const rawMidi = minMidi + pitchNorm * spanSemi;

    const scale = SCALES[state.scaleKey] || SCALES.minor9;
    const rootMidi = 36; // C2

    // Find nearest scale note
    let nearestMidi = rawMidi;
    let bestDist = 999;
    for (let i = 0; i < scale.length; i++) {
      const m = rootMidi + scale[i];
      const d = Math.abs(rawMidi - m);
      if (d < bestDist) {
        bestDist = d;
        nearestMidi = m;
      }
    }

    let finalMidi = rawMidi;
    if (state.pitchMode === 'scale') {
      finalMidi = nearestMidi;
    } else if (state.pitchMode === 'magnetic') {
      // Nonlinear magnetic pull toward scale tone
      const pull = state.gravity;
      finalMidi = rawMidi + (nearestMidi - rawMidi) * pull;
    }

    let freq = 440 * Math.pow(2, (finalMidi - 69) / 12);

    // Hidden Combo #2: Anchor & Spark soft harmonic pull toward consonant ratio of held anchor
    if (anchorFreq && state.pitchMode !== 'continuous') {
      const ratios = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.25, 3.0];
      let bestAnchorFreq = freq;
      let bestRatioDiff = 999;
      for (const r of ratios) {
        const cand = anchorFreq * r;
        const diff = Math.abs(Math.log2(freq / cand));
        if (diff < bestRatioDiff) {
          bestRatioDiff = diff;
          bestAnchorFreq = cand;
        }
      }
      freq = freq * 0.45 + bestAnchorFreq * 0.55;
    }

    return Math.max(42, Math.min(1400, freq));
  }

  function getAnchorFinger(excludeId) {
    const now = performance.now();
    for (const [id, p] of state.pointers.entries()) {
      if (id !== excludeId && (now - p.startTime) > 550) {
        return p;
      }
    }
    return null;
  }

  function colorForQuadrant(q) {
    // Base quadrant tint mixed softly with current active mood palette
    const cMist    = [0.22, 0.78, 0.85];
    const cGlass   = [0.42, 0.88, 1.00];
    const cShimmer = [0.58, 0.32, 0.96];
    const cAbyss   = [0.10, 0.30, 0.82];

    const r = cMist[0] * q.wMist + cGlass[0] * q.wGlass + cShimmer[0] * q.wShimmer + cAbyss[0] * q.wAbyss;
    const g = cMist[1] * q.wMist + cGlass[1] * q.wGlass + cShimmer[1] * q.wShimmer + cAbyss[1] * q.wAbyss;
    const b = cMist[2] * q.wMist + cGlass[2] * q.wGlass + cShimmer[2] * q.wShimmer + cAbyss[2] * q.wAbyss;

    return [
      r * 0.6 + state.moodAccent[0] * 0.4,
      g * 0.6 + state.moodAccent[1] * 0.4,
      b * 0.6 + state.moodAccent[2] * 0.4
    ];
  }

  // Trigger a brief procedural ghost/combo note without needing a finger slot
  function triggerComboNote(nx, ny, freq, gain, delayMs = 0, stillness = 0) {
    const id = ++synthIdCounter;
    const q = computeQuadrants(nx, ny);
    setTimeout(() => {
      audio.post({
        type: 'noteOn',
        id,
        freq,
        pan: (nx - 0.5) * 1.4,
        bright: 0.35 + nx * 0.5,
        wMist: q.wMist,
        wGlass: q.wGlass,
        wShimmer: q.wShimmer,
        wAbyss: q.wAbyss,
        gain,
        stillness
      });
      setTimeout(() => audio.post({ type: 'noteOff', id }), 180);
    }, delayMs);
  }

  async function ensureAudioStarted() {
    if (!state.started) {
      state.started = true;
      introPrompt.classList.add('hidden');
      requestWakeLock();
      const ok = await audio.init();
      if (!ok && audio.failedReason) {
        showToast(audio.failedReason, 6000);
      } else {
        audio.post({ type: 'setParams', spaceMix: state.spaceMix });
      }
    } else if (audio.ctx && audio.ctx.state === 'suspended') {
      audio.ctx.resume();
    }
  }

  // ----------------------------------------------------
  // MULTI-TOUCH POINTER HANDLERS
  // ----------------------------------------------------
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', async (e) => {
    e.preventDefault();
    await ensureAudioStarted();

    const rect = canvas.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const now = performance.now();

    const q = computeQuadrants(nx, ny);
    const anchor = getAnchorFinger(e.pointerId);
    const freq = computeFrequency(nx, ny, anchor ? anchor.freq : null);
    const col = colorForQuadrant(q);

    // Check Hidden Combo #3: Stillness Charge (pause 3s+ then strike)
    const stillness = state.stillnessCharge;
    state.stillnessCharge = 0;

    // Check Hidden Combo #1: Double-Tap Ripple Resonance
    const dtTap = now - state.lastTap.time;
    const distTap = Math.hypot(e.clientX - state.lastTap.x, e.clientY - state.lastTap.y);
    const isDoubleTap = dtTap < 320 && distTap < 65;

    state.lastTap = { time: now, x: e.clientX, y: e.clientY };

    const pData = {
      id: e.pointerId,
      nx,
      ny,
      px: e.clientX,
      py: e.clientY,
      startTime: now,
      freq,
      q,
      col,
      pulseAccum: 0
    };
    state.pointers.set(e.pointerId, pData);

    // Send main note to DSP
    audio.post({
      type: 'noteOn',
      id: e.pointerId,
      freq,
      pan: (nx - 0.5) * 1.4,
      bright: 0.25 + nx * 0.55 + (1 - ny) * 0.2,
      wMist: q.wMist,
      wGlass: q.wGlass,
      wShimmer: q.wShimmer,
      wAbyss: q.wAbyss,
      gain: 1.0 + stillness * 0.35,
      stillness
    });

    // Visual water splash scaled to pitch/quadrant
    const baseRadius = 0.022 + q.wAbyss * 0.035 + stillness * 0.045;
    const waveForce = 0.32 + q.wGlass * 0.22 + stillness * 0.45;
    water.addImpulse(nx, ny, baseRadius, waveForce, col, 0.95 + stillness * 0.6);
    state.tapImpulseEnergy = Math.min(1.0, state.tapImpulseEnergy + 0.28);

    // Execute Hidden Combo #1: Crystal Cascade
    if (isDoubleTap) {
      water.addImpulse(nx, ny, 0.048, 0.55, state.moodAccent, 1.35);
      water.addImpulse(nx, ny, 0.018, -0.45, [0.85, 0.96, 1.0], 0.9);
      triggerComboNote(nx, Math.max(0.05, ny - 0.12), freq * 1.5, 0.62, 55);
      triggerComboNote(Math.min(0.95, nx + 0.06), Math.max(0.05, ny - 0.22), freq * 2.0, 0.52, 125);
      triggerComboNote(nx, Math.max(0.05, ny - 0.30), freq * 3.0, 0.42, 210);
    }

    // Execute Hidden Combo #2 Visual Bridge: Anchor & Spark
    if (anchor) {
      const mx = (nx + anchor.nx) * 0.5;
      const my = (ny + anchor.ny) * 0.5;
      water.addImpulse(mx, my, 0.026, 0.26, state.moodAccent, 0.85);
    }

    // Execute Hidden Combo #3 Extra Sub Ripple: Stillness Bloom
    if (stillness > 0.45) {
      triggerComboNote(nx, Math.min(0.95, ny + 0.15), freq * 0.5, 0.7 * stillness, 40, stillness);
      water.addImpulse(nx, ny, 0.085, 0.42 * stillness, state.moodPrimary, 1.1);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = state.pointers.get(e.pointerId);
    if (!p) return;

    const rect = canvas.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const moveDist = Math.hypot(e.clientX - p.px, e.clientY - p.py);

    p.nx = nx;
    p.ny = ny;
    p.px = e.clientX;
    p.py = e.clientY;
    p.q = computeQuadrants(nx, ny);
    p.col = colorForQuadrant(p.q);

    const anchor = getAnchorFinger(e.pointerId);
    p.freq = computeFrequency(nx, ny, anchor ? anchor.freq : null);

    audio.post({
      type: 'noteMove',
      id: e.pointerId,
      freq: p.freq,
      pan: (nx - 0.5) * 1.4,
      bright: 0.25 + nx * 0.55 + (1 - ny) * 0.2,
      wMist: p.q.wMist,
      wGlass: p.q.wGlass,
      wShimmer: p.q.wShimmer,
      wAbyss: p.q.wAbyss
    });

    // Leave gentle luminous wake when gliding
    if (moveDist > 4) {
      const wakeForce = Math.min(0.24, moveDist * 0.0045);
      water.addImpulse(nx, ny, 0.02, wakeForce, p.col, 0.35);
      state.tapImpulseEnergy = Math.min(1.0, state.tapImpulseEnergy + moveDist * 0.002);
    }

    // Check Hidden Combo #4: Two-Finger Converge
    const now = performance.now();
    if (state.pointers.size >= 2 && now > state.convergeCooldown) {
      for (const [otherId, other] of state.pointers.entries()) {
        if (otherId === e.pointerId) continue;
        const d = Math.hypot(p.px - other.px, p.py - other.py);
        if (d < 72) {
          state.convergeCooldown = now + 1300;
          const mx = (p.nx + other.nx) * 0.5;
          const my = (p.ny + other.ny) * 0.5;
          water.addImpulse(mx, my, 0.065, 0.72, [0.9, 0.8, 1.0], 1.5);
          triggerComboNote(mx, my, Math.min(1200, (p.freq + other.freq) * 0.75), 0.68, 0);
          triggerComboNote(mx, my, Math.min(1200, (p.freq + other.freq) * 1.125), 0.52, 85);
          state.paletteShiftBoost = 1.0;
          break;
        }
      }
    }
  });

  function endPointer(e) {
    if (!state.pointers.has(e.pointerId)) return;
    state.pointers.delete(e.pointerId);
    audio.post({ type: 'noteOff', id: e.pointerId });
    if (state.pointers.size === 0) {
      state.lastTouchEndTime = performance.now();
    }
  }

  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  // ----------------------------------------------------
  // PSYCHOACOUSTIC CONSONANCE & SOUND-DRIVEN PALETTE ENGINE
  // ----------------------------------------------------
  function computeHarmonyAndMood(dt) {
    const active = Array.from(state.pointers.values());

    // Calculate pairwise harmonic consonance from active frequency ratios
    let consonanceTarget = 0.55;
    if (active.length >= 2) {
      let scoreSum = 0;
      let pairs = 0;
      const simpleRatios = [1.0, 2.0, 1.5, 1.3333, 1.25, 1.2, 1.125, 1.6667];
      for (let i = 0; i < active.length; i++) {
        for (let j = i + 1; j < active.length; j++) {
          let ratio = active[i].freq / active[j].freq;
          if (ratio < 1) ratio = 1 / ratio;
          // Reduce into single octave (1..2)
          while (ratio > 2.0) ratio *= 0.5;
          let minDist = 1.0;
          for (const sr of simpleRatios) {
            minDist = Math.min(minDist, Math.abs(ratio - sr));
          }
          // Closer to pure harmonic ratio -> higher consonance
          scoreSum += Math.max(0, 1.0 - minDist * 11.0);
          pairs++;
        }
      }
      consonanceTarget = pairs > 0 ? scoreSum / pairs : 0.6;
    } else if (active.length === 1) {
      // Single deep hold -> melancholic/calm consonance
      consonanceTarget = 0.45 + (1 - active[0].ny) * 0.25;
    }

    state.consonance += (consonanceTarget - state.consonance) * Math.min(1, dt * 3.0);
    state.tapImpulseEnergy *= Math.pow(0.28, dt);
    state.paletteShiftBoost *= Math.pow(0.35, dt);

    const energyTarget = Math.min(1.0, state.tapImpulseEnergy + active.length * 0.14 + audio.rms * 1.4);
    state.energy += (energyTarget - state.energy) * Math.min(1, dt * 4.0);

    // Choose target palette
    let targetPal = PALETTES.abyss;
    if (state.paletteMode !== 'auto') {
      targetPal = PALETTES[state.paletteMode];
    } else {
      // Average spectral height & quadrant character across held notes
      let avgAbyss = 0.3, avgHigh = 0.3;
      if (active.length > 0) {
        avgAbyss = active.reduce((s, p) => s + p.q.wAbyss + p.q.wShimmer * 0.4, 0) / active.length;
        avgHigh  = active.reduce((s, p) => s + p.q.wGlass + p.q.wMist * 0.7, 0) / active.length;
      }

      // Dynamic Mood Blends:
      // Slow/low -> Abyssal Melancholy (deep moody blues)
      // Consonant + active -> Bioluminescent Aurora / Twilight Bloom
      // Bright glass -> Moonlit Glass
      const pAbyss = PALETTES.abyss;
      const pAurora = PALETTES.aurora;
      const pGlass = PALETTES.glass;
      const pTwilight = PALETTES.twilight;

      const auroraW = Math.min(1, state.consonance * 0.75 + state.energy * 0.45);
      const glassW  = Math.min(1, avgHigh * 0.9);
      const twiW    = Math.min(1, state.paletteShiftBoost * 0.9 + (1 - state.consonance) * state.energy * 0.6);
      const abyssW  = Math.max(0.25, avgAbyss * 1.1 + (1 - state.energy) * 0.65);

      const sumW = abyssW + auroraW + glassW + twiW;
      const blendVec = (k) => [0, 1, 2].map(c =>
        (pAbyss[k][c] * abyssW + pAurora[k][c] * auroraW + pGlass[k][c] * glassW + pTwilight[k][c] * twiW) / sumW
      );
      targetPal = {
        primary: blendVec('primary'),
        secondary: blendVec('secondary'),
        accent: blendVec('accent')
      };
    }

    const lerpRate = Math.min(1, dt * 1.8);
    for (let c = 0; c < 3; c++) {
      state.moodPrimary[c]   += (targetPal.primary[c]   - state.moodPrimary[c])   * lerpRate;
      state.moodSecondary[c] += (targetPal.secondary[c] - state.moodSecondary[c]) * lerpRate;
      state.moodAccent[c]    += (targetPal.accent[c]    - state.moodAccent[c])    * lerpRate;
    }

    water.updateMood({
      primary: state.moodPrimary,
      secondary: state.moodSecondary,
      accent: state.moodAccent,
      consonance: state.consonance,
      energy: state.energy,
      audioRms: audio.rms
    });
  }

  // ----------------------------------------------------
  // MAIN 120HZ RENDER & HOLD-OSCILLATION LOOP
  // ----------------------------------------------------
  let lastFrame = performance.now();

  function tick(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    const timeSec = now * 0.001;

    // Build stillness charge when screen untouched for > 3 seconds
    if (state.pointers.size === 0) {
      const idleSec = (now - state.lastTouchEndTime) / 1000;
      if (idleSec > 3.0) {
        state.stillnessCharge = Math.min(1.0, (idleSec - 3.0) / 5.0);
      }
    }

    // Held fingers continuously pulse standing waves into the water
    // Pulse rate & size reflect note frequency and hold duration
    for (const p of state.pointers.values()) {
      const holdSec = (now - p.startTime) / 1000;
      const pulseHz = 2.2 + Math.min(6.0, p.freq / 120);
      const waveVal = Math.sin(timeSec * pulseHz * Math.PI * 2) * (0.045 + Math.min(0.06, holdSec * 0.02));
      const holdRad = 0.02 + p.q.wAbyss * 0.022 + Math.min(0.02, holdSec * 0.008);
      water.addImpulse(p.nx, p.ny, holdRad, waveVal, p.col, 0.14);
    }

    computeHarmonyAndMood(dt);
    water.render(dt, timeSec);
    requestAnimationFrame(tick);
  }

  window.addEventListener('resize', () => water.resize());
  requestAnimationFrame(tick);

  // ----------------------------------------------------
  // MINIMAL TUNING DRAWER CONTROLS
  // ----------------------------------------------------
  menuDot.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = panel.classList.toggle('open');
    menuDot.classList.toggle('active', isOpen);
  });

  canvas.addEventListener('pointerdown', () => {
    if (panel.classList.contains('open')) {
      panel.classList.remove('open');
      menuDot.classList.remove('active');
    }
  });

  pitchModeBtns.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (!btn) return;
    state.pitchMode = btn.dataset.mode;
    pitchModeBtns.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));

    const names = { magnetic: 'Magnetic (4B)', continuous: 'Ocean (4C)', scale: 'Scales (4A)' };
    pitchModeVal.textContent = names[state.pitchMode];
    gravityRow.style.display = state.pitchMode === 'magnetic' ? 'block' : 'none';
  });

  gravitySlider.addEventListener('input', () => {
    state.gravity = gravitySlider.value / 100;
    gravityVal.textContent = gravitySlider.value + '%';
  });

  scaleSelect.addEventListener('change', () => {
    state.scaleKey = scaleSelect.value;
  });

  spaceSlider.addEventListener('input', () => {
    state.spaceMix = spaceSlider.value / 100;
    spaceVal.textContent = spaceSlider.value + '%';
    audio.post({ type: 'setParams', spaceMix: state.spaceMix });
  });

  paletteSelect.addEventListener('change', () => {
    state.paletteMode = paletteSelect.value;
  });
})();