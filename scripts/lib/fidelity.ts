/**
 * The fidelity scorecard as a library (docs/MASTER-PLAN.md §2.2 gates G1–G3, G5 + §2.6 metrics),
 * shared by the `scripts/fidelity.ts` CLI and the authoring loop (`scripts/author/`, MCP `score_card`).
 *
 * G1 dot integrity  base-grid dots off their cell centre (lattice/site dots excluded; skipped for
 *                   jittered styles), NaN/∞ dots, visible dots with zero radius.       pass = 0/0/0
 * G2 accent         layers with tone 'active' and red (dotActive/activeDim) dot count. informational
 *                   until `accentRole` lands.
 * G3 lattice ladder explicit lattice values off {0.72,1,1.3,1.6,2,2.5,3,4} (±0.01).        pass = 0
 *                   Site sizes off the ladder are counted too, but informational (knob sites are huge).
 * G5 perf           median of 5 (after warm-up) layers()+sampleLayers: static mount ≤ 30 ms,
 *                   animated frame ≤ 4 ms.
 * Metrics           10-bin tonal histogram (digits = relative bin height), opacity spread p90−p10,
 *                   visible dots, ink coverage (Σπr² / card area), densest 8×8 block vs lit centroid
 *                   block, and for animated cards centroid speed (cells/frame at 12 fps) and the
 *                   fraction of dots changed per frame (mean over t = 0…1 s).
 */
import { sampleLayers } from '../../src/engine/sampler/gridSampler'
import type { DotInstance, Layer } from '../../src/engine/types'
import { boards, withChrome, type WidgetPreset } from '../../src/widgets'
import { litCentroid, median, pitchOf, quantile, theme, visible } from './cards'

export const LADDER = [0.72, 1, 1.3, 1.6, 2, 2.5, 3, 4], onLadder = (k: number) => LADDER.some(s => Math.abs(s - k) <= 0.01)
export const BUDGET = { staticMs: 30, frameMs: 4 }, FPS = 12
const RUNS = 5
const factor = (k: number | undefined) => (k !== undefined && Number.isFinite(k) && k > 0 ? k : 1)
const isBase = (l: Layer) => !l.sites && factor(l.lattice) === 1 && !l.origin
const boardOf = new Map<string, string>(); for (const b of boards) for (const p of b.items) if (!boardOf.has(p.id)) boardOf.set(p.id, b.id)

export interface FidelityCard {
  id: string; board: string; animated: boolean
  g1: { offGrid: number; nonFinite: number; zeroRadius: number; jitter: boolean; pass: boolean }
  g2: { activeLayers: number; activeDimLayers: number; redDots: number }
  /** `pass` gates on lattice (pitch) values only; site sizes are dot sizes (knobs may be huge) and are reported. */
  g3: { lattices: number[]; siteSizes: number[]; offLadder: number[]; offLadderSizes: number[]; pass: boolean }
  g5: { ms: number; budgetMs: number; pass: boolean }
  metrics: { dots: number; histogram: number[]; spread: number; coverage: number; densestBlock: [number, number]; centroidBlock: [number, number]; blockDistance: number }
  motion?: { cellsPerFrame: number; changedFraction: number }
}

const ctx = (p: WidgetPreset, t: number) => ({ t, data: { ...p.defaults } })
const key = (d: DotInstance) => `${d.x.toFixed(2)},${d.y.toFixed(2)}`
const val = (d: DotInstance) => `${d.r.toFixed(3)},${d.opacity.toFixed(3)},${d.color}`

