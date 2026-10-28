import type { DotInstance, DotStyle, JointGeom, ThemeTokens, Tone } from '../types'

/**
 * Struct-of-arrays dot list (MASTER-PLAN §3.10): the sampler writes dots here without allocating an
 * object per dot, the canvas renderer draws straight from it and a worker can transfer it whole.
 * All five arrays are views into one `ArrayBuffer` (`bytes`), so one transfer moves a frame.
 * `tone` indexes `palette` (see `TONE`); shape and roundness are per frame (the sampler's style).
 */
export interface DotBuffer {
  x: Float32Array; y: Float32Array; r: Float32Array; opacity: Float32Array; tone: Uint8Array
  /** Dots written (indices 0 … n-1 are valid). */
  n: number
  /** Dots the arrays hold before the buffer grows. */
  capacity: number
  bytes: ArrayBuffer
  /** Colour per tone index, resolved from the theme the frame was sampled with. */
  palette: readonly string[]
  shape?: DotStyle['shape']
  roundness?: number
  /**
   * Optional per-dot channels (squares), all views into `ext` (7 B/dot), allocated by the first `pushExt`; absent
   * on classic frames. `aspect` (Q2) Float32 at byte 0; `join` Uint16 at 4c (bits 0–11 mask, 12–15 joint slot,
   * 0xFFFF = plain); `form` Uint8 at 6c (bits 0–3 roundness step /8, 15 = frame style). `joints`: geometry per slot.
   */
  ext?: ArrayBuffer; aspect?: Float32Array; join?: Uint16Array; form?: Uint8Array; joints?: JointGeom[]
}

/** Tone indices of a `DotBuffer`: the grey bands first (value order), then the pinned roles. */
export const TONE = { faint: 0, mid: 1, idle: 2, value: 3, activeDim: 4, active: 5 } as const
const BYTES_PER_DOT = 4 * 4 + 1

/** Colour per tone index for `theme` (cached per theme object); same fallbacks as `toneColor`. */
const palettes = new WeakMap<ThemeTokens, readonly string[]>()
export function paletteOf(theme: ThemeTokens): readonly string[] {
  let p = palettes.get(theme)
  if (!p) {
    p = [theme.dotFaint ?? theme.dotIdle, theme.dotMid ?? theme.dotIdle, theme.dotIdle, theme.value ?? theme.dotIdle, theme.dotActiveDim ?? theme.dotActive, theme.dotActive]
    palettes.set(theme, p)
  }
  return p
}

/** Tone index of a dot: a pinned tone, else the grey band by value (thresholds as `colorFor`). */
export function toneIndex(tone: Tone | undefined, value: number): number {
  switch (tone) {
    case 'active': return TONE.active
    case 'activeDim': return TONE.activeDim
    case 'value': return TONE.value
    case 'idle': return TONE.idle
    case 'mid': return TONE.mid
    case 'faint': return TONE.faint
    default: return value <= 0.34 ? TONE.faint : value <= 0.67 ? TONE.mid : TONE.idle
  }
}

/** A buffer over `bytes` (or a fresh one) holding `capacity` dots; `ext` (the squares channels, 7 B/dot) is attached when its size fits. */
export function dotBufferOver(capacity: number, bytes = new ArrayBuffer(capacity * BYTES_PER_DOT), palette: readonly string[] = [], ext?: ArrayBuffer): DotBuffer {
  const c = capacity, f = 4 * c
  const buf: DotBuffer = { x: new Float32Array(bytes, 0, c), y: new Float32Array(bytes, f, c), r: new Float32Array(bytes, 2 * f, c), opacity: new Float32Array(bytes, 3 * f, c), tone: new Uint8Array(bytes, 4 * f, c), n: 0, capacity: c, bytes, palette }
  if (ext?.byteLength === 7 * c) extOver(buf, ext)
  return buf
}
export const createDotBuffer = (capacity = 1024): DotBuffer => dotBufferOver(Math.max(16, capacity | 0))
const extOver = (buf: DotBuffer, ext: ArrayBuffer) => {
  const c = buf.capacity
  buf.ext = ext; buf.aspect = new Float32Array(ext, 0, c); buf.join = new Uint16Array(ext, 4 * c, c); buf.form = new Uint8Array(ext, 6 * c, c)
}
/** Allocate the squares channels (every dot: plain, frame style) and keep the first `n` entries of `old`. */
function newExt(buf: DotBuffer, old?: DotBuffer, n = 0) {
  extOver(buf, new ArrayBuffer(7 * buf.capacity))
  buf.join!.fill(0xFFFF); buf.form!.fill(15)
  if (old?.join) { buf.aspect!.set(old.aspect!.subarray(0, n)); buf.join!.set(old.join.subarray(0, n)); buf.form!.set(old.form!.subarray(0, n)) }
}

