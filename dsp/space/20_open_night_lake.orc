; ============================================================================
; Instrument 900: Open Night Lake Acoustic Space (Option 5B)
; ============================================================================
instr 900
  aInL = gaLakeL
  aInR = gaLakeR

  aBufL delayr 0.28
  aErL1 deltapi 0.037
  aErL2 deltapi 0.089
  aErL3 deltapi 0.163
        delayw aInL + aInR * 0.25

  aBufR delayr 0.28
  aErR1 deltapi 0.053
  aErR2 deltapi 0.118
  aErR3 deltapi 0.197
        delayw aInR + aInL * 0.25

  aEarlyMixL = aErL1 * 0.45 + aErL2 * 0.30 + aErL3 * 0.18
  aEarlyMixR = aErR1 * 0.45 + aErR2 * 0.30 + aErR3 * 0.18
  aEarlyL butlp aEarlyMixL, 2600
  aEarlyR butlp aEarlyMixR, 2350

  aRevInL = aInL * 0.72 + aEarlyR * 0.35
  aRevInR = aInR * 0.72 + aEarlyL * 0.35
  aRevL, aRevR reverbsc aRevInL, aRevInR, 0.84, 4600

  aSpaceMixL = aEarlyL * 0.42 + aRevL * 0.56
  aSpaceMixR = aEarlyR * 0.42 + aRevR * 0.56
  aSpaceL buthp aSpaceMixL, 72
  aSpaceR buthp aSpaceMixR, 72

  vincr gaDryL, aSpaceL
  vincr gaDryR, aSpaceR
endin