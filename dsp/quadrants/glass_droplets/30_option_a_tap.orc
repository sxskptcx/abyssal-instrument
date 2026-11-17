; ============================================================================
; Instrument 10: OptionADropletTap (3C Hybrid PhISEM + Physical Minnaert)
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

  ; 1) 2C Adaptive fluid impact & capillary break
  aImpact ImpactCavity2C iAmp, iSharpness, iDropFreq, p3

  ; 2) Primary physical Minnaert entrapped bubble
  aBubble MinnaertBubble iDropFreq, iAmp * 0.62, iPinchWait, iResScale, p3

  ; 3) 3C Hybrid PhISEM stochastic micro-drip collision texture
  iNumDrops  = int(3 + iRichness * 6)
  iDamp      random 1.28, 1.58
  iMaxShake  = 0.12 + iRichness * 0.26
  iPhF1      limit iDropFreq * 0.78, 180, 4200
  iPhF2      limit iDropFreq * 1.19, 240, 5600
  iPhF3      limit iDropFreq * 1.67, 320, 7200

  iDripHold  = (p3 - 0.12 > 0.05 ? p3 - 0.12 : 0.05)
  aDripEnv   linseg 0, 0.004, 1, iDripHold, 0.35, 0.08, 0
  aDripRaw   dripwater iAmp * 0.38, 0.04, iNumDrops, iDamp, iMaxShake, iPhF1, iPhF2, iPhF3
  aDripLim   limit aDripRaw, -0.75, 0.75
  aDripMix   = aDripLim * aDripEnv
  aDrip      buthp aDripMix, 130

  ; 4) Couple bubble & drip through water-surface speaker radiation model
  aWetIn     = aBubble + aDrip * (0.35 + iRichness * 0.65)
  aWetCore   WaterSurfaceRadiation aWetIn, iRichness * 0.75

  iBodyHold  = (p3 - 0.031 > 0.01 ? p3 - 0.031 : 0.01)
  aVoiceEnv  linseg 0, 0.001, 1, iBodyHold, 1, 0.03, 0
  aMono      = (aImpact * 0.88 + aWetCore * 0.82) * aVoiceEnv

  aL, aR pan2 aMono, iPan
  iSpaceSend = 0.36 + iRichness * 0.38

  aDrySendL  = aL * (1.0 - iSpaceSend * 0.32)
  aDrySendR  = aR * (1.0 - iSpaceSend * 0.32)
  aLakeSendL = aL * iSpaceSend
  aLakeSendR = aR * iSpaceSend

  vincr gaDryL, aDrySendL
  vincr gaDryR, aDrySendR
  vincr gaLakeL, aLakeSendL
  vincr gaLakeR, aLakeSendR
endin