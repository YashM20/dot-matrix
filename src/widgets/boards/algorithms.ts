/**
 * Board · ALGORITHMS — four niche algorithms, each a dot source in its own right (`src/engine/algo`,
 * docs/ALGORITHMS.md): weighted Voronoi stippling (Secord 2002) draws the moon in Lloyd-relaxed sites,
 * a Clifford strange attractor is a log-density histogram that morphs as its parameters drift, Wave
 * Function Collapse ties a knot one lowest-entropy tile at a time, and diffusion-limited aggregation
 * grows frost from one grain.
 *
 * Chrome: the label top-left, the reference (author, year) top-right as a faint caption, and the sim-board
 * footer (a dotted rail for the loop, a step counter left, one stat right). Each card loops and its t = 0
 * frame is a finished picture, so goldens, thumbnails and reduced motion show the result, not a blank start.
 * One red on the board, always *live*: the rail knob while Lloyd relaxes, the tile just observed, the
 * grains sticking right now. The attractor has no red: it has no "now".
 */
import { attractorDensity, dla, stipple, wfc, type WfcTile } from '../../engine/algo'
import { clamp, hash01, len, smoothstep } from '../../engine/math'
import type { Field, Layer, Tone } from '../../engine/types'
import { TILE, layer, layoutFor, tileStyle, type WidgetPreset } from '../types'

const T = layoutFor(TILE)
type Pt = [number, number]
const N = TILE.cols - 1
const tile = { group: 'composite', chrome: 'dots', grid: TILE, style: tileStyle, animated: true } as const

/** Caption tier (0.72 lattice), as on the mosaic board. */
const cap = (s: string, col: number, row: number, align?: 'left' | 'center' | 'right') => T.big(s, col, row, { lattice: .72, align })
/** Top-right: the paper the card is built on. */
const cite = (s: string) => layer(cap(s, 143, 1, 'right'), 'faint')
const FOOT = 134, RAIL_Y = 129
/** Footer: a faint dotted rail filled in `mid` to `k` (0..1), an optional live (red) knob at the fill point, a counter left and one stat right. */
function footer(k: number, left: string, right: string, live = false): Layer[] {
  const done: Pt[] = [], rest: Pt[] = [], end = N * clamp(k)
  let knob: Pt | undefined
  for (let c = 0; c <= N; c += 3) (c <= end ? done : rest).push([c, RAIL_Y])
  if (live && done.length) knob = done.pop()
  return [
    layer(T.dots(rest, .9), 'faint'), layer(T.dots(done, 1.1), 'mid'),
    ...(knob ? [layer(T.dots([knob], 2.2), 'active')] : []),
    layer(T.text(left, 0, FOOT), 'idle'),
    layer(T.text(right, 143, FOOT, { align: 'right' }), 'faint'),
  ]
}
const pad = (n: number, w: number) => String(Math.max(0, Math.round(n))).padStart(w, '0')
const thousands = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
/** Group sites by tone into one site layer each (`size` per layer). */
function siteLayers(groups: Partial<Record<Tone, Pt[]>>, size: number, order: Tone[]): Layer[] {
  return order.filter(t => groups[t]?.length).map(t => layer(T.dots(groups[t]!, size), t))
}
/** A field written in card cells, zero outside `box` and bounded by it. */
const cells = (f: (x: number, y: number) => number, box: [number, number, number, number]): Field => {
  const [c0, r0, c1, r1] = box
  const field: Field = (u, v) => { const c = Math.round(u * N), r = Math.round(v * N); return c < c0 || c > c1 || r < r0 || r > r1 ? 0 : f(c, r) }
  field.bounds = [c0, r0, c1, r1]
  return field
}
const easeOut = (x: number) => 1 - (1 - clamp(x)) ** 2
const easeInOut = (x: number) => { const s = clamp(x); return s * s * (3 - 2 * s) }

