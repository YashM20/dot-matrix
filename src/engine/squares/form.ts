/**
 * Per-dot form (docs/living-matter/Q-squares.md §4.1, squares Q3): rotation snapped to π/4, nested motifs, and the
 * equal-ink rule of `shapeOf`. One geometry source for every renderer:
 *
 *   formCode      a layer's per-dot code: bits 0–3 roundness step (15 = the frame style), bit 4 rot45, bits 5–7 motif
 *   formOutline   the dot's outline into a path sink (Canvas Path2D, the SVG string sink, a recorder)
 *   insideForm    the CPU reference (point in shape): the snap raster and the parity probe
 *   formArea      the analytic area (ink checks)
 *   inkOf         `samplerExt.ink`: a `shapeOf` dot's half side, scaled so it holds the frame style's ink
 *
 * Rotation: with the square's 90° symmetry a snapped angle is one of two states, 0 or π/4, so a dot stores
 * `rot = π/4` or nothing. A rotated dot is the same outline turned 45° about its centre (a diamond); circles ignore it.
 * Motifs are cut in the dot's own colour: 'bead' a centred round hole of radius .4 s (Perler), 'stud' a ring of
 * radius .6 s and width .14 s (a LEGO stud seen from above), each a counter-clockwise sub-path, so the nonzero fill
 * cancels it; 'stitch' draws the cell as an X: two diagonal bars clipped to the box, arms .4 s across the axis.
 * Roundness still comes from the exponent (a motif is an inner cut, not a shape preset); a stitch is the X of the box.
 * Pure and deterministic (inside the determinism lint).
 */
import type { DotStyle, Layer } from '../types'
import { BEZIER_MAX_N, squircleExponent } from '../renderer/shapePath'
import { dpow } from '../noise/dmath'
import { insideRect, rectOutline, superellipseArea, type OutlineSink } from './geometry'

/** Form code bits: the roundness step (0–8; 15 = the frame style), a π/4 rotation, the motif (1–3). */
export const NO_FORM = 15, ROT45 = 16, MOTIF_SHIFT = 5
/** Motif names by code (`DotInstance.motif`); 0 = none. */
export const MOTIFS = ['', 'bead', 'stud', 'stitch'] as const
export const BEAD = 1, STUD = 2, STITCH = 3
const CODE: Record<string, number> = { bead: BEAD, stud: STUD, stitch: STITCH }
/** Motif geometry as fractions of the half side s. */
export const BEAD_HOLE = .4, STUD_RING = .6, STUD_HALF = .07, STITCH_ARM = .4

const QUARTER = Math.PI / 4
/** An angle (radians) snapped to a multiple of π/4, reduced by the square's 90° symmetry: 0 or π/4. */
export const snapRot = (theta: number): number => (Number.isFinite(theta) && Math.round(theta / QUARTER) & 1 ? QUARTER : 0)

/** `samplerExt.form`: a layer's code at one dot (15 = a plain dot in the frame style). */
export function formCode(layer: Layer, value: number, u: number, v: number): number {
  const r = layer.shapeOf?.(value, u, v), rot = layer.rotation, m = layer.motif ? CODE[layer.motif] ?? 0 : 0
  const step = r === undefined || !Number.isFinite(r) ? NO_FORM : Math.round(8 * Math.max(0, Math.min(1, r)))
  const turned = rot !== undefined && snapRot(typeof rot === 'function' ? rot(value, u, v) : rot) !== 0
  return step | (turned ? ROT45 : 0) | (m << MOTIF_SHIFT)
}

/** Exponent of a shape (`square` → ∞, circles and superformula → 2). */
export const shapeExponent = (shape: DotStyle['shape'] | undefined, roundness?: number): number =>
  shape === 'square' ? Infinity : shape === 'squircle' ? squircleExponent(roundness ?? 0) : 2
/** Corner of the rounded square a squircle of n > 8 is drawn as (shapePath's `cornerFraction`, with `dpow`). */
const corner = (n: number) => (n === Infinity ? 0 : (Math.SQRT2 * (1 - dpow(2, -1 / n))) / (Math.SQRT2 - 1))
/** Area of the drawn dot of exponent n at half side 1: the rounded square for n > 8, the superellipse below. */
export const drawnArea = (n: number): number => (n > BEZIER_MAX_N ? 4 - (4 - Math.PI) * corner(n) ** 2 : superellipseArea(n))

/** `samplerExt.ink`: a `shapeOf` dot (roundness step ≠ 15) holds the ink of the frame style's dot of the same r. */
export function inkOf(r: number, form: number, shape: DotStyle['shape'], roundness: number | undefined): number {
  const f = form & 15
  return f === NO_FORM ? r : r * Math.sqrt(drawnArea(shapeExponent(shape, roundness)) / drawnArea(squircleExponent(f / 8)))
}

/** What `formOutline` draws into: an outline sink that also takes cubic Béziers (soft squircles). */
export type FormSink = OutlineSink & { bezierCurveTo(ax: number, ay: number, bx: number, by: number, x: number, y: number): void }

