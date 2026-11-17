/**
 * WebGL2 2D Shallow-Water Wave Equation + Advected Light-Color Field
 * Renders glowing normal-refracted caustics out of pure #000000 OLED black.
 */
(function () {
  const VERT_SRC = `#version 300 es
    in vec2 aPos;
    out vec2 vUv;
    void main() {
      vUv = aPos * 0.5 + 0.5;
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  `;

  // Pass 1: Wave Equation (h, v) + Color Light Energy Field (r, g, b, lum)
  // Using two RGBA16F ping-pong textures:
  // texWave:  R = current height h, G = velocity v, B = local turbulence, A = 1
  // texColor: R, G, B = injected light color energy, A = caustic bloom intensity
  const WAVE_FRAG = `#version 300 es
    precision highp float;

    uniform sampler2D uWave;
    uniform sampler2D uColor;
    uniform vec2 uTexel;
    uniform float uDamping;
    uniform float uColorDecay;
    uniform float uTime;

    // Up to 12 simultaneous touch/combo impulses per frame
    uniform int uImpulseCount;
    uniform vec4 uImpPosRad[12];   // xy = uv, z = radius, w = signed wave impulse strength
    uniform vec4 uImpCol[12];      // rgb = color, w = color injection strength

    // Ambient background subtle glint
    uniform vec4 uAmbientGlint;    // xy = uv, z = radius, w = strength
    uniform vec3 uAmbientColor;

    in vec2 vUv;
    layout(location = 0) out vec4 outWave;
    layout(location = 1) out vec4 outColor;

    void main() {
      vec4 wC = texture(uWave, vUv);
      vec4 cC = texture(uColor, vUv);

      // 9-point isotropic Laplacian for ultra-round ripples (no diamond grid artifacts)
      vec2 dx = vec2(uTexel.x, 0.0);
      vec2 dy = vec2(0.0, uTexel.y);

      float hN  = texture(uWave, clamp(vUv + dy, 0.001, 0.999)).r;
      float hS  = texture(uWave, clamp(vUv - dy, 0.001, 0.999)).r;
      float hE  = texture(uWave, clamp(vUv + dx, 0.001, 0.999)).r;
      float hW  = texture(uWave, clamp(vUv - dx, 0.001, 0.999)).r;
      float hNE = texture(uWave, clamp(vUv + dx + dy, 0.001, 0.999)).r;
      float hNW = texture(uWave, clamp(vUv - dx + dy, 0.001, 0.999)).r;
      float hSE = texture(uWave, clamp(vUv + dx - dy, 0.001, 0.999)).r;
      float hSW = texture(uWave, clamp(vUv - dx - dy, 0.001, 0.999)).r;

      float lap = 0.20 * (hN + hS + hE + hW) + 0.05 * (hNE + hNW + hSE + hSW) - wC.r;

      float h = wC.r;
      float v = wC.g;

      // Soft edge damping so waves reflect gently without ringing forever
      float edgeDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
      float edgeMask = smoothstep(0.0, 0.045, edgeDist);

      v += lap * 0.95;
      v *= uDamping * mix(0.965, 1.0, edgeMask);
      h += v;
      h *= mix(0.985, 0.9994, edgeMask);

      // Advect & diffuse color light slightly along wave slope so light rides ripples
      vec2 grad = vec2(hE - hW, hN - hS);
      vec2 advUv = clamp(vUv - grad * 0.035, 0.001, 0.999);
      vec4 cAdv = texture(uColor, advUv);
      vec4 cBlur = (
        texture(uColor, vUv + dx) +
        texture(uColor, vUv - dx) +
        texture(uColor, vUv + dy) +
        texture(uColor, vUv - dy)
      ) * 0.25;

      vec4 col = mix(cAdv, cBlur, 0.14);
      col *= uColorDecay;

      float turb = wC.b * 0.94 + abs(lap) * 0.45;

      // Apply touch & hold impulses
      for (int i = 0; i < 12; i++) {
        if (i >= uImpulseCount) break;
        vec4 pr = uImpPosRad[i];
        vec2 d = (vUv - pr.xy);
        // Correct aspect distortion using uTexel ratio
        d.x *= (uTexel.y / uTexel.x);
        float dist2 = dot(d, d);
        float r2 = pr.z * pr.z;
        if (dist2 < r2 * 4.0) {
          float falloff = exp(-dist2 / max(r2, 0.00001));
          v += pr.w * falloff;
          vec4 ic = uImpCol[i];
          col.rgb += ic.rgb * ic.w * falloff;
          col.a += ic.w * falloff * 0.9;
          turb += abs(pr.w) * falloff * 0.6;
        }
      }

      // Subtle random ambient water glint
      if (uAmbientGlint.w > 0.0001) {
        vec2 da = vUv - uAmbientGlint.xy;
        da.x *= (uTexel.y / uTexel.x);
        float fa = exp(-dot(da, da) / max(uAmbientGlint.z * uAmbientGlint.z, 0.00001));
        v += uAmbientGlint.w * fa * 0.25;
        col.rgb += uAmbientColor * uAmbientGlint.w * fa * 0.7;
        col.a += uAmbientGlint.w * fa * 0.5;
      }

      h = clamp(h, -2.5, 2.5);
      v = clamp(v, -1.5, 1.5);
      col = clamp(col, 0.0, 4.0);
      turb = clamp(turb, 0.0, 2.0);

      outWave = vec4(h, v, turb, 1.0);
      outColor = col;
    }
  `;

  // Pass 2: Display shader — Pure #000000 base, surface-normal Fresnel, caustics & mood colors
  const DISPLAY_FRAG = `#version 300 es
    precision highp float;

    uniform sampler2D uWave;
    uniform sampler2D uColor;
    uniform vec2 uTexel;
    uniform vec3 uMoodPrimary;
    uniform vec3 uMoodSecondary;
    uniform vec3 uMoodAccent;
    uniform float uConsonance;
    uniform float uEnergy;
    uniform float uAudioRms;
    uniform float uTime;

    in vec2 vUv;
    out vec4 fragColor;

    void main() {
      vec2 dx = vec2(uTexel.x, 0.0);
      vec2 dy = vec2(0.0, uTexel.y);

      vec4 wC = texture(uWave, vUv);
      float hL = texture(uWave, vUv - dx).r;
      float hR = texture(uWave, vUv + dx).r;
      float hD = texture(uWave, vUv - dy).r;
      float hU = texture(uWave, vUv + dy).r;

      // Surface normal from heightfield gradient
      vec2 slope = vec2(hR - hL, hU - hD) * 2.6;
      vec3 normal = normalize(vec3(-slope.x, -slope.y, 0.16));

      // Curvature approximation -> focused caustics along wave crests
      float lap = (hL + hR + hD + hU) * 0.25 - wC.r;
      float caustic = clamp(-lap * 5.2, 0.0, 2.0);
      float crest = clamp(abs(wC.r) * 1.45 + length(slope) * 0.9, 0.0, 2.5);

      // Dual grazing-angle light reflections
      vec3 lightDir1 = normalize(vec3(0.45, 0.65, 0.62));
      vec3 lightDir2 = normalize(vec3(-0.55, -0.35, 0.72));
      vec3 viewDir = vec3(0.0, 0.0, 1.0);

      vec3 h1 = normalize(lightDir1 + viewDir);
      vec3 h2 = normalize(lightDir2 + viewDir);
      float spec1 = pow(max(dot(normal, h1), 0.0), 44.0);
      float spec2 = pow(max(dot(normal, h2), 0.0), 28.0);

      // Local advected touch color + mood harmony blend
      vec4 localCol = texture(uColor, vUv + slope * 0.015);
      float dyeLum = max(localCol.r, max(localCol.g, localCol.b));

      // Interference shimmer where waves cross
      float interference = smoothstep(0.03, 0.55, crest + wC.b * 0.5);

      // Blend curated mood palette based on wave phase & consonance
      float wavePhase = 0.5 + 0.5 * sin(wC.r * 5.5 + uTime * 0.7);
      vec3 moodTint = mix(uMoodPrimary, uMoodSecondary, wavePhase);
      moodTint = mix(moodTint, uMoodAccent, clamp(uConsonance * 0.75 * spec1 + caustic * 0.3, 0.0, 1.0));

      vec3 effectiveColor = mix(moodTint, localCol.rgb / max(dyeLum, 0.001), clamp(dyeLum * 0.85, 0.0, 0.85));

      // Pitch-black #000000 when calm; light emerges strictly from wave energy & caustics
      float lightStrength =
        interference * 0.42 +
        caustic * (0.48 + uAudioRms * 0.65) +
        localCol.a * 0.42;

      vec3 rgb = effectiveColor * lightStrength;

      // Specular highlights (soft pearlescent tint, never harsh clipped white)
      vec3 specColor = mix(effectiveColor * 1.3 + 0.2, vec3(0.92, 0.97, 1.0), 0.55);
      rgb += specColor * (spec1 * 0.85 + spec2 * 0.35) * (0.35 + localCol.a * 0.9 + crest * 0.6);

      // Gentle audio-reactive sheen on active crests
      rgb += uMoodAccent * (uAudioRms * caustic * 0.45);

      // Soft filmic tone-mapping preserving pure #000000 black floor
      rgb = rgb / (1.0 + rgb * 0.45);
      // Cut sub-noise floor cleanly so OLED pixels turn fully off when dark
      rgb *= smoothstep(0.0015, 0.012, max(rgb.r, max(rgb.g, rgb.b)));

      fragColor = vec4(rgb, 1.0);
    }
  `;

  class WaterEngine {
    constructor(canvas) {
      this.canvas = canvas;
      this.gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance'
      });

      if (!this.gl) {
        throw new Error('WebGL2 not supported on this browser.');
      }

      const gl = this.gl;
      this.extFloat = gl.getExtension('EXT_color_buffer_float');
      this.extHalf = gl.getExtension('EXT_color_buffer_half_float');
      this.extFloatLin = gl.getExtension('OES_texture_float_linear');
      this.extHalfLin = gl.getExtension('OES_texture_half_float_linear');

      this.useHalfFloat = !!(this.extFloat || this.extHalf);
      this.simScale = 360; // Longest sim side in pixels -> smooth 120Hz physics
      this.simW = 360;
      this.simH = 360;
      this.ping = 0;

      this.impulses = [];
      this.ambientTimer = 1.5;
      this.ambientGlint = { x: 0.5, y: 0.5, rad: 0.03, strength: 0, col: [0.1, 0.3, 0.6] };

      this.mood = {
        primary: [0.08, 0.25, 0.65],
        secondary: [0.22, 0.12, 0.58],
        accent: [0.35, 0.85, 0.95],
        consonance: 0.5,
        energy: 0.2,
        audioRms: 0.0
      };

      this._initShaders();
      this._initQuad();
      this.resize();
    }

    _compile(type, src) {
      const gl = this.gl;
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        throw new Error('Shader compile error: ' + log);
      }
      return s;
    }

    _link(vsSrc, fsSrc) {
      const gl = this.gl;
      const p = gl.createProgram();
      gl.attachShader(p, this._compile(gl.VERTEX_SHADER, vsSrc));
      gl.attachShader(p, this._compile(gl.FRAGMENT_SHADER, fsSrc));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        throw new Error('Program link error: ' + gl.getProgramInfoLog(p));
      }
      return p;
    }

    _initShaders() {
      const gl = this.gl;
      this.waveProg = this._link(VERT_SRC, WAVE_FRAG);
      this.dispProg = this._link(VERT_SRC, DISPLAY_FRAG);

      this.uW = {
        uWave: gl.getUniformLocation(this.waveProg, 'uWave'),
        uColor: gl.getUniformLocation(this.waveProg, 'uColor'),
        uTexel: gl.getUniformLocation(this.waveProg, 'uTexel'),
        uDamping: gl.getUniformLocation(this.waveProg, 'uDamping'),
        uColorDecay: gl.getUniformLocation(this.waveProg, 'uColorDecay'),
        uTime: gl.getUniformLocation(this.waveProg, 'uTime'),
        uImpulseCount: gl.getUniformLocation(this.waveProg, 'uImpulseCount'),
        uImpPosRad: gl.getUniformLocation(this.waveProg, 'uImpPosRad'),
        uImpCol: gl.getUniformLocation(this.waveProg, 'uImpCol'),
        uAmbientGlint: gl.getUniformLocation(this.waveProg, 'uAmbientGlint'),
        uAmbientColor: gl.getUniformLocation(this.waveProg, 'uAmbientColor')
      };

      this.uD = {
        uWave: gl.getUniformLocation(this.dispProg, 'uWave'),
        uColor: gl.getUniformLocation(this.dispProg, 'uColor'),
        uTexel: gl.getUniformLocation(this.dispProg, 'uTexel'),
        uMoodPrimary: gl.getUniformLocation(this.dispProg, 'uMoodPrimary'),
        uMoodSecondary: gl.getUniformLocation(this.dispProg, 'uMoodSecondary'),
        uMoodAccent: gl.getUniformLocation(this.dispProg, 'uMoodAccent'),
        uConsonance: gl.getUniformLocation(this.dispProg, 'uConsonance'),
        uEnergy: gl.getUniformLocation(this.dispProg, 'uEnergy'),
        uAudioRms: gl.getUniformLocation(this.dispProg, 'uAudioRms'),
        uTime: gl.getUniformLocation(this.dispProg, 'uTime')
      };
    }

    _initQuad() {
      const gl = this.gl;
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
    }

    _createTex(w, h) {
      const gl = this.gl;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      const linear = (this.extFloat && this.extFloatLin) || (this.extHalf && this.extHalfLin);
      const filter = linear ? gl.LINEAR : gl.NEAREST;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      if (this.extHalf) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      } else if (this.extFloat) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      }
      return tex;
    }

    _createPair(w, h) {
      const gl = this.gl;
      const wave = this._createTex(w, h);
      const color = this._createTex(w, h);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, wave, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, color, 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { wave, color, fbo };
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
      const w = Math.max(1, Math.floor(window.innerWidth * dpr));
      const h = Math.max(1, Math.floor(window.innerHeight * dpr));
      this.canvas.width = w;
      this.canvas.height = h;

      const aspect = w / h;
      if (aspect >= 1) {
        this.simW = this.simScale;
        this.simH = Math.max(64, Math.round(this.simScale / aspect));
      } else {
        this.simH = this.simScale;
        this.simW = Math.max(64, Math.round(this.simScale * aspect));
      }

      if (this.targets) {
        const gl = this.gl;
        for (const t of this.targets) {
          gl.deleteTexture(t.wave);
          gl.deleteTexture(t.color);
          gl.deleteFramebuffer(t.fbo);
        }
      }
      this.targets = [
        this._createPair(this.simW, this.simH),
        this._createPair(this.simW, this.simH)
      ];
      this.ping = 0;
    }

    /**
     * Inject a ripple + light color pulse at screen normalized coordinates (0..1, top=0)
     */
    addImpulse(normX, normY, radius, waveStrength, rgb, colorStrength) {
      if (this.impulses.length >= 12) return;
      this.impulses.push({
        x: normX,
        y: 1.0 - normY, // Flip Y for WebGL UV space
        radius,
        waveStrength,
        rgb,
        colorStrength
      });
    }

    updateMood(mood) {
      Object.assign(this.mood, mood);
    }

    render(dt, timeSec) {
      const gl = this.gl;

      // Occasional subtle random underwater glint when background is quiet
      this.ambientTimer -= dt;
      if (this.ambientTimer <= 0) {
        this.ambientTimer = 2.4 + Math.random() * 4.5;
        this.ambientGlint.x = 0.08 + Math.random() * 0.84;
        this.ambientGlint.y = 0.08 + Math.random() * 0.84;
        this.ambientGlint.rad = 0.018 + Math.random() * 0.025;
        this.ambientGlint.strength = 0.08 + Math.random() * 0.09;
        this.ambientGlint.col = [
          this.mood.primary[0] * 0.6 + this.mood.accent[0] * 0.4,
          this.mood.primary[1] * 0.6 + this.mood.accent[1] * 0.4,
          this.mood.primary[2] * 0.6 + this.mood.accent[2] * 0.4
        ];
      } else {
        this.ambientGlint.strength *= Math.pow(0.06, dt);
      }

      // Pack up to 12 impulses
      const count = Math.min(12, this.impulses.length);
      const posRad = new Float32Array(48);
      const cols = new Float32Array(48);
      for (let i = 0; i < count; i++) {
        const imp = this.impulses[i];
        posRad[i * 4 + 0] = imp.x;
        posRad[i * 4 + 1] = imp.y;
        posRad[i * 4 + 2] = imp.radius;
        posRad[i * 4 + 3] = imp.waveStrength;
        cols[i * 4 + 0] = imp.rgb[0];
        cols[i * 4 + 1] = imp.rgb[1];
        cols[i * 4 + 2] = imp.rgb[2];
        cols[i * 4 + 3] = imp.colorStrength;
      }
      this.impulses.length = 0;

      // Sub-step wave physics cleanly (1 or 2 steps depending on frame rate)
      const steps = dt > 0.012 ? 2 : 1;
      gl.bindVertexArray(this.vao);

      for (let s = 0; s < steps; s++) {
        const src = this.targets[this.ping];
        const dst = this.targets[1 - this.ping];

        gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
        gl.viewport(0, 0, this.simW, this.simH);
        gl.useProgram(this.waveProg);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, src.wave);
        gl.uniform1i(this.uW.uWave, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, src.color);
        gl.uniform1i(this.uW.uColor, 1);

        gl.uniform2f(this.uW.uTexel, 1.0 / this.simW, 1.0 / this.simH);
        gl.uniform1f(this.uW.uDamping, 0.9905);
        gl.uniform1f(this.uW.uColorDecay, 0.986);
        gl.uniform1f(this.uW.uTime, timeSec);

        // Inject impulses only on first sub-step
        if (s === 0) {
          gl.uniform1i(this.uW.uImpulseCount, count);
          gl.uniform4fv(this.uW.uImpPosRad, posRad);
          gl.uniform4fv(this.uW.uImpCol, cols);
          gl.uniform4f(
            this.uW.uAmbientGlint,
            this.ambientGlint.x,
            this.ambientGlint.y,
            this.ambientGlint.rad,
            this.ambientGlint.strength
          );
          gl.uniform3fv(this.uW.uAmbientColor, this.ambientGlint.col);
        } else {
          gl.uniform1i(this.uW.uImpulseCount, 0);
          gl.uniform4f(this.uW.uAmbientGlint, 0, 0, 0.01, 0);
        }

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        this.ping = 1 - this.ping;
      }

      // Render final display pass to screen
      const current = this.targets[this.ping];
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.useProgram(this.dispProg);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, current.wave);
      gl.uniform1i(this.uD.uWave, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, current.color);
      gl.uniform1i(this.uD.uColor, 1);

      gl.uniform2f(this.uD.uTexel, 1.0 / this.simW, 1.0 / this.simH);
      gl.uniform3fv(this.uD.uMoodPrimary, this.mood.primary);
      gl.uniform3fv(this.uD.uMoodSecondary, this.mood.secondary);
      gl.uniform3fv(this.uD.uMoodAccent, this.mood.accent);
      gl.uniform1f(this.uD.uConsonance, this.mood.consonance);
      gl.uniform1f(this.uD.uEnergy, this.mood.energy);
      gl.uniform1f(this.uD.uAudioRms, this.mood.audioRms);
      gl.uniform1f(this.uD.uTime, timeSec);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
    }
  }

  window.WaterEngine = WaterEngine;
})();