// ── 01 STIPPLE ─ the moon in weighted Voronoi stipples ────────────────────────────────────────────────
// Thesis: "The moon, in sixteen hundred dots that found their own places." The density is a hand-placed
// moon (maria, craters, Tycho's rays) lit by a low sun from the right with the Lommel–Seeliger law, so the
// limb stays bright and the terminator falls off softly. Lloyd relaxation runs at 1.5× the card pitch; the
// card scrubs its iterations: scatter (random start) → relax → hold.
const MOON = { cx: 71.5, cy: 67, r: 53 }
const SS = 1.5, M_BOX = [MOON.cx - MOON.r - 1, MOON.cy - MOON.r - 1] as const, M_SIZE = Math.ceil((MOON.r * 2 + 2) * SS)
/** Maria: hand-placed from a full-moon photo, unit-disc coordinates (x right, y down), radii, darkness. */
const MARIA: [number, number, number, number, number][] = [
  // x, y, rx, ry, depth
  [-.36, -.34, .3, .24, .62],   // Imbrium
  [.13, -.36, .16, .15, .62],   // Serenitatis
  [.28, -.08, .2, .17, .58],   // Tranquillitatis
  [.63, -.3, .11, .09, .66],   // Crisium
  [-.62, .02, .26, .42, .55],  // Procellarum
  [-.2, .36, .2, .14, .5],    // Nubium
  [.52, .14, .12, .16, .55],    // Fecunditatis
  [.36, .38, .1, .08, .5],    // Nectaris
  [-.08, -.66, .38, .06, .32], // Frigoris
  [-.4, .5, .12, .08, .3],     // Humorum
]
/** Craters: x, y, radius (unit disc), rim brightness. */
const CRATERS: [number, number, number, number][] = [
  [-.12, .72, .055, .5], [-.27, -.07, .05, .4], [-.5, -.03, .03, .35], [-.15, -.6, .04, .1], [-.68, -.24, .028, .6],
  [.78, .14, .05, .3], [.72, .4, .055, .3], [.32, .26, .045, .35], [.08, .1, .04, .25], [.2, .52, .06, .2],
  [-.02, .3, .035, .2], [.5, -.55, .04, .25], [-.35, .74, .045, .2], [.05, .82, .04, .2],
]
const SUN = (() => { const l = len(len(.55, -.1), .83); return [.55 / l, -.1 / l, .83 / l] })()
/** Moon brightness at a point of the unit disc (0 outside / in shadow). */
function moonLight(X: number, Y: number): number {
  const rr = X * X + Y * Y
  if (rr >= 1) return 0
  const Z = Math.sqrt(1 - rr), mu0 = X * SUN[0] + Y * SUN[1] + Z * SUN[2]
  if (mu0 <= 0) return 0
  // Lommel–Seeliger: the lunar limb does not darken
  const lit = Math.min(1, 1.7 * mu0 / (mu0 + Z)) * smoothstep(0, .07, mu0)
  let albedo = 1
  for (const [mx, my, rx, ry, depth] of MARIA) {
    const e = len((X - mx) / rx, (Y - my) / ry)
    albedo -= depth * (1 - smoothstep(.75, 1.15, e))
  }
  albedo = Math.max(.25, albedo)
  // a little highland texture (hash value noise on a 1/30 lattice)
  const gx = (X + 1) * 15, gy = (Y + 1) * 15, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy
  const n = (a: number, b: number) => hash01(a, b, 41)
  const noise = (n(ix, iy) * (1 - fx) + n(ix + 1, iy) * fx) * (1 - fy) + (n(ix, iy + 1) * (1 - fx) + n(ix + 1, iy + 1) * fx) * fy
  albedo *= .9 + .2 * noise
  let shade = 1
  for (const [cx, cy, r, rim] of CRATERS) {
    const dx = (X - cx) / r, dy = (Y - cy) / r, d = len(dx, dy)
    if (d > 1.35) continue
    // bowl: the wall facing the sun (dx < 0) catches it, the other wall is in shadow; a bright rim outside
    if (d < 1) shade *= 1 - .55 * Math.max(0, dx) + .35 * Math.max(0, -dx)
    else shade *= 1 + rim * (1 - (d - 1) / .35)
  }
  // Tycho's rays: thin bright streaks out to ~.7 of the disc
  const tx = X + .12, ty = Y - .72, td = len(tx, ty)
  if (td > .06 && td < .75) {
    const a = Math.atan2(ty, tx), k = 11, seg = Math.floor(((a / (2 * Math.PI)) + .5) * k), ca = ((seg + .5) / k - .5) * 2 * Math.PI + (hash01(seg, 3) - .5) * .4
    const off = Math.abs(Math.sin(a - ca)) * td
    albedo += .22 * Math.exp(-(off * off) / .0004) * (1 - td / .75)
  }
  return clamp(albedo * lit * shade)
}
const moonDensity = (x: number, y: number) => {
  const X = (M_BOX[0] + x / SS - MOON.cx) / MOON.r, Y = (M_BOX[1] + y / SS - MOON.cy) / MOON.r
  const b = moonLight(X, Y)
  return b < .04 ? 0 : b ** 2.1
}
const STIPPLES = 2400, LLOYD = 12
let moon: ReturnType<typeof stipple> | undefined
/** Built on first draw: the density raster and the Lloyd iterations as they are asked for. */
const moonStipple = () => (moon ??= stipple({ w: M_SIZE, h: M_SIZE, n: STIPPLES, seed: 9, iterations: LLOYD, density: moonDensity }))
/** The unlit limb: a faint dotted arc at equal arc length, where the sun no longer reaches. */
const DARK_LIMB: Pt[] = (() => {
  const pts: Pt[] = [], n = Math.round(2 * Math.PI * MOON.r / 3.2)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI, X = Math.cos(a), Y = Math.sin(a)
    if (X * SUN[0] + Y * SUN[1] < -.05) pts.push([MOON.cx + MOON.r * X, MOON.cy + MOON.r * Y])
  }
  return pts
})()
const ST_P = 14, ST_HOLD = 4, ST_SCATTER = .9
const posBuf = new Float32Array(STIPPLES * 2)
export const algoStipple: WidgetPreset = {
  id: 'algo-stipple', name: 'Algorithms Stipple', label: 'STIPPLE', ...tile,
  layers: ctx => {
    const s = moonStipple(), p = ((ctx.t % ST_P) + ST_P) % ST_P
    let k: number, live = false
    if (p < ST_HOLD) { k = LLOYD; s.at(k, posBuf) }
    else if (p < ST_HOLD + ST_SCATTER) {
      // fly back to the random start: final → start, accelerating
      const f = easeInOut((p - ST_HOLD) / ST_SCATTER), a = s.frame(LLOYD), b = s.frame(0)
      for (let i = 0; i < posBuf.length; i++) posBuf[i] = a[i] + (b[i] - a[i]) * f
      k = 0
    } else { k = LLOYD * easeOut((p - ST_HOLD - ST_SCATTER) / (ST_P - ST_HOLD - ST_SCATTER - .6)); s.at(k, posBuf); live = k < LLOYD }
    const groups: Partial<Record<Tone, Pt[]>> = { value: [], idle: [], mid: [] }
    for (let i = 0; i < STIPPLES; i++) {
      const x = posBuf[i * 2], y = posBuf[i * 2 + 1], d = s.densityAt(x, y)
      const tone: Tone = d >= .42 ? 'value' : d >= .16 ? 'idle' : 'mid'
      groups[tone]!.push([M_BOX[0] + x / SS - .5, M_BOX[1] + y / SS - .5])
    }
    return [
      cite('SECORD 2002'),
      layer(T.dots(DARK_LIMB, .8), 'faint'),
      ...siteLayers({ mid: groups.mid }, .8, ['mid']), ...siteLayers({ idle: groups.idle }, .95, ['idle']), ...siteLayers({ value: groups.value }, 1.1, ['value']),
      ...footer(k / LLOYD, `LLOYD ${pad(k, 2)}/${LLOYD}`, `${thousands(STIPPLES)} DOTS`, live),
    ]
  },
}

