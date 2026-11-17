; ============================================================================
; MinnaertBubble UDO (Added iChirpScale for V-1 Archetype Expressiveness)
; ============================================================================
opcode MinnaertBubble, a, iiiiii
  iFreq0, iAmp, iPinchDelay, iResScale, iChirpScale, iDur xin

  iF0       limit iFreq0, 120, 4800
  iDurSafe  = (iDur > 0.06 ? iDur : 0.06)

  ; Physical damping rate d (s^-1) -> decay tau = 1 / d
  iDampRate = 0.043 * iF0 + 0.00072 * pow(iF0, 1.5)
  iTauRaw   = (1.0 / iDampRate) * iResScale
  iTau      limit iTauRaw, 0.006, 0.24

  iRiseOnset = 0.0012
  iHoldRaw   = iDurSafe - iPinchDelay - iRiseOnset
  iHoldRem   = (iHoldRaw > 0.01 ? iHoldRaw : 0.01)

  aEnv       linseg 0, iPinchDelay, 0, iRiseOnset, 1, iHoldRem, 1
  aDecay     expseg 0.0001, iPinchDelay + iRiseOnset, 1.0, iTau * 3.8, 0.0002, iDurSafe, 0.0002

  ; Hydrodynamic upward pitch rise scaled by archetype character
  iXiBase    random 0.14, 0.36
  iXiMax     limit iXiBase * iChirpScale, 0.04, 0.62
  iXiSafe    = (iXiMax > 0.001 ? iXiMax : 0.001)
  iRiseTau   = iTau * 0.72
  aChirp     linseg 0, iPinchDelay, 0, iRiseTau * 2.5, iXiMax, iDurSafe, iXiMax

  aChirpRatio = aChirp / iXiSafe
  aChirpPos   limit aChirpRatio, 0.0, 4.0
  aChirpCurve = iXiMax * (1.0 - exp(aChirpPos * -2.8))

  kMicroJit  jitter 0.006, 18, 55
  aFreqRaw   = iF0 * (1.0 + aChirpCurve + kMicroJit)
  aFreq      limit aFreqRaw, 40, sr * 0.38

  aFreq2Raw  = aFreq * 2.02
  aFreq2     limit aFreq2Raw, 80, sr * 0.42

  aBody      poscil 1.0, aFreq, giSine
  aHarm2     poscil 0.06, aFreq2, giSine

  aOut = (aBody + aHarm2) * aEnv * aDecay * iAmp
  xout aOut
endop