/** Score one preset: gates + metrics (pure apart from the G5 timings). */
export function scoreFidelity(p: WidgetPreset): FidelityCard {
  const pitch = pitchOf(p), W = p.grid.cols * pitch, H = p.grid.rows * pitch, lf = withChrome(p)
  const layers = lf(ctx(p, 0)), dots = sampleLayers(layers, p.grid, p.style, theme), lit = dots.filter(visible)

  // G1 — base dots sit on cell centres: (x/pitch − .5) is an integer
  const jitter = !!p.style.jitter
  const offGridOf = (x: number) => { const c = x / pitch - .5; return Math.abs(c - Math.round(c)) > 1e-6 }
  const baseDots = jitter ? [] : sampleLayers(layers.filter(isBase), p.grid, p.style, theme)
  const offGrid = baseDots.filter(d => visible(d) && (offGridOf(d.x) || offGridOf(d.y))).length
  const nonFinite = dots.filter(d => ![d.x, d.y, d.r, d.opacity].every(Number.isFinite)).length
  const zeroRadius = dots.filter(d => d.opacity > 0 && !(d.r > 0)).length

  // G2 — accent
  const activeLayers = layers.filter(l => l.tone === 'active').length, activeDimLayers = layers.filter(l => l.tone === 'activeDim').length
  const reds = new Set([theme.dotActive, theme.dotActiveDim].filter(Boolean)), redDots = lit.filter(d => reds.has(d.color)).length

  // G3 — lattice ladder (explicit values only; the implicit card lattice 1 is on the ladder)
  const lattices = layers.filter(l => !l.sites && l.lattice !== undefined).map(l => l.lattice!)
  const siteSizes = layers.filter(l => l.sites).map(l => l.size ?? l.lattice ?? 1)
  const offOf = (ks: number[]) => [...new Set(ks.filter(k => !onLadder(k)))].sort((a, b) => a - b)
  const offLadder = offOf(lattices), offLadderSizes = offOf(siteSizes)

  // G5 — perf, median of RUNS after a warm-up
  const runAt = (t: number) => { const a = performance.now(); sampleLayers(lf(ctx(p, t)), p.grid, p.style, theme); return performance.now() - a }
  runAt(0)
  const ms = median(Array.from({ length: RUNS }, (_, i) => runAt(p.animated ? i / FPS : 0)))
  const budgetMs = p.animated ? BUDGET.frameMs : BUDGET.staticMs

  // metrics
  const ops = lit.map(d => d.opacity), histogram = Array(10).fill(0)
  for (const o of ops) histogram[Math.min(9, Math.floor(o * 10))]++
  const spread = ops.length ? quantile(ops, .9) - quantile(ops, .1) : 0
  const coverage = (lit.reduce((s, d) => s + Math.PI * d.r * d.r, 0) / (W * H)) * 100
  const blocks = Array(64).fill(0), blockOf = (x: number, y: number): [number, number] => [Math.max(0, Math.min(7, Math.floor((x / W) * 8))), Math.max(0, Math.min(7, Math.floor((y / H) * 8)))]
  for (const d of lit) { const [bx, by] = blockOf(d.x, d.y); blocks[by * 8 + bx] += d.opacity * d.r * d.r }
  const m = blocks.indexOf(Math.max(...blocks)), densestBlock: [number, number] = [m % 8, Math.floor(m / 8)]
  const [cx, cy] = litCentroid(dots), centroidBlock = Number.isFinite(cx) ? blockOf(cx, cy) : [NaN, NaN] as [number, number]
  const blockDistance = Math.max(Math.abs(densestBlock[0] - centroidBlock[0]), Math.abs(densestBlock[1] - centroidBlock[1]))

  // motion — consecutive frames over the first second
  let motion: FidelityCard['motion']
  if (p.animated) {
    const frames = Array.from({ length: FPS + 1 }, (_, k) => sampleLayers(lf(ctx(p, k / FPS)), p.grid, p.style, theme).filter(visible))
    const speeds: number[] = [], changed: number[] = []
    for (let k = 1; k < frames.length; k++) {
      const [ax, ay] = litCentroid(frames[k - 1]), [bx, by] = litCentroid(frames[k])
      if ([ax, ay, bx, by].every(Number.isFinite)) speeds.push(Math.hypot(bx - ax, by - ay) / pitch)
      const A = new Map(frames[k - 1].map(d => [key(d), val(d)])), B = new Map(frames[k].map(d => [key(d), val(d)]))
      const union = new Set([...A.keys(), ...B.keys()]); let diff = 0
      for (const q of union) if (A.get(q) !== B.get(q)) diff++
      changed.push(union.size ? diff / union.size : 0)
    }
    const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0)
    motion = { cellsPerFrame: mean(speeds), changedFraction: mean(changed) }
  }

  return {
    id: p.id, board: boardOf.get(p.id) ?? '', animated: !!p.animated,
    g1: { offGrid, nonFinite, zeroRadius, jitter, pass: offGrid + nonFinite + zeroRadius === 0 },
    g2: { activeLayers, activeDimLayers, redDots },
    g3: { lattices: [...new Set(lattices)].sort((a, b) => a - b), siteSizes: [...new Set(siteSizes)].sort((a, b) => a - b), offLadder, offLadderSizes, pass: offLadder.length === 0 },
    g5: { ms, budgetMs, pass: ms <= budgetMs },
    metrics: { dots: lit.length, histogram, spread, coverage, densestBlock, centroidBlock, blockDistance },
    motion,
  }
}

