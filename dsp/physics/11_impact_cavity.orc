; ============================================================================
; ImpactCavity2C UDO (Enhanced Sharp Tip vs. Wide Fluid Displacement Contrast)
; ============================================================================
opcode ImpactCavity2C, a, iiii
  iAmp, iSharpness, iBaseFreq, iDur xin

  iDurSafe = (iDur > 0.05 ? iDur : 0.05)

  ; 1) Capillary Surface Tension Snap (crisp delicate click on sharp taps)
  iSnapDur  random 0.0018, 0.0046
  iSnapRem  = (iDurSafe - iSnapDur > 0.005 ? iDurSafe - iSnapDur : 0.005)
  aSnapEnv  expseg 1.0, iSnapDur, 0.0001, iSnapRem, 0.0001
  aWhite    noise 1.0, 0.0
  aSnapExc  = aWhite * aSnapEnv

  iSnapF1   random 2400, 4600
  iSnapF2   random 4700, 7600
  aSnapM1   mode aSnapExc, iSnapF1, 6.0
  aSnapM2   mode aSnapExc, iSnapF2, 8.0
  aSnapMix  = aSnapM1 * 0.65 + aSnapM2 * 0.35
  aSnapRaw  buthp aSnapMix, 1100

  ; 2) Viscous Fluid Displacement Cavity Thud (audible deep warmth on wide presses)
  iThudDur  random 0.018, 0.036
  iThudRem  = (iDurSafe - iThudDur > 0.005 ? iDurSafe - iThudDur : 0.005)
  aThudEnv  expseg 1.0, iThudDur, 0.0001, iThudRem, 0.0001
  aWhiteB   noise 1.0, 0.0
  aBrown    tone aWhiteB, 175
  aThudExc  = (aBrown * 4.2) * aThudEnv

  iBaseSafe = (iBaseFreq > 150 ? iBaseFreq : 150)
  iCavJit   random 0.88, 1.12
  ; Wide presses shift cavity resonance slightly deeper & fuller
  iWideLow  = 1.0 - (1.0 - iSharpness) * 0.24
  iCavRaw   = (62 + (1800 / iBaseSafe) * 11.5) * iCavJit * iWideLow
  iCavFreq  limit iCavRaw, 58, 138

  aCavMode  mode aThudExc, iCavFreq, 3.2
  aThudRaw  lowpass2 aCavMode, iCavFreq * 3.1, 0.85

  ; Dramatic 2C dynamic shift: sharp taps stay feather-clean, wide taps thump deeply
  iWide     = 1.0 - iSharpness
  iSnapGain = (0.14 + iSharpness * 0.86) * 0.36
  iThudGain = 0.06 + pow(iWide, 1.25) * 0.86

  aOut = (aSnapRaw * iSnapGain + aThudRaw * iThudGain) * iAmp
  xout aOut
endop