// ── 02 ATTRACTOR ─ one point, thirty-two thousand steps ────────────────────────────────────────────────────
// Thesis: "One point hopping thirty-two thousand times draws a shape no one designed." Clifford map; a and b
// drift on two incommensurate sines, so the folds slide and the shape never repeats. Tone is log density in
// three bands (faint wisps, mid body, white folds); size follows tone.
const AT_W = 144, AT_H = 114, AT_ROW = 12, AT_ITER = 32000, AT_MIN_COVER = 3000
const atParams = (t: number) => ({ a: -1.93 + .11 * Math.sin(t * 2 * Math.PI / 37), b: 1.86 + .06 * Math.sin(t * 2 * Math.PI / 23 + 1), c: -1.9, d: -.4 })
const atBuf = new Float32Array(AT_W * AT_H)
let atAt = NaN, atDrawn = { a: 0, b: 0 }
/** The histogram at t, memoised for the frame (the three tone layers and the footer share it). */
const atDensity = (t: number) => {
  if (t !== atAt) {
    const r = attractorDensity(atParams(t), { w: AT_W, h: AT_H, iterations: AT_ITER, margin: 2, minCovered: AT_MIN_COVER, out: atBuf })
    atDrawn = { a: r.a, b: r.b }; atAt = t
    // re-normalise to the 97th percentile of lit cells (a 64-bin histogram), so the brightest 3% are the white
    // folds whether this frame's orbit is crisp or diffuse
    const bins = new Uint32Array(64)
    for (const v of atBuf) if (v > 0) bins[Math.min(63, (v * 64) | 0)]++
    let rest = r.covered * .03, q = 1
    for (let i = 63; i >= 0; i--) { rest -= bins[i]; if (rest <= 0) { q = Math.max(.3, (i + 1) / 64); break } }
    for (let i = 0; i < atBuf.length; i++) atBuf[i] = Math.min(1, atBuf[i] / q)
  }
  return atBuf
}
/**
 * The attractor window as one multi-tone layer (one scan): log density (re-normalised to its 97th percentile) ≤ .25 is empty, then faint wisps, the
 * mid body, and white folds. A white cell needs two of its four neighbours above .6, so lone specks stay mid.
 */
