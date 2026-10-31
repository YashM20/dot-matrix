/**
 * Suminagashi: closed-form marbling (docs/living-matter/X-advanced.md #1; S. Lu, A. Jaffer et al., "Mathematical
 * Marbling", IEEE CG&A 32(6), 2012). Every ink drop and every comb stroke is a homeomorphism of the plane, so there is
 * no fluid solver and no blur: a point's tone is found by walking the operation list backwards from it until a drop
 * contains it.
 *
 * - **Drop** at c, radius r: p' = c + (p − c)·√(1 + r²/|p − c|²); backwards p = c + (p' − c)·√(1 − r²/|p' − c|²).
 * - **Tine** through b along unit m (normal n), shift α, sharpness λ: p' = p + (αλ/(d + λ))·m with d = |(p − b)·n|.
 * - **Vortex** around c: a rotation by α/(d + λ) (d = |p − c|), so the arc shift stays under α.
 * - **Koi tines** (the hero): each fish's recent path, cut into segments, is a short curved comb stroke; a segment
 *   drags the ink within 3λ of it (a smooth compact bump, λ = the body width) along the swim direction, by an amount
 *   that fades with the segment's age, so the water closes slowly behind a fish.
 *
 * The pristine pattern (`marbleOps`, 40–60 operations seeded by the day) is baked once into a tone per card cell, at
 * mount (`marbleBake`); a frame then walks only the live operations (koi segments, the visitor's drops and finger
 * strokes, newest first, each visiting the cells of its own box) and looks the rest up in the bake. The koi swim on
 * closed curves with integer harmonics, so the card is a pure function of t with period `period`; taps and strokes
 * live in a small physics `World` that heals back (its pristine state is all zeros, so a heal shrinks the visitor's
 * drops back into the water). Only `+ × √` and dmath trig: bit-identical across engines (the F0.9 lint covers it).
 */
import { dcos, dsin, rngFor, TAU } from '../noise/dmath'
import { createWorld, type StepInput, type World } from '../physics/world'
import { bodyRaster, createBodyRaster, PART_BODY, profileAt, type BodySpec } from './body'
import { createChain, type Chain } from './chain'
import { clearTiles, matchTile, putBig, putGlyph, rampGlyph, RAMP3, SHAPE3, T_ACTIVE, T_FAINT, T_IDLE, T_MID, T_VALUE, type TileGrid, type TileRaster } from './glyphTiles'
import { pressAt, pressInit, pressStep, PRESS_TAP } from './loop'

// ── operations ──────────────────────────────────────────────────────────────────────────────────────
export const OP_DROP = 0, OP_TINE = 1, OP_VORTEX = 2
/** One operation: [kind, a0 … a5]. DROP: cx, cy, r, tone (−1 = a water drop). TINE: bx, by, mx, my, α, λ. VORTEX: cx, cy, α, λ. */
export const OP_STRIDE = 7
/** Smallest ring a station lays down, cells (the material rule: periods ≥ 2 cells, so a ring never aliases). */
export const RING_MIN = 2.5

export interface MarbleKoi { length: number }
export interface MarbleSpec {
  seed: number; tiles: TileGrid; card: { cols: number; rows: number }
  /** Basin SDF in card cells (< 0 = water). */
  sdf: (x: number, y: number) => number
  koi: MarbleKoi[]
  /** Loop period, seconds (the koi paths close on it). */
  period: number
}

/**
 * The pristine operation list for `seed`: 4 or 5 ink stations of alternating sumi / grey / water drops (rings
 * RING_MIN–4.5 cells thick, laid from the newest drop outwards so every ring starts at least RING_MIN wide), two
 * rakes of parallel tines, one vortex, and last the beni drop with a water core: the red ring, the newest ink.
 */
