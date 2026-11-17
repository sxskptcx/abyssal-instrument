; ============================================================================
; CrownSheetSpray UDO (Ligament Breakup & Aerated Crown Splatter Physics)
; ============================================================================
opcode CrownSheetSpray, a, iiii
  iAmp, iSplashEnergy, iBaseFreq, iDur xin

  iDurSafe   = (iDur > 0.08 ? iDur : 0.08)
  iEnergy    limit iSplashEnergy, 0.0, 1.0

  ; Spray lifetime scales with splash energy (35ms..155ms)
  iSprayDur  = 0.035 + iEnergy * 0.120
  iSprayDur  = (iSprayDur < iDurSafe - 0.01 ? iSprayDur : iDurSafe - 0.01)
  iRem       = (iDurSafe - iSprayDur > 0.01 ? iDurSafe - iSprayDur : 0.01)

  ; 1) Micro-ligament breakup impulses (dust2 density decaying exponentially)
  iDensStart = 280 + iEnergy * 950
  kDens      expseg iDensStart, iSprayDur, 12.0, iRem, 12.0
  aDust      dust2 1.0, kDens

  aEnvDust   expseg 0.001, 0.003, 1.0, iSprayDur, 0.0002, iRem, 0.0002
  aDustExc   = aDust * aEnvDust

  iBaseSafe  limit iBaseFreq, 180, 1500
  iMul1      random 2.2, 2.7
  iMul2      random 3.8, 4.7
  iModeF1    limit iBaseSafe * iMul1, 900, 4200
  iModeF2    limit iBaseSafe * iMul2, 1800, 6800

  aSprayM1   mode aDustExc, iModeF1, 7.5
  aSprayM2   mode aDustExc, iModeF2, 10.5
  aLigaments = aSprayM1 * 0.62 + aSprayM2 * 0.38

  ; 2) Aerated crown sheet turbulence sweeping down as sheet relaxes
  aAir       noise 1.0, 0.0
  iStartCf   limit 1800 + iEnergy * 2400, 1200, 5200
  iEndCf     limit 620 + iEnergy * 480, 450, 1800
  kSweep     expseg iStartCf, iSprayDur, iEndCf, iRem, iEndCf
  aAirBand   butbp aAir, kSweep, kSweep * 0.55

  aEnvAir    expseg 0.0005, 0.005, 1.0, iSprayDur * 0.85, 0.0002, iRem, 0.0002
  aAirTurbul = aAirBand * aEnvAir * 0.22

  ; Nonlinear energy curve keeps feather-light sharp taps spray-free
  iScale     = pow(iEnergy, 1.45) * iAmp * 0.34
  aMix       = (aLigaments * 0.82 + aAirTurbul * 0.48) * iScale
  aOut       buthp aMix, 280

  xout aOut
endop