const atLayer = (t: number): Layer => {
  const d = atDensity(t)
  const band = (x: number, y: number) => {
    const i = (y - AT_ROW) * AT_W + x, v = d[i]
    if (v <= .25) return 0
    if (v <= .42) return 1
    if (v < .97) return 2
    const nb = (x > 0 && d[i - 1] > .6 ? 1 : 0) + (x < AT_W - 1 && d[i + 1] > .6 ? 1 : 0) + (y > AT_ROW && d[i - AT_W] > .6 ? 1 : 0) + (y < AT_ROW + AT_H - 1 && d[i + AT_W] > .6 ? 1 : 0)
    return nb >= 2 ? 3 : 2
  }
  const field = cells((x, y) => { const b = band(x, y), v = d[(y - AT_ROW) * AT_W + x]; return b === 0 ? 0 : b === 1 ? .25 + v : b === 2 ? .45 + .5 * v : 1 }, [0, AT_ROW, AT_W - 1, AT_ROW + AT_H - 1])
  const tones: Tone[] = ['faint', 'faint', 'mid', 'value']
  return { field, toneOf: (_, u, v) => tones[band(Math.round(u * N), Math.round(v * N))] }
}
export const algoAttractor: WidgetPreset = {
  id: 'algo-attractor', name: 'Algorithms Attractor', label: 'ATTRACTOR', ...tile,
  layers: ctx => {
    const t = ctx.t
    atDensity(t)
    const q = atDrawn
    return [
      cite('CLIFFORD MAP'),
      atLayer(t),
      ...footer(.5 + .5 * Math.sin(t * 2 * Math.PI / 37), `A${q.a.toFixed(2)} B${q.b.toFixed(2)}`, '32K STEPS'),
    ]
  },
}

