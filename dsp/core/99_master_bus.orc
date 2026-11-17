; ============================================================================
; Instrument 999: Master Output Conditioning & Bus Cleanup
; ============================================================================
instr 999
  aL dcblock2 gaDryL
  aR dcblock2 gaDryR

  ; Subtle soft saturation & peak protection for multi-finger polyphony
  aOutL = tanh(aL * 0.85) * 0.92
  aOutR = tanh(aR * 0.85) * 0.92

  outs aOutL, aOutR

  clear gaDryL, gaDryR, gaLakeL, gaLakeR
endin