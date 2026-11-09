/**
 * Fractals board · the density cards: popcorn, a Flames-style IFS, a symmetric icon and a Lyapunov field. Each
 * picture is baked once (a fixed number of seeded steps, so it is the same everywhere) and cached; a frame only
 * moves the one live element on top, so a frame costs a lookup, never a re-bake.
 */
import { chaosGame, chaosWalker, densityTone, fitWindow, iconDensity, iconRadius, iconStep, lyapunov, lyapunovSequence, popcornDensity, popcornPath, type Affine, type IconParams, type PopcornParams, type Variation } from '../../engine/fractal'
import { dcos, dsin, TAU } from '../../engine/noise/dmath'
import { layer, type WidgetPreset } from '../types'
import { T, cite, credit, densityBands, footer, gridLayer, phase, probe, signed, thousands, tile, toCell, toPlane, type Band, type Pt } from './fractals-kit'

/** Every density picture fills the same window: the full card width, rows 12 to 123. */
const W = 144, H = 112, R0 = 12
const inWin = (p: Pt) => p[0] >= 0 && p[0] <= 143 && p[1] >= R0 && p[1] < R0 + H

// ── 03 POPCORN ─ one grain in the flow ────────────────────────────────────────────────────────────────
// Thesis: "Three thousand grains dropped into one flow, and the shape is where they pile up." Pickover's popcorn
// field stepped with Euler from seeded starts; the density is the picture, a square-root tone in four bands. One
// grain (red) rides a closed orbit of 43 steps (one lap in 5.4 s), a short trail behind it. The field repeats, so the card looks at it through a
// round port (a disc 56 cells across the middle) instead of tiling the whole frame.
const POP: PopcornParams = { kind: 'pickover', h: .05 }
const POP_WIN = fitWindow(0, 0, 1.75, 1.75, W, H), POP_ORBITS = 3000, POP_STEPS = 40, POP_LOOP = 43, PORT = 55.5
let popTone: Float32Array | undefined, popPath: Float64Array | undefined
const popBake = () => {
  if (!popTone) {
    const tone = densityTone(popcornDensity(POP, { w: W, h: H, window: POP_WIN, orbits: POP_ORBITS, steps: POP_STEPS, seed: 3 }), { quantile: .97 })
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const dx = i - (W - 1) / 2, dy = j - (H - 1) / 2; if (dx * dx + dy * dy > PORT * PORT) tone[j * W + i] = 0 }
    popTone = tone
    // from (−1, .6) the orbit closes on itself after 43 steps (back within .01): the grain loops it seamlessly
    popPath = popcornPath(POP, -1, .6, POP_LOOP)
  }
  return { tone: popTone, path: popPath! }
}
const popCell = toCell(POP_WIN, W, H, 0, R0)
const inPort = (p: Pt) => { const dx = p[0] - (W - 1) / 2, dy = p[1] - R0 - (H - 1) / 2; return dx * dx + dy * dy <= PORT * PORT }
const POP_BANDS = densityBands(.12, .3, .55, .82)
export const frPopcorn: WidgetPreset = {
  id: 'fr-popcorn', name: 'Fractals Popcorn', label: 'POPCORN', ...tile,
  credit: credit('popcorns', 'Popcorn images', ['Clifford Pickover']),
  layers: ctx => {
    const { tone, path } = popBake(), k = Math.floor(ctx.t * 8), at = (i: number): Pt => { const j = ((i % POP_LOOP) + POP_LOOP) % POP_LOOP; return popCell(path[2 * j], path[2 * j + 1]) }
    const trail: Pt[] = [1, 2, 3, 4].map(d => at(k - d)).filter(inPort), head = at(k)
    const [grid, mark] = inPort(head) ? probe(gridLayer(tone, W, H, 0, R0, POP_BANDS), head) : [gridLayer(tone, W, H, 0, R0, POP_BANDS)]
    return [
      cite('PICKOVER'),
      grid,
      layer(mark ? T.knockout(T.dots(trail, 1.2), mark.sites ?? [], 3) : T.dots(trail, 1.2), 'value'),
      ...(mark ? [mark] : []),
      ...footer(`H ${POP.h.toFixed(2)}`, `${thousands(POP_ORBITS * POP_STEPS / 1000)}K STEPS`),
    ]
  },
}

