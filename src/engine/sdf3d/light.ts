/**
 * Light for a marched scene (#69, docs/IQ-PLAN.md IQ8): Inigo Quilez's fog (colour from the sun direction,
 * extinction and in-scattering, density falling off with height) and his three-light outdoors rig (sun, sky,
 * bounce) in linear space with the 1/2.2 gamma at the end. Colours stay RGB so the rig is the article's; a dot board
 * reads the result as `luma`.
 */
import { dexp, dpow } from '../noise/dmath'
import type { V3 } from './march'

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

// after Inigo Quilez, https://iquilezles.org/articles/fog/ (MIT)
/** How much fog lies between the eye and a point `t` away, at density `b`: 1 − e^(−t·b). */
export const fogAmount = (t: number, b: number) => 1 - dexp(-t * b)

// after Inigo Quilez, https://iquilezles.org/articles/fog/ (MIT)
/**
 * The fog colour for a view ray: the base colour, turned toward the sun colour by max(rd·sun, 0)^p (the article
 * uses p = 8). Writes into `out`.
 */
export function sunFogColor(rd: V3, sun: V3, base: V3, toward: V3, out: V3, p = 8): V3 {
  const s = dpow(Math.max(rd[0] * sun[0] + rd[1] * sun[1] + rd[2] * sun[2], 0), p)
  for (let i = 0; i < 3; i++) out[i] = base[i] + (toward[i] - base[i]) * s
  return out
}

// after Inigo Quilez, https://iquilezles.org/articles/fog/ (MIT)
/** Blend `col` (in place) toward `fog` by `amount`: the plain mix. */
export function applyFog(col: V3, fog: V3, amount: number): V3 {
  for (let i = 0; i < 3; i++) col[i] += (fog[i] - col[i]) * amount
  return col
}

// after Inigo Quilez, https://iquilezles.org/articles/fog/ (MIT)
/**
 * The mix split in two: extinction e^(−t·be) dims the colour and in-scattering 1 − e^(−t·bi) adds the fog, each
 * with its own density per channel. Applied to `col` in place.
 */
export function applyFogSplit(col: V3, fog: V3, t: number, be: V3, bi: V3): V3 {
  for (let i = 0; i < 3; i++) col[i] = col[i] * dexp(-t * be[i]) + fog[i] * (1 - dexp(-t * bi[i]))
  return col
}

// after Inigo Quilez, https://iquilezles.org/articles/fog/ (MIT); the height falloff is Crytek's
/**
 * Fog whose density falls off with height, d(y) = a·e^(−b·y), integrated in closed form along the ray from the eye
 * (height `oy`, ray slope `dy`) to `t`. Clamped to [0, 1]; a level ray takes the limit a·e^(−b·oy)·t.
 */
export function heightFog(t: number, oy: number, dy: number, a: number, b: number): number {
  const base = a * dexp(-oy * b)
  const k = Math.abs(dy * b) < 1e-6 ? t : (1 - dexp(-t * dy * b)) / (dy * b)
  return clamp01(base * k)
}

/** The rig's light colours, linear RGB, as the article gives them. */
export const SUN_RGB: readonly number[] = [1.64, 1.27, .99]
export const SKY_RGB: readonly number[] = [.16, .20, .28]
export const BOUNCE_RGB: readonly number[] = [.40, .28, .20]
/** The penumbra colour powers: shadow edges turn warm. */
const PEN = [1, 1.2, 1.5]

// after Inigo Quilez, https://iquilezles.org/articles/outdoorslighting/ (MIT)
/**
 * The three directional lights at a surface with unit normal n: the sun (key, shadowed by `sha` with its
 * penumbra coloured by pow(sha, (1, 1.2, 1.5)), never occluded by AO), the sky straight down (0.5 + 0.5·n.y,
 * times `occ`) and the bounce (the sun's horizontal direction negated, times `occ`). Writes linear light into
 * `out`; multiply by an albedo near 0.2, fog, then `gamma`. `gain` scales the three lights (sun, sky, bounce).
 */
export function outdoorLight(n: V3, sun: V3, sha: number, occ: number, out: V3, gain: V3 = [1, 1, 1]): V3 {
  const dif = clamp01(n[0] * sun[0] + n[1] * sun[1] + n[2] * sun[2])
  const sky = clamp01(.5 + .5 * n[1])
  const bl = Math.sqrt(sun[0] * sun[0] + sun[2] * sun[2]) || 1
  const ind = clamp01((-n[0] * sun[0] - n[2] * sun[2]) / bl)
  for (let i = 0; i < 3; i++) {
    const pen = PEN[i] === 1 ? sha : dpow(Math.max(sha, 0), PEN[i])
    out[i] = gain[0] * dif * SUN_RGB[i] * pen + gain[1] * sky * SKY_RGB[i] * occ + gain[2] * ind * BOUNCE_RGB[i] * occ
  }
  return out
}

// after Inigo Quilez, https://iquilezles.org/articles/outdoorslighting/ (MIT)
/** The display curve the article insists on: linear light to the screen, x^(1/2.2). */
export const gamma = (x: number) => (x <= 0 ? 0 : dpow(x, 1 / 2.2))

/** Rec. 709 luma of linear RGB: how bright a lit colour reads as one grey dot. */
export const luma = (c: V3) => .2126 * c[0] + .7152 * c[1] + .0722 * c[2]
