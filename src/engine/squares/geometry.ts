/**
 * Joined-cell geometry (docs/living-matter/Q-squares.md §1.1, §2.4): one source for every renderer.
 *
 *   insideJoined  the CPU reference (point in shape), used by the snap raster and the parity probe
 *   joinOutline   one clockwise closed outline into a path sink (Canvas Path2D, the SVG string sink, a recorder)
 *   joinArea      the analytic area (ink checks)
 *   inkRadius     the radius that gives a superellipse of exponent n the ink of a circle of radius r
 *
 * A cell of half side `s` (the sampler's r) centred at (cx, cy) reaches the cell boundary `hj = h − seam/2` on its
 * joined sides; in quadrant-local coordinates a = |p − c| each quadrant is one of the five shapes of `mask.ts`:
 * CONVEX [0, s]² with its outer corner rounded by ro; EDGE_H [0, hj] × [0, s]; EDGE_V [0, s] × [0, hj]; FULL [0, hj]²;
 * INNER [0, hj]² minus the notch {a.x > s, a.y > s}, whose corner is filleted by ri. Arcs use explicit centres and
 * quarter angles (exact, no trig), so Canvas and SVG trace the same curve.
 */
import type { JointGeom } from '../types'
import { ALL_FULL, EDGE_H, EDGE_V, FULL, INNER, quadrant } from './mask'

/** What `joinOutline` draws into: Canvas `Path2D` / context methods satisfy it (they ignore the arc's end point). */
export interface OutlineSink {
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  /** Arc around (cx, cy) from angle a0 to a1 (radians, y down), counter-clockwise when `ccw`; it ends at (ex, ey). */
  arc(cx: number, cy: number, r: number, a0: number, a1: number, ccw: boolean, ex: number, ey: number): void
  rect(x: number, y: number, w: number, h: number): void
  closePath(): void
}

/** Resolved extents of one cell: joined half extents (with `bleed`), convex radius and fillet (px). */
function extents(s: number, g: JointGeom, bleed: number): [number, number, number, number] {
  const hjx = Math.max(s, g.hx - g.seam / 2), hjy = Math.max(s, g.hy - g.seam / 2)
  const ro = Math.max(0, Math.min(1, g.ro)) * s, ri = Math.max(0, Math.min(g.ri, hjx - s, hjy - s))
  return [hjx + bleed, hjy + bleed, ro, ri]
}

// One quadrant's outline as vertices in local |offset| coordinates, from the vertical axis to the horizontal
// axis; a vertex flagged 1 is reached by a quarter arc around (cx, cy) from the previous vertex.
const V = new Float64Array(7 * 5)
let nv = 0
const pt = (x: number, y: number) => { const o = nv++ * 5; V[o] = x; V[o + 1] = y; V[o + 2] = 0 }
const arcPt = (x: number, y: number, cx: number, cy: number) => { const o = nv++ * 5; V[o] = x; V[o + 1] = y; V[o + 2] = 1; V[o + 3] = cx; V[o + 4] = cy }
function corner(code: number, s: number, hjx: number, hjy: number, ro: number, ri: number): number {
  nv = 0
  if (code === EDGE_H) { pt(0, s); pt(hjx, s); pt(hjx, 0) }
  else if (code === EDGE_V) { pt(0, hjy); pt(s, hjy); pt(s, 0) }
  else if (code === FULL) { pt(0, hjy); pt(hjx, hjy); pt(hjx, 0) }
  else if (code === INNER) {
    pt(0, hjy); pt(s, hjy)
    if (ri > 0) { pt(s, s + ri); arcPt(s + ri, s, s + ri, s + ri) } else pt(s, s)
    pt(hjx, s); pt(hjx, 0)
  } else {
    // CONVEX (and Q3's DIAG until it lands)
    pt(0, s)
    if (ro > 0) { pt(s - ro, s); arcPt(s, s - ro, s - ro, s - ro) } else pt(s, s)
    pt(s, 0)
  }
  return nv
}
/** Exact angle of an axis-aligned offset (y down). */
const quarter = (dx: number, dy: number) => (Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 0 : Math.PI) : dy > 0 ? Math.PI / 2 : -Math.PI / 2)
/** Quadrant signs (q0 NW, q1 NE, q2 SE, q3 SW) and the clockwise walk: q1 → q2 → q3 → q0, q2 and q0 walked backwards. */
const SX = [-1, 1, 1, -1], SY = [-1, -1, 1, 1], WALK = [1, 2, 3, 0]

/**
 * Append the outline of a joined cell (centre cx, cy, half side s) as one clockwise sub-path. `bleed` extends the
 * joined sides past the cell edge (SVG, where abutting elements would conflate). An interior cell is one rect, and
 * an isolated square-cornered cell is the plain square dot. `close: false` leaves it open (Canvas `fill` closes it).
 */