export function marbleOps(seed: number, sdf: (x: number, y: number) => number): Float64Array {
  const rnd = rngFor(seed, 0x5a11)
  const ops: number[] = []
  const push = (...a: number[]) => { ops.push(...a); for (let i = a.length; i < OP_STRIDE; i++) ops.push(0) }
  const centres: [number, number][] = []
  const stations = 3 + (rnd() < .5 ? 1 : 0)
  for (let s = 0, tries = 0; s < stations && tries < 400; tries++) {
    const x = 18 + rnd() * 108, y = 24 + rnd() * 106
    if (sdf(x, y) > -14) continue
    if (centres.some(([cx, cy]) => (cx - x) * (cx - x) + (cy - y) * (cy - y) < 40 * 40)) continue
    centres.push([x, y]); s++
  }
  const TONES = [T_VALUE, -1, T_MID, -1]
  for (const [cx, cy] of centres) {
    const rings = 9 + Math.floor(rnd() * 5), radii: number[] = []
    let S = 0
    // newest (innermost) first: ring i spans [√S, √S + th]
    for (let i = 0; i < rings; i++) {
      const th = i === 0 ? 3 + rnd() * 2.5 : RING_MIN + rnd() * 1.5
      const outer = Math.sqrt(S) + th
      radii.push(Math.sqrt(outer * outer - S)); S = outer * outer
    }
    const t0 = Math.floor(rnd() * 4)
    for (let i = rings - 1; i >= 0; i--) push(OP_DROP, cx, cy, radii[i], TONES[(t0 + rings - 1 - i) % 4])
  }
  // two rakes (3 parallel tines each), roughly across each other
  for (let k = 0; k < 2; k++) {
    const a = (k ? TAU / 4 : 0) + (rnd() - .5) * .5, mx = dcos(a), my = dsin(a), nx = -my, ny = mx
    const sharp = 7 + rnd() * 4, shift = (9 + rnd() * 5) * (rnd() < .5 ? -1 : 1), off = (rnd() - .5) * 16
    for (let j = -2; j <= 2; j++) push(OP_TINE, 72 + nx * (j * 26 + off), 77 + ny * (j * 26 + off), mx, my, shift * (j & 1 ? -.8 : 1), sharp)
  }
  // two breaths across the water (the blown swirl of suminagashi), turning opposite ways
  for (let k = 0; k < 2; k++) {
    const vc = centres[(k + Math.floor(rnd() * centres.length)) % Math.max(1, centres.length)] ?? [72, 77]
    push(OP_VORTEX, vc[0] + (rnd() - .5) * 20, vc[1] + (rnd() - .5) * 20, (10 + rnd() * 6) * (k ? -1 : 1), 12)
  }
  // the beni: a red drop, then a water drop inside it (a ring), away from the stations' centres
  let bx = 72, by = 77
  for (let tries = 0; tries < 200; tries++) {
    const x = 26 + rnd() * 92, y = 32 + rnd() * 90
    if (sdf(x, y) > -20 || centres.some(([cx, cy]) => (cx - x) * (cx - x) + (cy - y) * (cy - y) < 18 * 18)) continue
    bx = x; by = y; break
  }
  push(OP_DROP, bx, by, 8, T_ACTIVE)
  push(OP_DROP, bx, by, 5.5, -1)
  return Float64Array.from(ops)
}

/** Walk `ops` (first `n` of them) backwards from (x, y): the tone of the first drop that holds the point, else −1. */
export function marbleToneAt(ops: Float64Array, x: number, y: number, n = ops.length / OP_STRIDE): number {
  for (let k = n - 1; k >= 0; k--) {
    const o = k * OP_STRIDE, kind = ops[o]
    if (kind === OP_DROP) {
      const cx = ops[o + 1], cy = ops[o + 2], r = ops[o + 3], dx = x - cx, dy = y - cy, q = dx * dx + dy * dy, r2 = r * r
      if (q < r2) return ops[o + 4]
      const f = Math.sqrt(1 - r2 / q)
      x = cx + dx * f; y = cy + dy * f
    } else if (kind === OP_TINE) {
      const mx = ops[o + 3], my = ops[o + 4], a = ops[o + 5], l = ops[o + 6]
      let d = (x - ops[o + 1]) * -my + (y - ops[o + 2]) * mx
      if (d < 0) d = -d
      const s = a * l / (d + l)
      x -= s * mx; y -= s * my
    } else {
      const cx = ops[o + 1], cy = ops[o + 2], dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy), th = -ops[o + 3] / (d + ops[o + 4])
      const c = dcos(th), s = dsin(th)
      x = cx + dx * c - dy * s; y = cy + dx * s + dy * c
    }
  }
  return -1
}

