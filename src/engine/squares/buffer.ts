/**
 * The squares channels of a `DotBuffer` and of array-path dots (Q-squares §2.2), as `samplerExt` hooks so the
 * first-load buffer carries only the field names. `ext` holds three views, 7 B/dot, Float32 first so every view is
 * aligned for any capacity c: `aspect` (Q2) at byte 0, `join` Uint16 at 4c (bits 0–11 mask, 12–15 joint slot;
 * 0xFFFF = plain), `form` Uint8 at 6c (bits 0–3 roundness step /8; 15 = frame style).
 */
import type { DotBuffer } from '../buffer/dotBuffer'
import type { DotInstance, JointGeom, Layer } from '../types'

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

/** `samplerExt.form`: a `shapeOf` layer's roundness snapped to `{grid.shapeSteps}` (1/8), or 15. */
export function formOf(layer: Layer, value: number, u: number, v: number): number {
  const r = layer.shapeOf?.(value, u, v)
  return r === undefined || !Number.isFinite(r) ? NO_FORM : Math.round(8 * Math.max(0, Math.min(1, r)))
}
/** `samplerExt.stamp`: the array-path dot's per-dot roundness and join. */
export function stamp(d: DotInstance, join: number, form: number, joints: JointGeom[] | null): void {
  if (form !== NO_FORM) { d.shape = 'squircle'; d.roundness = form / 8 }
  if (join !== NO_JOIN) { d.join = join & 0xFFF; d.joint = joints![join >> 12] }
}
/** `samplerExt.push`: the buffer dot's channels. */
export function push(buf: DotBuffer, i: number, join: number, form: number): void {
  if (!buf.ext) fresh(buf)
  buf.join![i] = join; buf.form![i] = form
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
  const { join, form, joints } = buf
  for (let i = 0; i < out.length; i++) stamp(out[i], join![i], form![i], joints ?? null)
}
