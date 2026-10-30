/**
 * Board · MATERIALS (M1, docs/living-matter/M-materials.md §3): cloth, spun aluminium, perforated steel, marble and
 * terrazzo here; M2 (§4: liquid glass, a caustic pool, stained glass, embroidery, rust, a wax candle) in
 * `materials-glass.ts` (lens, window), `materials-live.ts` (pool, rust: main thread only) and `materials-wear.ts` (patch, candle),
 * with the shared shell in `materials-shared.ts`.
 * Each is made of relief + one light + a micro-pattern of whole size steps (`src/engine/matter`). Material never comes from hue: height → normal → tone band, AO, an anisotropic sheen, and the card's one moving part in red.
 *
 * Rules (M §1):
 * - One accent per card, on the live element only (the shuttle, the value arc, the peak hole, the colon, today's chip).
 *   No `activeDim` until the owner rules (M §10.6): "was active" is size contrast in the one `active` layer.
 * - Every bake (relief, AO, normals, tangents, stone) runs lazily on the card's first frame, never at import; per frame
 *   only the light, the signal and per-cell lookups run (≤ 4 ms, `scripts/materials.ts`). The first frame, bakes
 *   included, stays ≤ 30 ms: bakes visit only their geometry's box (a chip, a colon, the plaque), and per-cell loops
 *   live in small per-row helpers (`loomRow`, `plateRow`, …) that reach compiled code within that first frame, where
 *   one long loop in a once-run closure would stay interpreted. Every speed-up here is pixel-identical.
 * - The light is `sceneLight` (src/engine/light/input.ts) through `matLight`: the hovering pointer as a torch, else the
 *   tilt hub (`lightSrc` 1), else the sun of the hour. Every card declares the hub keys in `defaults`.
 */
import { ambientOcclusion, anisoSpec, cardMask, DRAFTS, fromDraft, marble, surfaceLayer, tangentLinear, tangentRadial, terrazzo, tonedLayer, weaveRelief, type Draft, type Drawdown, type TangentRaster } from '../../engine/matter'
import { heightFromField } from '../../engine/matter/relief'
import { heightRaster, normalRaster, stackHeights, type HeightRaster, type NormalRaster } from '../../engine/light/height'
import { illuminate, lambert, phong, type Light } from '../../engine/light/shade'
import { MATTE_BANDS, type ToneBand } from '../../engine/light/material'
import { sdfBox, sdfCircle } from '../../engine/light/sdf'
import { createRaster, rasterize, rasterWindow, sample, type Raster } from '../../engine/raster/raster'
import { insetDistance } from '../../engine/matter/relief'
import { noise2 } from '../../engine/noise/gradient'
import { dexp, dpow } from '../../engine/noise/dmath'
import { hash01 } from '../../engine/math'
import type { Field, Layer } from '../../engine/types'
import { lightSource } from '../../site/light'
import { TILE, layer, layoutFor, type WidgetPreset } from '../types'
import { cap, cellToLattice15, cite, DEG, L15, LG15, LIGHT_DEFAULTS, matLight, mod, once, pad2, rasterLayer, scratch, T, TAU, tile, toCard15, valuedSites, type Box, type Pt } from './materials-shared'
import { matLens, matWindow, glassHooks } from './materials-glass'
import { matPool, matRust, poolHooks } from './materials-live'
import { matPatch, matCandle, wearHooks } from './materials-wear'

export { LIGHT_DEFAULTS, matLight, type MatLightOptions } from './materials-shared'

// ── 01 LOOM ─ cloth appears one pick at a time; the shuttle is the only thing moving ─────────────────
// Twill, satin, herringbone, basket and plain in turn (26 picks a panel, 1.2 s a pick at 40 fps: 2 cells a frame).
// Warp in the lambert bands, weft one band lower; the Kajiya–Kay crest one step up; AO in the crossings. The draft
// (threading, tie-up, treadling) is drawn as dots beside the cloth; the tie-up cells are toggles.
const LOOM = { box: [8, 14, 103, 117] as Box, W: 4, ends: 24, picks: 26, PICK: 1.2, lift: 1.2 }
const PANEL = LOOM.picks * LOOM.PICK
export const LOOM_ORDER = ['twill22', 'satin52', 'herringbone', 'basket2', 'plain'] as const
type DraftName = typeof LOOM_ORDER[number]
const DRAFT_NAMES: Record<DraftName, string> = { plain: 'PLAIN', twill22: 'TWILL 2/2', satin52: 'SATIN 5/2', herringbone: 'HERRINGBONE', basket2: 'BASKET 2/2' }
const SPAN = (LOOM.box[2] - LOOM.box[0] + 1), LOOM_X0 = LOOM.box[0] - .5
export interface LoomState { draft: DraftName; panel: number; done: number; pick: number; f: number; parked: boolean; x: number; y: number; dir: 1 | -1 }
/**
 * The loom at time t: panel p covers t ∈ (p·P, (p + 1)·P] (so t = 0 is the end of the twill panel, complete, with
 * the shuttle parked at the right selvedge); pick j runs right → left when j is even. Pure in t.
 */
export function loomAt(t: number): LoomState {
  const p = Math.ceil(t / PANEL - 1e-12) - 1, tau = t - p * PANEL, draft = LOOM_ORDER[mod(p + 1, LOOM_ORDER.length)]
  const parked = tau >= PANEL - 1e-9, done = parked ? LOOM.picks : Math.floor(tau / LOOM.PICK + 1e-12), pick = Math.min(done, LOOM.picks - 1)
  const f = parked ? 1 : tau / LOOM.PICK - done, dir: 1 | -1 = pick % 2 === 0 ? -1 : 1
  const x = dir === -1 ? LOOM_X0 + SPAN * (1 - f) : LOOM_X0 + SPAN * f
  return { draft, panel: p, done, pick, f, parked, x, y: LOOM.box[1] + LOOM.W * pick + 1, dir }
}
/** The draft with the card's tie-up edits (data tu0…tu15 flip the top-left 4×4 of the tie-up). */
export function loomDraft(name: DraftName, data: Record<string, number>): Draft {
  const d = DRAFTS[name], flips = Array.from({ length: 16 }, (_, i) => (data[`tu${i}`] ?? 0) >= .5)
  if (!flips.some(Boolean)) return d
  return { ...d, tieup: d.tieup.map((row, s) => row.map((x, t) => (s < 4 && t < 4 && flips[s * 4 + t] ? !x : x))) }
}
const drawdowns = new Map<string, Drawdown>()
const draftKey = (name: DraftName, d: Draft) => `${name}|${d.tieup.map(r => r.map(x => (x ? 1 : 0)).join('')).join('/')}`
function drawdownOf(name: DraftName, d: Draft): Drawdown {
  const k = draftKey(name, d)
  let dd = drawdowns.get(k)
  if (!dd) { drawdowns.set(k, (dd = fromDraft(d))); if (drawdowns.size > 16) drawdowns.delete(drawdowns.keys().next().value!) }
  return dd
}
interface Cloth { height: HeightRaster; tangent: TangentRaster; warp: Raster; n: NormalRaster; ao: Raster }
const cloths = new WeakMap<Drawdown, Cloth>()
/** The panel's full relief, normals and AO (baked once per drawdown; a tie-up edit rebakes, ≤ 12 ms). */
export function loomCloth(dd: Drawdown): Cloth {
  let c = cloths.get(dd)
  if (!c) {
    const r = weaveRelief(dd, TILE, { box: LOOM.box, crossing: LOOM.W, lift: LOOM.lift })
    cloths.set(dd, (c = { ...r, n: normalRaster(r.height), ao: ambientOcclusion(r.height, { radius: 1.5, strength: .5 }) }))
  }
  return c
}
const bareWarp = once(() => weaveRelief(() => true, TILE, { box: LOOM.box, crossing: LOOM.W, lift: LOOM.lift, picks: 0 }))
const loomScratch = scratch(5)
const LOOM_HEAD = .75, LOOM_BANDS: readonly ToneBand[] = [[.06, .3, 'faint'], [.3, .55, 'mid'], [.55, 2, 'idle']]
const DRAFT_Y = 119, TREADLE_X = 110
/** Is card cell (c, r) of the cloth woven at this state (rows above the fell, and the current pick behind the shuttle)? */
export function woven(s: LoomState, c: number, r: number): boolean {
  if (s.parked) return true
  const band = Math.floor((r - LOOM.box[1]) / LOOM.W)
  if (band !== s.pick) return band < s.pick
  return s.dir === -1 ? c + .5 >= s.x : c + .5 <= s.x
}
/**
 * One row of the cloth: the woven cells [wa, wb] take the lit cloth (the body, or the crest a step up where the sheen
 * peaks); the rest of the row shows only the bare warp, a taut thread down each end's centre column.
 */
