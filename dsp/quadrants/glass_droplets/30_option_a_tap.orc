; ============================================================================
; Instrument 10: OptionADropletTap (I-1 Sharp/Wide + V-1 5 Fluid Archetypes)
; p4=baseFreq, p5=amp, p6=pan, p7=sharpness, p8=richness, p9=archetype(1..5)
; ============================================================================
instr 10
  iBaseFreq  = p4
  iAmp       = p5
  iPan       = p6
  iSharpness = p7
  iRichness  = p8
  iArch      = (p9 >= 1 && p9 <= 5 ? int(p9) : 1)

  iFreqJit   random 0.92, 1.09
  iDropFreq  = iBaseFreq * iFreqJit
  iPinchWait random 0.0025, 0.0075
  iWide      = 1.0 - iSharpness

  ; Option 2.2 splash energy strongly driven by I-1 touch sharpness
  iSplashRaw = pow(iWide, 0.95) * 0.92 + (iAmp - 0.45) * 0.25
  iSplash    limit iSplashRaw, 0.03, 0.99

  ; Archetype-specific primary voice parameters
  iResScale  = 1.15 + iRichness * 0.85
  iChirp     = 1.0
  iBubAmp    = iAmp * 0.62
  iSubCut    = 9500
  iDripScale = 1.0

  if iArch == 1 then
    ; 1) Clean Deep Plop: extra round resonant ring, minimal spray
    iResScale  = iResScale * 1.42
    iChirp     = 1.12
    iBubAmp    = iAmp * 0.68
    iDripScale = 0.45
  elseif iArch == 2 then
    ; 2) Coupled Doublet ("Bloop-Blip"): tighter primary + twin bubble
    iResScale  = iResScale * 0.88
    iChirp     = 1.08
    iBubAmp    = iAmp * 0.60
    iDripScale = 0.65
  elseif iArch == 3 then
    ; 3) Surface Skimmer / Ricochet: crisp graze + accelerating skip drops
    iResScale  = iResScale * 0.78
    iChirp     = 0.85
    iBubAmp    = iAmp * 0.42
    iDripScale = 0.70
  elseif iArch == 4 then
    ; 4) Submerged Hollow Pocket: deeper pitch, slow wide bend, muffled body
    iDropFreq  limit iDropFreq * 0.78, 135, 2200
    iResScale  = iResScale * 1.30
    iChirp     = 1.68
    iBubAmp    = iAmp * 0.64
    iSubCut    random 1350, 2350
    iDripScale = 0.55
  elseif iArch == 5 then
    ; 5) Micro-Effervescence Burst: light drop dissolving into high sparkles
    iResScale  = iResScale * 0.72
    iChirp     = 0.92
    iBubAmp    = iAmp * 0.36
    iDripScale = 1.25
  endif

  ; 1) 2C Adaptive fluid impact & capillary break
  aImpact ImpactCavity2C iAmp, iSharpness, iDropFreq, p3

  ; 2) Primary physical Minnaert entrapped bubble
  aBubRaw MinnaertBubble iDropFreq, iBubAmp, iPinchWait, iResScale, iChirp, p3
  aBubble butlp aBubRaw, iSubCut

  ; 3) 3C Hybrid PhISEM stochastic micro-drip texture
  iNumDrops  = int((2 + iRichness * 5 + iSplash * 3) * iDripScale)
  iNumDrops  = (iNumDrops < 1 ? 1 : iNumDrops)
  iDamp      random 1.28, 1.56
  iMaxShake  = (0.09 + iRichness * 0.20 + iSplash * 0.14) * iDripScale
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
  aWetIn     = aBubble + aDrip * (0.28 + iRichness * 0.55) * iDripScale
  aWetCore   WaterSurfaceRadiation aWetIn, iRichness * 0.75

  iBodyHold  = (p3 - 0.031 > 0.01 ? p3 - 0.031 : 0.01)
  aVoiceEnv  linseg 0, 0.001, 1, iBodyHold, 1, 0.03, 0
  aMono      = (aImpact * 0.92 + aWetCore * 0.84) * aVoiceEnv

  aL, aR pan2 aMono, iPan
  iSpaceSend = 0.34 + iRichness * 0.34 + iWide * 0.12

  aDrySendL  = aL * (1.0 - iSpaceSend * 0.32)
  aDrySendR  = aR * (1.0 - iSpaceSend * 0.32)
  aLakeSendL = aL * iSpaceSend
  aLakeSendR = aR * iSpaceSend

  vincr gaDryL, aDrySendL
  vincr gaDryR, aDrySendR
  vincr gaLakeL, aLakeSendL
  vincr gaLakeR, aLakeSendR

  ; --------------------------------------------------------------------------
  ; ARCHETYPE-DRIVEN SECONDARY EVENTS & WIDE-PRESS SPLASHES
  ; --------------------------------------------------------------------------

  ; Wide presses unleash crown spray + Worthington center rebound
  if iSplash > 0.32 then
    iSprayPanJit random -0.10, 0.10
    iSprayPan    limit iPan + iSprayPanJit, 0.04, 0.96
    schedule 12, 0.003, 0.36, iAmp * (0.75 + iSplash * 0.65), iSplash, iDropFreq, iSprayPan, iRichness
  endif

  if iSplash > 0.44 then
    iRebDelay  random 0.052, 0.115
    iRebRatio  random 1.24, 1.58
    iRebFreq   limit iDropFreq * iRebRatio, 180, 3400
    iRebAmp    = iAmp * (0.26 + iSplash * 0.20)
    iRebPanJit random -0.06, 0.06
    iRebPan    limit iPan + iRebPanJit, 0.04, 0.96
    schedule 11, iRebDelay, 0.65, iRebFreq, iRebAmp, iRebPan, 0.10, iRichness, 1, 1.15
  endif

  ; Archetype 2: Coupled Doublet ("Bloop-Blip") twin bubble
  if iArch == 2 then
    iTwinDelay random 0.018, 0.046
    iTwinRoll  random 0.0, 1.0
    if iTwinRoll < 0.72 then
      iTwinMul random 1.28, 1.58
    else
      iTwinMul random 0.76, 0.88
    endif
    iTwinFreq  limit iDropFreq * iTwinMul, 150, 3600
    iTwinPan   limit iPan + (rnd(0.05) - 0.025), 0.04, 0.96
    schedule 11, iTwinDelay, 0.58, iTwinFreq, iAmp * 0.48, iTwinPan, 0.16, iRichness, 0, 1.12
  endif

  ; Archetype 3: Surface Skimmer / Ricochet (3-4 accelerating stereo skips)
  if iArch == 3 then
    iSkipDir   = (iPan > 0.5 ? -1.0 : 1.0)
    iSkipCount = int(3 + (1.0 - iWide) * 1.4)
    iSkIdx     = 0
    iSkDelay   = 0.016
    while iSkIdx < iSkipCount do
      iSkStep    random 0.022, 0.040
      iSkDelay   = iSkDelay + iSkStep * (1.0 + iSkIdx * 0.22)
      iSkMul     = 1.22 + iSkIdx * 0.34 + rnd(0.12)
      iSkFreq    limit iDropFreq * iSkMul, 220, 4200
      iSkAmp     = iAmp * (0.34 - iSkIdx * 0.06)
      iSkPan     limit iPan + iSkipDir * (0.045 * (iSkIdx + 1)), 0.03, 0.97
      schedule 11, iSkDelay, 0.42, iSkFreq, iSkAmp, iSkPan, 0.08, iRichness, 1, 0.85
      iSkIdx += 1
    od
  endif

  ; Archetype 4: Submerged Hollow Pocket extra rising underwater bubbles
  if iArch == 4 then
    iSubCnt = 2 + int(iSplash * 2.5)
    iSbIdx  = 0
    while iSbIdx < iSubCnt do
      iSbDelay random 0.055, 0.220
      iSbMul   random 1.15, 2.25
      iSbFreq  limit iDropFreq * iSbMul, 160, 2600
      iSbAmp   = iAmp * (0.16 + iSplash * 0.12)
      iSbPan   limit iPan + (rnd(0.24) - 0.12), 0.04, 0.96
      schedule 11, iSbDelay, 0.52, iSbFreq, iSbAmp, iSbPan, 0.72, iRichness, 0, 1.48
      iSbIdx += 1
    od
  endif

  ; Archetype 5 (Micro-Effervescence) + general splash satellite cascade
  if iArch == 5 then
    iEffCnt = 6 + int(iSplash * 5)
    iEfIdx  = 0
    while iEfIdx < iEffCnt do
      iEfDelay random 0.010, 0.165
      iEfMul   random 2.05, 4.45
      iEfFreq  limit iDropFreq * iEfMul, 350, 4400
      iEfAmp   = iAmp * (0.08 + rnd(0.08))
      iEfPan   limit iPan + (rnd(0.28) - 0.14), 0.03, 0.97
      schedule 11, iEfDelay, 0.28, iEfFreq, iEfAmp, iEfPan, 0.06, iRichness, 0, 0.95
      iEfIdx += 1
    od
  elseif iArch != 1 || iSplash > 0.35 then
    ; Satellite splash cascade scaled tightly by sharpness vs wide press
    iSatMin   = (iSplash < 0.25 ? 0 : int(1 + iSplash * 4.5))
    iSatMax   = int(1 + iSplash * 8.5)
    iSatCount random iSatMin, iSatMax + 0.99
    iSatCount = int(iSatCount)
    iSpread   = 0.03 + iSplash * 0.28
    iIdx      = 0

    while iIdx < iSatCount do
      iProg     = (iIdx + 0.5) / iSatCount
      iTimeBase = 0.014 + iProg * (0.055 + iSplash * 0.21)
      iTimeJit  random 0.72, 1.32
      iDelay    limit iTimeBase * iTimeJit, 0.010, 0.320

      iSizeRoll random 0.0, 1.0
      if iSizeRoll < 0.75 then
        iSatMul random 1.45, 3.85
      else
        iSatMul random 0.76, 1.28
      endif
      iSatFreq  limit iDropFreq * iSatMul, 150, 4200

      iAmpScale random 0.09, 0.24
      iSatAmp   = iAmp * iAmpScale * (0.35 + iSplash * 0.85) * (1.0 - iProg * 0.42)
      iPanOff   random -iSpread, iSpread
      iSatPan   limit iPan + iPanOff, 0.03, 0.97
      iSubmerge limit (1.0 - iProg * 0.85) * (0.30 + iSplash * 0.55), 0.05, 0.92
      iSatDur   = 0.32 + (1.0 - (iSatFreq / 4200)) * 0.36

      schedule 11, iDelay, iSatDur, iSatFreq, iSatAmp, iSatPan, iSubmerge, iRichness, 0, 1.0
      iIdx += 1
    od
  endif
endin