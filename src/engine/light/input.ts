/**
 * Light and tilt input, the engine half (docs/living-matter/F0-foundation.md §2.7). Pure: no sensors,
 * no DOM. The app's hub (`src/site/light.ts`) reads the phone and publishes plain numeric data keys;
 * this module turns a light direction into those keys (`bucketLight`) and back (`lightOfBucket`), and
 * picks the light a lit card uses this frame (`sceneLight`).
 *
 * Imported by path (`engine/light/input`). It is deliberately not in `light/index.ts`, which the
 * engine barrel re-exports, so nothing here reaches first load through the barrel.
 */
import { lightDir, torch, type Light, type Vec3 } from './shade'
import { sunAt } from './material'

export const LIGHT_AZ_BUCKETS = 64, LIGHT_EL_BANDS = 8
/** Elevation bands cover 10°..80° above the surface, `LIGHT_EL_BANDS` equal bands. */
export const LIGHT_EL_MIN = 10, LIGHT_EL_MAX = 80
/** Data keys a card declares in `defaults` to receive hub light and tilt (Board.tsx:82 passes only declared keys). */
export const LIGHT_KEYS = { src: 'lightSrc', az: 'lightAz', el: 'lightEl', tx: 'tx', ty: 'ty' } as const
/** 0 = the clock's sun (card computes sunAt), 1 = tilt (az/el buckets valid). */
export type LightSrc = 0 | 1
/** An azimuth bucket (0..63, clockwise from 12 o'clock) and an elevation band (0..7, low to high). */
export interface LightBucket { az: number; el: number }

const TAU = Math.PI * 2, DEG = Math.PI / 180, BAND = (LIGHT_EL_MAX - LIGHT_EL_MIN) / LIGHT_EL_BANDS
const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x)
const wrapBucket = (k: number) => ((k % LIGHT_AZ_BUCKETS) + LIGHT_AZ_BUCKETS) % LIGHT_AZ_BUCKETS

/**
 * Round `x` (in step units) to the nearest integer with hysteresis: while `prev` is set, the result
 * stays `prev` until `x` is `margin` of a step past the boundary halfway between two integers. With
 * `wrap` = n the steps are circular (0 ≡ n). Jitter of ± (margin − ε) around a boundary flips it at most once.
 */
export function stickyRound(x: number, prev: number | undefined, margin = .25, wrap = 0): number {
  if (prev !== undefined && Number.isFinite(prev)) {
    let d = x - prev
    if (wrap) d -= wrap * Math.round(d / wrap)
    if (Math.abs(d) < .5 + margin) return prev
  }
  const r = Math.round(x)
  return wrap ? ((r % wrap) + wrap) % wrap : r
}

/**
 * Direction → (azimuth bucket 0..63, elevation band 0..7 over 10°..80°), the inverse of `lightDir`'s
 * convention (x right, y down, z toward the viewer). With `prev`, each changes only once the direction is
 * ¼ bucket past the boundary (the hub's hysteresis). A straight-overhead light keeps `prev.az` (else 0).
 */
export function bucketLight(dir: Vec3, prev?: LightBucket): LightBucket {
  const x = dir[0], y = dir[1], z = dir[2], h = Math.sqrt(x * x + y * y)
  // TODO(F0.1): datan2 (same bucket in every engine)
  const az = Math.atan2(x, -y)
  // TODO(F0.1): datan2
  const el = Math.atan2(z, h) / DEG
  const a = wrapBucket((az / TAU) * LIGHT_AZ_BUCKETS)
  const e = clamp((el - LIGHT_EL_MIN) / BAND - .5, 0, LIGHT_EL_BANDS - 1)
  return {
    az: h > 1e-9 ? stickyRound(a, prev?.az, .25, LIGHT_AZ_BUCKETS) : prev?.az ?? 0,
    el: clamp(stickyRound(e, prev?.el), 0, LIGHT_EL_BANDS - 1),
  }
}

/** The bucket centre as a unit direction (`lightDir`, shade.ts). Bake caches key on `az + 64·el` (512 lights max). */
export function lightOfBucket(az: number, el: number): Vec3 {
  const a = wrapBucket(Math.round(az)), b = clamp(Math.round(el), 0, LIGHT_EL_BANDS - 1)
  return lightDir((a / LIGHT_AZ_BUCKETS) * TAU, (LIGHT_EL_MIN + (b + .5) * BAND) * DEG)
}

export interface SceneLightInput {
  /** A pointer inside the card, in the cells of the card's normals grid (null / absent: none). */
  pointer?: { x: number; y: number } | null
  /** The card's data: reads `lightSrc`, `lightAz`, `lightEl` (declare them in `defaults`). */
  data: Record<string, number>
  /** The board clock's fractional hour, for `sunAt`. */
  hour: number
  /** The pointer torch: height above the surface and falloff, cells (default 32, none). */
  torch?: { height: number; falloff?: number }
}

/**
 * The light a material card uses this frame, first match wins:
 *  1. a pointer inside the card → torch at it (shade.ts `torch`; the pattern of widgets/boards/light.ts `boardLight`);
 *  2. data.lightSrc === 1 → lightOfBucket(data.lightAz, data.lightEl);
 *  3. sunAt(hour) (material.ts).
 * Pure in its inputs; goldens see defaults (lightSrc 0) and the frozen clock, so nothing moves.
 */
export function sceneLight(o: SceneLightInput): Light {
  if (o.pointer) return torch(o.pointer.x, o.pointer.y, o.torch?.height ?? 32, o.torch?.falloff)
  if (o.data[LIGHT_KEYS.src] === 1) return lightOfBucket(o.data[LIGHT_KEYS.az] ?? 0, o.data[LIGHT_KEYS.el] ?? LIGHT_EL_BANDS - 1)
  return sunAt(o.hour)
}