function loomRow(r: number, wa: number, wb: number, cloth: Cloth, bare: ReturnType<typeof bareWarp> | null, dif: Float32Array, spec: Float32Array, body: Float32Array, crest: Float32Array, warpOnly: Float32Array): void {
  const x0 = LOOM.box[0], x1 = LOOM.box[2], row = r * TILE.cols, M = cloth.height.mask, A = cloth.ao.data, W = cloth.warp.data
  const B = bare ? bare.height.mask : M // no bare warp only when parked: every row is then woven end to end
  for (let c = x0, i = row + x0; c <= x1; c++, i++) {
    if (c >= wa && c <= wb) {
      if (M[i] <= 0) continue
      const b = dif[i] * A[i] * (W[i] ? 1 : .8) * LOOM_HEAD
      if (spec[i] >= .55 && b >= .06) crest[i] = Math.min(1, b + .25)
      else body[i] = b
    } else if (B[i] > 0 && (c - x0) % LOOM.W === 1) warpOnly[i] = .5
  }
}
export const matLoom: WidgetPreset = {
  ...tile, id: 'mat-loom', name: 'Loom', fps: 40,
  defaults: { ...LIGHT_DEFAULTS, ...Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`tu${i}`, 0])) },
  controls: Array.from({ length: 16 }, (_, i) => ({
    key: `tu${i}`, kind: 'toggle' as const, box: [TREADLE_X + 3 * (i % 4) - 1.5, DRAFT_Y + 3 * Math.floor(i / 4) - 1.5, 3, 3] as Box,
    label: `Tie-up: shaft ${Math.floor(i / 4) + 1}, treadle ${(i % 4) + 1}`,
  })),
  layers: ctx => {
    // the bare warp only shows while a panel is being woven: a parked shuttle (t = 0) never needs its relief
    const s = loomAt(ctx.t), draft = loomDraft(s.draft, ctx.data), dd = drawdownOf(s.draft, draft), cloth = loomCloth(dd), bare = s.parked ? null : bareWarp()
    const L = matLight(ctx, { torch: { height: 40, falloff: 160 } }), [dif, spec, body, crest, warpOnly] = loomScratch()
    lambert(cloth.n, L, { ambient: .12, into: dif })
    anisoSpec(cloth.n, cloth.tangent, L, { exponent: 32, into: spec })
    body.data.fill(0); crest.data.fill(0); warpOnly.data.fill(0)
    const [x0, y0, x1, y1] = LOOM.box
    for (let r = y0; r <= y1; r++) {
      // the woven run of this row (≡ woven(s, c, r) per cell): rows above the fell whole, the current pick behind the shuttle
      const band = Math.floor((r - y0) / LOOM.W)
      let wa = x0, wb = x1
      if (!s.parked && band >= s.pick) {
        if (band > s.pick) { wa = x1 + 1; wb = x1 }
        else if (s.dir === -1) wa = Math.max(x0, Math.ceil(s.x - .5))
        else wb = Math.min(x1, Math.floor(s.x - .5))
      }
      loomRow(r, wa, wb, cloth, bare, dif.data, spec.data, body.data, crest.data, warpOnly.data)
    }
    body.bounds = crest.bounds = warpOnly.bounds = LOOM.box
    // the draft: threading under the cloth, tie-up at the corner, treadling beside the cloth
    const set: Pt[] = [], empty: Pt[] = [], current: Pt[] = []
    for (let i = 0; i < LOOM.ends; i++) for (let sh = 0; sh < draft.shafts; sh++) (draft.threading[i % draft.threading.length] === sh ? set : empty).push([x0 + LOOM.W * i + 1, DRAFT_Y + 3 * sh])
    for (let sh = 0; sh < draft.shafts; sh++) for (let tr = 0; tr < draft.treadles; tr++) (draft.tieup[sh][tr] ? set : empty).push([TREADLE_X + 3 * tr, DRAFT_Y + 3 * sh])
    for (let j = 0; j < LOOM.picks; j++) for (let tr = 0; tr < draft.treadles; tr++) {
      const on = draft.treadling[j % draft.treadling.length] === tr, at: Pt = [TREADLE_X + 3 * tr, y0 + LOOM.W * j + 1]
      ;(on ? (!s.parked && j === s.pick ? current : set) : empty).push(at)
    }
    // the shuttle (live), with a two-site trail in its own layer, one and two size steps smaller (no activeDim)
    const shuttle: [number, number, number][] = [[s.x, s.y, 1]]
    if (!s.parked) for (const [back, v] of [[3, .75], [6, .5]] as const) {
      const tx = s.x - s.dir * back
      if (tx >= LOOM_X0 && tx <= LOOM_X0 + SPAN) shuttle.push([tx, s.y, v])
    }
    const name = DRAFT_NAMES[s.draft], n = s.parked ? LOOM.picks : s.pick + 1
    return [
      cite('WEAVING DRAFT'),
      surfaceLayer([[body, LOOM_BANDS], [crest, 'value'], [warpOnly, 'mid']]),
      layer(T.dots(empty, .9), 'faint'), layer(T.dots(set, .9), 'mid'), ...(current.length ? [layer(T.dots(current, .9), 'idle')] : []),
      layer(valuedSites(shuttle, 2.6), 'active'),
      layer(T.text(name, 0, 134), 'idle'),
      layer(T.text(`PICK ${pad2(n)}/${LOOM.picks}`, 143, 134, { align: 'right' }), 'faint'),
    ]
  },
}