export function joinOutline(p: OutlineSink, cx: number, cy: number, s: number, g: JointGeom, mask: number, bleed = 0, close = true): void {
  const [hjx, hjy, ro, ri] = extents(s, g, bleed)
  if (mask === ALL_FULL) { p.rect(cx - hjx, cy - hjy, 2 * hjx, 2 * hjy); return }
  if (mask === 0 && ro === 0) { p.rect(cx - s, cy - s, 2 * s, 2 * s); return }
  let first = true
  for (const q of WALK) {
    const n = corner(quadrant(mask, q), s, hjx, hjy, ro, ri), sx = SX[q], sy = SY[q], back = q === 2 || q === 0
    for (let k = 1; k < n; k++) {
      const to = back ? n - 1 - k : k, from = back ? to + 1 : to - 1, arcAt = back ? from : to
      const tx = cx + sx * V[to * 5], ty = cy + sy * V[to * 5 + 1]
      if (first) { p.moveTo(cx + sx * V[from * 5], cy + sy * V[from * 5 + 1]); first = false }
      if (V[arcAt * 5 + 2]) {
        const ccx = cx + sx * V[arcAt * 5 + 3], ccy = cy + sy * V[arcAt * 5 + 4], r = Math.abs(V[arcAt * 5 + 3] - V[to * 5]) || Math.abs(V[arcAt * 5 + 4] - V[to * 5 + 1])
        const a0 = quarter(cx + sx * V[from * 5] - ccx, cy + sy * V[from * 5 + 1] - ccy), a1 = quarter(tx - ccx, ty - ccy)
        let d = a1 - a0
        if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI
        p.arc(ccx, ccy, r, a0, a0 + d, d < 0, tx, ty)
      } else p.lineTo(tx, ty)
    }
  }
  if (close) p.closePath()
}

/** Is (px, py) inside the joined cell (centre cx, cy, half side s)? The CPU reference for every renderer. */
export function insideJoined(px: number, py: number, cx: number, cy: number, s: number, g: JointGeom, mask: number): boolean {
  const dx = px - cx, dy = py - cy, q = dy < 0 ? (dx < 0 ? 0 : 1) : dx < 0 ? 3 : 2, ax = Math.abs(dx), ay = Math.abs(dy)
  const [hjx, hjy, ro, ri] = extents(s, g, 0), code = quadrant(mask, q)
  if (code === EDGE_H) return ax <= hjx && ay <= s
  if (code === EDGE_V) return ax <= s && ay <= hjy
  if (code === FULL) return ax <= hjx && ay <= hjy
  if (code === INNER) {
    if (ax > hjx || ay > hjy) return false
    if (ax <= s || ay <= s) return true
    const fx = ax - s - ri, fy = ay - s - ri
    return ri > 0 && fx <= 0 && fy <= 0 && fx * fx + fy * fy >= ri * ri
  }
  if (ax > s || ay > s) return false
  const fx = ax - s + ro, fy = ay - s + ro
  return !(ro > 0 && fx > 0 && fy > 0) || fx * fx + fy * fy <= ro * ro
}

const CORNER = 1 - Math.PI / 4
/** Analytic area (px²) of a joined cell. */
export function joinArea(s: number, g: JointGeom, mask: number): number {
  const [hjx, hjy, ro, ri] = extents(s, g, 0)
  let a = 0
  for (let q = 0; q < 4; q++) {
    const code = quadrant(mask, q)
    a += code === EDGE_H ? hjx * s : code === EDGE_V ? s * hjy : code === FULL ? hjx * hjy
      : code === INNER ? hjx * hjy - (hjx - s) * (hjy - s) + CORNER * ri * ri : s * s - CORNER * ro * ro
  }
  return a
}

/** Γ(1 + x) for x in [0, 1] (Abramowitz & Stegun 6.1.36, |error| ≤ 3e-7): polynomial only, deterministic. */
function gamma1p(x: number): number {
  const b = [-.577191652, .988205891, -.897056937, .918206857, -.756704078, .482199394, -.193527818, .035868343]
  let s = 0
  for (let i = b.length - 1; i >= 0; i--) s = (s + b[i]) * x
  return 1 + s
}
/** Area of the superellipse |x/r|^n + |y/r|^n ≤ 1 at r = 1: 4Γ(1 + 1/n)² / Γ(1 + 2/n) (π at n = 2, 4 for the square). */
export const superellipseArea = (n: number): number => (n === Infinity ? 4 : 4 * gamma1p(1 / n) ** 2 / gamma1p(Math.min(1, 2 / n)))
/** Radius at which a superellipse of exponent n (≥ 2) holds the ink of a circle of radius r (equal-ink dot ↔ square morphs). */
export const inkRadius = (r: number, n: number): number => r * Math.sqrt(Math.PI / superellipseArea(Math.max(2, n)))
