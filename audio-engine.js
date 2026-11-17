/**
 * Custom From-Scratch AudioWorklet Synthesizer Engine
 * Combines:
 *  - TL: Granular Mist (live windowed noise-band + droplet grain cloud)
 *  - TR: Glass & Droplets (Minnaert rising-pitch bubbles + inharmonic modal glass)
 *  - BL: Ethereal Shimmer (additive harmonic bloom pad)
 *  - BR: Abyssal Current (sub-harmonic pressure swell + warm low-pass resonance)
 *  - Master: Underwater damped stereo ping-pong delay + 4-channel Householder FDN reverb
 */
(function () {
  const WORKLET_CODE = `
    const MAX_VOICES = 16;
    const TWO_PI = Math.PI * 2;

    class AbyssalDSPProcessor extends AudioWorkletProcessor {
      constructor() {
        super();
        this.sr = sampleRate;

        // Deterministic fast PRNG state
        this.rng = 0x13579bdf;

        // Pre-allocate 16 polyphonic voices
        this.voices = [];
        for (let i = 0; i < MAX_VOICES; i++) {
          this.voices.push({
            active: false,
            id: -1,
            held: false,
            age: 0,
            releaseAge: 0,
            env: 0,
            // Smoothed & target synthesis params
            freq: 220, targetFreq: 220,
            pan: 0, targetPan: 0,
            bright: 0.5, targetBright: 0.5,
            wMist: 0.25, twMist: 0.25,
            wGlass: 0.25, twGlass: 0.25,
            wShimmer: 0.25, twShimmer: 0.25,
            wAbyss: 0.25, twAbyss: 0.25,
            // Per-note procedural uniqueness
            bubbleRise: 0.65,
            bubbleTau: 0.038,
            detuneA: 1.003,
            detuneB: 0.996,
            glassRatio1: 2.756,
            glassRatio2: 5.404,
            gainScale: 1.0,
            // Oscillator phases
            p0: 0, p1: 0, p2: 0, p3: 0, p4: 0, pSub: 0, pBubble: 0,
            // Modal glass state
            m1: 0, m2: 0,
            // Granular mist micro-engine (2 overlapping grains per voice)
            g0Phase: 0, g0Freq: 600, g0Pos: 0, g0Len: 1800, g0Pan: 0,
            g1Phase: 0, g1Freq: 900, g1Pos: 900, g1Len: 2200, g1Pan: 0,
            // State-variable filter states for mist & abyss
            svfLow: 0, svfBand: 0,
            mistLp: 0,
            stillnessBoost: 0
          });
        }

        // Stereo Ping-Pong Underwater Delay
        this.delayLenL = Math.floor(this.sr * 0.377);
        this.delayLenR = Math.floor(this.sr * 0.513);
        this.delayBufL = new Float32Array(this.delayLenL);
        this.delayBufR = new Float32Array(this.delayLenR);
        this.delayIdxL = 0;
        this.delayIdxR = 0;
        this.delayLpL = 0;
        this.delayLpR = 0;

        // 4-Channel Householder FDN Reverb (prime-like mutually coprime lengths)
        const baseLens = [1327, 1789, 2267, 2903];
        const scale = this.sr / 48000;
        this.fdnLens = baseLens.map(n => Math.max(256, Math.floor(n * scale)));
        this.fdnBufs = this.fdnLens.map(n => new Float32Array(n));
        this.fdnIdx = [0, 0, 0, 0];
        this.fdnLp = [0, 0, 0, 0];
        this.fdnModPhase = 0;

        this.spaceMix = 0.72;
        this.dcX = 0; this.dcY = 0;
        this.dcXR = 0; this.dcYR = 0;

        this.rmsAccum = 0;
        this.rmsCount = 0;

        this.port.onmessage = (e) => this._handleMsg(e.data);
      }

      rand() {
        let x = this.rng;
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        this.rng = x >>> 0;
        return this.rng / 4294967296;
      }

      _handleMsg(m) {
        if (m.type === 'noteOn') {
          let v = this._findVoice(m.id);
          if (!v) v = this._allocVoice();
          v.active = true;
          v.id = m.id;
          v.held = true;
          v.age = 0;
          v.releaseAge = 0;

          v.freq = v.targetFreq = m.freq;
          v.pan = v.targetPan = m.pan;
          v.bright = v.targetBright = m.bright;

          v.wMist = v.twMist = m.wMist;
          v.wGlass = v.twGlass = m.wGlass;
          v.wShimmer = v.twShimmer = m.wShimmer;
          v.wAbyss = v.twAbyss = m.wAbyss;

          // Unique procedural voice DNA on every single touch
          v.bubbleRise = 0.45 + this.rand() * 0.75;
          v.bubbleTau = 0.022 + this.rand() * 0.042;
          v.detuneA = 1.002 + (this.rand() - 0.5) * 0.008;
          v.detuneB = 0.997 + (this.rand() - 0.5) * 0.008;
          v.glassRatio1 = 2.72 + this.rand() * 0.09;
          v.glassRatio2 = 5.32 + this.rand() * 0.22;
          v.gainScale = m.gain || 1.0;
          v.stillnessBoost = m.stillness || 0.0;

          v.p0 = this.rand() * TWO_PI;
          v.p1 = this.rand() * TWO_PI;
          v.p2 = this.rand() * TWO_PI;
          v.p3 = this.rand() * TWO_PI;
          v.p4 = this.rand() * TWO_PI;
          v.pSub = this.rand() * TWO_PI;
          v.pBubble = 0;

          v.g0Pos = 0;
          v.g0Len = Math.floor(this.sr * (0.028 + this.rand() * 0.055));
          v.g0Freq = m.freq * (1.0 + Math.floor(this.rand() * 4) * 0.5);
          v.g0Pan = (this.rand() - 0.5) * 1.2;

          v.g1Pos = Math.floor(v.g0Len * 0.5);
          v.g1Len = Math.floor(this.sr * (0.032 + this.rand() * 0.065));
          v.g1Freq = m.freq * (1.5 + this.rand() * 2.0);
          v.g1Pan = (this.rand() - 0.5) * 1.2;
        } else if (m.type === 'noteMove') {
          const v = this._findVoice(m.id);
          if (v) {
            v.targetFreq = m.freq;
            v.targetPan = m.pan;
            v.targetBright = m.bright;
            v.twMist = m.wMist;
            v.twGlass = m.wGlass;
            v.twShimmer = m.wShimmer;
            v.twAbyss = m.wAbyss;
          }
        } else if (m.type === 'noteOff') {
          const v = this._findVoice(m.id);
          if (v) {
            v.held = false;
            v.releaseAge = 0;
          }
        } else if (m.type === 'setParams') {
          if (typeof m.spaceMix === 'number') this.spaceMix = m.spaceMix;
        }
      }

      _findVoice(id) {
        for (let i = 0; i < MAX_VOICES; i++) {
          if (this.voices[i].active && this.voices[i].id === id) return this.voices[i];
        }
        return null;
      }

      _allocVoice() {
        // First try inactive slot
        for (let i = 0; i < MAX_VOICES; i++) {
          if (!this.voices[i].active) return this.voices[i];
        }
        // Otherwise steal quietest releasing voice
        let best = this.voices[0];
        let minScore = 1e9;
        for (let i = 0; i < MAX_VOICES; i++) {
          const v = this.voices[i];
          const score = v.env + (v.held ? 2.0 : 0.0);
          if (score < minScore) {
            minScore = score;
            best = v;
          }
        }
        return best;
      }

      process(inputs, outputs) {
        const out = outputs[0];
        if (!out || out.length < 2) return true;
        const outL = out[0];
        const outR = out[1];
        const n = outL.length;
        const dt = 1.0 / this.sr;

        for (let s = 0; s < n; s++) {
          let dryL = 0;
          let dryR = 0;

          for (let i = 0; i < MAX_VOICES; i++) {
            const v = this.voices[i];
            if (!v.active) continue;

            v.age += dt;
            if (!v.held) v.releaseAge += dt;

            // Smooth parameters to avoid zipper noise while gliding
            v.freq += (v.targetFreq - v.freq) * 0.0045;
            v.pan += (v.targetPan - v.pan) * 0.0045;
            v.bright += (v.targetBright - v.bright) * 0.0045;
            v.wMist += (v.twMist - v.wMist) * 0.003;
            v.wGlass += (v.twGlass - v.wGlass) * 0.003;
            v.wShimmer += (v.twShimmer - v.wShimmer) * 0.003;
            v.wAbyss += (v.twAbyss - v.wAbyss) * 0.003;

            // Adaptive Tap vs Long-Hold Envelope:
            // Quick taps ring out naturally with glass/bubble decay;
            // Long holds bloom into sustained ambient pads.
            const attackRate = 0.015; // smooth ~12ms anti-click onset
            if (v.held) {
              v.env += (1.0 - v.env) * attackRate;
            } else {
              // Longer held notes release more slowly like an ambient tail
              const holdFactor = Math.min(1.0, v.age / 0.8);
              const relTime = 0.55 + holdFactor * 2.4 + v.stillnessBoost * 1.4;
              const relCoeff = Math.exp(-dt / relTime);
              v.env *= relCoeff;
              if (v.env < 0.00025 && v.age > 0.15) {
                v.active = false;
                continue;
              }
            }

            const f = v.freq;
            const holdBloom = Math.min(1.0, v.age / 1.8); // swells slowly during long holds

            // ----------------------------------------------------
            // 1) TOP-RIGHT: GLASS & DROPLETS (Minnaert Bubble + Modal Glass)
            // ----------------------------------------------------
            let glassL = 0, glassR = 0;
            if (v.wGlass > 0.01) {
              // Real water bubble pitch-sweep upward
              const bubbleEnv = Math.exp(-v.age / v.bubbleTau);
              const bubbleFreq = f * (1.0 + v.bubbleRise * (1.0 - Math.exp(-v.age / (v.bubbleTau * 0.65))));
              v.pBubble += TWO_PI * bubbleFreq * dt;
              if (v.pBubble > TWO_PI) v.pBubble -= TWO_PI;
              const bubble = Math.sin(v.pBubble) * bubbleEnv * 0.72;

              // Inharmonic glass partials (ringing out on tap, sustained softly on hold)
              v.p1 += TWO_PI * Math.min(this.sr * 0.42, f * v.glassRatio1) * dt;
              v.p2 += TWO_PI * Math.min(this.sr * 0.42, f * v.glassRatio2) * dt;
              if (v.p1 > TWO_PI) v.p1 -= TWO_PI;
              if (v.p2 > TWO_PI) v.p2 -= TWO_PI;

              const modalEnv1 = Math.exp(-v.age / (0.35 + holdBloom * 1.6));
              const modalEnv2 = Math.exp(-v.age / (0.14 + holdBloom * 0.7));
              const sustainGlass = Math.sin(v.p0) * (0.18 + holdBloom * 0.25);

              const glassMono = bubble + Math.sin(v.p1) * modalEnv1 * 0.26 + Math.sin(v.p2) * modalEnv2 * 0.12 + sustainGlass;
              glassL = glassMono * 0.85;
              glassR = glassMono * 0.85;
            }

            // ----------------------------------------------------
            // 2) BOTTOM-LEFT: ETHEREAL SHIMMER (Additive Harmonic Bloom 3D)
            // ----------------------------------------------------
            let shimL = 0, shimR = 0;
            if (v.wShimmer > 0.01 || v.wAbyss > 0.01 || v.wGlass > 0.01) {
              v.p0 += TWO_PI * f * dt;
              v.p3 += TWO_PI * (f * 1.5 * v.detuneA) * dt;   // pure fifth shimmer
              v.p4 += TWO_PI * (f * 2.0 * v.detuneB) * dt;   // octave shimmer
              if (v.p0 > TWO_PI) v.p0 -= TWO_PI;
              if (v.p3 > TWO_PI) v.p3 -= TWO_PI;
              if (v.p4 > TWO_PI) v.p4 -= TWO_PI;

              const harmFade = 0.15 + holdBloom * 0.85;
              const fund = Math.sin(v.p0);
              const fifth = Math.sin(v.p3) * harmFade * (0.28 + v.bright * 0.28);
              const oct = Math.sin(v.p4) * harmFade * (0.24 + v.bright * 0.34);
              const highBell = Math.sin(v.p0 * 3.0 + Math.sin(v.p3) * 0.35) * harmFade * v.bright * 0.16;

              shimL = (fund * 0.55 + fifth * 0.9 + oct * 0.65 + highBell) * 0.7;
              shimR = (fund * 0.55 + fifth * 0.65 + oct * 0.9 - highBell * 0.7) * 0.7;
            }

            // ----------------------------------------------------
            // 3) TOP-LEFT: GRANULAR MIST (Micro-Grain Cloud 3F)
            // ----------------------------------------------------
            let mistL = 0, mistR = 0;
            if (v.wMist > 0.01) {
              // Grain 0
              v.g0Pos++;
              if (v.g0Pos >= v.g0Len) {
                v.g0Pos = 0;
                v.g0Len = Math.floor(this.sr * (0.025 + this.rand() * 0.065));
                const mults = [1.0, 1.5, 2.0, 2.5, 3.0];
                const mPick = mults[Math.floor(this.rand() * mults.length)];
                v.g0Freq = Math.min(this.sr * 0.4, f * mPick * (0.992 + this.rand() * 0.016));
                v.g0Pan = (this.rand() - 0.5) * 1.4;
              }
              const w0 = 0.5 - 0.5 * Math.cos(TWO_PI * (v.g0Pos / v.g0Len));
              v.g0Phase += TWO_PI * v.g0Freq * dt;
              if (v.g0Phase > TWO_PI) v.g0Phase -= TWO_PI;

              // Grain 1
              v.g1Pos++;
              if (v.g1Pos >= v.g1Len) {
                v.g1Pos = 0;
                v.g1Len = Math.floor(this.sr * (0.030 + this.rand() * 0.075));
                const mults = [0.5, 1.0, 1.5, 2.0, 4.0];
                const mPick = mults[Math.floor(this.rand() * mults.length)];
                v.g1Freq = Math.min(this.sr * 0.4, f * mPick * (0.99 + this.rand() * 0.02));
                v.g1Pan = (this.rand() - 0.5) * 1.4;
              }
              const w1 = 0.5 - 0.5 * Math.cos(TWO_PI * (v.g1Pos / v.g1Len));
              v.g1Phase += TWO_PI * v.g1Freq * dt;
              if (v.g1Phase > TWO_PI) v.g1Phase -= TWO_PI;

              // Soft filtered air whisper layered under droplets
              const white = this.rand() * 2 - 1;
              v.mistLp += (white - v.mistLp) * (0.03 + v.bright * 0.09);

              const s0 = Math.sin(v.g0Phase) * w0 * 0.42;
              const s1 = Math.sin(v.g1Phase) * w1 * 0.38;
              const air = v.mistLp * (0.06 + holdBloom * 0.08);

              mistL = s0 * (0.5 - v.g0Pan * 0.35) + s1 * (0.5 - v.g1Pan * 0.35) + air;
              mistR = s0 * (0.5 + v.g0Pan * 0.35) + s1 * (0.5 + v.g1Pan * 0.35) - air * 0.7;
            }

            // ----------------------------------------------------
            // 4) BOTTOM-RIGHT: ABYSSAL CURRENT (Sub-Harmonic Pressure Swell)
            // ----------------------------------------------------
            let abyssL = 0, abyssR = 0;
            if (v.wAbyss > 0.01 || v.stillnessBoost > 0.05) {
              v.pSub += TWO_PI * (f * 0.5) * dt;
              if (v.pSub > TWO_PI) v.pSub -= TWO_PI;

              const subSine = Math.sin(v.pSub);
              const fundWarm = Math.sin(v.p0) + Math.sin(v.p0 * 2.0) * 0.18;
              const rawAbyss = Math.tanh((subSine * 0.72 + fundWarm * 0.48) * (1.15 + holdBloom * 0.4));

              // Gentle resonant state-variable low-pass sweep
              const cutoff = Math.min(0.45, (140 + v.bright * 520 + holdBloom * 220) * dt * 2.5);
              v.svfLow += cutoff * v.svfBand;
              const high = rawAbyss - v.svfLow - 0.65 * v.svfBand;
              v.svfBand += cutoff * high;

              abyssL = v.svfLow * 0.85;
              abyssR = v.svfLow * 0.85;
            }

            // Bilinear quadrant blend + stillness sub boost
            let vL =
              mistL * v.wMist +
              glassL * v.wGlass +
              shimL * v.wShimmer +
              abyssL * (v.wAbyss + v.stillnessBoost * 0.45);
            let vR =
              mistR * v.wMist +
              glassR * v.wGlass +
              shimR * v.wShimmer +
              abyssR * (v.wAbyss + v.stillnessBoost * 0.45);

            // Stereo panner
            const panAngle = (v.pan * 0.5 + 0.5) * (Math.PI * 0.5);
            const gL = Math.cos(panAngle) * v.env * v.gainScale * 0.34;
            const gR = Math.sin(panAngle) * v.env * v.gainScale * 0.34;

            dryL += vL * gL;
            dryR += vR * gR;
          }

          // ----------------------------------------------------
          // MASTER FX (3G): Stereo Underwater Ping-Pong Delay + 4x4 FDN Reverb
          // ----------------------------------------------------
          const dReadL = this.delayBufL[this.delayIdxL];
          const dReadR = this.delayBufR[this.delayIdxR];

          // Underwater low-pass damping inside echo loop (each repeat gets darker)
          this.delayLpL += (dReadR - this.delayLpL) * 0.24;
          this.delayLpR += (dReadL - this.delayLpR) * 0.24;

          const fb = 0.46 * this.spaceMix;
          this.delayBufL[this.delayIdxL] = dryL * 0.65 + this.delayLpL * fb;
          this.delayBufR[this.delayIdxR] = dryR * 0.65 + this.delayLpR * fb;

          this.delayIdxL = (this.delayIdxL + 1) % this.delayLenL;
          this.delayIdxR = (this.delayIdxR + 1) % this.delayLenR;

          const echoL = dReadL * 0.52 * this.spaceMix;
          const echoR = dReadR * 0.52 * this.spaceMix;

          // 4-Channel Householder FDN Reverb
          const in0 = dryL + echoL * 0.7;
          const in1 = dryR + echoR * 0.7;
          const x0 = this.fdnBufs[0][this.fdnIdx[0]];
          const x1 = this.fdnBufs[1][this.fdnIdx[1]];
          const x2 = this.fdnBufs[2][this.fdnIdx[2]];
          const x3 = this.fdnBufs[3][this.fdnIdx[3]];

          // Damp high frequencies inside reverb tank
          const damp = 0.38;
          this.fdnLp[0] += (x0 - this.fdnLp[0]) * damp;
          this.fdnLp[1] += (x1 - this.fdnLp[1]) * damp;
          this.fdnLp[2] += (x2 - this.fdnLp[2]) * damp;
          this.fdnLp[3] += (x3 - this.fdnLp[3]) * damp;

          const f0 = this.fdnLp[0];
          const f1 = this.fdnLp[1];
          const f2 = this.fdnLp[2];
          const f3 = this.fdnLp[3];

          // Unitary Householder feedback matrix: y = x - 0.5 * sum(x)
          const sum = (f0 + f1 + f2 + f3) * 0.5;
          const revFb = 0.68 + this.spaceMix * 0.23;

          this.fdnBufs[0][this.fdnIdx[0]] = in0 + (f0 - sum) * revFb;
          this.fdnBufs[1][this.fdnIdx[1]] = in1 + (f1 - sum) * revFb;
          this.fdnBufs[2][this.fdnIdx[2]] = (in0 - in1) * 0.5 + (f2 - sum) * revFb;
          this.fdnBufs[3][this.fdnIdx[3]] = (in0 + in1) * 0.5 + (f3 - sum) * revFb;

          for (let k = 0; k < 4; k++) {
            this.fdnIdx[k] = (this.fdnIdx[k] + 1) % this.fdnLens[k];
          }

          const revL = (f0 + f2) * 0.34 * this.spaceMix;
          const revR = (f1 + f3) * 0.34 * this.spaceMix;

          let mixL = dryL + echoL + revL;
          let mixR = dryR + echoR + revR;

          // DC blocker
          const dcOutL = mixL - this.dcX + 0.995 * this.dcY;
          this.dcX = mixL; this.dcY = dcOutL;
          const dcOutR = mixR - this.dcXR + 0.995 * this.dcYR;
          this.dcXR = mixR; this.dcYR = dcOutR;

          // Musical soft saturation limiter (prevents clipping on 10-finger chords)
          const finalL = Math.tanh(dcOutL * 0.9);
          const finalR = Math.tanh(dcOutR * 0.9);

          outL[s] = finalL;
          outR[s] = finalR;

          this.rmsAccum += (finalL * finalL + finalR * finalR) * 0.5;
          this.rmsCount++;
        }

        // Send live acoustic RMS back to visual water engine ~25x/sec
        if (this.rmsCount >= 1800) {
          const rms = Math.sqrt(this.rmsAccum / this.rmsCount);
          this.port.postMessage({ type: 'rms', rms });
          this.rmsAccum = 0;
          this.rmsCount = 0;
        }

        return true;
      }
    }

    registerProcessor('abyssal-dsp', AbyssalDSPProcessor);
  `;

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.node = null;
      this.rms = 0;
      this.ready = false;
      this.failedReason = null;
    }

    async init() {
      if (this.ready) {
        if (this.ctx && this.ctx.state === 'suspended') {
          await this.ctx.resume();
        }
        return true;
      }

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        this.failedReason = 'Web Audio API unavailable in this browser.';
        return false;
      }

      this.ctx = new AudioCtx({ latencyHint: 'interactive' });
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      if (!this.ctx.audioWorklet) {
        this.failedReason = 'AudioWorklet requires HTTPS or localhost.';
        return false;
      }

      const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      try {
        await this.ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }

      this.node = new AudioWorkletNode(this.ctx, 'abyssal-dsp', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2]
      });

      this.node.port.onmessage = (e) => {
        if (e.data && e.data.type === 'rms') {
          this.rms = e.data.rms;
        }
      };

      this.node.connect(this.ctx.destination);
      this.ready = true;
      return true;
    }

    post(msg) {
      if (this.ready && this.node) {
        this.node.port.postMessage(msg);
      }
    }
  }

  window.AudioEngine = AudioEngine;
})();