/**
 * The pristine pattern as a tone per card cell (−1 = clear water or outside the basin). Cell (c, r) is sampled at its
 * centre (c, r). Op-major (each operation sweeps every undecided cell, newest first): tight monomorphic loops, much
 * faster than walking the list per cell; it is the same walk, so it equals `marbleToneAt` cell for cell (checked).
 */
export function marbleBake(ops: Float64Array, card: { cols: number; rows: number }, sdf: (x: number, y: number) => number): Int8Array {
  const W = card.cols, out = new Int8Array(W * card.rows).fill(-1), idx: number[] = []
  for (let y = 0; y < card.rows; y++) for (let x = 0; x < W; x++) if (sdf(x, y) < 0) idx.push(y * W + x)
  const N = idx.length, X = new Float64Array(N), Y = new Float64Array(N), live = new Int32Array(N)
  for (let c = 0; c < N; c++) { X[c] = idx[c] % W; Y[c] = (idx[c] / W) | 0; live[c] = c }
  let n = N
  for (let k = ops.length / OP_STRIDE - 1; k >= 0 && n > 0; k--) {
    const o = k * OP_STRIDE, kind = ops[o]
    if (kind === OP_DROP) {
      const cx = ops[o + 1], cy = ops[o + 2], r2 = ops[o + 3] * ops[o + 3], tone = ops[o + 4]
      let m = 0
      for (let q = 0; q < n; q++) {
        const c = live[q], dx = X[c] - cx, dy = Y[c] - cy, d2 = dx * dx + dy * dy
        if (d2 < r2) { out[idx[c]] = tone; continue }
        const f = Math.sqrt(1 - r2 / d2)
        X[c] = cx + dx * f; Y[c] = cy + dy * f; live[m++] = c
      }
      n = m
    } else if (kind === OP_TINE) {
      const bx = ops[o + 1], by = ops[o + 2], mx = ops[o + 3], my = ops[o + 4], l = ops[o + 6], al = ops[o + 5] * l
      for (let q = 0; q < n; q++) {
        const c = live[q]
        let d = (X[c] - bx) * -my + (Y[c] - by) * mx
        if (d < 0) d = -d
        const sh = al / (d + l)
        X[c] -= sh * mx; Y[c] -= sh * my
      }
    } else {
      const cx = ops[o + 1], cy = ops[o + 2], a = ops[o + 3], l = ops[o + 4]
      for (let q = 0; q < n; q++) {
        const c = live[q], dx = X[c] - cx, dy = Y[c] - cy, th = -a / (Math.sqrt(dx * dx + dy * dy) + l), cs = dcos(th), sn = dsin(th)
        X[c] = cx + dx * cs - dy * sn; Y[c] = cy + dx * sn + dy * cs
      }
    }
  }
  return out
}

// ── koi paths ───────────────────────────────────────────────────────────────────────────────────────
/** Harmonics of a koi's closed path: x = cx + Σ ax_h cos(hθ + φx_h), y = cy + Σ ay_h sin(hθ + φy_h), θ = dir·2π·τ/P. */
interface KoiPath { ax: number[]; ay: number[]; px: number[]; py: number[]; dir: number; surge: number; nb: number }
/** Surges per loop (burst and glide: the clock τ runs 1 ± SURGE_W fast). */
const SURGES = 6, SURGE_W = .45
/** Mean swim speed, cells per second of τ (set by the harmonics; kept for the beat count). */
const U_MEAN = 11