// ── 03 COLLAPSE ─ a knot that ties itself ─────────────────────────────────────────────────────────────
// Thesis: "Every cell is every tile until it isn't." Wave Function Collapse over knot tiles (straights,
// Truchet quarter arcs, crossings and double arcs; sockets = strand or none, closed at the border). An
// undecided cell is one dot whose size is how many tiles it could still be (its superposition); a decided cell
// draws its strand as dotted sites shared with its neighbours. Crossings alternate over / under by parity.
const S = 9, KW = 15, KH = 12, KX = 4.5, KY = 14
type Edges = readonly [number, number, number, number]
const KNOT: (WfcTile & { draw: string })[] = [
  { edges: [0, 0, 0, 0], weight: .35, draw: 'blank' },
  { edges: [1, 0, 1, 0], weight: .7, draw: 'ns' }, { edges: [0, 1, 0, 1], weight: .7, draw: 'ew' },
  { edges: [1, 1, 0, 0], weight: 1.3, draw: 'ne' }, { edges: [0, 1, 1, 0], weight: 1.3, draw: 'es' },
  { edges: [0, 0, 1, 1], weight: 1.3, draw: 'sw' }, { edges: [1, 0, 0, 1], weight: 1.3, draw: 'wn' },
  { edges: [1, 1, 1, 1] as Edges, weight: 2, draw: 'cross' },
  { edges: [1, 1, 1, 1] as Edges, weight: .8, draw: 'ne+sw' }, { edges: [1, 1, 1, 1] as Edges, weight: .8, draw: 'wn+es' },
]
/** Edge midpoints of tile (i, j): N, E, S, W. */
const mid = (i: number, j: number): Pt[] => { const x = KX + i * S, y = KY + j * S; return [[x + S / 2, y], [x + S, y + S / 2], [x + S / 2, y + S], [x, y + S / 2]] }
const line = (a: Pt, b: Pt, skip = 0): Pt[] => {
  const out: Pt[] = [], n = 4, cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2
  for (let k = 0; k <= n; k++) { const x = a[0] + (b[0] - a[0]) * k / n, y = a[1] + (b[1] - a[1]) * k / n; if (!skip || len(x - cx, y - cy) > skip) out.push([x, y]) }
  return out
}
/** Quarter arc of radius S/2 around tile corner (cx, cy) from angle a0 to a1. */
const arc = (cx: number, cy: number, a0: number, a1: number): Pt[] => Array.from({ length: 4 }, (_, k) => { const a = a0 + (a1 - a0) * k / 3; return [cx + S / 2 * Math.cos(a), cy + S / 2 * Math.sin(a)] as Pt })
const H = Math.PI / 2
function strand(draw: string, i: number, j: number): Pt[] {
  const [n, e, s, w] = mid(i, j), x = KX + i * S, y = KY + j * S
  const corner = (c: string): Pt[] => c === 'ne' ? arc(x + S, y, H * 2, H) : c === 'es' ? arc(x + S, y + S, -H, -H * 2) : c === 'sw' ? arc(x, y + S, 0, -H) : arc(x, y, H, 0)
  switch (draw) {
    case 'ns': return line(n, s)
    case 'ew': return line(w, e)
    case 'ne': case 'es': case 'sw': case 'wn': return corner(draw)
    case 'cross': return (i + j) % 2 ? [...line(n, s), ...line(w, e, 1.5)] : [...line(w, e), ...line(n, s, 1.5)]
    case 'ne+sw': return [...corner('ne'), ...corner('sw')]
    case 'wn+es': return [...corner('wn'), ...corner('es')]
    default: return []
  }
}
const KN_P = 16, KN_RUN = 10, KN_HOLD = 5, KN_OFF = 12
const solves = new Map<number, ReturnType<typeof wfc>>()
const solve = (seed: number) => {
  let r = solves.get(seed)
  if (!r) { r = wfc({ w: KW, h: KH, tiles: KNOT, seed, border: 0 }); solves.set(seed, r); if (solves.size > 3) solves.delete(solves.keys().next().value!) }
  return r
}
export const algoCollapse: WidgetPreset = {
  id: 'algo-collapse', name: 'Algorithms Collapse', label: 'COLLAPSE', ...tile,
  layers: ctx => {
    const tt = ctx.t + KN_OFF, loop = Math.floor(tt / KN_P), p = tt - loop * KN_P, r = solve(1 + (((loop % 64) + 64) % 64))
    const steps = r.observed.length
    // step = observations made so far; past the run it holds, then the last second dissolves back (reverse order)
    let step = p < KN_RUN ? Math.floor(steps * easeInOut(p / KN_RUN)) : steps
    const dissolve = p >= KN_RUN + KN_HOLD ? (p - KN_RUN - KN_HOLD) / (KN_P - KN_RUN - KN_HOLD) : 0
    if (dissolve > 0) step = Math.floor(steps * (1 - easeInOut(dissolve)))
    const counts = r.history[Math.min(step, r.history.length - 1)], cells = KW * KH, live = p < KN_RUN && step < steps
    const now = live && step > 0 ? r.observed[step - 1] : -1
    const done: Pt[] = [], hot: Pt[] = [], ghosts: Record<number, Pt[]> = {}
    let settled = 0
    for (let c = 0; c < cells; c++) {
      const i = c % KW, j = (c / KW) | 0
      if (r.settledAt[c] <= step) {
        settled++
        ;(c === now ? hot : done).push(...strand(KNOT[r.tiles[c]].draw, i, j))
      } else (ghosts[counts[c]] ??= []).push([KX + i * S + S / 2, KY + j * S + S / 2])
    }
    const ghostLayers = Object.entries(ghosts).map(([n, pts]) => layer(T.dots(pts, .8 + 2.2 * (+n / KNOT.length)), 'faint'))
    return [
      cite('GUMIN 2016'),
      ...ghostLayers,
      layer(T.dots(done, 1.25), 'value'),
      ...(hot.length ? [layer(T.dots(hot, 1.5), 'active')] : []),
      ...footer(settled / cells, `OBSERVE ${pad(step, 3)}`, `${pad(settled, 3)}/${cells}`),
    ]
  },
}

