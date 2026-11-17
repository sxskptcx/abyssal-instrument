; ============================================================================
; WaterSurfaceRadiation UDO
; ============================================================================
opcode WaterSurfaceRadiation, a, ai
  aIn, iDistance xin

  aRad buthp aIn, 42

  ; Subtle air-water boundary reflection (~0.9ms to 2.1ms bounce off flat water)
  iReflSec random 0.0009, 0.0021
  aRefl delay aRad, iReflSec
  aSurf = aRad + aRefl * 0.22

  ; High-frequency air absorption over distance
  iAirCut = 11500 - iDistance * 5200
  aOut butlp aSurf, iAirCut

  xout aOut
endop