// ── the scene ───────────────────────────────────────────────────────────────────────────────────────
export interface Marble {
  spec: MarbleSpec; world: World; ops: Float64Array
  /** Baked once (lazily, at the first frame). */
  bake: Int8Array | null
  paths: KoiPath[]; chains: Chain[]; spines: Float32Array[]; bodies: BodySpec[]
  /** Tile cells inside the basin: card index per cell, and their centres. */
  cells: Int32Array; cx: Float32Array; cy: Float32Array
  /** Card cell → index into `cells` (−1 = not a basin tile cell). */
  lut: Int32Array
  /** Cells on the basin's rim (drawn faint). */
  rim: Int32Array
}
/** Visitor drops: [x, y, r, core, R, age]; R > 0 = in use. */
export const M_DROPS = 6, DROP_F = 6
/** The finger's stroke: [x, y, age, w] ring buffer. */
export const M_STROKE = 32, STROKE_F = 4
const D0 = 0, S0 = D0 + M_DROPS * DROP_F, H0 = S0 + M_STROKE * STROKE_F, P0 = H0 + 4
export const MARBLE_SIZE = P0 + 4
/** Koi tine segments: Δ seconds apart over a TAU_TINE window. */
export const SEG_DT = .6, TAU_TINE = 9.6
const SEGS = Math.round(TAU_TINE / SEG_DT)
/** Ink dragged per cell of swim path (× the segment's age fade). */
export const KOI_DRAG = .3, FINGER_DRAG = .45
/** Seconds a stroke point lasts. */
const STROKE_LIFE = 8
/** A visitor drop's ink radius; its water core opens to CORE × that. */
const DROP_R = 6.5, CORE = .62
export const MARBLE_DT = 1 / 30

export function createMarble(spec: MarbleSpec): Marble {
  const rnd = rngFor(spec.seed, 0x6b01)
  const paths: KoiPath[] = spec.koi.map((k, i) => {
    const sx = 1 - .06 * i, sy = 1 - .08 * i
    return {
      ax: [36 * sx, 9 + rnd() * 4, 3 + rnd() * 3], ay: [33 * sy, 8 + rnd() * 4, 3 + rnd() * 3],
      px: [rnd() * TAU, rnd() * TAU, rnd() * TAU], py: [rnd() * TAU, rnd() * TAU, rnd() * TAU],
      dir: i % 2 ? -1 : 1, surge: rnd() * TAU,
      nb: Math.max(1, Math.round(1.5 * U_MEAN * spec.period / k.length)),
    }
  })
  const chains = spec.koi.map(k => createChain(20, k.length / 19, .11, 0))
  const spines = spec.koi.map(() => new Float32Array(40))
  const bodies: BodySpec[] = spec.koi.map(k => ({ length: k.length, halfWidth: .13, fins: true, tail: true }))
  const { cols, rows, pitch, ox, oy } = spec.tiles, W = spec.card.cols, H = spec.card.rows
  const lut = new Int32Array(W * H).fill(-1), list: number[] = [], rim: number[] = []
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
    const x = ox + tx * pitch + i, y = oy + ty * pitch + j
    if (x >= W || y >= H) continue
    const d = spec.sdf(x, y)
    if (d < 0) { lut[y * W + x] = list.length; list.push(y * W + x) } else if (d < 1.6) rim.push(y * W + x)
  }
  const cells = Int32Array.from(list)
  const m: Marble = {
    spec, ops: marbleOps(spec.seed, spec.sdf), bake: null, paths, chains, spines, bodies,
    cells, cx: Float32Array.from(list, i => i % W), cy: Float32Array.from(list, i => (i / W) | 0), lut, rim: Int32Array.from(rim),
    world: createWorld({
      size: MARBLE_SIZE, dt: MARBLE_DT, lead: 0, period: spec.period, every: 360, maxCheckpoints: 8,
      idle: 6, heal: 4,
      init: s => { s.fill(0); pressInit(s, P0) },
      step: (s, _n, input) => marbleStep(s, input),
      blend: (a, b, k) => {
        // a heal shrinks the visitor's ink back into the water: only the radii and the stroke weights move;
        // positions stay put (a lerp toward 0 would slide them to the corner) until the last step lands on b
        if (k >= 1) { a.set(b); return }
        for (let d = 0; d < M_DROPS; d++) { const o = D0 + d * DROP_F; a[o + 2] += (b[o + 2] - a[o + 2]) * k; a[o + 3] += (b[o + 3] - a[o + 3]) * k; a[o + 4] += (b[o + 4] - a[o + 4]) * k }
        for (let q = 0; q < M_STROKE; q++) { const o = S0 + q * STROKE_F + 3; a[o] += (b[o] - a[o]) * k }
      },
    }),
  }
  return m
}

