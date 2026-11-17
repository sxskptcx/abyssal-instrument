; ============================================================================
; Instrument 900: Open Night Lake Acoustic Space (Option 5B)
; Wide, dark, airy stereo reflections across open water:
;  - Asymmetric distant shoreline early reflections (no close boxy room walls)
;  - Air-absorbed waveguide scattering (reverbsc) with clean sub-75Hz cut
; ============================================================================
instr 900
  ; Read stereo sends from lake bus
  aInL = gaLakeL
  aInR = gaLakeR

  ; Asymmetric far-bank early reflections (34ms to 195ms across stereo field)
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

  ; Air absorbs high frequencies rapidly over open dark water
  aEarlyL butlp (aErL1 * 0.45 + aErL2 * 0.30 + aErL3 * 0.18), 2600
  aEarlyR butlp (aErR1 * 0.45 + aErR2 * 0.30 + aErR3 * 0.18), 2350

  ; Lush open-air night scatter via Sean Costello's 8-delay FDN
  aRevInL = aInL * 0.72 + aEarlyR * 0.35
  aRevInR = aInR * 0.72 + aEarlyL * 0.35
  aRevL, aRevR reverbsc aRevInL, aRevInR, 0.84, 4600, sr, 0.45

  ; Keep low end transparent so water impacts never get muddy
  aSpaceL buthp (aEarlyL * 0.42 + aRevL * 0.56), 72
  aSpaceR buthp (aEarlyR * 0.42 + aRevR * 0.56), 72

  vincr gaDryL, aSpaceL
  vincr gaDryR, aSpaceR
endin