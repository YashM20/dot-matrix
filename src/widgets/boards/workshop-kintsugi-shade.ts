/**
 * The kintsugi plate's per-frame shading (`workshop-kintsugi.ts`): which lit relief each cell reads (the plate
 * before the break, cracked, or mended, chosen by the crack nearest it and the beat), the glaze's tone bands, the
 * grooves, the seams, the red front, and the shards parting and tipping. Plain loops over the plate's box, no bakes.
 */
import type { Light, Vec3 } from '../../engine/light/shade'
import { hash32 } from '../../engine/math'
import { stbn } from '../../engine/halftone/mask'
import { createRaster, type Raster } from '../../engine/raster/raster'
import type { CellBounds } from '../../engine/types'
import { TILE } from '../types'
import type { Pt } from './materials-shared'
import type { Beat, Break, Lit } from './workshop-kintsugi'

const COLS = TILE.cols
/** Tone indices of `tonedLayer`: faint, mid, idle, value. */
export const BAND = { FAINT: 0, MID: 1, IDLE: 2, VALUE: 3 } as const
const { FAINT, MID, IDLE, VALUE } = BAND
const SPECKLE = .2

/**
 * The plate's profile (cells from the centre → height): a flat well, the cavetto rising to the lip from .6 R, and a
 * rolled lip 6 cells wide (a half-round bead on the cavetto's top), so the rim catches the light on one side.
 */
export function plateHeight(r: number, R = 60): number {
  const H = 3.6, lip = R - 6, well = .6 * R
  if (r >= lip) { const t = Math.min(1, Math.abs(r - (R - 3)) / 3.2); return H + 1.8 * Math.sqrt(1 - t * t) - (r > R - 3 ? H * t * t : 0) }
  if (r <= well) return 0
  const t = (r - well) / (lip - well)
  return H * t * t * (3 - 2 * t)
}

/** A seam cell's value: the bead catches the light where its tangent runs across it (Kajiya–Kay, by hand). */
export function seamTone(tx: number, ty: number, lx: number, ly: number): number {
  const d = tx * lx + ty * ly
  return 1 - d * d > .55 ? 1 : .86
}

export interface ShadeInput {
  b: Break; beat: Beat; close: number; L: Light
  before: Lit; cracked: Lit; mended: Lit; plain: Lit | null
  box: CellBounds; seed: number; drift: number; front: number
}
export interface Shaded { values: Raster; tones: Uint8Array; red: Pt[] }

export function shadePlate(o: ShadeInput): Shaded {
  const { b, beat, close, L, box } = o, f = b.f, old = b.prev?.seams ?? null
  const values = createRaster(TILE, 'card', box), tones = new Uint8Array(COLS * TILE.rows), V = values.data, red: Pt[] = []
  const dir = Array.isArray(L) ? L as Vec3 : null, at = dir ? null : (L as { at: Vec3 }).at
  const Lz = dir ? dir[2] / (Math.hypot(dir[0], dir[1], dir[2]) || 1) : .8, gain = .78 / Math.max(.1, Lz)
  // the light's direction in the plate's plane (a torch: from the plate's centre)
  let lx = dir ? dir[0] : at![0] - 72, ly = dir ? dir[1] : at![1] - 73
  const ll = Math.hypot(lx, ly) || 1
  lx /= ll; ly /= ll
  // each shard's drift (whole cells) and tip (a gain on its light) at this beat
  const n = f.count, ox = new Int8Array(n + 1), oy = new Int8Array(n + 1), tip = new Float32Array(n + 1).fill(1)
  if (beat.part > 0) for (let s = 1; s <= n; s++) {
    ox[s] = Math.round(beat.part * o.drift * f.ux[s]); oy[s] = Math.round(beat.part * o.drift * f.uy[s])
    const r = (hash32(o.seed, f.impact[0] * 256 + f.impact[1], s) % 1000) / 1000
    tip[s] = 1 + beat.part * (.32 * (f.ux[s] * lx + f.uy[s] * ly) + .36 * (r - .5))
  }
  const R = beat.reveal, F = beat.fill, keep = 1 - close
  // pass 1 the moving shards, pass 2 everything still (so a shard drifting over the rest of the plate slips under it)
  for (let pass = 0; pass < 2; pass++) {
    for (let y = box[1]; y <= box[3]; y++) for (let x = box[0], i = y * COLS + x; x <= box[2]; x++, i++) {
      const s = f.shard[i]
      if (s === -1 && !(old && old[i])) continue // off the plate
      const moving = s >= 1 && (ox[s] !== 0 || oy[s] !== 0)
      if ((pass === 0) !== moving) continue
      const j = moving ? i + oy[s] * COLS + ox[s] : i
      let v = 0, tone: number = FAINT
      if (close > 0) {
        // the glaze closes over every seam, from the rim of each break in to its impact
        if (b.seams[i] && b.seamU[i] <= keep) { v = seamTone(b.tx[i], b.ty[i], lx, ly); tone = VALUE } else { glaze(o.plain!, i, j, gain, x, y, V, tones); continue }
      } else if (f.crack[i] && R >= 0 && f.reach[i] <= R) {
        const r = f.reach[i]
        if (F >= 0 && r <= F) {
          if (r > F - o.front) { red.push([x, y]); continue }
          v = seamTone(f.tx[i], f.ty[i], lx, ly); tone = VALUE
        } else {
          // an open crack: dark, its wall turned to the light a faint glint
          const g = o.cracked.D[i] * gain
          if (g >= .7) { v = .2; tone = FAINT }
        }
      } else if (old && old[i]) {
        v = seamTone(b.tx[i], b.ty[i], lx, ly); tone = VALUE
      } else {
        const nr = b.near[i], src = nr >= 0 && R >= 0 && nr <= R ? (F >= 0 && nr <= F ? o.mended : o.cracked) : o.before
        glaze(src, i, j, gain * (s >= 1 ? tip[s] : 1), x, y, V, tones)
        continue
      }
      if (v > 0) { V[j] = v; tones[j] = tone }
    }
  }
  return { values, tones, red }
}

/**
 * The glaze of cell i drawn at cell j: diffuse in three bands, the specular spot a step up to value. A fifth of the
 * glaze is void by blue noise (a speckled stoneware glaze, and the plate stays near 9k dots).
 */
function glaze(l: Lit, i: number, j: number, gain: number, x: number, y: number, V: Float32Array, T: Uint8Array): void {
  const b = Math.min(1, l.D[i] * gain)
  if (l.P[i] >= .62 && b >= .3) { V[j] = 1; T[j] = VALUE; return }
  if (b < .06 || stbn(x, y, 5) < SPECKLE) return
  if (b < .3) { V[j] = b < .12 ? .12 : b; T[j] = FAINT } else if (b < .55) { V[j] = b; T[j] = MID } else {
    // the white glaze: idle, its dots a size under the seams' so a seam stands out across the well
    V[j] = .52 + .22 * (b - .55) / .45; T[j] = IDLE
  }
}