/** One step of the visitor's ink: a tap (or a kick) lays a drop that blooms over ~.4 s; a drag lays a stroke. */
function marbleStep(s: Float32Array, input: StepInput): void {
  const dt = MARBLE_DT
  for (let d = 0; d < M_DROPS; d++) {
    const o = D0 + d * DROP_F
    if (s[o + 4] <= 0) continue
    s[o + 5] += dt
    s[o + 2] += (s[o + 4] - s[o + 2]) * .2
    if (s[o + 5] > .25) s[o + 3] += (s[o + 4] * CORE - s[o + 3]) * .2
  }
  for (let q = 0; q < M_STROKE; q++) {
    const o = S0 + q * STROKE_F
    if (s[o + 3] <= 0) continue
    s[o + 2] += dt
    if (s[o + 2] > STROKE_LIFE) s[o + 3] = 0
  }
  const p = input.pointers[0]
  const ev = pressStep(s, P0, p, dt)
  const put = (x: number, y: number, w: number) => {
    const o = S0 + s[H0] * STROKE_F
    s[o] = x; s[o + 1] = y; s[o + 2] = 0; s[o + 3] = w
    s[H0] = (s[H0] + 1) % M_STROKE; s[H0 + 2] = x; s[H0 + 3] = y
  }
  // a press drops an anchor (weight ~0: no stroke from the last one); each 1.5 cells of drag adds a stroke point
  if (p?.pressed) { s[H0 + 1] = 0; put(p.x, p.y, .001) }
  else if (p?.down) {
    const dx = p.x - s[H0 + 2], dy = p.y - s[H0 + 3], l = Math.sqrt(dx * dx + dy * dy)
    if (l >= 1.5) { s[H0 + 1] += l; put(p.x, p.y, 1) }
  }
  if ((ev === PRESS_TAP && s[H0 + 1] < 4) || input.kick) {
    const [x, y] = input.kick && ev !== PRESS_TAP ? [72, 77] : pressAt(s, P0)
    // the oldest slot (or a free one)
    let best = 0, age = -1
    for (let d = 0; d < M_DROPS; d++) { const o = D0 + d * DROP_F, a = s[o + 4] > 0 ? s[o + 5] : 1e9; if (a > age) { age = a; best = d } }
    const o = D0 + best * DROP_F
    s[o] = x; s[o + 1] = y; s[o + 2] = .5; s[o + 3] = 0; s[o + 4] = DROP_R; s[o + 5] = 0
  }
}

/** Visitor drops in use in state `s`: [x, y, r, core, age][] (tests and the probe). */
export function marbleDrops(s: Float32Array): [number, number, number, number, number][] {
  const out: [number, number, number, number, number][] = []
  for (let d = 0; d < M_DROPS; d++) { const o = D0 + d * DROP_F; if (s[o + 4] > 0 && s[o + 2] > .05) out.push([s[o], s[o + 1], s[o + 2], s[o + 3], s[o + 5]]) }
  return out
}
/** Live stroke points (weight > 0). */
export const marbleStrokes = (s: Float32Array) => { let n = 0; for (let q = 0; q < M_STROKE; q++) if (s[S0 + q * STROKE_F + 3] > 0) n++; return n }