// ── 04 AGGREGATE ─ frost from one grain ───────────────────────────────────────────────────────────────
// Thesis: "Random walkers, one at a time, stick where they touch: frost grows from a single grain." DLA on a
// 143 × 114-diameter domain, off-lattice (one particle = one card cell). The trunk is oldest and dimmest, the tips bright, and the
// grains that stuck in the last moment are red. The footer measures the fractal dimension from the cluster's
// own mass–radius curve (≈ 1.71 in the plane).
const AG_UNIT = 1, AG_W = 143, AG_H = 114, AG_ROW = 12
let agg: ReturnType<typeof dla> | undefined
const aggregate = () => (agg ??= dla({ w: AG_W, h: AG_H, n: 4000, seed: 12 }))
const AG_P = 18, AG_GROW = 13, AG_OFF = 12.6
/** Mass–radius fractal dimension: least-squares slope of log N against log Rg (radius of gyration) over the grown history. */
function dimension(d: ReturnType<typeof dla>, k: number): number {
  let sx = 0, sy = 0, sxx = 0, sxy = 0, m = 0
  for (let i = 60; i < k; i += 8) { const x = Math.log(d.gyration[i]), y = Math.log(i + 1); sx += x; sy += y; sxx += x * x; sxy += x * y; m++ }
  return m > 2 ? (m * sxy - sx * sy) / (m * sxx - sx * sx) : 0
}
export const algoAggregate: WidgetPreset = {
  id: 'algo-aggregate', name: 'Algorithms Aggregate', label: 'AGGREGATE', ...tile,
  layers: ctx => {
    const d = aggregate(), tt = ctx.t + AG_OFF, p = ((tt % AG_P) + AG_P) % AG_P
    const grow = clamp(p / AG_GROW), fade = p > AG_P - .8 ? (p - AG_P + .8) / .8 : 0
    // the front advances at about constant speed: N ∝ R^1.7
    const k = Math.max(1, Math.round(d.count * grow ** 1.7 * (1 - easeInOut(fade)))), live = grow < 1 && fade === 0
    const groups: Partial<Record<Tone, Pt[]>> = { active: [], value: [], idle: [], mid: [], faint: [] }
    for (let i = 0; i < k; i++) {
      const age = (k - i) / k
      const tone: Tone = live && k - i <= 16 ? 'active' : age < .15 ? 'value' : age < .45 ? 'idle' : age < .8 ? 'mid' : 'faint'
      groups[tone]!.push([d.x[i] * AG_UNIT, AG_ROW + d.y[i] * AG_UNIT])
    }
    const dim = dimension(d, k)
    return [
      cite('WITTEN-SANDER 1981'),
      ...siteLayers(groups, 1.05, ['faint', 'mid', 'idle', 'value', 'active']),
      ...footer(k / d.count, `N ${thousands(k).padStart(5, ' ')}`, dim > 0 ? `D ${dim.toFixed(2)}` : 'D -.--'),
    ]
  },
}

export const algorithmsBoard = [algoStipple, algoAttractor, algoCollapse, algoAggregate]
/** The board's algorithm instances and sizes, for the checks (`scripts/algorithms.ts`) and docs. */
export const algorithmsSources = {
  moon: moonStipple, attractorAt: atParams, attractorDensity: atDensity, knot: solve, knotTiles: KNOT, aggregate,
  STIPPLES, LLOYD, AT_ITER, AT_MIN_COVER, KNOT_GRID: [KW, KH] as const, DLA_DOMAIN: [AG_W, AG_H] as const,
}
