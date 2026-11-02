/**
 * Fractals board · the escape-time cards: a Julia set whose c walks the edge of the Mandelbrot set's main
 * cardioid (the Mandelbrot set itself as the map in the corner, c in red on it), and a Julia plane coloured by
 * orbit traps with one probe orbit drawn over it (red where it came closest to the trap).
 */
import { INSIDE, cardioid, escapeTime, orbitPoints, orbitTraps, trapHit, trapLine } from '../../engine/fractal'
import { dcos, dsin, TAU } from '../../engine/noise/dmath'
import { layer, type WidgetPreset } from '../types'
import { T, cite, credit, footer, gridLayer, phase, signed, tile, toCell, toPlane, type Band, type Pt } from './fractals-kit'

// ── 01 JULIA ─ c on the cardioid's edge ───────────────────────────────────────────────────────────────
// Thesis: "Every point of the map is a whole picture." The big field is the Julia set of c, drawn by the smooth
// escape count; the small one bottom-right is the Mandelbrot set, the map of every c, with this c in red. c walks
// just inside the main cardioid's edge, one lap in 96 s, so the Julia set stays connected and keeps changing:
// fat near the cusp, rabbits and dendrites near the bulbs. Tone: the inside stays dark;
// outside, the smooth count lights the escape halo, white where it hugs the set.
const JW = 144, JH = 104, JR = 10, J_ITER = 32, J_WIN = [-1.6, 1.156, 1.6, -1.156] as const
const MW = 46, MH = 34, MC = 98, MR = 109, M_WIN = [-2.15, 1.18, .99, -1.14] as const
const J_LAP = 96, J_R = .995, J_TH0 = 2.2
/** c at t: on the main cardioid scaled by J_R, one lap in J_LAP seconds. */
export const juliaC = (t: number): Pt => cardioid(J_TH0 + TAU * phase(t, J_LAP), J_R, dcos, dsin)
/** Grid value of a point inside the set (above every smooth count). */
const IN = 1e3
const jVals = new Float32Array(JW * JH)
let jAt = NaN
/** The grid's clock: t on a 1/6 s step. */
const jTime = (t: number) => Math.round(t * 6) / 6
/**
 * The Julia grid at t, refreshed at 6 Hz (c moves .01 rad between refreshes, below what a cell shows): every other
 * 12 fps frame reuses it, which keeps the card inside its frame budget. t = 0 is on the grid.
 */
const juliaGrid = (t0: number) => {
  const t = jTime(t0)
  if (t === jAt) return jVals
  const [cx, cy] = juliaC(t), at = toPlane(J_WIN, JW, JH), o = { maxIter: J_ITER }
  // a Julia set is symmetric under z → −z and the window is centred: compute the top half, mirror the bottom
  for (let j = 0; j < JH / 2; j++) for (let i = 0; i < JW; i++) {
    const [x, y] = at(i, j), s = escapeTime(x, y, cx, cy, o)
    jVals[j * JW + i] = jVals[(JH - 1 - j) * JW + JW - 1 - i] = s === INSIDE ? IN : s
  }
  jAt = t
  return jVals
}
/** Smooth count → band: far halo faint, near halo mid, the rim idle and white; inside nothing (dark). */
const J_BANDS: Band[] = [
  { at: 3.5, tone: 'faint', v: .25 }, { at: 5.5, tone: 'mid', v: .5 }, { at: 8.5, tone: 'idle', v: .75 }, { at: 13, tone: 'value', v: 1 },
  { at: IN, tone: 'faint', v: 0 },
]
let mVals: Float32Array | undefined
/** The Mandelbrot map, baked once: inside mid, the rim idle, the near halo faint. */
const mandelGrid = () => {
  if (mVals) return mVals
  const v = new Float32Array(MW * MH), at = toPlane(M_WIN, MW, MH), o = { maxIter: 60 }
  for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) { const [x, y] = at(i, j), s = escapeTime(0, 0, x, y, o); v[j * MW + i] = s === INSIDE ? IN : s }
  return (mVals = v)
}
const M_BANDS: Band[] = [{ at: 4, tone: 'faint', v: .25 }, { at: 7, tone: 'mid', v: .5 }, { at: 12, tone: 'idle', v: .75 }, { at: IN, tone: 'mid', v: .75 }]
const mCell = toCell(M_WIN, MW, MH, MC, MR)
export const frJulia: WidgetPreset = {
  id: 'fr-julia', name: 'Fractals Julia', label: 'JULIA', ...tile,
  credit: credit('msetsmooth', 'Smooth iteration count for generalized Mandelbrot sets'),
  layers: ctx => {
    const [cx, cy] = juliaC(jTime(ctx.t))
    return [
      cite('SMOOTH COUNT'),
      gridLayer(juliaGrid(ctx.t), JW, JH, 0, JR, J_BANDS, jAt),
      gridLayer(mandelGrid(), MW, MH, MC, MR, M_BANDS),
      layer(T.dots([mCell(cx, cy)], 2.6), 'active'),
      ...footer(`C ${signed(cx, 2)}${signed(cy, 2)}I`, ''),
    ]
  },
}

