/**
 * Automated fidelity scorecard (docs/MASTER-PLAN.md §2.2 gates G1–G3, G5 + §2.6 metrics).
 *
 *   pnpm fidelity                 # every preset (same as --all)
 *   pnpm fidelity timer level-03  # some presets
 *   pnpm fidelity --all --json    # also write .snapshots/fidelity.json
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
import { mkdirSync, writeFileSync } from 'node:fs'
import { sampleLayers } from '../src/engine/sampler/gridSampler'
import type { DotInstance, Layer } from '../src/engine/types'
import { boards, widgetById, withChrome, type WidgetPreset } from '../src/widgets'
import { litCentroid, median, pitchOf, quantile, theme, uniquePresets, visible } from './lib/cards'
import { freezeWallClock } from './lib/freeze'

freezeWallClock()
const args = process.argv.slice(2), json = args.includes('--json')
const ids = args.filter(a => !a.startsWith('--'))
const presets = ids.length && !args.includes('--all') ? ids.map(id => widgetById(id) ?? (console.error(`unknown card ${id}`), process.exit(1))) : uniquePresets()

const LADDER = [0.72, 1, 1.3, 1.6, 2, 2.5, 3, 4], onLadder = (k: number) => LADDER.some(s => Math.abs(s - k) <= 0.01)
const BUDGET = { staticMs: 30, frameMs: 4 }, FPS = 12, RUNS = 5
const factor = (k: number | undefined) => (k !== undefined && Number.isFinite(k) && k > 0 ? k : 1)
const isBase = (l: Layer) => !l.sites && factor(l.lattice) === 1 && !l.origin
const boardOf = new Map<string, string>(); for (const b of boards) for (const p of b.items) if (!boardOf.has(p.id)) boardOf.set(p.id, b.id)

interface Card {
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

function score(p: WidgetPreset): Card {
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
  let motion: Card['motion']
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

const cards = presets.map(score)
const spark = (h: number[]) => { const mx = Math.max(1, ...h); return h.map(x => (x ? Math.max(1, Math.round((x / mx) * 9)) : 0)).join('') }
const pad = (s: string | number, n: number) => String(s).padEnd(n)
const lpad = (s: string | number, n: number) => String(s).padStart(n)
const head = `${pad('card', 18)} ${pad('board', 10)} ${pad('G1 off/nan/r0', 14)} ${pad('G2 act/red', 11)} ${pad('G3 lat-off size-off', 22)} ${pad('G5 ms/budget', 14)} ${lpad('dots', 6)} ${pad('hist 0→1', 10)} ${lpad('sprd', 5)} ${lpad('cov%', 5)} ${pad('dense/ctr', 10)} motion c/f chg%`
console.log(head); console.log('-'.repeat(head.length + 4))
for (const c of cards) {
  const g1 = `${c.g1.pass ? 'ok' : 'FAIL'} ${c.g1.jitter ? 'jit' : c.g1.offGrid}/${c.g1.nonFinite}/${c.g1.zeroRadius}`
  const list = (ks: number[]) => (ks.length ? `${ks.length}(${ks.slice(0, 3).join(',')}${ks.length > 3 ? '…' : ''})` : '0')
  const g3 = `${c.g3.pass ? 'ok' : 'FAIL'} ${list(c.g3.offLadder)} ${list(c.g3.offLadderSizes)}`
  const g5 = `${c.g5.pass ? 'ok' : 'FAIL'} ${c.g5.ms.toFixed(1)}/${c.g5.budgetMs}`
  const dm = `${c.metrics.densestBlock.join(',')}/${c.metrics.centroidBlock.join(',')}`
  const mo = c.motion ? `${c.motion.cellsPerFrame.toFixed(2)} ${(c.motion.changedFraction * 100).toFixed(0)}%` : ''
  console.log(`${pad(c.id, 18)} ${pad(c.board, 10)} ${pad(g1, 14)} ${pad(`${c.g2.activeLayers}/${c.g2.redDots}`, 11)} ${pad(g3, 22)} ${pad(g5, 14)} ${lpad(c.metrics.dots, 6)} ${pad(spark(c.metrics.histogram), 10)} ${lpad(c.metrics.spread.toFixed(2), 5)} ${lpad(c.metrics.coverage.toFixed(1), 5)} ${pad(dm, 10)} ${mo}`)
}
const fails = (g: 'g1' | 'g3' | 'g5') => cards.filter(c => !c[g].pass).length
console.log(`\n${cards.length} cards — G1 fail ${fails('g1')}, G3 fail ${fails('g3')}, G5 fail ${fails('g5')}; G2 info: ${cards.filter(c => c.g2.activeLayers > 1).length} cards with >1 active layer`)
if (json) { mkdirSync('.snapshots', { recursive: true }); writeFileSync('.snapshots/fidelity.json', JSON.stringify(cards, null, 1)); console.log('.snapshots/fidelity.json') }
