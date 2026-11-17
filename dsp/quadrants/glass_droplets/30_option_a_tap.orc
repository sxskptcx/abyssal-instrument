; ============================================================================
; Instrument 10: OptionADropletTap (Bold Sharp/Wide + V-1 + M-3 Agitation)
; p4=baseFreq, p5=amp, p6=pan, p7=sharpness, p8=richness, p9=arch, p10=agitation
; ============================================================================
instr 10
  iBaseFreq  = p4
  iAmp       = p5
  iPan       = p6
  iSharpness = p7
  iRichness  = p8
  iArch      = (p9 >= 1 && p9 <= 5 ? int(p9) : 1)
  iAgitation = (p10 >= 0 && p10 <= 1 ? p10 : 0.0)

  iWide      = 1.0 - iSharpness
  iFreqJit   random 0.92, 1.09

  ; Sharp tip = tiny high crystal drop (1.24x); Wide flat thumb = deep heavy drop (0.64x)
  iSizeScale = 0.64 + iSharpness * 0.60
  iDropFreq  limit iBaseFreq * iFreqJit * iSizeScale, 115, 2400

  iPinchWait random 0.0025, 0.0075

  ; Splash energy driven strongly by wide thumb footprint + water agitation (M-3)
  iSplashRaw = pow(iWide, 0.88) * 0.88 + iAgitation * 0.24
  iSplash    limit iSplashRaw, 0.02, 0.99

  ; M-3: Calm water rings longer & cleaner; choppy water gets tighter & frothier
  iCalmRes   = 1.25 - iAgitation * 0.42
  iResScale  = (1.10 + iRichness * 0.78) * iCalmRes
  iChirp     = 1.0
  iBubAmp    = iAmp * 0.60
  iSubCut    = 9500 - iWide * 2200
  iDripScale = 0.85 + iAgitation * 0.65

  if iArch == 1 then
    iResScale  = iResScale * 1.45
    iChirp     = 1.12
    iBubAmp    = iAmp * 0.66
    iDripScale = iDripScale * 0.45
  elseif iArch == 2 then
    iResScale  = iResScale * 0.88
    iChirp     = 1.08
    iBubAmp    = iAmp * 0.58
    iDripScale = iDripScale * 0.65
  elseif iArch == 3 then
    iResScale  = iResScale * 0.78
    iChirp     = 0.85
    iBubAmp    = iAmp * 0.42
    iDripScale = iDripScale * 0.75
  elseif iArch == 4 then
    iDropFreq  limit iDropFreq * 0.82, 110, 1900
    iResScale  = iResScale * 1.32
    iChirp     = 1.68
    iBubAmp    = iAmp * 0.64
    iSubCut    random 1250, 2100
    iDripScale = iDripScale * 0.55
  elseif iArch == 5 then
    iResScale  = iResScale * 0.72
    iChirp     = 0.92
    iBubAmp    = iAmp * 0.36
    iDripScale = iDripScale * 1.30
  endif

  ; 1) 2C Bold sharp-vs-wide impact & cavity displacement
  aImpact ImpactCavity2C iAmp, iSharpness, iDropFreq, p3

  ; 2) Primary physical Minnaert entrapped bubble
  aBubRaw MinnaertBubble iDropFreq, iBubAmp, iPinchWait, iResScale, iChirp, p3
  aBubble butlp aBubRaw, iSubCut

  ; 3) 3C Hybrid PhISEM stochastic micro-drip collision texture
  iNumDrops  = int((2 + iRichness * 4 + iSplash * 4 + iAgitation * 3) * iDripScale)
  iNumDrops  = (iNumDrops < 1 ? 1 : iNumDrops)
  iDamp      random 1.28, 1.56
  iMaxShake  = (0.08 + iRichness * 0.18 + iSplash * 0.18) * iDripScale
  iPhF1      limit iDropFreq * 0.78, 160, 4200
  iPhF2      limit iDropFreq * 1.19, 220, 5600
  iPhF3      limit iDropFreq * 1.67, 300, 7200

  iDripHold  = (p3 - 0.12 > 0.05 ? p3 - 0.12 : 0.05)
  aDripEnv   linseg 0, 0.004, 1, iDripHold, 0.35, 0.08, 0
  aDripRaw   dripwater iAmp * (0.28 + iSplash * 0.20), 0.04, iNumDrops, iDamp, iMaxShake, iPhF1, iPhF2, iPhF3
  aDripLim   limit aDripRaw, -0.75, 0.75
  aDripMix   = aDripLim * aDripEnv
  aDrip      buthp aDripMix, 130

  ; 4) Water-surface speaker radiation
  aWetIn     = aBubble + aDrip * (0.25 + iRichness * 0.55)
  aWetCore   WaterSurfaceRadiation aWetIn, iRichness * 0.75

  iBodyHold  = (p3 - 0.031 > 0.01 ? p3 - 0.031 : 0.01)
  aVoiceEnv  linseg 0, 0.001, 1, iBodyHold, 1, 0.03, 0
  aMono      = (aImpact * 0.96 + aWetCore * 0.84) * aVoiceEnv

  aL, aR pan2 aMono, iPan
  iSpaceSend = 0.34 + iRichness * 0.32 + iWide * 0.12

  aDrySendL  = aL * (1.0 - iSpaceSend * 0.32)
  aDrySendR  = aR * (1.0 - iSpaceSend * 0.32)
  aLakeSendL = aL * iSpaceSend
  aLakeSendR = aR * iSpaceSend

  vincr gaDryL, aDrySendL
  vincr gaDryR, aDrySendR
  vincr gaLakeL, aLakeSendL
  vincr gaLakeR, aLakeSendR

  ; --- WIDE-PRESS SPLASHES, CROWN SPRAY & WORTHINGTON REBOUND ---

  ; Sharp taps (iSplash <= 0.32) skip crown spray completely for crisp purity!
  if iSplash > 0.32 then
    iSprayPanJit random -0.14, 0.14
    iSprayPan    limit iPan + iSprayPanJit, 0.04, 0.96
    schedule 12, 0.003, 0.38, iAmp * (0.85 + iSplash * 0.85), iSplash, iDropFreq, iSprayPan, iRichness
  endif

  ; Bold Worthington double-plop rebound on medium/wide presses
  if iSplash > 0.38 then
    iRebDelay  random 0.055, 0.122
    iRebRatio  random 1.28, 1.65
    iRebFreq   limit iDropFreq * iRebRatio, 180, 3400
    iRebAmp    = iAmp * (0.34 + iSplash * 0.28)
    iRebPanJit random -0.07, 0.07
    iRebPan    limit iPan + iRebPanJit, 0.04, 0.96
    schedule 11, iRebDelay, 0.68, iRebFreq, iRebAmp, iRebPan, 0.08, iRichness, 1, 1.18
  endif

  if iArch == 2 then
    iTwinDelay random 0.018, 0.046
    iTwinRoll  random 0.0, 1.0
    if iTwinRoll < 0.72 then
      iTwinMul random 1.28, 1.58
    else
      iTwinMul random 0.76, 0.88
    endif
    iTwinFreq  limit iDropFreq * iTwinMul, 140, 3600
    iTwinPan   limit iPan + (rnd(0.05) - 0.025), 0.04, 0.96
    schedule 11, iTwinDelay, 0.58, iTwinFreq, iAmp * 0.48, iTwinPan, 0.16, iRichness, 0, 1.12
  endif

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

  if iArch == 4 then
    iSubCnt = 2 + int(iSplash * 3.0)
    iSbIdx  = 0
    while iSbIdx < iSubCnt do
      iSbDelay random 0.055, 0.220
      iSbMul   random 1.15, 2.25
      iSbFreq  limit iDropFreq * iSbMul, 150, 2600
      iSbAmp   = iAmp * (0.20 + iSplash * 0.16)
      iSbPan   limit iPan + (rnd(0.28) - 0.14), 0.04, 0.96
      schedule 11, iSbDelay, 0.54, iSbFreq, iSbAmp, iSbPan, 0.68, iRichness, 0, 1.48
      iSbIdx += 1
    od
  endif

  if iArch == 5 then
    iEffCnt = 6 + int(iSplash * 6)
    iEfIdx  = 0
    while iEfIdx < iEffCnt do
      iEfDelay random 0.010, 0.165
      iEfMul   random 2.05, 4.45
      iEfFreq  limit iDropFreq * iEfMul, 350, 4400
      iEfAmp   = iAmp * (0.10 + rnd(0.10))
      iEfPan   limit iPan + (rnd(0.32) - 0.16), 0.03, 0.97
      schedule 11, iEfDelay, 0.28, iEfFreq, iEfAmp, iEfPan, 0.06, iRichness, 0, 0.95
      iEfIdx += 1
    od
  elseif iSplash > 0.28 then
    ; Wide splashes scatter 5-12 audible secondary bubbles across stereo lake
    iSatMin   = int(2 + iSplash * 5.0)
    iSatMax   = int(4 + iSplash * 8.5)
    iSatCount random iSatMin, iSatMax + 0.99
    iSatCount = int(iSatCount)
    iSpread   = 0.06 + iSplash * 0.34
    iIdx      = 0

    while iIdx < iSatCount do
      iProg     = (iIdx + 0.5) / iSatCount
      iTimeBase = 0.014 + iProg * (0.065 + iSplash * 0.22)
      iTimeJit  random 0.72, 1.32
      iDelay    limit iTimeBase * iTimeJit, 0.010, 0.330

      iSizeRoll random 0.0, 1.0
      if iSizeRoll < 0.72 then
        iSatMul random 1.45, 3.85
      else
        iSatMul random 0.72, 1.28
      endif
      iSatFreq  limit iDropFreq * iSatMul, 140, 4200

      iAmpScale random 0.14, 0.32
      iSatAmp   = iAmp * iAmpScale * (0.45 + iSplash * 0.85) * (1.0 - iProg * 0.38)
      iPanOff   random -iSpread, iSpread
      iSatPan   limit iPan + iPanOff, 0.03, 0.97
      iSubmerge limit (1.0 - iProg * 0.85) * (0.28 + iSplash * 0.55), 0.05, 0.90
      iSatDur   = 0.34 + (1.0 - (iSatFreq / 4200)) * 0.38

      schedule 11, iDelay, iSatDur, iSatFreq, iSatAmp, iSatPan, iSubmerge, iRichness, 0, 1.0
      iIdx += 1
    od
  endif
endin