// ── 02 KNOB ─ a machined knob: the light slides round its grooves as a bowtie ──────────────────────────
// Spun aluminium on the 1.5 lattice: a chamfered rim on a shallow dome, circumferential (lathe) tangents, Lambert body
// capped at mid with lathe rings a band apart, and the Kajiya–Kay bowtie +1 / +2 steps over it. Knurled skirt, an
// index dimple, and the value arc (the card's live value) in red.
const KNOB = { cx: 48, cy: 50, r: 25 }
export const KNOB_CARD = { x: toCard15(KNOB.cx), y: toCard15(KNOB.cy) }
export const KNOB_ARC = { start: 225 * DEG, sweep: 270 * DEG, r: 56, n: 40 }
const knobGeometry = once(() => {
  const sdf = rasterize(sdfCircle(LG15, KNOB.cx, KNOB.cy, KNOB.r), LG15) // evaluated once for both profiles
  const h = stackHeights(heightRaster(sdf, { shape: 'round', width: 3, height: 2.4 }), heightRaster(sdf, { shape: 'smooth', width: KNOB.r, height: 1.2 }))
  const n = normalRaster(h), t = tangentRadial(LG15, KNOB.cx, KNOB.cy)
  const ring = new Uint8Array(LG15.cols * LG15.rows)
  for (let r = 0; r < LG15.rows; r++) lathe(ring, r)
  return { n, t, ring }
})
/** Row r of the lathe rings: 1 on every other 2-dot ring round the knob's axis. */
function lathe(ring: Uint8Array, r: number): void {
  for (let c = 0, i = r * LG15.cols; c < LG15.cols; c++, i++) ring[i] = Math.floor(Math.hypot(c - KNOB.cx, r - KNOB.cy) / 2) & 1
}
/** Where the value arc's i-th site sits (card cells), and the angle of value v. */
const arcAngle = (v: number) => KNOB_ARC.start + v * KNOB_ARC.sweep
const arcSites = once(() => Array.from({ length: KNOB_ARC.n }, (_, i) => {
  const a = KNOB_ARC.start + (i / (KNOB_ARC.n - 1)) * KNOB_ARC.sweep
  return [KNOB_CARD.x + KNOB_ARC.r * Math.sin(a), KNOB_CARD.y - KNOB_ARC.r * Math.cos(a)] as Pt
}))
const knurl = once(() => {
  const n = Math.round(TAU * 42 / 3), a: Pt[] = [], b: Pt[] = []
  for (let i = 0; i < n; i++) { const t = (i / n) * TAU; (i % 2 ? b : a).push([KNOB_CARD.x + 42 * Math.sin(t), KNOB_CARD.y - 42 * Math.cos(t)]) }
  return { a, b }
})
const knobScratch = scratch(5, LG15)
/**
 * The knob as a dial (`Control.map`): v follows the pointer's angle round the knob over the value arc, so a tap on
 * the arc jumps there; outside the arc it snaps to the nearer end, and at the axle (no angle) it keeps its value.
 */
export function knobDial(x: number, y: number, v: number): number {
  const dx = x - KNOB_CARD.x, dy = y - KNOB_CARD.y
  if (Math.hypot(dx, dy) < 7) return v
  const rel = mod(Math.atan2(dx, -dy) - KNOB_ARC.start, TAU)
  return rel <= KNOB_ARC.sweep ? rel / KNOB_ARC.sweep : rel - KNOB_ARC.sweep < TAU - rel ? 1 : 0
}
/** The knob's specular raster for a light (exported for the bowtie check). */
export function knobSpec(L: Light): Raster {
  const g = knobGeometry(), out = createRaster(LG15)
  anisoSpec(g.n, g.t, L, { exponent: 80, into: out })
  return out
}
export const matKnob: WidgetPreset = {
  ...tile, id: 'mat-knob', name: 'Knob',
  defaults: { ...LIGHT_DEFAULTS, v: .72 },
  springKeys: ['v'],
  controls: [{ key: 'v', kind: 'knob', box: [KNOB_CARD.x - 60, KNOB_CARD.y - 60, 120, 120], map: knobDial, label: 'Volume' }],
  layers: ctx => {
    const v = Math.max(0, Math.min(1, ctx.data.v ?? .72)), g = knobGeometry(), [dif, spec, body, rim, core] = knobScratch()
    const L = matLight(ctx, { lattice: L15, torch: { height: 40, falloff: 150 }, pressed: true })
    lambert(g.n, L, { ambient: .12, into: dif })
    anisoSpec(g.n, g.t, L, { exponent: 80, into: spec })
    body.data.fill(0); rim.data.fill(0); core.data.fill(0)
    const a = arcAngle(v), dx = KNOB_CARD.x + 29 * Math.sin(a), dy = KNOB_CARD.y - 29 * Math.cos(a), step = .25
    const [c0, r0, c1, r1] = g.n.bounds ?? [0, 0, LG15.cols - 1, LG15.rows - 1], cols = LG15.cols
    const K = g.n.mask, D = dif.data, S = spec.data, B = body.data, R = rim.data, C = core.data, ring = g.ring
    for (let r = r0; r <= r1; r++) {
      const ry = toCard15(r) - dy, nearRow = Math.abs(ry) < 2.6
      for (let c = c0, i = r * cols + c0; c <= c1; c++, i++) {
        if (K[i] < .5) continue
        if (nearRow) { const rx = toCard15(c) - dx; if (Math.abs(rx) < 2.6 && Math.hypot(rx, ry) < 2.6) continue } // the dimple's pit
        // the body is capped at mid (× .62: 1 − 2 steps); the bowtie is +1 step (idle) at .25, +2 (value) at .55
        const b = D[i] * .62, p = S[i]
        if (p >= .55 && b >= .06) C[i] = Math.min(1, b + 2 * step)
        else if (p >= .25 && b >= .06) R[i] = Math.min(1, b + step)
        else B[i] = ring[i] ? b * .62 : b // lathe rings: a band lower on every other 2-dot ring
      }
    }
    body.bounds = rim.bounds = core.bounds = g.n.bounds
    const on = Math.round(v * KNOB_ARC.n), sites = arcSites(), k = knurl()
    return [
      cite('KAJIYA-KAY 1989'),
      surfaceLayer([[body, MATTE_BANDS], [rim, 'idle'], [core, 'value']], L15),
      layer(T.dots(k.a, .9), 'mid'), layer(T.dots(k.b, .9), 'faint'),
      layer(T.dots([[dx, dy]], 2.2), 'faint'),
      layer(T.dots(sites.slice(on), 1.2), 'faint'),
      ...(on > 0 ? [layer(T.dots(sites.slice(0, on), 1.4), 'active')] : []),
      layer(T.big(`VOL ${pad2(Math.round(v * 100))}`, 72, 132, { lattice: 1.3, align: 'center' }), 'idle'),
    ]
  },
}

