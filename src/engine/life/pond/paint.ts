/**
 * What both looks of the koi scene draw with (`draw.ts` for the DOTS tiles, `type.ts` for the TYPE font glyphs): the
 * shared scratch, the quantize steps, the draw options, the calm surface's contour lines and the moon's reflection.
 */
import { noise2 } from '../../noise'
import { rippleGrad } from '../ripple'
import { createBodyRaster } from '../body'
import { moonAcross, nightTile } from '../sky'
import { putGlyph, T_VALUE, type Glyph, type TileRaster } from '../glyphTiles'
import type { KoiPond } from './layout'

/** Water crest light (screen), ∇h·L > .12 → '='. */
export const WL = [-.6, -.8] as const
/** Scratch shared by both looks: the body raster, a ripple gradient and the koi draw order. */
export const body = createBodyRaster()
export const grad = new Float32Array(3)
export const tileOrder: number[] = []

/** Quantize-friendly value steps: 1 → .8 → .6 → 0 (no dot). */
export const stepDown = (v: number, k: number) => { let x = v >= .95 ? 2 : v >= .75 ? 1 : 0; x -= k; return x >= 2 ? 1 : x === 1 ? .8 : x === 0 ? .6 : 0 }

export interface KoiDrawOpts {
  /** Unit light for the koi shading (x right, y down, z up; L3.6: the hub's tilt light). Default KOI_LIGHT. */
  light?: readonly [number, number, number]
  /** The hub's tilt (tx, ty): lily pads drift 3 cells per unit downhill (render-time). Default none. */
  tilt?: readonly [number, number]
}
/**
 * The calm surface: contour lines of a slowly drifting noise field (|n| < .055), drawn as faint line glyphs along the
 * contour. Pure in t; the field drifts about .4 cells/s, so a tile changes a few times a minute.
 */
export const sgrad = new Float64Array(2)
export function surfaceLine(seed: number, tx: number, ty: number, t: number): boolean {
  const x = tx / 4.2 + .035 * t, y = ty / 2.6 + .02 * t, n = noise2(x, y, seed + 3)
  if (n > .055 || n < -.055) return false
  sgrad[0] = (noise2(x + .1, y, seed + 3) - noise2(x - .1, y, seed + 3)) / 4.2; sgrad[1] = (noise2(x, y + .1, seed + 3) - noise2(x, y - .1, seed + 3)) / 2.6
  return true
}

/**
 * The moon's reflection at night (L3.3): a broken vertical column of `-` glyphs in `value` across the water, at the
 * moon's place on its arc (sky.ts `moonAcross`), each row pushed sideways by a slow wobble and by the water's slope
 * there (∇h, so ripples bend it). Rows thin out toward the ends; at dusk and dawn the STBN night dither thins it too.
 * Works on any tile grid of the scene's card (`water` and `shore` are that grid's).
 */
export function moonColumn(p: KoiPond, s: Float32Array, t: number, hour: number, nl: number, r: TileRaster, dash: Glyph, water = p.water, shore = p.shore, rx?: (tx: number, ty: number) => [number, number]) {
  const g = r.grid, seed = p.spec.seed, mid = (moonAcross(hour) * 144 - g.ox - (g.pitch - 1) / 2) / g.pitch
  for (let ty = 0; ty < g.rows; ty++) {
    const u = ty / (g.rows - 1), gap = noise2(ty * .9, t * 1.1, seed + 12)
    if (gap < -.3 + 1.1 * Math.abs(u - .45)) continue
    const at = rx ? rx(Math.round(mid), ty) : [mid, ty] as [number, number]
    rippleGrad(p.ripple, s, at[0], at[1], grad)
    const x = Math.round(mid + 1.1 * noise2(ty * .55, t * .45, seed + 11) + (g.pitch === 4 ? 8 : 5) * grad[1])
    for (let k = 0; k < (gap > .35 && u > .25 && u < .7 ? 2 : 1); k++) {
      const tx = x + k * (grad[1] >= 0 ? 1 : -1), i = ty * g.cols + tx
      if (tx < 0 || tx >= g.cols || !water[i] || shore[i] >= 0 || !nightTile(tx, ty, nl)) continue
      putGlyph(r, tx, ty, dash, T_VALUE, k ? .8 : 1)
    }
  }
}