/** Head position and swim speed factor of koi k at t (out: [x, y, speed factor]). Pure in t, period P. */
export function koiPathAt(m: Marble, k: number, t: number, out: Float64Array): void {
  const P = m.spec.period, path = m.paths[k], w = TAU * SURGES / P
  const tau = t + (SURGE_W / w) * dsin(w * t + path.surge)
  const th = path.dir * TAU * tau / P
  let x = 72, y = 77
  for (let h = 0; h < 3; h++) { x += path.ax[h] * dcos((h + 1) * th + path.px[h]); y += path.ay[h] * dsin((h + 1) * th + path.py[h]) }
  out[0] = x; out[1] = y; out[2] = 1 + SURGE_W * dcos(w * t + path.surge)
}
/** τ (the koi's own clock) at t: the swim phase runs on it. */
const tauOf = (m: Marble, k: number, t: number) => { const w = TAU * SURGES / m.spec.period; return t + (SURGE_W / w) * dsin(w * t + m.paths[k].surge) }

// ── per-frame scratch ───────────────────────────────────────────────────────────────────────────────
const MAX_OPS = 8 * (SEGS + 1) + M_STROKE + M_DROPS
const opAge = new Float64Array(MAX_OPS), opIdx = new Int32Array(MAX_OPS)
/** Live ops: [kind (1 seg, 0 drop), ax, ay, bx, by, α, λ | x, y, r, core, tone]. */
const LIVE_F = 8
const live = new Float64Array(MAX_OPS * LIVE_F)
let px = new Float32Array(0), py = new Float32Array(0), done = new Int8Array(0)
const pt = new Float64Array(3), pq = new Float64Array(3)
const body = createBodyRaster()
const sub16 = new Float32Array(16)
const KL = [-.45 / .99373035, -.55 / .99373035, .70 / .99373035] as const

/** Ages of the koi path samples behind the head, for the spine (δ seconds apart). */
const SPINE_DT = .04

function spineFromPath(m: Marble, k: number, t: number): void {
  const c = m.chains[k], st = m.spines[k], seg = c.seg
  koiPathAt(m, k, t, pt)
  st[c.X] = pt[0]; st[c.Y] = pt[1]
  let lx = pt[0], ly = pt[1], acc = 0, node = 1, back = 0
  while (node < c.n && back < 400) {
    back++
    koiPathAt(m, k, t - back * SPINE_DT, pq)
    const dx = pq[0] - lx, dy = pq[1] - ly, l = Math.sqrt(dx * dx + dy * dy)
    if (l < 1e-9) continue
    // place nodes every `seg` of arc length along the path
    let rem = l, fx = lx, fy = ly
    while (acc + rem >= seg && node < c.n) {
      const f = (seg - acc) / rem
      fx += (pq[0] - fx) * f; fy += (pq[1] - fy) * f
      st[c.X + node] = fx; st[c.Y + node] = fy; node++
      rem -= seg - acc; acc = 0
    }
    acc += rem; lx = pq[0]; ly = pq[1]
  }
  for (; node < c.n; node++) { st[c.X + node] = lx; st[c.Y + node] = ly }
}

/**
 * Draw the marble at t, with the visitor's state `s`, into `r` (the basin's tile grid): the ink as 3 × 3 cell glyphs
 * sampled straight from the marbling, the basin's rim faint, then the koi (style B: lattice-4 interiors, SHAPE3
 * edges, fins) in `value`/`idle`. The one accent is the newest drop's ring (`active`).
 */
