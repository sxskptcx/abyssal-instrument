; ============================================================================
; Instrument 11: SatelliteBubble (Doublets, Skips, Submerged & Worthington)
; p10 = iChirpScale (optional, defaults cleanly to 1.0)
; ============================================================================
instr 11
  iFreq          = p4
  iAmp           = p5
  iPan           = p6
  iSubmerge      = p7
  iRichness      = p8
  iHasMiniImpact = p9
  iChirpScale    = (p10 > 0.05 ? p10 : 1.0)

  iFreqJit   random 0.94, 1.06
  iDropFreq  limit iFreq * iFreqJit, 140, 4200
  iPinch     random 0.0015, 0.0055
  iResScale  = 0.88 + iRichness * 0.72

  aBubble    MinnaertBubble iDropFreq, iAmp * 0.78, iPinch, iResScale, iChirpScale, p3

  aImpact    init 0
  if iHasMiniImpact > 0.5 then
    aImpact  ImpactCavity2C iAmp * 0.54, 0.82, iDropFreq, p3
  endif

  iSubCut    = 5800 - iSubmerge * 4100
  aBubSub    butlp aBubble, iSubCut

  aWetIn     = aBubSub + aImpact * 0.68
  aWetCore   WaterSurfaceRadiation aWetIn, 0.15 + iRichness * 0.65 + iSubmerge * 0.25

  iBodyHold  = (p3 - 0.026 > 0.01 ? p3 - 0.026 : 0.01)
  aEnv       linseg 0, 0.001, 1, iBodyHold, 1, 0.025, 0
  aMono      = aWetCore * aEnv

  aL, aR     pan2 aMono, iPan
  iSpaceSend = 0.28 + iRichness * 0.36 + iSubmerge * 0.12

  aDryL      = aL * (1.0 - iSpaceSend * 0.30)
  aDryR      = aR * (1.0 - iSpaceSend * 0.30)
  aLakeL     = aL * iSpaceSend
  aLakeR     = aR * iSpaceSend

  vincr gaDryL, aDryL
  vincr gaDryR, aDryR
  vincr gaLakeL, aLakeL
  vincr gaLakeR, aLakeR
endin

; ============================================================================
; Instrument 12: CrownSheetSprayEvent (Triggered during medium/wide splashes)
; ============================================================================
instr 12
  iAmp          = p4
  iSplashEnergy = p5
  iBaseFreq     = p6
  iPan          = p7
  iRichness     = p8

  aSprayRaw  CrownSheetSpray iAmp, iSplashEnergy, iBaseFreq, p3
  aSprayWet  WaterSurfaceRadiation aSprayRaw, 0.22 + iRichness * 0.55

  iSprayHold = (p3 - 0.026 > 0.01 ? p3 - 0.026 : 0.01)
  aEnv       linseg 0, 0.002, 1, iSprayHold, 1, 0.024, 0
  aMono      = aSprayWet * aEnv

  aL, aR     pan2 aMono, iPan
  iSpaceSend = 0.34 + iRichness * 0.34

  aDryL      = aL * (1.0 - iSpaceSend * 0.25)
  aDryR      = aR * (1.0 - iSpaceSend * 0.25)
  aLakeL     = aL * iSpaceSend
  aLakeR     = aR * iSpaceSend

  vincr gaDryL, aDryL
  vincr gaDryR, aDryR
  vincr gaLakeL, aLakeL
  vincr gaLakeR, aLakeR
endin