// ── 04 FLAME ─ the chaos game, one hop at a time ──────────────────────────────────────────────────────
// Thesis: "Four maps picked at random draw the same picture every time." Four contracting affine maps (picked
// from a seeded search) with the article's twist after each, 150k hops binned. The red dot is the game being
// played now, four hops a second, with a faint dotted line back to where it jumped from; the footer reads its
// address, the maps that brought it here, newest first.
const MAPS: Affine[] = [
  [.434, .04, .213, .18, -.584, -.377], [.401, .148, .236, .334, .773, -.425],
  [-.038, -.416, .248, -.654, -.325, -.904], [.305, -.308, -.153, -.546, .904, .812],
]
const TWIST: Variation = { kind: 'twist', amp: .5, omega: .7 }
const FL_STEPS = 150000, FL_HOPS = 1440
let flame: { tone: Float32Array; win: readonly [number, number, number, number]; xs: Float64Array; ys: Float64Array; ks: Uint8Array } | undefined
/** Frame the attractor from a short probe run, bake the density, then record a loop of hops for the live dot. */
const flameBake = () => {
  if (flame) return flame
  const probe = chaosWalker(MAPS, 3, TWIST)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let i = 0; i < 20000; i++) { probe.next(); if (i < 32) continue; x0 = Math.min(x0, probe.x); x1 = Math.max(x1, probe.x); y0 = Math.min(y0, probe.y); y1 = Math.max(y1, probe.y) }
  const win = fitWindow((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2 * 1.03, (y1 - y0) / 2 * 1.03, W, H)
  const tone = densityTone(chaosGame({ maps: MAPS, w: W, h: H, window: win, steps: FL_STEPS, seed: 3, variation: TWIST }), { quantile: .97 })
  const walk = chaosWalker(MAPS, 11, TWIST), xs = new Float64Array(FL_HOPS), ys = new Float64Array(FL_HOPS), ks = new Uint8Array(FL_HOPS)
  for (let i = 0; i < 32; i++) walk.next()
  for (let i = 0; i < FL_HOPS; i++) { ks[i] = walk.next(); xs[i] = walk.x; ys[i] = walk.y }
  return (flame = { tone, win, xs, ys, ks })
}
const FL_BANDS = densityBands(.1, .28, .52, .8)
export const frFlame: WidgetPreset = {
  id: 'fr-flame', name: 'Fractals Flame', label: 'FLAME', ...tile,
  credit: credit('ifsfractals', 'IFS fractals'),
  layers: ctx => {
    const f = flameBake(), cell = toCell(f.win, W, H, 0, R0), n = Math.floor(ctx.t * 4), i = ((n % FL_HOPS) + FL_HOPS) % FL_HOPS, j = (i + FL_HOPS - 1) % FL_HOPS
    const now = cell(f.xs[i], f.ys[i]), prev = cell(f.xs[j], f.ys[j])
    let addr = ''
    for (let d = 0; d < 6; d++) addr += f.ks[(i - d + FL_HOPS) % FL_HOPS]
    const [flGrid, flProbe] = probe(gridLayer(f.tone, W, H, 0, R0, FL_BANDS), now)
    return [
      cite('CHAOS GAME'),
      flGrid,
      layer(T.knockout(T.dotLine(prev[0], prev[1], now[0], now[1], { spacing: 3, size: .8, from: 3 }), flProbe.sites ?? [], 3), 'idle'),
      flProbe,
      ...footer(`ADDR ${addr}`, `${FL_STEPS / 1000}K HOPS`),
    ]
  },
}

