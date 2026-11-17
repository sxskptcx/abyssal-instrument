; ============================================================================
; ImpactCavity2C UDO (Option 2C: Velocity/Contact-Adaptive Surface Impact)
; Produces physical 0-30ms fluid break + cavity displacement without oscillators.
; Input:  iAmp, iSharpness (0 = heavy cavity thud, 1 = delicate capillary snap),
;         iBaseFreq (scales cavity scale)
; Output: aOut
; ============================================================================
opcode ImpactCavity2C, a, iii
  iAmp, iSharpness, iBaseFreq xin

  ; 1) Delicate Capillary Surface Tension Break (2-5ms noise burst -> surface modes)
  iSnapDur  random 0.0022, 0.0052
  aSnapEnv  expseg 1.0, iSnapDur, 0.0001, p3 - iSnapDur, 0.0001
  aWhite    noise 1.0, 0.0
  aSnapExc  = aWhite * aSnapEnv

  iSnapF1   random 2100, 4200
  iSnapF2   random 4400, 7200
  aSnapM1   mode aSnapExc, iSnapF1, 5.5
  aSnapM2   mode aSnapExc, iSnapF2, 7.5
  aSnapRaw  buthp (aSnapM1 * 0.65 + aSnapM2 * 0.35), 950

  ; 2) Viscous Fluid Displacement Cavity Thud (14-30ms low-Q cavity mode)
  iThudDur  random 0.015, 0.028
  aThudEnv  expseg 1.0, iThudDur, 0.0001, p3 - iThudDur, 0.0001
  aBrown    fractalnoise 1.0, 1.75
  aThudExc  = aBrown * aThudEnv

  ; Larger drops (lower baseFreq) displace slightly lower cavity frequencies
  iCavFreq  limit (48 + (1800 / max(150, iBaseFreq)) * 9.0) * (0.88 + rnd(0.24)), 44, 118
  aCavMode  mode aThudExc, iCavFreq, 3.0
  aThudRaw  lowpass2 aCavMode, iCavFreq * 2.8, 0.8

  ; 2C Continuous Blend: sharp feather tap <-> heavy submerged press
  iSnapGain = (0.18 + iSharpness * 0.82) * 0.32
  iThudGain = (1.0 - iSharpness * 0.78) * 0.58

  aOut = (aSnapRaw * iSnapGain + aThudRaw * iThudGain) * iAmp
  xout aOut
endop