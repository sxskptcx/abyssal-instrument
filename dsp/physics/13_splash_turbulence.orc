; ============================================================================
; CrownSheetSpray UDO (Audible Wet Crown Splatter & Fluid Slosh Physics)
; ============================================================================
opcode CrownSheetSpray, a, iiii
  iAmp, iSplashEnergy, iBaseFreq, iDur xin

  iDurSafe   = (iDur > 0.08 ? iDur : 0.08)
  iEnergy    limit iSplashEnergy, 0.0, 1.0

  ; Spray lifetime scales strongly with splash energy (45ms..210ms)
  iSprayDur  = 0.045 + iEnergy * 0.165
  iSprayDur  = (iSprayDur < iDurSafe - 0.01 ? iSprayDur : iDurSafe - 0.01)
  iRem       = (iDurSafe - iSprayDur > 0.01 ? iDurSafe - iSprayDur : 0.01)

  ; 1) Micro-ligament breakup impulses (dense liquid splatter)
  iDensStart = 320 + iEnergy * 1350
  kDens      expseg iDensStart, iSprayDur, 16.0, iRem, 16.0
  aDust      dust2 1.0, kDens

  aEnvDust   expseg 0.001, 0.003, 1.0, iSprayDur, 0.0002, iRem, 0.0002
  aDustExc   = aDust * aEnvDust

  iBaseSafe  limit iBaseFreq, 130, 1400
  iMul1      random 2.0, 2.6
  iMul2      random 3.4, 4.4
  iModeF1    limit iBaseSafe * iMul1, 750, 3800
  iModeF2    limit iBaseSafe * iMul2, 1500, 6200

  aSprayM1   mode aDustExc, iModeF1, 7.2
  aSprayM2   mode aDustExc, iModeF2, 9.8
  aLigaments = aSprayM1 * 0.64 + aSprayM2 * 0.36

  ; 2) Wet crown-sheet fluid slosh sweeping down as displaced wave collapses
  aAir       noise 1.0, 0.0
  iStartCf   limit 1350 + iEnergy * 2100, 900, 4400
  iEndCf     limit 320 + iEnergy * 340, 280, 1100
  kSweep     expseg iStartCf, iSprayDur, iEndCf, iRem, iEndCf
  aAirBand   butbp aAir, kSweep, kSweep * 0.48

  aEnvAir    expseg 0.0005, 0.006, 1.0, iSprayDur * 0.90, 0.0002, iRem, 0.0002
  aSlosh     = aAirBand * aEnvAir * 0.34

  ; Bold presence on wide splashes while staying clean
  iScale     = pow(iEnergy, 1.22) * iAmp * 0.85
  aMix       = (aLigaments * 0.88 + aSlosh * 0.65) * iScale
  aOut       buthp aMix, 220

  xout aOut
endop