// ── 03 GRILLE ─ a perforated metal grille, lit from behind by the music ───────────────────────────────
// A brushed plate with 1.8-cell holes on a hex lattice (pitch 6), a 1-cell moat and an AO ring round every hole. The
// holes light bottom-up with a synthetic 120 bpm signal (11 bands × 2 columns); the single highest peak-hold is red.
const GRILLE = { box: [4, 14, 139, 129] as Box, pitch: 6, row: 5.196, rows: 22 }
export interface Hole { x: number; y: number; col: number }
/** The holes: even rows at x = 6 + 6i (23), odd rows offset by 3 (22); VU column k holds x ∈ [6 + 6k, 12 + 6k). */
export const grilleHoles = once((): Hole[] => {
  const out: Hole[] = []
  for (let j = 0; j < GRILLE.rows; j++) {
    const y = 17 + GRILLE.row * j, odd = j % 2 === 1
    for (let i = 0; i < (odd ? 22 : 23); i++) { const x = (odd ? 9 : 6) + GRILLE.pitch * i; out.push({ x, y, col: Math.floor((x - 6) / GRILLE.pitch) }) }
  }
  return out
})
/** The cells of a row of holes, relative to a hole's (whole-cell) x: rows `dr`, column offsets `dc`; the rows it can reach, r0 … r1. */
interface HoleStamp { dr: number[]; dc: number[]; r0: number; r1: number }
/** Row r, columns c0 … c1 round the hole at x: keep the smaller squared distance to one of its cells. */
function stampRow(D2: Float64Array, st: HoleStamp, x: number, r: number, c0: number, c1: number): void {
  const n = st.dr.length
  for (let c = c0, i = r * TILE.cols + c0; c <= c1; c++, i++) {
    let m = D2[i]
    for (let k = 0; k < n; k++) { const dy = r - st.dr[k], dx = c - x - st.dc[k], q = dx * dx + dy * dy; if (q < m) m = q }
    D2[i] = m
  }
}
/**
 * Cells i … end of one plate row from the squared distance to the holes: void in the hole and its 1-cell moat, then
 * a 1.5-cell bevel up to the flat plate. Per-row helpers like this keep the bakes' inner loops small and hot.
 */
function plateRow(D2: Float64Array, P: Float32Array, K: Float32Array, i: number, end: number): void {
  for (; i <= end; i++) {
    const s = Math.fround(Math.sqrt(D2[i]) - .5) // the distance to the hole's edge, as distanceRaster stores it
    if (s <= 1.5) continue
    K[i] = 1; P[i] = Math.min(1, (s - 1.5) / 1.5) * .5 + .5
  }
}
const grillePlate = once(() => {
  const { cols, rows } = TILE, [x0, y0, x1, y1] = GRILLE.box
  // Squared distance (cells²) from each cell to the nearest hole cell, stamped round every hole: exact wherever it is
  // < 16 (the plate only slopes within 3.5 cells: the moat ends at 2, the bevel at 3.5); cells 4+ cells from every
  // hole stay ∞ and read as flat plate. ≡ distanceRaster of the hole mask (an EDT finds the same integer d²), without
  // full-grid passes. A hole's cells lie within .9 of its centre; x is a whole cell, so they only depend on the row.
  const D2 = new Float64Array(cols * rows).fill(Infinity)
  let stampY = NaN, st: HoleStamp = { dr: [], dc: [], r0: 0, r1: 0 }
  for (const h of grilleHoles()) {
    if (h.y !== stampY) {
      stampY = h.y; st = { dr: [], dc: [], r0: 0, r1: 0 }
      for (let r = Math.floor(h.y - 1); r <= Math.ceil(h.y + 1); r++) for (let dc = -1; dc <= 1; dc++) if (Math.hypot(dc, r - h.y) <= .9) { st.dr.push(r); st.dc.push(dc) }
      st.r0 = Math.max(0, st.dr[0] - 3); st.r1 = Math.min(rows - 1, st.dr[st.dr.length - 1] + 3)
    }
    for (let r = st.r0; r <= st.r1; r++) stampRow(D2, st, h.x, r, Math.max(0, h.x - 4), Math.min(cols - 1, h.x + 4))
  }
  const plate = createRaster(TILE, 'card', GRILLE.box), mask = createRaster(TILE, 'card', GRILLE.box), P = plate.data, K = mask.data
  for (let r = y0; r <= y1; r++) plateRow(D2, P, K, r * cols + x0, r * cols + x1)
  const h = heightFromField(plate, TILE, { scale: 1.5, mask })
  return { n: normalRaster(h), ao: ambientOcclusion(h, { radius: 1.5, strength: .8 }), t: tangentLinear(TILE, 0, GRILLE.box), mask }
})
const BEAT = .5, BANDS = 11, VU_COLS = 22, VU_HOLES = 22, HOLD = .8, FALL = 6
/** The band's target level at signal time s: kick on beats, a hat on off-beats (bands 8–10), per-beat variation. */
/** Per-band bass shape (1 − b/11)^1.3. */
const SHAPE = Array.from({ length: BANDS }, (_, b) => dpow(1 - b / BANDS, 1.3))
/** The beat envelopes at signal time s: kick on beats, hat on off-beats (shared by every band). */
const beatAt = (s: number) => { const beat = Math.floor(s / BEAT), ph = s - beat * BEAT; return { beat, kick: dexp(-7 * ph), hat: .6 * dexp(-16 * mod(s - BEAT / 2, BEAT)) } }
/** The per-beat variation of every band. */
const varyOf = (beat: number, into: Float64Array) => { for (let b = 0; b < BANDS; b++) into[b] = .75 + .25 * hash01(beat, b, 5) }
const levelOf = (b: number, kick: number, hat: number, vary: number) => Math.min(1, .05 + .92 * kick * SHAPE[b] * vary + (b >= 8 ? hat * vary : 0))
const targetOf = (b: number, beat: number, kick: number, hat: number) => levelOf(b, kick, hat, .75 + .25 * hash01(beat, b, 5))
/** One 60 Hz step of a VU column: the two one-pole follower and the peak-hold. */
function vuFollow(f1: Float64Array, f2: Float64Array, peak: Float64Array, at: Float64Array, col: number, target: number, a: number, now: number): void {
  f1[col] += (target - f1[col]) * a; f2[col] += (f1[col] - f2[col]) * a
  const held = peak[col] - Math.max(0, now - at[col] - HOLD) * FALL / VU_HOLES
  if (f2[col] >= held) { peak[col] = f2[col]; at[col] = now }
}
/** The band's target level at signal time s: kick on beats, a hat on off-beats (bands 8–10), per-beat variation. */
export function grilleTarget(b: number, s: number): number { const e = beatAt(s); return targetOf(b, e.beat, e.kick, e.hat) }
export interface VU { lit: number[]; peak: number[] }
/**
 * Lit holes and peak-hold per VU column at signal time s: a critically damped follower (two one-poles, 60 ms
 * half-life) and a peak that holds 0.8 s then falls 6 holes/s, integrated on a fixed 60 Hz grid from s − 5 s, so the
 * result is a pure function of s.
 */
