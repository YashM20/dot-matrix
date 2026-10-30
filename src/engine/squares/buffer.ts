/**
 * The squares channels of a `DotBuffer` and of array-path dots (Q-squares §2.2), as `samplerExt` hooks so the
 * first-load buffer carries only the field names. `ext` holds three views, 7 B/dot, Float32 first so every view is
 * aligned for any capacity c: `aspect` Float32 at byte 0 (a rect cell's ry / rx; 0 = none, i.e. 1), `join` Uint16 at 4c (bits 0–11 mask, 12–15 joint slot;
 * 0xFFFF = plain), `form` Uint8 at 6c (bits 0–3 roundness step /8, 15 = frame style; bit 4 rotated by π/4; bits 5–7 the motif, src/engine/squares/form.ts).
 */
import type { DotBuffer } from '../buffer/dotBuffer'
import type { DotInstance, DotStyle, JointGeom } from '../types'
import { MOTIFS, MOTIF_SHIFT, ROT45, inkOf } from './form'

const NO_JOIN = 0xFFFF, NO_FORM = 15

function views(buf: DotBuffer, ext: ArrayBuffer): void {
  const c = buf.capacity
  buf.ext = ext; buf.aspect = new Float32Array(ext, 0, c); buf.join = new Uint16Array(ext, 4 * c, c); buf.form = new Uint8Array(ext, 6 * c, c)
}
/** A fresh `ext` for the buffer's capacity (every dot plain, frame style), keeping the first `n` entries of `old`. */
function fresh(buf: DotBuffer, old?: { aspect?: Float32Array; join?: Uint16Array; form?: Uint8Array }, n = 0): void {
  views(buf, new ArrayBuffer(7 * buf.capacity))
  buf.join!.fill(NO_JOIN); buf.form!.fill(NO_FORM)
  if (old?.join) { buf.aspect!.set(old.aspect!.subarray(0, n)); buf.join!.set(old.join.subarray(0, n)); buf.form!.set(old.form!.subarray(0, n)) }
}

/**
 * `samplerExt.rect`: a rect cell's half width and aspect. ry follows the same ramp on ky (each side clamped to its own
 * gutter); a bar ('x') keeps its height full, a line ('y') its width. A form dot (Q3) first takes the equal-ink half
 * side of its roundness step (`inkOf`); a square cell (ky = 0) keeps aspect 1.
 */
export function rect(r: number, kx: number, ky: number, axis: 'x' | 'y' | undefined, gap: number, pitch: number, form = NO_FORM, style?: { shape: DotStyle['shape']; roundness: number | undefined }): [number, number] {
  // the gutter clamp again after the ink scale (a scale ≥ 1 can't push a square-like dot past its gutter)
  if (form !== NO_FORM && style) { r = inkOf(r, form, style.shape, style.roundness); if (gap) r = Math.min(r, (1 - gap) * kx * pitch / 2) }
  if (!ky) return [r, 1]
  let ry = r / kx * ky
  if (axis === 'y') r = (1 - gap) * kx * pitch / 2; else if (axis === 'x') ry = (1 - gap) * ky * pitch / 2
  return [r, r > 0 ? ry / r : 1]
}
/** `samplerExt.stamp`: the array-path dot's per-dot roundness, rotation (π/4, radians), motif, join and rect aspect. */
export function stamp(d: DotInstance, join: number, form: number, joints: JointGeom[] | null, aspect = 1): void {
  if (form !== NO_FORM) {
    const f = form & 15
    if (f !== NO_FORM) { d.shape = 'squircle'; d.roundness = f / 8 }
    if (form & ROT45) d.rot = Math.PI / 4
    if (form >> MOTIF_SHIFT) d.motif = MOTIFS[form >> MOTIF_SHIFT]
  }
  if (join !== NO_JOIN) { d.join = join & 0xFFF; d.joint = joints![join >> 12] }
  if (aspect !== 1) d.aspect = aspect
}
/** `samplerExt.push`: the buffer dot's channels. */
export function push(buf: DotBuffer, i: number, join: number, form: number, aspect = 1): void {
  if (!buf.ext) fresh(buf)
  buf.join![i] = join; buf.form![i] = form; buf.aspect![i] = aspect === 1 ? 0 : aspect
}
/** `samplerExt.attach`: views over a transferred store, when its size fits the capacity. */
export function attach(buf: DotBuffer, ext: ArrayBuffer): void {
  if (ext.byteLength === 7 * buf.capacity) views(buf, ext)
}
/** `samplerExt.grow`: the buffer grew (`reserve`): a store for the new capacity, first `n` dots kept. */
export function grow(buf: DotBuffer, n: number): void {
  const { aspect, join, form } = buf
  fresh(buf, { aspect, join, form }, n)
}
/** `samplerExt.decode`: `toDots` output gets per-dot roundness and join, as the array path stamps them. */
export function decode(buf: DotBuffer, out: DotInstance[]): void {
  const { join, form, joints, aspect } = buf
  for (let i = 0; i < out.length; i++) stamp(out[i], join![i], form![i], joints ?? null, aspect![i] || 1)
}
