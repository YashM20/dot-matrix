/** Read-outs of the koi scene's state (cards, checks, probes): koi, pellets and the globals, by name instead of slot. */
import {
  G_CASC, G_LURE, G_LX, G_LY, G_PRESS, G_STILL, G_WALL, GULP_SHOW, K_BACK, K_BEAT, K_CURIOUS, K_FOOD, K_GULP, K_HUNGER, K_HX, K_HY,
  K_MODE, K_PHASE, K_REFR, K_U, K_Z, KS, P_AGE, P_H, P_STATE, P_X, P_Y, PEL_OFF, PELLETS, PS, type KoiPond,
} from './layout'

export interface KoiView {
  x: number; y: number; hx: number; hy: number; u: number; z: number; beat: number; phase: number; mode: number; refractory: number; curious: number
  /** L3.1: hunger 0..1, the gulp pulse, the pellet it is after (−1 none) and its circle-back slot (> 0 circling back). */
  hunger: number; gulp: number; food: number; back: number
}
export function koiView(p: KoiPond, s: Float32Array, i: number): KoiView {
  const o = p.layout.KOI + KS * i, c = p.chains[i]
  return {
    x: s[c.X], y: s[c.Y], hx: s[o + K_HX], hy: s[o + K_HY], u: s[o + K_U], z: s[o + K_Z], beat: s[o + K_BEAT], phase: s[o + K_PHASE], mode: s[o + K_MODE], refractory: s[o + K_REFR], curious: s[o + K_CURIOUS],
    hunger: s[o + K_HUNGER], gulp: s[o + K_GULP], food: s[o + K_FOOD], back: s[o + K_BACK],
  }
}
/** The head bulge (cells) koi i draws with: 1 during the first .3 s of a gulp (L3.1), else 0. */
export const koiBulge = (p: KoiPond, s: Float32Array, i: number) => (s[p.layout.KOI + KS * i + K_GULP] > GULP_SHOW ? 1 : 0)
/** Set every koi's hunger (checks: sated koi ignore food). */
export function setKoiHunger(p: KoiPond, s: Float32Array, v: number): void { for (let i = 0; i < p.spec.koi.length; i++) s[p.layout.KOI + KS * i + K_HUNGER] = v }
export interface PelletView { x: number; y: number; h: number; state: number; age: number }
export function pelletViews(p: KoiPond, s: Float32Array): PelletView[] {
  const out: PelletView[] = []
  for (let k = 0; k < PELLETS; k++) { const o = p.layout.PEL + PS * k; if (s[o + P_STATE] !== PEL_OFF) out.push({ x: s[o + P_X], y: s[o + P_Y], h: s[o + P_H], state: s[o + P_STATE], age: s[o + P_AGE] }) }
  return out
}
export const pondGlobals = (p: KoiPond, s: Float32Array) => ({ still: s[p.layout.G + G_STILL], press: s[p.layout.G + G_PRESS], lure: s[p.layout.G + G_LURE], lureX: s[p.layout.G + G_LX], lureY: s[p.layout.G + G_LY], wallHits: s[p.layout.G + G_WALL], cascade: s[p.layout.G + G_CASC] })