export function grilleVU(s: number, kick = false): VU {
  const dt = 1 / 60, a = 1 - dexp(-dt * Math.LN2 / .06), k0 = Math.floor((s - 5) / dt), k1 = Math.floor(s / dt)
  const f1 = new Float64Array(VU_COLS), f2 = new Float64Array(VU_COLS), peak = new Float64Array(VU_COLS), at = new Float64Array(VU_COLS).fill(-1e9)
  // the per-beat variation only changes once a beat (30 steps): hash it once per beat, not once per step
  const vary = new Float64Array(BANDS)
  let varyBeat = NaN
  for (let k = k0; k <= k1; k++) {
    const now = k * dt, e = beatAt(now)
    if (e.beat !== varyBeat) { varyBeat = e.beat; varyOf(e.beat, vary) }
    for (let b = 0; b < BANDS; b++) {
      const x = levelOf(b, e.kick, e.hat, vary[b])
      vuFollow(f1, f2, peak, at, 2 * b, x, a, now)
      vuFollow(f1, f2, peak, at, 2 * b + 1, x * .9, a, now)
    }
  }
  const now = k1 * dt, lit: number[] = [], pk: number[] = []
  for (let col = 0; col < VU_COLS; col++) {
    const level = kick ? .95 : f2[col], n = Math.max(0, Math.min(VU_HOLES, Math.round(level * VU_HOLES)))
    const held = kick ? .95 : peak[col] - Math.max(0, now - at[col] - HOLD) * FALL / VU_HOLES
    lit.push(n); pk.push(Math.max(n, Math.min(VU_HOLES, Math.round(held * VU_HOLES))))
  }
  return { lit, peak: pk }
}
/** VU column → its holes from the bottom up. */
const vuColumns = once(() => {
  const by: Hole[][] = Array.from({ length: VU_COLS }, () => [])
  for (const h of grilleHoles()) if (h.col < VU_COLS) by[h.col].push(h)
  for (const c of by) c.sort((p, q) => q.y - p.y)
  return by
})
/** The single live peak: the column with the highest peak-hold (ties → the lower band index). */
export const livePeak = (vu: VU) => { let best = 0; for (let c = 1; c < VU_COLS; c++) if (vu.peak[c] > vu.peak[best]) best = c; return vu.peak[best] > 0 ? best : -1 }
const grilleScratch = scratch(2)
const plates = new Map<string, Layer>()
const lightKey = (L: Light) => (Array.isArray(L) ? (L as readonly number[]).map(x => x.toFixed(5)).join(',') : `${(L as { at: readonly number[] }).at.map(x => x.toFixed(3)).join(',')}|${(L as { falloff?: number }).falloff ?? 0}`)
/** Cells i … end of one row of the lit plate: the body faint / mid (Lambert × .4 × AO), the brushed streak a step up in idle. */
function grilleRow(K: Float32Array, A: Float32Array, D: Float32Array, S: Float32Array, V: Float32Array, tones: Uint8Array, i: number, end: number): void {
  for (; i <= end; i++) {
    if (!K[i]) continue
    const b = D[i] * .4 * A[i]
    if (b < .06) continue
    if (S[i] >= .35) { V[i] = Math.min(1, b + .25); tones[i] = 2 } else { V[i] = b; tones[i] = b < .2 ? 0 : 1 } // idle; faint / mid
  }
}
/**
 * The plate's shading for one light, as one multi-tone surface (body faint / mid, the brushed streak idle), cached per
 * light (LRU of 8; M §3.2's mitigation): the sun and the tilt hub's buckets repeat, so only a moving torch re-shades.
 */
export function grilleSurface(L: Light): Layer {
  const key = lightKey(L), hit = plates.get(key)
  if (hit) { plates.delete(key); plates.set(key, hit); return hit }
  const g = grillePlate(), [dif, spec] = grilleScratch()
  lambert(g.n, L, { ambient: .1, into: dif })
  anisoSpec(g.n, g.t, L, { exponent: 40, into: spec })
  const values = createRaster(TILE, 'card', GRILLE.box), tones = new Uint8Array(TILE.cols * TILE.rows), V = values.data
  const [x0, y0, x1, y1] = GRILLE.box, cols = TILE.cols
  for (let r = y0; r <= y1; r++) grilleRow(g.mask.data, g.ao.data, dif.data, spec.data, V, tones, r * cols + x0, r * cols + x1)
  const out = tonedLayer(values, tones)
  plates.set(key, out)
  if (plates.size > 8) plates.delete(plates.keys().next().value!)
  return out
}
export const matGrille: WidgetPreset = {
  ...tile, id: 'mat-grille', name: 'Grille',
  defaults: { ...LIGHT_DEFAULTS, k: 0 },
  controls: [{ key: 'k', kind: 'button', box: [GRILLE.box[0], GRILLE.box[1], GRILLE.box[2] - GRILLE.box[0], GRILLE.box[3] - GRILLE.box[1]], label: 'Kick' }],
  layers: ctx => {
    const plate = grilleSurface(matLight(ctx, { torch: { height: 36, falloff: 170 } }))
    const vu = grilleVU(ctx.t + .12, (ctx.data.k ?? 0) >= .5), live = livePeak(vu), by = vuColumns()
    const groups: Record<'idle' | 'value' | 'mid' | 'active', Pt[]> = { idle: [], value: [], mid: [], active: [] }
    for (let col = 0; col < VU_COLS; col++) {
      const holes = by[col], n = vu.lit[col], p = vu.peak[col]
      for (let i = 0; i < n; i++) groups[i === n - 1 && !(col === live && p === n) ? 'value' : 'idle'].push([holes[i].x, holes[i].y])
      if (col === live) groups.active.push([holes[p - 1].x, holes[p - 1].y])
      else if (p > n) groups.mid.push([holes[p - 1].x, holes[p - 1].y])
    }
    // the live peak replaces whatever hole it sits on
    if (live >= 0 && vu.peak[live] === vu.lit[live]) groups.idle = groups.idle.filter(q => !(q[0] === groups.active[0][0] && q[1] === groups.active[0][1]))
    return [
      cite('BRUSHED · AO'),
      plate,
      layer(T.dots(groups.idle, 2.2), 'idle'), layer(T.dots(groups.value, 2.2), 'value'), layer(T.dots(groups.mid, 2.2), 'mid'),
      ...(groups.active.length ? [layer(T.dots(groups.active, 2.2), 'active')] : []),
      layer(T.text('120 BPM', 0, 134), 'mid'), layer(T.text('L+R', 143, 134, { align: 'right' }), 'faint'),
    ]
  },
}