// ── 05 ICON ─ eight-fold, from one point ──────────────────────────────────────────────────────────────
// Thesis: "No rule says draw a flower; the symmetry is in the equation." A Field–Golubitsky map that commutes
// with a turn of 2π/8, so one chaotic orbit draws an eight-fold rosette. The red dot is that orbit, now.
const ICON: IconParams = { n: 8, lambda: 2.353, alpha: -2.72, beta: .557, gamma: -.064, omega: .07 }
const IC_STEPS = 200000, IC_HOPS = 1440
let icon: { tone: Float32Array; win: readonly [number, number, number, number]; pts: Float64Array } | undefined
const iconBake = () => {
  if (icon) return icon
  const r = iconRadius(ICON), win = fitWindow(0, 0, r * 1.03, r * 1.03, W, H)
  const tone = densityTone(iconDensity(ICON, { w: W, h: H, window: win, steps: IC_STEPS }), { quantile: .97 })
  const pts = new Float64Array(2 * IC_HOPS), q: [number, number] = [0, 0]
  let x = .31, y = .02
  for (let i = -100; i < IC_HOPS; i++) { iconStep(ICON, x, y, q); x = q[0]; y = q[1]; if (i >= 0) { pts[2 * i] = x; pts[2 * i + 1] = y } }
  return (icon = { tone, win, pts })
}
const IC_BANDS = densityBands(.1, .3, .55, .82)
export const frIcon: WidgetPreset = {
  id: 'fr-icon', name: 'Fractals Icon', label: 'ICON', ...tile,
  credit: credit('iconimages', 'Icon images', ['Michael Field', 'Martin Golubitsky']),
  layers: ctx => {
    const c = iconBake(), cell = toCell(c.win, W, H, 0, R0), n = Math.floor(ctx.t * 3), i = ((n % IC_HOPS) + IC_HOPS) % IC_HOPS
    const at = (k: number) => { const m = ((k % IC_HOPS) + IC_HOPS) % IC_HOPS; return cell(c.pts[2 * m], c.pts[2 * m + 1]) }
    const [icGrid, icProbe] = probe(gridLayer(c.tone, W, H, 0, R0, IC_BANDS), at(i))
    return [
      cite('FIELD-GOLUBITSKY'),
      icGrid,
      layer(T.knockout(T.dots([at(i - 1), at(i - 2)].filter(inWin), 1.3), icProbe.sites ?? [], 3), 'value'),
      icProbe,
      ...footer(`${ICON.n}-FOLD`, `${IC_STEPS / 1000}K STEPS`),
    ]
  },
}

// ── 06 LYAPUNOV ─ order and chaos, one probe ──────────────────────────────────────────────────────────
// Thesis: "Two growth rates taking turns are either calm or chaotic, and the border is a fractal." The logistic
// map driven by the sequence AAABB over (a, b) ∈ [2.8, 4]²; where the orbit settles (λ < 0) the dots grow with
// how fast it settles, where it is chaotic (λ > 0) the plane stays dark. The red probe drifts across and the
// footer reads its λ.
const SEQ = 'AAABB', SEQ_V = lyapunovSequence(SEQ), LY_WIN = [2.8, 4, 4, 2.8] as const, LY_W = 144
const LY_C0 = 0, LY_OPTS = { warmup: 30, n: 80 }
let lyVals: Float32Array | undefined
const lyBake = () => {
  if (lyVals) return lyVals
  const v = new Float32Array(LY_W * H), at = toPlane(LY_WIN, LY_W, H)
  for (let j = 0; j < H; j++) for (let i = 0; i < LY_W; i++) { const [a, b] = at(i, j); v[j * LY_W + i] = -lyapunov(a, b, SEQ_V, LY_OPTS) }
  // the chaotic sea is dotted with one-cell periodic windows; a cell with fewer than two ordered neighbours drops
  // out, so the sea reads dark and the ordered shapes keep their edges
  const out = new Float32Array(v.length), ordered = (i: number, j: number) => i >= 0 && j >= 0 && i < LY_W && j < H && v[j * LY_W + i] > 0
  for (let j = 0; j < H; j++) for (let i = 0; i < LY_W; i++) {
    const n = +ordered(i - 1, j) + +ordered(i + 1, j) + +ordered(i, j - 1) + +ordered(i, j + 1)
    out[j * LY_W + i] = n >= 2 ? v[j * LY_W + i] : 0
  }
  return (lyVals = out)
}
/** −λ in bands: most of the ordered region settles slowly (−λ < .3), so the bands sit low and the superstable ridges go white. */
const LY_BANDS: Band[] = [{ at: .012, tone: 'faint', v: .25 }, { at: .07, tone: 'mid', v: .5 }, { at: .2, tone: 'idle', v: .75 }, { at: .58, tone: 'value', v: 1 }]
const lyCell = toCell(LY_WIN, LY_W, H, LY_C0, R0)
const probeAB = (t: number): [number, number] => { const p = TAU * phase(t, 48); return [3.35 + .5 * dsin(p), 3.35 + .45 * dcos(2 * p + .6)] }
export const frLyapunov: WidgetPreset = {
  id: 'fr-lyapunov', name: 'Fractals Lyapunov', label: 'LYAPUNOV', ...tile,
  credit: credit('lyapunovfractals', 'Lyapunov fractals', ['Mario Markus']),
  layers: ctx => {
    const [a, b] = probeAB(ctx.t), l = lyapunov(a, b, SEQ_V, LY_OPTS)
    return [
      cite('MARKUS'),
      ...probe(gridLayer(lyBake(), LY_W, H, LY_C0, R0, LY_BANDS), lyCell(a, b)),
      ...footer(`L ${Number.isFinite(l) ? signed(l, 2) : '-INF'}`, SEQ),
    ]
  },
}