// ── 02 TRAP ─ pearls, and the orbit that strings them ─────────────────────────────────────────────────
// Thesis: "Colour a point by where its orbit has been, not by how fast it left." The Julia plane of
// c = 0.285 + 0.01i, each z shaded by how close its orbit passes a point trap at the origin: every preimage of the
// trap's disc comes back as a pearl, smaller and smaller toward the set. A line trap on the real axis threads them
// in grey. Over it, one probe z drifts on a slow loop and its orbit is drawn as dots; the red dot is the orbit point
// nearest the trap, the one that sets this z's tone.
const TW = 144, TH = 112, TR = 12, T_ITER = 40, T_C: Pt = [.285, .01], T_WIN = [-1.56, 1.213, 1.56, -1.213] as const
const TRAP: Pt = [0, 0], TLINE = trapLine(0, 0, 1, 0), TRAP_R = .36, LINE_R = .02, T_BAIL = 4
const tCell = toCell(T_WIN, TW, TH, 0, TR)
let tVals: Float32Array | undefined
/** Baked once: 2 + point closeness on the pearls, else 1 + line closeness on the threads, else 0. */
const trapGrid = () => {
  if (tVals) return tVals
  const v = new Float32Array(TW * TH), at = toPlane(T_WIN, TW, TH), hit = trapHit(), traps = { point: TRAP, line: TLINE }
  // both traps are symmetric under z → −z (a point at the origin, a line through it), like the Julia set: mirror
  for (let j = 0; j < TH / 2; j++) for (let i = 0; i < TW; i++) {
    const [x, y] = at(i, j)
    orbitTraps(x, y, T_C[0], T_C[1], T_ITER, traps, hit, T_BAIL)
    const p = 1 - hit.point / TRAP_R, l = 1 - hit.line / LINE_R
    v[j * TW + i] = v[(TH - 1 - j) * TW + TW - 1 - i] = p > .1 ? 2 + p : l > 0 ? 1 + l : 0
  }
  return (tVals = v)
}
/** Pearls shade like spheres (faint rim → white core); threads are small mid dots. */
const T_BANDS: Band[] = [
  { at: 1, tone: 'mid', v: .25 },
  { at: 2.1, tone: 'faint', v: .25 }, { at: 2.25, tone: 'mid', v: .5 }, { at: 2.45, tone: 'idle', v: .75 }, { at: 2.66, tone: 'value', v: 1 },
]
const PROBE_P = 40, orbitBuf = new Float64Array(2 * T_ITER), probeHit = trapHit()
/** The probe z at t: a slow figure-eight through the pearls. */
const probeZ = (t: number): Pt => { const a = TAU * phase(t, PROBE_P); return [-.18 + .78 * dcos(a), .1 + .52 * dsin(2 * a)] }
export const frTrap: WidgetPreset = {
  id: 'fr-trap', name: 'Fractals Trap', label: 'ORBIT TRAP', ...tile,
  credit: credit('ftrapsgeometric', 'Geometric orbit traps'),
  layers: ctx => {
    const [zx, zy] = probeZ(ctx.t), k = orbitPoints(zx, zy, T_C[0], T_C[1], orbitBuf, T_BAIL)
    const hit = orbitTraps(zx, zy, T_C[0], T_C[1], T_ITER, { point: TRAP }, probeHit, T_BAIL)
    const pts: Pt[] = [tCell(zx, zy)]
    for (let i = 0; i < k; i++) if (i + 1 !== hit.at) pts.push(tCell(orbitBuf[2 * i], orbitBuf[2 * i + 1]))
    const shown = pts.filter(p => p[0] >= 0 && p[0] <= 143 && p[1] >= TR && p[1] < TR + TH)
    return [
      cite('POINT + LINE'),
      gridLayer(trapGrid(), TW, TH, 0, TR, T_BANDS),
      layer(T.dots(shown, 1.1), 'idle'),
      ...(hit.at ? [layer(T.dots([tCell(hit.ax, hit.ay)], 2.6), 'active')] : []),
      ...footer(`TRAP ${hit.point.toFixed(3)}`, `Z${String(hit.at).padStart(2, '0')} OF ${String(k).padStart(2, '0')}`),
    ]
  },
}