// ── 04 MARBLE ─ the time, cut into marble, read by raking light ────────────────────────────────────────
// A chamfered plaque on the 1.5 lattice, Perlin turbulence-sine marble (veins a band lower), HH MM engraved as a
// V-groove (lit wall / dark wall under a light raked to ≤ 18°), the year below. The colon is the live red.
const PLAQUE = sdfBox(LG15, 48, 48, 44, 36, 4)
const plaqueHeight = once(() => heightRaster(PLAQUE, { shape: 'linear', width: 2, height: 1.5 }, LG15))
const marbleBody = once(() => marble(LG15, { period: 20, sharp: 2.5 }))
const ROMAN: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
export const roman = (n: number) => { let s = ''; for (const [v, r] of ROMAN) while (n >= v) { s += r; n -= v } return s }
const HERO_ROW = 50, YEAR_ROW = 61
/** The hero's lattice: 2 (smooth `00:00` is 58 dots wide, 116 cells: the plan's 2.5 would overrun the 132-cell plaque). */
const HERO_K = 2
/** A card-cell mask down-sampled to the 1.5 lattice: a lattice cell is lit when ≥ 50% of the card cells in it are. */
function toLattice15(m: Raster): Raster {
  const out = createRaster(LG15), cols = TILE.cols, [b0, b1, b2, b3] = rasterWindow(m)
  // lattice cell j covers card rows ⌈1.5j − ½⌉ … < 1.5(j + 1) − ½: only cells over the mask's bounds can be lit
  const ja = Math.max(0, Math.floor((b1 + .5) / L15) - 1), jb = Math.min(LG15.rows - 1, Math.ceil((b3 + .5) / L15))
  const ia = Math.max(0, Math.floor((b0 + .5) / L15) - 1), ib = Math.min(LG15.cols - 1, Math.ceil((b2 + .5) / L15))
  for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) {
    let lit = 0, all = 0
    for (let r = Math.ceil(j * L15 - .5); r < (j + 1) * L15 - .5; r++) for (let c = Math.ceil(i * L15 - .5); c < (i + 1) * L15 - .5; c++) { all++; lit += m.data[r * cols + c] }
    if (all && lit / all >= .5) out.data[j * LG15.cols + i] = 1
  }
  return out
}
export interface Engraving { key: string; n: NormalRaster; ao: Raster; hero: Raster; year: Raster; colon: Pt[]; clear: Uint8Array }
const engravings = new Map<string, Engraving>()
/** The engraving of one minute (LRU of 2): height, normals and AO of the plaque with `HH MM` and the year cut in. */
export function engraving(hh: string, mm: string, year: number): Engraving {
  const key = `${hh}:${mm}|${year}`, hit = engravings.get(key)
  if (hit) { engravings.delete(key); engravings.set(key, hit); return hit }
  const opts = { lattice: HERO_K, smooth: true, align: 'center' as const }
  const full = cardMask(T.big(`${hh}:${mm}`, 72, HERO_ROW, opts), TILE), cut = cardMask(T.big(`${hh} ${mm}`, 72, HERO_ROW, opts), TILE)
  // the colon's two dots: what the full string lights and the spaced one doesn't, split top / bottom
  const pts: Pt[] = [], [f0, f1, f2, f3] = rasterWindow(full)
  for (let r = f1; r <= f3; r++) for (let c = f0; c <= f2; c++) if (full.data[r * TILE.cols + c] && !cut.data[r * TILE.cols + c]) pts.push([c, r])
  const midY = pts.reduce((s, p) => s + p[1], 0) / Math.max(1, pts.length)
  const centroid = (q: Pt[]): Pt => [q.reduce((s, p) => s + p[0], 0) / q.length, q.reduce((s, p) => s + p[1], 0) / q.length]
  const top = pts.filter(p => p[1] < midY), bottom = pts.filter(p => p[1] >= midY), colon = top.length && bottom.length ? [centroid(top), centroid(bottom)] : []
  const hero = toLattice15(cut), year15 = rasterize(layoutFor(LG15).text(`ANNO ${roman(year)}`, 48, YEAR_ROW, { align: 'center' }), LG15)
  // the year is a hairline (1-dot strokes): drawn as void, not relief, so its AO doesn't swallow the gaps between letters
  const h = stackHeights(plaqueHeight(), heightRaster(insetDistance(hero), { shape: 'linear', width: 1.6, height: -1.8 }))
  // the colon's sites sit over the plaque lattice: clear the stone under them (sites don't hide lattice dots)
  const clear = new Uint8Array(LG15.cols * LG15.rows)
  // only the lattice cells within 3 cells of a colon dot (their box, then the exact distance test)
  for (const [x, y] of colon) {
    const ia = Math.max(0, Math.floor((x - 3 + .5) / L15 - .5)), ib = Math.min(LG15.cols - 1, Math.ceil((x + 3 + .5) / L15 - .5))
    const ja = Math.max(0, Math.floor((y - 3 + .5) / L15 - .5)), jb = Math.min(LG15.rows - 1, Math.ceil((y + 3 + .5) / L15 - .5))
    for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) if (Math.hypot(toCard15(i) - x, toCard15(j) - y) < 3) clear[j * LG15.cols + i] = 1
  }
  const e: Engraving = { key, n: normalRaster(h), ao: ambientOcclusion(h, { radius: 2, strength: .7 }), hero, year: year15, colon, clear }
  engravings.set(key, e)
  if (engravings.size > 2) engravings.delete(engravings.keys().next().value!)
  return e
}
const marbleScratch = scratch(4, LG15)
/** Cells i … end of one plaque row: the exposed, veined, occluded body, or the polish a step up where the highlight is. */
function marbleRow(e: Engraving, M: Float32Array, D: Float32Array, S: Float32Array, B: Float32Array, P: Float32Array, gain: number, i: number, end: number): void {
  const N = e.n.mask, Y = e.year.data, C = e.clear, A = e.ao.data
  for (; i <= end; i++) {
    if (N[i] < .5 || Y[i] || C[i]) continue // the year: a hairline cut in its own shadow (void letters)
    const b = Math.min(1, Math.max(0, D[i] - .1) * gain) * (.55 + .45 * M[i]) * A[i]
    if (S[i] >= .35 && b >= .06) P[i] = Math.min(1, b + .25)
    else B[i] = b
  }
}
/**
 * The plaque's lit body and polish for one light (rasters on the 1.5 lattice, reused per frame). Exposure: the flat
 * face reads at .62 whatever the light (a raked sun alone would leave it faint); walls turned to the light climb past
 * it, walls turned away fall to void. Veins drop the body a band (x .55), AO darkens the groove floors.
 */