const C = Math.SQRT1_2
/** A sink that turns everything by π/4 about (x, y) (y down: clockwise on screen); a rect becomes a 4-point polygon. */
class Turned implements FormSink {
  private p: FormSink; private x: number; private y: number
  constructor(p: FormSink, x: number, y: number) { this.p = p; this.x = x; this.y = y }
  private tx(px: number, py: number) { return this.x + C * (px - this.x - (py - this.y)) }
  private ty(px: number, py: number) { return this.y + C * (px - this.x + (py - this.y)) }
  moveTo(x: number, y: number) { this.p.moveTo(this.tx(x, y), this.ty(x, y)) }
  lineTo(x: number, y: number) { this.p.lineTo(this.tx(x, y), this.ty(x, y)) }
  arc(cx: number, cy: number, r: number, a0: number, a1: number, ccw: boolean, ex: number, ey: number) { this.p.arc(this.tx(cx, cy), this.ty(cx, cy), r, a0 + QUARTER, a1 + QUARTER, ccw, this.tx(ex, ey), this.ty(ex, ey)) }
  bezierCurveTo(ax: number, ay: number, bx: number, by: number, x: number, y: number) { this.p.bezierCurveTo(this.tx(ax, ay), this.ty(ax, ay), this.tx(bx, by), this.ty(bx, by), this.tx(x, y), this.ty(x, y)) }
  rect(x: number, y: number, w: number, h: number) { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath() }
  closePath() { this.p.closePath() }
}
/** A full circle as two half arcs (an SVG arc can't start and end at one point); counter-clockwise for a hole. */
function circle(p: OutlineSink, x: number, y: number, r: number, ccw: boolean): void {
  const s = ccw ? -1 : 1
  p.moveTo(x + r, y)
  p.arc(x, y, r, 0, s * Math.PI, ccw, x - r, y)
  p.arc(x, y, r, s * Math.PI, s * 2 * Math.PI, ccw, x + r, y)
  p.closePath()
}
/** The X of a cross-stitch: two diagonal bars (|y − x| ≤ t, |y + x| ≤ t) clipped to the box of half side s, clockwise. */
function stitch(p: OutlineSink, x: number, y: number, s: number): void {
  const t = STITCH_ARM * s, a = s - t
  const pts = [[-s, -s], [-a, -s], [0, -t], [a, -s], [s, -s], [s, -a], [t, 0], [s, a], [s, s], [a, s], [0, t], [-a, s], [-s, s], [-s, a], [-t, 0], [-s, -a]]
  p.moveTo(x + pts[0][0], y + pts[0][1])
  for (let i = 1; i < pts.length; i++) p.lineTo(x + pts[i][0], y + pts[i][1])
  p.closePath()
}
/**
 * Append a form dot (centre x, y, half side s, exponent n; `rot45`; motif code) as clockwise sub-paths, holes
 * counter-clockwise. A circle (n ≤ 2) turns only its stitch.
 */
export function formOutline(p: FormSink, x: number, y: number, s: number, n: number, rot45: boolean, motif: number): void {
  const q: FormSink = rot45 && (n > 2 || motif === STITCH) ? new Turned(p, x, y) : p
  if (motif === STITCH) { stitch(q, x, y, s); return }
  if (n <= 2) circle(p, x, y, s, false)
  else { rectOutline(q, x, y, s, s, n); p.closePath() }
  if (motif === BEAD) circle(p, x, y, BEAD_HOLE * s, true)
  else if (motif === STUD) { circle(p, x, y, (STUD_RING + STUD_HALF) * s, true); circle(p, x, y, (STUD_RING - STUD_HALF) * s, false) }
}
/** Is (px, py) inside the form dot of `formOutline`? The CPU reference for every renderer. */
export function insideForm(px: number, py: number, cx: number, cy: number, s: number, n: number, rot45: boolean, motif: number): boolean {
  let dx = px - cx, dy = py - cy
  if (rot45 && (n > 2 || motif === STITCH)) { const a = C * (dx + dy), b = C * (dy - dx); dx = a; dy = b }
  if (motif === STITCH) { const t = STITCH_ARM * s; return Math.abs(dx) <= s && Math.abs(dy) <= s && (Math.abs(dy - dx) <= t || Math.abs(dy + dx) <= t) }
  if (!(n <= 2 ? dx * dx + dy * dy <= s * s : insideRect(dx, dy, 0, 0, s, s, n))) return false
  const L = Math.sqrt(dx * dx + dy * dy)
  return motif === BEAD ? L >= BEAD_HOLE * s : motif === STUD ? Math.abs(L - STUD_RING * s) >= STUD_HALF * s : true
}
/** Analytic area (px²) of a form dot of half side s and exponent n (rotation keeps the area). */
export function formArea(s: number, n: number, motif: number): number {
  if (motif === STITCH) { const a = s - STITCH_ARM * s; return 4 * s * s - 4 * a * a }
  const outer = (n <= 2 ? Math.PI : drawnArea(n)) * s * s
  if (motif === BEAD) return outer - Math.PI * (BEAD_HOLE * s) ** 2
  if (motif === STUD) return outer - Math.PI * (((STUD_RING + STUD_HALF) * s) ** 2 - ((STUD_RING - STUD_HALF) * s) ** 2)
  return outer
}
