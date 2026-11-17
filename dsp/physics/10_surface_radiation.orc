; ============================================================================
; WaterSurfaceRadiation UDO
; Models the water surface acting as an acoustic membrane driven by
; subsurface bubbles & impacts, including micro-surface bounce & air absorption.
; Input:  aIn, iDistance (0 = close intimate, 1 = open lake distance)
; Output: aOut
; ============================================================================
opcode WaterSurfaceRadiation, a, ai
  aIn, iDistance xin

  ; Water-to-air dipole/monopole radiation tilt: gently rolls off sub-40Hz mud
  aRad buthp aIn, 42

  ; Subtle air-water boundary reflection (~0.9ms to 2.1ms bounce off flat water)
  iReflMs random 0.9, 2.1
  aRefl vdelay aRad, iReflMs, 5.0
  aSurf = aRad + aRefl * 0.22

  ; High-frequency air absorption over distance (never harsh/metallic)
  iAirCut = 11500 - iDistance * 5200
  aOut butlp aSurf, iAirCut

  xout aOut
endop