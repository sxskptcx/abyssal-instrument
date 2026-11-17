; ============================================================================
; ImpactCavity2C UDO (Option 2C: Velocity/Contact-Adaptive Surface Impact)
; ============================================================================
opcode ImpactCavity2C, a, iiii
  iAmp, iSharpness, iBaseFreq, iDur xin

  iDurSafe = (iDur > 0.05 ? iDur : 0.05)

  ; 1) Delicate Capillary Surface Tension Break (2-5ms noise burst -> surface modes)
  iSnapDur  random 0.0022, 0.0052
  iSnapRem  = (iDurSafe - iSnapDur > 0.005 ? iDurSafe - iSnapDur : 0.005)
  aSnapEnv  expseg 1.0, iSnapDur, 0.0001, iSnapRem, 0.0001
  aWhite    noise 1.0, 0.0
  aSnapExc  = aWhite * aSnapEnv

  iSnapF1   random 2100, 4200
  iSnapF2   random 4400, 7200
  aSnapM1   mode aSnapExc, iSnapF1, 5.5
  aSnapM2   mode aSnapExc, iSnapF2, 7.5
  aSnapMix  = aSnapM1 * 0.65 + aSnapM2 * 0.35
  aSnapRaw  buthp aSnapMix, 950

  ; 2) Viscous Fluid Displacement Cavity Thud (14-30ms low-Q cavity mode)
  iThudDur  random 0.015, 0.028
  iThudRem  = (iDurSafe - iThudDur > 0.005 ? iDurSafe - iThudDur : 0.005)
  aThudEnv  expseg 1.0, iThudDur, 0.0001, iThudRem, 0.0001
  aBrown    fractalnoise 1.0, 1.75
  aThudExc  = aBrown * aThudEnv

  iBaseSafe = (iBaseFreq > 150 ? iBaseFreq : 150)
  iCavJit   random 0.88, 1.12
  iCavRaw   = (48 + (1800 / iBaseSafe) * 9.0) * iCavJit
  iCavFreq  limit iCavRaw, 44, 118

  aCavMode  mode aThudExc, iCavFreq, 3.0
  aThudRaw  lowpass2 aCavMode, iCavFreq * 2.8, 0.8

  iSnapGain = (0.18 + iSharpness * 0.82) * 0.32
  iThudGain = (1.0 - iSharpness * 0.78) * 0.58

  aOut = (aSnapRaw * iSnapGain + aThudRaw * iThudGain) * iAmp
  xout aOut
endop