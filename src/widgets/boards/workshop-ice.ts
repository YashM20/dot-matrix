/**
 * WORKSHOP, the ice card (docs/living-matter/M-materials.md §5): a frost fern grown by diffusion-limited aggregation
 * (`algo/dla.ts`) on a window. It is a pure function of t until touched; a small `World` (`engine/physics/world.ts`)
 * holds the breath a hover or a tap started. The grains sticking right now are red; a breath melts the frost round it
 * and it freezes back.
 *
 * Main thread only (the world lives here): the sampling worker's build resolves this module to
 * `workshop-ice-worker-stub.ts` (vite.config.ts `mainThreadOnly`).
 */
import { DLA, KAJIYA_KAY } from '../creditSources'
import type { Vec3 } from '../../engine/light/shade'
import { createWorld, framePointers, worldAt, type World } from '../../engine/physics/world'
import { dla, type Dla } from '../../engine/algo/dla'
import { fbm2 } from '../../engine/noise/gradient'
import { hash01 } from '../../engine/math'
import type { Layer } from '../../engine/types'
import { layer, type WidgetContext, type WidgetPreset } from '../types'
import { cite, LIGHT_DEFAULTS, matLight, once, T, tile, type Pt } from './materials-shared'

const IN_WORKER = typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== 'undefined'
const mainThread = (id: string) => { if (IN_WORKER) throw new Error(`${id} keeps its live state on the main thread`) }
const DT = 1 / 30
/** This frame's input for the breath world: pointers in card cells, Enter / Space as a kick. Reduced motion: none. */
function tapInput(ctx: WidgetContext) {
  if (ctx.reducedMotion) return undefined
  const busy = ctx.pointers?.some(p => !p.up && (p.down || p.inside)) ?? false
  return { pointers: framePointers(ctx.pointers, (x, y) => [x, y]), kick: (ctx.data.k ?? 0) >= .5 && !busy }
}

// ── ICE ─ a frost fern on a window ──────────────────────────────────────────────────────────────────────
// The fern is a DLA cluster (`dla({ w: 96, h: 96, n: 2600 })`, Witten–Sander), a grain per site, 1.375 cells a
// diameter. It grows over 14 s (N ∝ R^1.7), holds, and sublimates newest first; the grains sticking right now are
// red (as `algo-aggregate`). Each grain's branch direction (parent → child) is its tangent: a Kajiya–Kay glint
// flashes on the branches turned across the light. Hoar (fBm speckle on 2-cell blocks) creeps in from the corners.
// A breath, the hovering pointer or a tap for 2 s, melts the frost round it; it freezes back from the edge in.
export const ICE = { n: 2600, w: 96, seed: 17, kill: 1.6, minStep: .6, unit: 1.6, cx: 72, cy: 78, grow: 14, hold: 4, thaw: 2, offset: 13.6, front: 16, breath: 16 }
const ICE_P = ICE.grow + ICE.hold + ICE.thaw
let fern: Dla | undefined
/** The cluster (baked once, on the first frame): the same as `dla({ w: 96, h: 96, n: 2600, seed: 17, kill: 1.6, minStep: .6 })` (a tighter relaunch circle and longer last steps: a third of the default bake, the same aggregation). */
export const iceFern = () => (fern ??= dla({ w: ICE.w, h: ICE.w, n: ICE.n, seed: ICE.seed, kill: ICE.kill, minStep: ICE.minStep }))
/** Grains shown at t (growth N ∝ g^1.7, the hold, then the thaw newest first) and whether the front is live. */
export function iceCount(t: number, count: number): { k: number; live: boolean } {
  const p = (((t + ICE.offset) % ICE_P) + ICE_P) % ICE_P
  if (p < ICE.grow) return { k: Math.max(1, Math.round(count * (p / ICE.grow) ** 1.7)), live: true }
  if (p < ICE.grow + ICE.hold) return { k: count, live: false }
  const q = (p - ICE.grow - ICE.hold) / ICE.thaw
  return { k: Math.max(1, Math.round(count * (1 - q * q))), live: false }
}
/** Grain i in card cells, and its branch tangent (unit, parent → child). */
const iceGeo = once(() => {
  const d = iceFern(), n = d.count, x = new Float32Array(n), y = new Float32Array(n), tx = new Float32Array(n), ty = new Float32Array(n), c = ICE.w / 2
  for (let i = 0; i < n; i++) {
    x[i] = ICE.cx + (d.x[i] - c) * ICE.unit; y[i] = ICE.cy + (d.y[i] - c) * ICE.unit
    const p = d.parent[i], dx = p >= 0 ? d.x[i] - d.x[p] : 1, dy = p >= 0 ? d.y[i] - d.y[p] : 0, l = Math.hypot(dx, dy) || 1
    tx[i] = dx / l; ty[i] = dy / l
  }
  // hoar: 2-cell blocks (a 2× lattice) in the corners, outside the fern's reach
  let reach = 0
  for (let i = 0; i < n; i++) reach = Math.max(reach, Math.hypot(x[i] - ICE.cx, y[i] - ICE.cy))
  const hoar: Pt[] = []
  for (let j = 7; j < 72; j++) for (let i = 1; i < 71; i++) {
    const px = 2 * i + .5, py = 2 * j + .5, rr = Math.hypot(px - ICE.cx, py - ICE.cy)
    if (rr < reach + 4) continue
    const corner = Math.min(1, (rr - reach - 4) / 30)
    if (fbm2(i / 4, j / 4, 3, 61) + .55 * corner > .5 && hash01(i, j, 67) < .55) hoar.push([px, py])
  }
  return { n, x, y, tx, ty, hoar }
})
/**
 * The ice world: [0, 1] the breath's centre (cells), [2] its strength: up to 1 while a pointer hovers; a tap sets it
 * to 2 (the full melt for 2 s); it falls by ½ a second, so the frost freezes back from the edge in over the last 2 s.
 */
