; ============================================================================
; MinnaertBubble UDO (Van den Doel + Phillips/Agarwal/Jordan Physics)
; Models an entrapped air bubble pinching off after cavity impact:
;  - Radius-dependent physical damping: d(f0) = 0.043*f0 + 0.00072*f0^1.5
;  - Saturating upward hydrodynamic frequency sweep as bubble rises
;  - Subtle fluid turbulence jitter so bubbles never sound static/electronic
; Input:  iFreq0, iAmp, iPinchDelaySec, iResonanceScale
; Output: aOut
; ============================================================================
opcode MinnaertBubble, a, iiii
  iFreq0, iAmp, iPinchDelay, iResScale xin

  ; Safe frequency bounds
  iF0 limit iFreq0, 120, 4800

  ; Physical damping rate d (s^-1) -> decay tau = 1 / d
  iDampRate = 0.043 * iF0 + 0.00072 * pow(iF0, 1.5)
  iTau      = limit((1.0 / iDampRate) * iResScale, 0.006, 0.19)

  ; Cavity pinch-off wait (2-8ms after initial surface break) + rapid liquid onset
  iRiseOnset = 0.0012
  iHoldRem   = max(0.01, p3 - iPinchDelay - iRiseOnset)
  aEnv       linseg 0, iPinchDelay, 0, iRiseOnset, 1, iHoldRem, 1
  aDecay     expseg 0.0001, iPinchDelay + iRiseOnset, 1.0, iTau * 3.8, 0.0002, max(0.01, p3), 0.0002

  ; Hydrodynamic pitch rise (bubble rises toward free surface, decreasing added mass)
  iXiMax     random 0.14, 0.36
  iRiseTau   = iTau * 0.72
  aChirp     linseg 0, iPinchDelay, 0, iRiseTau * 2.5, iXiMax, max(0.01, p3), iXiMax
  ; Smooth concave approach via sqrt shaping
  aChirpCurve = iXiMax * (1.0 - exp(-max(0, (aChirp / max(0.001, iXiMax)) * 2.8)))

  ; Micro fluid jitter (~0.6%) prevents sterile oscillator phase lock
  kMicroJit  jitter 0.006, 18, 55
  aFreq      = min(sr * 0.38, iF0 * (1.0 + aChirpCurve + kMicroJit))

  ; Primary oscillating gas volume + gentle 2nd harmonic surface nonlinearity
  aBody      poscil 1.0, aFreq, giSine
  aHarm2     poscil 0.06, min(sr * 0.42, aFreq * 2.02), giSine

  aOut = (aBody + aHarm2) * aEnv * aDecay * iAmp
  xout aOut
endop