export function marbleLit(e: Engraving, L: Light): { body: Raster; polish: Raster } {
  const M = marbleBody().data, [dif, spe, body, polish] = marbleScratch()
  illuminate(e.n, L, { ambient: .1, shininess: 40, into: dif, intoSpecular: spe })
  body.data.fill(0); polish.data.fill(0)
  const cols = LG15.cols, [c0, r0, c1, r1] = e.n.bounds ?? [0, 0, cols - 1, LG15.rows - 1]
  const Ld = Array.isArray(L) ? L as readonly number[] : [0, 0, 1], Lz = Ld[2] / (Math.hypot(Ld[0], Ld[1], Ld[2]) || 1), gain = .58 / (.9 * Math.max(.05, Lz))
  for (let r = r0; r <= r1; r++) marbleRow(e, M, dif.data, spe.data, body.data, polish.data, gain, r * cols + c0, r * cols + c1)
  body.bounds = polish.bounds = e.n.bounds
  return { body, polish }
}
export const matMarble: WidgetPreset = {
  ...tile, id: 'mat-marble', name: 'Marble', clock: true,
  defaults: { ...LIGHT_DEFAULTS },
  layers: ctx => {
    const now = new Date(), e = engraving(pad2(now.getHours()), pad2(now.getMinutes()), now.getFullYear())
    const { body, polish } = marbleLit(e, matLight(ctx, { lattice: L15, torch: { height: 14, falloff: 120 }, rake: true }))
    const on = ctx.reducedMotion || mod(ctx.t, 1) < .5
    return [
      cite('PERLIN 1985'),
      surfaceLayer([[body, MATTE_BANDS], [polish, 'value']], L15),
      ...(on && e.colon.length ? [layer(T.dots(e.colon, 2), 'active')] : []),
    ]
  },
}