export function drawMarble(m: Marble, s: Float32Array, t: number, r: TileRaster): void {
  const { card } = m.spec, W = card.cols, H = card.rows
  m.bake ??= marbleBake(m.ops, card, m.spec.sdf)
  const bake = m.bake, N = m.cells.length
  if (px.length < N) { px = new Float32Array(N); py = new Float32Array(N); done = new Int8Array(N) }
  px.set(m.cx); py.set(m.cy)
  done.fill(0, 0, N)
  clearTiles(r)
  // live ops: koi segments, stroke segments, visitor drops; newest first
  let n = 0
  const K = m.spec.koi.length
  for (let k = 0; k < K; k++) {
    const lam = .13 * m.spec.koi[k].length
    koiPathAt(m, k, t, pt)
    let ax = pt[0], ay = pt[1]
    for (let j = 1; j <= SEGS; j++) {
      koiPathAt(m, k, t - j * SEG_DT, pq)
      const age = (j - .5) * SEG_DT, fade = 1 - age / TAU_TINE, len = Math.sqrt((ax - pq[0]) * (ax - pq[0]) + (ay - pq[1]) * (ay - pq[1]))
      const o = n * LIVE_F
      live[o] = 1; live[o + 1] = pq[0]; live[o + 2] = pq[1]; live[o + 3] = ax; live[o + 4] = ay; live[o + 5] = KOI_DRAG * len * fade * fade; live[o + 6] = lam
      opAge[n] = age; opIdx[n] = n; n++
      ax = pq[0]; ay = pq[1]
    }
  }
  // the stroke: consecutive points of the ring buffer (oldest → newest) make segments
  const head = s[H0]
  let prev = -1
  for (let q = 0; q < M_STROKE; q++) {
    const qi = (head + q) % M_STROKE, o = S0 + qi * STROKE_F
    if (s[o + 3] <= 0) { prev = -1; continue }
    if (prev >= 0 && s[o + 3] > .01) {
      const p0 = S0 + prev * STROKE_F, w = s[o + 3] * (1 - s[o + 2] / STROKE_LIFE), dx = s[o] - s[p0], dy = s[o + 1] - s[p0 + 1], len = Math.sqrt(dx * dx + dy * dy)
      if (len < 12) {
        const l = n * LIVE_F
        live[l] = 1; live[l + 1] = s[p0]; live[l + 2] = s[p0 + 1]; live[l + 3] = s[o]; live[l + 4] = s[o + 1]; live[l + 5] = FINGER_DRAG * len * w; live[l + 6] = 5
        opAge[n] = s[o + 2]; opIdx[n] = n; n++
      }
    }
    prev = qi
  }
  let newest = -1, newestAge = Infinity
  for (let d = 0; d < M_DROPS; d++) {
    const o = D0 + d * DROP_F
    if (s[o + 4] <= 0 || s[o + 2] < .05) continue
    if (s[o + 5] < newestAge) { newestAge = s[o + 5]; newest = n }
    const l = n * LIVE_F
    live[l] = 0; live[l + 1] = s[o]; live[l + 2] = s[o + 1]; live[l + 3] = s[o + 2]; live[l + 4] = s[o + 3]; live[l + 5] = T_VALUE
    opAge[n] = s[o + 5]; opIdx[n] = n; n++
  }
  if (newest >= 0) live[newest * LIVE_F + 5] = T_ACTIVE
  // newest first (insertion sort: ≤ 140 ops, mostly in order already)
  for (let i = 1; i < n; i++) { const a = opAge[opIdx[i]], v = opIdx[i]; let j = i - 1; while (j >= 0 && opAge[opIdx[j]] > a) { opIdx[j + 1] = opIdx[j]; j-- } opIdx[j + 1] = v }
  const lut = m.lut
  for (let q = 0; q < n; q++) {
    const o = opIdx[q] * LIVE_F
    if (live[o] === 1) {
      const ax = live[o + 1], ay = live[o + 2], bx = live[o + 3], by = live[o + 4], a = live[o + 5], R = 3 * live[o + 6]
      if (a < 1e-3) continue
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy
      if (l2 < 1e-9) continue
      const l = Math.sqrt(l2), mx = dx / l, my = dy / l, R2 = R * R, M = R + 2
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - M)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + M))
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - M)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + M))
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const c = lut[y * W + x]
        if (c < 0 || done[c]) continue
        const qx = px[c] - ax, qy = py[c] - ay
        let u = (qx * dx + qy * dy) / l2
        if (u < 0) u = 0; else if (u > 1) u = 1
        const rx = qx - dx * u, ry = qy - dy * u, d2 = rx * rx + ry * ry
        if (d2 >= R2) continue
        const b = 1 - d2 / R2, w = a * b * b
        px[c] -= w * mx; py[c] -= w * my
      }
    } else {
      const cx = live[o + 1], cy = live[o + 2], ri = live[o + 3], rc = live[o + 4], tone = live[o + 5]
      const rc2 = rc * rc, rt2 = ri * ri + rc2
      for (let c = 0; c < N; c++) {
        if (done[c]) continue
        const dx = px[c] - cx, dy = py[c] - cy, q2 = dx * dx + dy * dy
        if (q2 < rt2) { done[c] = q2 < rc2 ? 2 : 1; if (done[c] === 1) { px[c] = tone; py[c] = 0 } continue }
        const f = Math.sqrt(1 - rt2 / q2)
        px[c] = cx + dx * f; py[c] = cy + dy * f
      }
    }
  }
  // write the cells
  const tone = r.tone, value = r.value
  for (let c = 0; c < N; c++) {
    let tn: number
    if (done[c] === 2) continue
    if (done[c] === 1) tn = px[c]
    else {
      const x = (px[c] + .5) | 0, y = (py[c] + .5) | 0
      if (px[c] < 0 || py[c] < 0 || x >= W || y >= H) continue
      tn = bake[y * W + x]
    }
    if (tn < 0) continue
    const i = m.cells[c]
    tone[i] = tn; value[i] = tn === T_MID ? .8 : 1
  }
  for (let i = 0; i < m.rim.length; i++) { tone[m.rim[i]] = T_FAINT; value[m.rim[i]] = .6 }
  // the koi, over the ink
  for (let k = 0; k < K; k++) drawKoi(m, k, t, r)
}

