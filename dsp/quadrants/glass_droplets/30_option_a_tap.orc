; ============================================================================
; Instrument 10: OptionADropletTap (3C Hybrid PhISEM + Physical Minnaert)
; p4 = baseFreq, p5 = amp, p6 = pan (0..1), p7 = sharpness (2C), p8 = richness
; ============================================================================
instr 10
  iBaseFreq  = p4
  iAmp       = p5
  iPan       = p6
  iSharpness = p7
  iRichness  = p8

  ; Micro-organic randomization per individual droplet
  iFreqJit   random 0.92, 1.09
  iDropFreq  = iBaseFreq * iFreqJit
  iPinchWait random 0.0025, 0.0075
  iResScale  = 1.15 + iRichness * 0.85

  ; 1) 2C Adaptive fluid impact & capillary break
  aImpact ImpactCavity2C iAmp, iSharpness, iDropFreq

  ; 2) Primary physical Minnaert entrapped bubble
  aBubble MinnaertBubble iDropFreq, iAmp * 0.62, iPinchWait, iResScale

  ; 3) 3C Hybrid PhISEM stochastic micro-drip collision texture
  ;    (idamp kept safely in 1.28..1.62 per Rasmus Ekman's guideline)
  iNumDrops  = int(3 + iRichness * 6)
  iDamp      random 1.28, 1.58
  iMaxShake  = 0.12 + iRichness * 0.26
  iPhF1      limit iDropFreq * 0.78, 180, 4200
  iPhF2      limit iDropFreq * 1.19, 240, 5600
  iPhF3      limit iDropFreq * 1.67, 320, 7200

  aDripEnv   linseg 0, 0.004, 1, max(0.05, p3 - 0.12), 0.35, 0.08, 0
  aDripRaw   dripwater iAmp * 0.38, 0.04, iNumDrops, iDamp, iMaxShake, iPhF1, iPhF2, iPhF3
  aDripLim   limit aDripRaw, -0.75, 0.75
  aDrip      buthp (aDripLim * aDripEnv), 130

  ; 4) Couple bubble & drip through water-surface speaker radiation model
  aWetCore   WaterSurfaceRadiation (aBubble + aDrip * (0.35 + iRichness * 0.65)), iRichness * 0.75

  ; Combine impact + wet radiation with smooth anti-click tail envelope
  aVoiceEnv  linseg 0, 0.001, 1, p3 - 0.031, 1, 0.03, 0
  aMono      = (aImpact * 0.88 + aWetCore * 0.82) * aVoiceEnv

  ; Stereo placement & sends
  aL, aR pan2 aMono, iPan
  iSpaceSend = 0.36 + iRichness * 0.38

  vincr gaDryL, aL * (1.0 - iSpaceSend * 0.32)
  vincr gaDryR, aR * (1.0 - iSpaceSend * 0.32)
  vincr gaLakeL, aL * iSpaceSend
  vincr gaLakeR, aR * iSpaceSend
endin