; ============================================================================
; Instrument 10: OptionADropletTap (Block #1 Core + Block #2 Option 2.2 Splashes)
; ============================================================================
instr 10
  iBaseFreq  = p4
  iAmp       = p5
  iPan       = p6
  iSharpness = p7
  iRichness  = p8

  iFreqJit   random 0.92, 1.09
  iDropFreq  = iBaseFreq * iFreqJit
  iPinchWait random 0.0025, 0.0075
  iResScale  = 1.15 + iRichness * 0.85

  ; Option 2.2 splash energy (0.04 = solitary drop, 0.98 = crater collapse splash)
  iRawSplash = (1.0 - iSharpness) * 0.78 + (iAmp - 0.35) * 0.42
  iSplash    limit iRawSplash, 0.04, 0.98

  ; 1) 2C Adaptive fluid impact & capillary break
  aImpact ImpactCavity2C iAmp, iSharpness, iDropFreq, p3

  ; 2) Primary physical Minnaert entrapped bubble
  aBubble MinnaertBubble iDropFreq, iAmp * 0.62, iPinchWait, iResScale, p3

  ; 3) 3C Hybrid PhISEM stochastic micro-drip collision texture
  iNumDrops  = int(3 + iRichness * 5 + iSplash * 3)
  iDamp      random 1.28, 1.56
  iMaxShake  = 0.10 + iRichness * 0.22 + iSplash * 0.12
  iPhF1      limit iDropFreq * 0.78, 180, 4200
  iPhF2      limit iDropFreq * 1.19, 240, 5600
  iPhF3      limit iDropFreq * 1.67, 320, 7200

  iDripHold  = (p3 - 0.12 > 0.05 ? p3 - 0.12 : 0.05)
  aDripEnv   linseg 0, 0.004, 1, iDripHold, 0.35, 0.08, 0
  aDripRaw   dripwater iAmp * 0.34, 0.04, iNumDrops, iDamp, iMaxShake, iPhF1, iPhF2, iPhF3
  aDripLim   limit aDripRaw, -0.75, 0.75
  aDripMix   = aDripLim * aDripEnv
  aDrip      buthp aDripMix, 130

  ; 4) Couple bubble & drip through water-surface radiation
  aWetIn     = aBubble + aDrip * (0.32 + iRichness * 0.58)
  aWetCore   WaterSurfaceRadiation aWetIn, iRichness * 0.75

  iBodyHold  = (p3 - 0.031 > 0.01 ? p3 - 0.031 : 0.01)
  aVoiceEnv  linseg 0, 0.001, 1, iBodyHold, 1, 0.03, 0
  aMono      = (aImpact * 0.88 + aWetCore * 0.82) * aVoiceEnv

  aL, aR pan2 aMono, iPan
  iSpaceSend = 0.36 + iRichness * 0.36

  aDrySendL  = aL * (1.0 - iSpaceSend * 0.32)
  aDrySendR  = aR * (1.0 - iSpaceSend * 0.32)
  aLakeSendL = aL * iSpaceSend
  aLakeSendR = aR * iSpaceSend

  vincr gaDryL, aDrySendL
  vincr gaDryR, aDrySendR
  vincr gaLakeL, aLakeSendL
  vincr gaLakeR, aLakeSendR

  ; --- BLOCK #2 (OPTION 2.2): TOUCH-ADAPTIVE SPLASH CLUSTERS ---

  ; A) Crown sheet breakup & splatter
  if iSplash > 0.22 then
    iSprayPanJit random -0.07, 0.07
    iSprayPan    limit iPan + iSprayPanJit, 0.04, 0.96
    schedule 12, 0.003, 0.35, iAmp, iSplash, iDropFreq, iSprayPan, iRichness
  endif

  ; B) Worthington Jet Center Rebound Drop ("Double-Plop" on heavy presses)
  if iSplash > 0.34 then
    iRebChance random 0.0, 1.0
    if iRebChance < (0.35 + iSplash * 0.60) then
      iRebDelay  random 0.052, 0.118
      iRebRatio  random 1.22, 1.62
      iRebFreq   limit iDropFreq * iRebRatio, 180, 3400
      iRebAmp    = iAmp * (0.24 + iSplash * 0.16)
      iRebPanJit random -0.05, 0.05
      iRebPan    limit iPan + iRebPanJit, 0.04, 0.96
      schedule 11, iRebDelay, 0.65, iRebFreq, iRebAmp, iRebPan, 0.12, iRichness, 1
    endif
  endif

  ; C) Power-law satellite micro-bubble cascade (1..2 on light drop, 6..10 on splash)
  iSatMin   = int(1 + iSplash * 5.0)
  iSatMax   = int(2 + iSplash * 8.5)
  iSatCount random iSatMin, iSatMax + 0.99
  iSatCount = int(iSatCount)

  iSpread   = 0.04 + iSplash * 0.20
  iIdx      = 0

  while iIdx < iSatCount do
    iProg     = (iIdx + 0.5) / iSatCount
    iTimeBase = 0.014 + iProg * (0.065 + iSplash * 0.195)
    iTimeJit  random 0.72, 1.32
    iDelay    limit iTimeBase * iTimeJit, 0.010, 0.320

    iSizeRoll random 0.0, 1.0
    if iSizeRoll < 0.75 then
      iSatMul random 1.45, 3.85
    else
      iSatMul random 0.76, 1.28
    endif
    iSatFreq  limit iDropFreq * iSatMul, 150, 4200

    iAmpScale random 0.09, 0.22
    iSatAmp   = iAmp * iAmpScale * (0.42 + iSplash * 0.75) * (1.0 - iProg * 0.42)

    iPanOff   random -iSpread, iSpread
    iSatPan   limit iPan + iPanOff, 0.03, 0.97

    iSubmerge limit (1.0 - iProg * 0.85) * (0.35 + iSplash * 0.50), 0.05, 0.92
    iSatDur   = 0.32 + (1.0 - (iSatFreq / 4200)) * 0.36

    schedule 11, iDelay, iSatDur, iSatFreq, iSatAmp, iSatPan, iSubmerge, iRichness, 0
    iIdx += 1
  od
endin