const iceWorld = once((): World => createWorld({
  size: 3, dt: DT, init: () => {}, lead: 0, period: 1, every: 30, maxSteps: 120, maxCheckpoints: 4, idle: 5, heal: .5,
  step: (s, _n, inp) => {
    let hover = false
    for (const p of inp.pointers) {
      if (p.x < 0 || p.y < 12 || p.x >= 144 || p.y >= 144) continue
      if (p.pressed) { s[0] = p.x; s[1] = p.y; s[2] = 2 } else if (!p.down) { s[0] = p.x; s[1] = p.y; hover = true }
    }
    if (inp.kick) { s[0] = ICE.cx; s[1] = ICE.cy; s[2] = 2 }
    s[2] = hover ? Math.max(s[2], Math.min(1, s[2] + 6 * DT)) : Math.max(0, s[2] - DT / 2)
  },
}))
export const matIce: WidgetPreset = {
  ...tile, id: 'mat-ice', name: 'Ice',
  credit: [DLA, { ...KAJIYA_KAY, note: 'the glint along each branch' }],
  defaults: { ...LIGHT_DEFAULTS, k: 0 },
  controls: [{ key: 'k', kind: 'button', box: [0, 12, 144, 132], label: 'Breathe on the glass' }],
  layers: ctx => {
    mainThread('mat-ice')
    const g = iceGeo(), s = worldAt(iceWorld(), ctx.t, tapInput(ctx)), { k, live } = iceCount(ctx.t, g.n)
    const L = matLight(ctx, { torch: { height: 30, falloff: 160 } }), melt = ICE.breath * Math.min(1, s[2]), m2 = melt * melt
    const point = !Array.isArray(L), at = point ? (L as { at: Vec3 }).at : null, dir = point ? null : L as Vec3
    const groups: Record<'faint' | 'mid' | 'idle' | 'value' | 'active', Pt[]> = { faint: [], mid: [], idle: [], value: [], active: [] }
    for (let i = 0; i < k; i++) {
      const x = g.x[i], y = g.y[i]
      if (m2 > 0) { const dx = x - s[0], dy = y - s[1]; if (dx * dx + dy * dy < m2) continue }
      if (live && k - i <= ICE.front) { groups.active.push([x, y]); continue }
      // the glint: Kajiya–Kay on the branch, the eye straight above (sin of the tangent to the half vector)
      let lx: number, ly: number, lz: number
      if (at) { lx = at[0] - x; ly = at[1] - y; lz = at[2] } else [lx, ly, lz] = dir!
      const ll = Math.hypot(lx, ly, lz) || 1, hx = lx / ll, hy = ly / ll, hz = lz / ll + 1, hl = Math.hypot(hx, hy, hz) || 1
      const th = (g.tx[i] * hx + g.ty[i] * hy) / hl, spark = (1 - th * th) ** 12, age = (k - i) / k
      groups[spark > .9 && age < .7 ? 'value' : age > .85 ? 'mid' : 'idle'].push([x, y])
    }
    const out: Layer[] = [cite('FROST FERN'), layer(T.dots(m2 === 0 ? g.hoar : g.hoar.filter(([x, y]) => (x - s[0]) ** 2 + (y - s[1]) ** 2 >= m2), .8), 'faint')]
    for (const tone of ['mid', 'idle', 'value'] as const) if (groups[tone].length) out.push(layer(T.dots(groups[tone], 1.3), tone))
    if (groups.active.length) out.push(layer(T.dots(groups.active, 1.45), 'active'))
    return out
  },
}

export const iceHooks = { ICE, iceFern, iceCount, iceGeo, iceWorld }