function drawKoi(m: Marble, k: number, t: number, r: TileRaster): void {
  spineFromPath(m, k, t)
  koiPathAt(m, k, t, pt)
  const b = m.bodies[k], path = m.paths[k], P = m.spec.period
  const phase = TAU * path.nb * tauOf(m, k, t) / P, beat = .55 + .5 * (pt[2] - 1 + SURGE_W) / (2 * SURGE_W)
  bodyRaster(b, m.chains[k], m.spines[k], phase, beat, body)
  if (!body.w) return
  const { cols, rows, pitch, ox, oy } = m.spec.tiles, hw = .13 * b.length
  const tx0 = Math.max(0, Math.floor((body.x0 - ox) / pitch)), tx1 = Math.min(cols - 1, Math.floor((body.x0 + body.w - 1 - ox) / pitch))
  const ty0 = Math.max(0, Math.floor((body.y0 - oy) / pitch)), ty1 = Math.min(rows - 1, Math.floor((body.y0 + body.h - 1 - oy) / pitch))
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    let cov = 0, sh = 0, nb = 0, nf = 0
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const bx = ox + tx * pitch + i - body.x0, by = oy + ty * pitch + j - body.y0
      let c = 0
      if (bx >= 0 && by >= 0 && bx < body.w && by < body.h) {
        const bi = by * body.w + bx
        c = body.cover[bi]
        if (c > 0) {
          const B = hw * profileAt(Math.min(.999, body.s[bi]))
          let vn = B > 1e-6 ? body.v[bi] / B : 0
          if (vn > 1) vn = 1; else if (vn < -1) vn = -1
          const nz = Math.sqrt(1 - vn * vn), dot = vn * (body.nx[bi] * KL[0] + body.ny[bi] * KL[1]) + nz * KL[2]
          sh += .35 + .65 * (dot > 0 ? dot : 0)
          if (body.part[bi] === PART_BODY) nb++; else nf++
        }
      }
      sub16[j * 4 + i] = c; cov += c
    }
    if (cov < 3.2) continue
    const fin = nf > nb, shade = sh / (nb + nf)
    if (cov < 9.6) { putGlyph(r, tx, ty, matchTile(SHAPE3, sub16), fin ? T_IDLE : T_VALUE, .8); continue }
    if (fin) { putGlyph(r, tx, ty, rampGlyph(RAMP3, .5), T_IDLE, .8); continue }
    putBig(r, tx, ty, T_VALUE, shade >= .75 ? 1 : shade >= .5 ? .8 : .6)
  }
}
