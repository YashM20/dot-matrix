/**
 * The sampler's join pass (`samplerExt.join`, docs/living-matter/Q-squares.md §1.3, §2.3): keys, then masks, for
 * one composite. Two neighbouring cells merge only when both winning layers have `join`, they share the resolved
 * group, tone index and quantized step, each is at least `at`, and neither is hidden by a lattice or site dot. The
 * accent (`active`, `activeDim`) joins only with `join.accent`; unquantized (photo) styles never join (one warning).
 * Merged cells therefore share colour and opacity, so they land in one Canvas `Path2D`: no conflation seam.
 */
import { TONE, toneIndex } from '../buffer/dotBuffer'
import { cornerFraction, squircleExponent } from '../renderer/shapePath'
import type { JoinArgs, JoinFrame } from '../sampler/ext'
import type { DotStyle, JoinSpec, JointGeom } from '../types'
import { joinMasks, NO_JOIN } from './mask'

const DEFAULT: JoinSpec = {}
/** Convex corner of a joined blob when `join.outer` is unset: the style's own corner (0 for 'square', 1 for circles). */
export function defaultOuter(style: DotStyle): number {
  return style.shape === 'square' ? 0 : style.shape === 'squircle' ? cornerFraction(squircleExponent(style.cornerRoundness ?? 0)) : 1
}
/** Slot of `g` in the frame's joint table (an equal one is shared), or -1 when the table (15 slots) is full. */
function slotOf(joints: JointGeom[], g: JointGeom): number {
  for (let i = 0; i < joints.length; i++) {
    const o = joints[i]
    if (o.hx === g.hx && o.hy === g.hy && o.ro === g.ro && o.ri === g.ri && o.seam === g.seam && o.ox === g.ox && o.oy === g.oy) return i
  }
  if (joints.length >= 15) return -1
  return joints.push(g) - 1
}

let key = new Uint16Array(0), mask = new Uint16Array(0), join = new Uint16Array(0), tone = new Uint8Array(0), slot = new Int8Array(0)
let warned = false
/** One composite's join pass: the packed join value (mask | slot << 12, or NO_JOIN) and tone index per window cell. */
export function joinPass(a: JoinArgs): JoinFrame | null {
  const { layers, best, owner, win, us, vs, covered, style } = a, steps = style.quantizeSteps ?? 0
  if (!(steps >= 2)) {
    if (!warned) { warned = true; console.warn('squares: `join` needs a quantized style (quantizeSteps ≥ 2); drawing plain dots') }
    return null
  }
  const [c0, r0, c1, r1] = win, width = c1 - c0 + 1, height = r1 - r0 + 1, n = Math.max(0, width * height)
  // scratch reused across calls; the frame keeps only `join` / `tone` until the composite is emitted
  if (key.length < n) { key = new Uint16Array(n); mask = new Uint16Array(n); join = new Uint16Array(n); tone = new Uint8Array(n); slot = new Int8Array(n) }
  const specs = layers.map(l => (l.join === true ? DEFAULT : l.join))
  const slots = specs.map(J => (J ? slotOf(a.joints, { hx: a.h, hy: a.h, ro: J.outer ?? defaultOuter(style), ri: (J.inner ?? 0) * a.h, seam: (J.seam ?? 0) * 2 * a.h, ox: a.ox, oy: a.oy }) : -1))
  const K = key, T = tone, S = slot, q = steps - 1
  // per layer, resolved once: the spec's fields, and whether tone and group vary per cell
  const n0 = layers.length, at = new Float64Array(n0), accent = new Uint8Array(n0), groupFn: (((u: number, v: number) => number) | null)[] = [], group0 = new Int32Array(n0)
  for (let l = 0; l < n0; l++) {
    const J = specs[l]
    if (!J) continue
    at[l] = J.at ?? 0; accent[l] = J.accent ? 1 : 0
    groupFn[l] = typeof J.group === 'function' ? J.group : null; group0[l] = typeof J.group === 'number' ? J.group & 255 : 0
  }
  // a run of equal cells (same owner and value) shares tone and step: only per-cell callbacks are re-read
  let lastO = -1, lastV = -1, lastT = 0, lastStep = 0
  for (let r = r0; r <= r1; r++) for (let c = c0, i = (r - r0) * width; c <= c1; c++, i++) {
    const v = best[i], o = owner[i]
    K[i] = 0
    if (!o || (covered !== null && covered[i])) { T[i] = toneIndex(undefined, v); continue }
    const l = o - 1, L = layers[l]
    let t: number
    if (o === lastO && v === lastV && !L.toneOf) t = lastT
    else { t = toneIndex(L.toneOf ? L.toneOf(v, us[c], vs[r]) : L.tone, v); lastO = o; lastV = v; lastT = t; lastStep = Math.round(Math.min(1, v) * q) }
    T[i] = t
    const step = lastStep
    if (slots[l] < 0 || step <= 0 || step / q < at[l] || ((t === TONE.active || t === TONE.activeDim) && !accent[l])) continue
    const fn = groupFn[l], g = fn ? fn(us[c], vs[r]) & 255 : group0[l]
    K[i] = ((g << 7) | (t << 4) | (step & 15)) + 1
    S[i] = slots[l]
  }
  const M = joinMasks(K.subarray(0, n), width, height, mask), out = join
  for (let i = 0; i < n; i++) out[i] = K[i] ? M[i] | (S[i] << 12) : NO_JOIN
  return { join: out, tone: T }
}