// ── 05 TERRAZZO ─ the month, set in stone: each day a chip, today's chip red ─────────────────────────────
// A pillowed slab on the 1.5 lattice; one irregular chip per day (superellipse, rotated, noise-warped edge), past days
// polished (+1 step where the sheen crosses), future days honed, today red. Poisson aggregate in three sizes between.
const SLAB = { x0: 7, x1: 137, y0: 50, y1: 137, colPitch: 18.5 }
const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'], WEEKDAY = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']
export interface Month { year: number; month: number; days: number; offset: number; rows: number; centres: Pt[]; radius: number; chip: Int16Array; keepOut: Raster; aggregate: ReturnType<typeof terrazzo>; pillow: NormalRaster }
const colX = (col: number) => SLAB.x0 + SLAB.colPitch / 2 + SLAB.colPitch * col
const months = new Map<string, Month>()
/** One day's chip: centre (card cells), superellipse exponent, rotation (cos, sin), radius and box reach. */
interface ChipShape { d: number; cx: number; cy: number; e: number; co: number; si: number; radius: number; reach: number; seed: number }
type ChipBox = [number, number, number, number]
/** Lattice cells ia … ib of row j that day `s.d`'s noise-warped, rotated superellipse covers (unless an earlier day took them); grows `laid`. */
function chipRow(chip: Int16Array, s: ChipShape, j: number, ia: number, ib: number, laid: ChipBox): void {
  const y = toCard15(j), dy = y - s.cy, { cx, e, co, si, radius, reach, seed } = s
  if (y < SLAB.y0 || y > SLAB.y1 || Math.abs(dy) > reach) return
  for (let i = ia, k = j * LG15.cols + ia; i <= ib; i++, k++) {
    if (chip[k] >= 0) continue
    const x = toCard15(i)
    if (x < SLAB.x0 || x > SLAB.x1) continue
    const dx = x - cx
    if (Math.abs(dx) > reach) continue
    const u = dx * co + dy * si, w = -dx * si + dy * co
    const rse = (Math.abs(u) ** e + Math.abs(w) ** e) ** (1 / e)
    if (rse <= radius + .7 * noise2(x * .35, y * .35, seed)) {
      chip[k] = s.d
      if (i < laid[0]) laid[0] = i
      if (j < laid[1]) laid[1] = j
      if (i > laid[2]) laid[2] = i
      if (j > laid[3]) laid[3] = j
    }
  }
}
/** One month of chips, aggregate and slab normals (baked once per month). Day d is at Monday-first index d − 1 + offset. */
export function monthOf(year: number, month: number): Month {
  const key = `${year}-${month}`, hit = months.get(key)
  if (hit) return hit
  const days = new Date(year, month + 1, 0).getDate(), offset = (new Date(year, month, 1).getDay() + 6) % 7
  const rows = Math.ceil((offset + days) / 7), rowPitch = (SLAB.y1 - SLAB.y0 + 1) / rows, radius = Math.min(5.6, rowPitch * .32)
  const seed = year * 12 + month
  const centres: Pt[] = Array.from({ length: days }, (_, d) => {
    const idx = d + offset, col = idx % 7, row = Math.floor(idx / 7)
    return [colX(col) + (hash01(seed, d, 1) - .5) * 3, SLAB.y0 + rowPitch * (row + .5) + (hash01(seed, d, 2) - .5) * 3]
  })
  const chip = new Int16Array(LG15.cols * LG15.rows).fill(-1), keep = createRaster(TILE), LC = LG15.cols, reach = radius + 1.5
  // each lattice cell takes the first day whose (noise-warped, rotated superellipse) chip covers it: walk the days in
  // order over each chip's own box, skipping cells an earlier day took (≡ testing every day per cell, ~30× fewer tests)
  const laid: ChipBox = [LC, LG15.rows, -1, -1]
  for (let d = 0; d < days; d++) {
    const s: ChipShape = { d, cx: centres[d][0], cy: centres[d][1], e: 2.5 + 1.5 * hash01(seed, d, 3), co: 0, si: 0, radius, reach, seed }, rot = hash01(seed, d, 4) * Math.PI
    s.co = Math.cos(rot); s.si = Math.sin(rot)
    const ia = Math.max(0, Math.floor((s.cx - reach + .5) / L15 - .5)), ib = Math.min(LC - 1, Math.ceil((s.cx + reach + .5) / L15 - .5))
    const ja = Math.max(0, Math.floor((s.cy - reach + .5) / L15 - .5)), jb = Math.min(LG15.rows - 1, Math.ceil((s.cy + reach + .5) / L15 - .5))
    for (let j = ja; j <= jb; j++) chipRow(chip, s, j, ia, ib, laid)
  }
  const [i0, j0, i1, j1] = laid
  // card cell (c, r) lies in lattice cell ⌊(c + ½) / 1.5⌋: only the cells over the chips' lattice box can be kept
  const ca = Math.max(0, Math.floor(i0 * L15 - .5)), cb = Math.min(TILE.cols - 1, Math.ceil((i1 + 1) * L15)), ra = Math.max(0, Math.floor(j0 * L15 - .5)), rb = Math.min(TILE.rows - 1, Math.ceil((j1 + 1) * L15))
  const toLat = cellToLattice15(), K = keep.data
  for (let r = ra; r <= rb; r++) {
    const j = toLat[r]
    if (j >= LG15.rows) continue
    for (let c = ca; c <= cb; c++) { const i = toLat[c]; if (i < LC && chip[j * LC + i] >= 0) K[r * TILE.cols + c] = 1 }
  }
  keep.bounds = i1 < 0 ? [0, 0, -1, -1] : [ca, ra, cb, rb]
  const keepOut = createRaster(TILE, 'card', rasterWindow(keep, 1))
  for (let r = keepOut.bounds![1]; r <= keepOut.bounds![3]; r++) grow3(K, keepOut.data, r, keepOut.bounds![0], keepOut.bounds![2])
  const aggregate = terrazzo([SLAB.x0, SLAB.y0, SLAB.x1, SLAB.y1], { d: 3.4, seed, keepOut })
  const sx = (SLAB.x0 + .5) / L15 - .5, ex = (SLAB.x1 + .5) / L15 - .5, sy = (SLAB.y0 + .5) / L15 - .5, ey = (SLAB.y1 + .5) / L15 - .5
  const pillow = normalRaster(heightRaster(sdfBox(LG15, (sx + ex) / 2, (sy + ey) / 2, (ex - sx) / 2, (ey - sy) / 2, 4), { shape: 'smooth', width: 10, height: 2 }, LG15))
  const m: Month = { year, month, days, offset, rows, centres, radius, chip, keepOut, aggregate, pillow }
  months.set(key, m)
  if (months.size > 2) months.delete(months.keys().next().value!)
  return m
}
/** The day (0-based) whose chip is at card point (x, y), or −1. */
export function chipAt(m: Month, x: number, y: number): number {
  let best = -1, bd = Infinity
  m.centres.forEach(([cx, cy], d) => { const dd = Math.hypot(x - cx, y - cy); if (dd < bd) { bd = dd; best = d } })
  return bd <= m.radius + 1.5 ? best : -1
}
/** Row r, cells c0 … c1 of a 0/1 mask grown by one cell (3×3 max, off-card cells ignored): ≡ dilate(mask, 1.5), whose disc is the 3×3. */
function grow3(src: Float32Array, dst: Float32Array, r: number, c0: number, c1: number): void {
  const cols = TILE.cols, ra = Math.max(0, r - 1), rb = Math.min(TILE.rows - 1, r + 1)
  for (let c = c0; c <= c1; c++) {
    const ca = Math.max(0, c - 1), cb = Math.min(cols - 1, c + 1)
    let m = 0
    for (let y = ra; y <= rb && !m; y++) for (let x = ca; x <= cb; x++) if (src[y * cols + x] > m) { m = src[y * cols + x]; break }
    dst[r * cols + c] = m
  }
}
/** Lattice cells i … end: each day's chip as today (red), past (honed, or polished under the sheen) or future. */
function chipTones(chip: Int16Array, today: number, spec: Float32Array, past: Float32Array, polished: Float32Array, future: Float32Array, now1: Float32Array, i: number, end: number): void {
  for (; i <= end; i++) {
    const d = chip[i]
    if (d < 0) continue
    if (d === today) now1[i] = 1
    else if (d < today) { if (spec[i] > .3) polished[i] = 1; else past[i] = .75 }
    else future[i] = .5
  }
}
const TZ_BOX: Box = [SLAB.x0 - 4, SLAB.y0 - 4, SLAB.x1 - SLAB.x0 + 8, SLAB.y1 - SLAB.y0 + 8]
const tzScratch = scratch(5, LG15)
export const matTerrazzo: WidgetPreset = {
  ...tile, id: 'mat-terrazzo', name: 'Terrazzo', clock: true,
  defaults: { ...LIGHT_DEFAULTS, px: 0, py: 1 },
  controls: [{ key: 'px', keyY: 'py', kind: 'xy', box: TZ_BOX, label: 'Preview a day' }],
  layers: ctx => {
    const now = new Date(), m = monthOf(now.getFullYear(), now.getMonth()), today = now.getDate() - 1
    const L = matLight(ctx, { lattice: L15, torch: { height: 30, falloff: 140 } }), [spec, past, polished, future, now1] = tzScratch()
    phong(m.pillow, L, [0, 0, 1], 40, { into: spec })
    // preview: the hovering pointer, else the tapped point (the xy control), else today
    const p = ctx.pointers?.find(q => q.inside && !q.up && !q.down)
    const tapped = chipAt(m, TZ_BOX[0] + (ctx.data.px ?? 0) * TZ_BOX[2], TZ_BOX[1] + TZ_BOX[3] - (ctx.data.py ?? 1) * TZ_BOX[3])
    const hovered = p ? chipAt(m, p.x, p.y) : -1, preview = hovered >= 0 ? hovered : tapped
    for (const r of [past, polished, future, now1]) { r.data.fill(0); r.bounds = m.pillow.bounds }
    for (let r = 0; r < LG15.rows; r++) chipTones(m.chip, today, spec.data, past.data, polished.data, future.data, now1.data, r * LG15.cols, (r + 1) * LG15.cols - 1)
    const sheen = sample(spec), N = TILE.cols - 1
    const agg = (lift: number): Field => (u, v) => (sheen(((u * N + .5) / L15 - .5) / (LG15.cols - 1), ((v * N + .5) / L15 - .5) / (LG15.rows - 1)) > .3 ? 1 : lift)
    const shown = preview >= 0 && preview !== today ? preview : today, weekday = WEEKDAY[(shown + m.offset) % 7]
    const out: Layer[] = [
      cite('POISSON DISC'),
      layer(cap(`${MONTHS[m.month]} ${m.year}`, 0, 14), 'mid'),
      layer(T.big(pad2(shown + 1), 140, 12, { lattice: 2.5, smooth: true, align: 'right' }), shown === today ? 'value' : 'mid'),
      layer(cap(weekday, 0, 22), shown === today ? 'faint' : 'mid'),
      ...WEEK.map((w, i) => layer(cap(w, colX(i), 44, 'center'), 'faint')),
      { field: agg(.75), sites: m.aggregate.a, size: 1.6, tone: 'mid' }, { field: agg(.75), sites: m.aggregate.b, size: 1.15, tone: 'faint' }, { field: agg(.75), sites: m.aggregate.c, size: .85, tone: 'faint' },
      surfaceLayer([[future, 'mid'], [past, 'idle'], [polished, 'value']], L15),
    ]
    if (today >= 0 && today < m.days) out.push(rasterLayer(now1, 'active', L15))
    return out
  },
}

/** M1 (loom … terrazzo), then M2: glass and water (lens, pool, window), then wear (patch, rust, candle). */
export const materialsBoard = [matLoom, matKnob, matGrille, matMarble, matTerrazzo, matLens, matPool, matWindow, matPatch, matRust, matCandle]
/** Live data for the board: the light / tilt hub (F0), subscribed while the board is open. */
export const materialsSources = [lightSource]
/** The board's internals, for the checks (`scripts/materials.ts`). */
export const materialsHooks = {
  LOOM, LOOM_ORDER, loomAt, loomDraft, loomCloth, drawdownOf, woven, KNOB_ARC, KNOB_CARD, knobSpec, grilleHoles, grillePlate, grilleSurface, grilleTarget, grilleVU, livePeak,
  engraving, marbleLit, monthOf, chipAt, roman, PANEL, LG15, toCard15,
  ...glassHooks, ...poolHooks, ...wearHooks,
}
