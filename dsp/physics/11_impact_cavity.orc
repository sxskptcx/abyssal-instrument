; ============================================================================
; ImpactCavity2C UDO (Bold Contrast: Sharp Capillary Tick vs. Hollow Plunge)
; ============================================================================
opcode ImpactCavity2C, a, iiii
  iAmp, iSharpness, iBaseFreq, iDur xin

  iDurSafe = (iDur > 0.05 ? iDur : 0.05)
  iWide    = 1.0 - iSharpness

  ; 1) Capillary Surface Tension Snap (ultra-clean tiny click on sharp tip)
  iSnapDur  random 0.0016, 0.0040
  iSnapRem  = (iDurSafe - iSnapDur > 0.005 ? iDurSafe - iSnapDur : 0.005)
  aSnapEnv  expseg 1.0, iSnapDur, 0.0001, iSnapRem, 0.0001
  aWhite    noise 1.0, 0.0
  aSnapExc  = aWhite * aSnapEnv

  iSnapF1   random 2600, 4800
  iSnapF2   random 4900, 7800
  aSnapM1   mode aSnapExc, iSnapF1, 7.0
  aSnapM2   mode aSnapExc, iSnapF2, 9.0
  aSnapMix  = aSnapM1 * 0.65 + aSnapM2 * 0.35
  aSnapRaw  buthp aSnapMix, 1300

  ; 2) Viscous Fluid Cavity Displacement + Hollow "Ker-Plunk" (wide thumb press)
  iThudDur  random 0.022, 0.044
  iThudRem  = (iDurSafe - iThudDur > 0.005 ? iDurSafe - iThudDur : 0.005)
  aThudEnv  expseg 1.0, iThudDur, 0.0001, iThudRem, 0.0001
  aWhiteB   noise 1.0, 0.0
  aBrown    tone aWhiteB, 210
  aThudExc  = (aBrown * 4.6) * aThudEnv

  iBaseSafe = (iBaseFreq > 130 ? iBaseFreq : 130)
  iCavJit   random 0.88, 1.12
  iCavRaw   = (66 + (1600 / iBaseSafe) * 10.5) * iCavJit
  iCavFreq  limit iCavRaw, 62, 142

  aCavMode  mode aThudExc, iCavFreq, 3.6
  ; Hollow open-crater Helmholtz mode (audible on both Fold speakers & headphones)
  iPlunkF   limit iCavFreq * 2.15, 115, 290
  aPlunk    mode aThudExc, iPlunkF, 6.2
  aThudSum  = aCavMode * 0.72 + aPlunk * 0.58
  aThudRaw  lowpass2 aThudSum, iCavFreq * 3.8, 0.9

  ; Strong nonlinear contrast: sharp tip has almost zero thud; wide thumb hits heavy
  iSnapGain = (0.10 + iSharpness * 0.90) * 0.38
  iThudGain = 0.02 + pow(iWide, 1.35) * 1.15

  aOut = (aSnapRaw * iSnapGain + aThudRaw * iThudGain) * iAmp
  xout aOut
endop