/** Grow `buf` in place (new backing store, contents kept) so it holds at least `need` dots. */
export function reserve(buf: DotBuffer, need: number): void {
  if (need <= buf.capacity) return
  const next = dotBufferOver(Math.max(need, buf.capacity * 2))
  const n = buf.n
  next.x.set(buf.x.subarray(0, n)); next.y.set(buf.y.subarray(0, n)); next.r.set(buf.r.subarray(0, n)); next.opacity.set(buf.opacity.subarray(0, n)); next.tone.set(buf.tone.subarray(0, n))
  if (buf.ext) newExt(next, buf, n)
  buf.x = next.x; buf.y = next.y; buf.r = next.r; buf.opacity = next.opacity; buf.tone = next.tone; buf.capacity = next.capacity; buf.bytes = next.bytes
  if (buf.ext) { buf.ext = next.ext; buf.aspect = next.aspect; buf.join = next.join; buf.form = next.form }
}
/** Set dot `i`'s squares channels (packed join, form code), allocating them on first use. */
export function pushExt(buf: DotBuffer, i: number, join: number, form: number): void {
  if (!buf.ext) newExt(buf)
  buf.join![i] = join; buf.form![i] = form
}

/** Append one dot. */
export function pushDot(buf: DotBuffer, x: number, y: number, r: number, opacity: number, tone: number): void {
  const i = buf.n
  if (i >= buf.capacity) reserve(buf, i + 1)
  buf.x[i] = x; buf.y[i] = y; buf.r[i] = r; buf.opacity[i] = opacity; buf.tone[i] = tone
  buf.n = i + 1
}

/** Adapter for SVG, export, motion and other `DotInstance[]` consumers (values are float32-rounded). */
export function toDots(buf: DotBuffer): DotInstance[] {
  const out: DotInstance[] = new Array(buf.n), { x, y, r, opacity, tone, palette, shape, roundness, join, form, joints } = buf
  for (let i = 0; i < buf.n; i++) {
    const d: DotInstance = out[i] = { x: x[i], y: y[i], r: r[i], opacity: opacity[i], color: palette[tone[i]], shape, roundness }
    if (!join) continue
    const f = form![i], j = join[i]
    if (f !== 15) { d.shape = 'squircle'; d.roundness = f / 8 }
    if (j !== 0xFFFF) { d.join = j & 0xFFF; d.joint = joints![j >> 12] }
  }
  return out
}

/** Lit dots (r > 0 and opacity > 0), the count the renderer rule reads. */
export function visibleCount(buf: DotBuffer): number {
  let n = 0
  for (let i = 0; i < buf.n; i++) if (buf.r[i] > 0 && buf.opacity[i] > 0) n++
  return n
}

/**
 * Pool of retired buffers, so a card that re-samples (or remounts) reuses its backing store instead of
 * allocating. Bounded; `acquire` returns the smallest pooled buffer that fits, else a new one.
 */
const pool: DotBuffer[] = []
const POOL_LIMIT = 16
export function acquireDotBuffer(capacity = 1024): DotBuffer {
  let best = -1
  for (let i = 0; i < pool.length; i++) if (pool[i].capacity >= capacity && (best < 0 || pool[i].capacity < pool[best].capacity)) best = i
  const buf = best >= 0 ? pool.splice(best, 1)[0] : createDotBuffer(capacity)
  buf.n = 0
  return buf
}
export function releaseDotBuffer(buf: DotBuffer | null | undefined): void {
  // a transferred (detached) buffer has byteLength 0 and cannot be reused
  if (!buf || buf.bytes.byteLength === 0 || pool.includes(buf)) return
  if (pool.length >= POOL_LIMIT) pool.shift()
  pool.push(buf)
}
