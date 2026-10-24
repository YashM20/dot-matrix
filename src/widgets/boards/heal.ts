/**
 * Board · HEAL — "the mirror that heals" (MASTER-PLAN §9, WEB-PLAN C3). A Growing Neural Cellular Automaton
 * (src/engine/nca, weights trained by scripts/nca/train.ts) grows a dot lizard from a single seed cell;
 * scratch it with the pointer and every cell, knowing only its 3×3 neighbourhood, rebuilds the body.
 * Untouched, each card is a pure function of `ctx.t` (fixed seed, looped timeline, scripted wounds), so
 * goldens and films are stable; a scratch takes that card live until it is left alone through a loop wrap.
 * One red on the board: the regrowth front on the first card (cells whose alpha rose over the last 8 steps).
 */
import { ncaAliveCount, ncaErase, ncaDamage, ncaSeed, ncaGrowth, ncaLift, ncaMapField, ncaModel, ncaPhase, ncaRun, ncaRunAt, ncaScratch, ncaStepAt, type NcaGrid, type NcaRun } from '../../engine/nca'
import type { Field, Layer } from '../../engine/types'
import type { Control } from '../../engine/context'
import { lizardNca } from '../../assets/nca/lizard'
import { TILE, layer, layoutFor, tileStyle, type WidgetContext, type WidgetPreset } from '../types'

const T = layoutFor(TILE)
const tile = { group: 'composite', chrome: 'dots', grid: TILE, style: tileStyle, animated: true } as const
const model = ncaModel(lizardNca)
/** Board grid: the model was trained on a narrower crop; the seed sits at the same place relative to the centre. */
const W = 32, H = model.h, DT = 1 / 30, SEED_X = model.seedAt[0] + ((W - model.w) >> 1)
/** The lizard on a 4× lattice: 32 × 28 grid cells → 128 × 112 card cells, centred under the label. */
const K = 4, OX = (TILE.cols - W * K) >> 1, OY = 11
const GRID = T.lattice(K, OX, OY)
const on = (f: Field) => GRID.at(GRID.place(f, 0, 0, W, H))
const FOOT = 134, RAIL = { x0: 0, x1: 143, y: 129 }
const pad = (n: number, k = 4) => String(Math.max(0, Math.min(10 ** k - 1, Math.round(n)))).padStart(k, '0')
const healPct = (g: NcaGrid) => Math.min(100, ncaAliveCount(g) / model.grown * 100)

function footer(run: NcaRun, t: number, left: string, right: string): Layer[] {
  const k = run.live ? 1 : ncaPhase(run, t), done: [number, number][] = [], rest: [number, number][] = []
  for (let c = RAIL.x0; c <= RAIL.x1; c += 3) (c - RAIL.x0 <= (RAIL.x1 - RAIL.x0) * k ? done : rest).push([c, RAIL.y])
  return [
    layer(T.dots(rest, .9), 'faint'), layer(T.dots(done, 1.1), 'mid'),
    layer(T.text(left, 0, FOOT), 'idle'),
    layer(T.text(right, 143, FOOT, { align: 'right' }), 'faint'),
  ]
}

/** The whole lizard area is one xy control, so the host hands this card its pointers. */
const scratchPad = (label: string): Control[] => [{ key: 'sx', keyY: 'sy', kind: 'xy', box: [OX, OY, W * K, H * K], min: 0, max: 1, label }]
/**
 * Pointer → damage: every pointer that is down inside the lizard area erases a 2.2-cell disc along its
 * stroke. Keyboard users move the xy control; a change of (sx, sy) while focused scratches there too.
 */
const lastKey = new WeakMap<NcaRun, string>()
function scratch(run: NcaRun, ctx: WidgetContext) {
  for (const p of ctx.pointers ?? []) {
    const gx = (p.x - OX) / K, gy = (p.y - OY) / K
    if (p.down && !p.up && gx >= -1 && gy >= -1 && gx <= W + 1 && gy <= H + 1) ncaScratch(run, ctx.t, gx, gy, 2.2, p.id)
    else ncaLift(run, p.id)
  }
  if (ctx.focus === 'sx' && ctx.data.sx !== undefined) {
    const key = `${ctx.data.sx},${ctx.data.sy}`
    if (lastKey.has(run) && lastKey.get(run) !== key) ncaScratch(run, ctx.t, ctx.data.sx * W, (ctx.data.sy ?? .5) * H, 2.6, -1)
    lastKey.set(run, key)
  }
}

/** Body in `value`, the darker spine spots and eyes in `mid`; dot size = alpha (the growing rim is small). */
function body(g: NcaGrid, skip?: Float32Array): Layer[] {
  const alpha = (lo: number, hi: number) => ncaMapField(g, (c, i, x, y) => {
    const a = c[i], tone = c[i + 1]
    if (a <= .1 || tone < lo || tone >= hi || (skip && skip[y * W + x] > .3)) return 0
    return a > 1 ? 1 : a
  })
  return [layer(on(alpha(-Infinity, .75)), 'mid'), layer(on(alpha(.75, Infinity)), 'value')]
}

/**
 * Back to a single seed `lead` seconds before the loop ends: the wrap then lands on a state grown for the
 * same `lead` seconds, so the loop closes without a jump (the timeline starts from that same seed).
 */
const reseed = (g: NcaGrid) => { g.cells.fill(0); ncaSeed(g, SEED_X, model.seedAt[1]) }
const at = (s: number) => Math.round(s / DT)

// ── 01 Heal: a scripted cut takes the top half (head, front legs: ~48% of the body) at 5 s and it regrows, the regrowth front in red; at 12 s
// it starts again from one seed cell. Loop [3 s, 15 s): t = 0 is already grown.
const heroRun = ncaRun({
  model, w: W, h: H, dt: DT, seed: 3, lead: 3, period: 12, every: 24,
  script: (g, n) => { if (n === at(5)) ncaErase(g, (_x, y) => y < H * .46); else if (n === at(12)) reseed(g) },
})
const growth = new Float32Array(W * H)
export const healMirror: WidgetPreset = {
  id: 'heal-mirror', name: 'Heal Mirror', label: 'HEAL  SCRATCH ME', ...tile,
  controls: scratchPad('Scratch the lizard'), defaults: { sx: .5, sy: .5 },
  layers: ctx => {
    scratch(heroRun, ctx)
    const g = ncaRunAt(heroRun, ctx.t), front = ncaGrowth(heroRun, growth)
    const frontField = ncaMapField(g, (c, i, x, y) => front[y * W + x] > .3 && c[i] > .1 ? Math.min(1, c[i]) : 0)
    const step = heroRun.live ? 'LIVE' : pad(ncaStepAt(heroRun, ctx.t) - heroRun.start)
    return [...body(g, front), layer(on(frontField), 'active'), ...footer(heroRun, ctx.t, `STEP ${step}`, `HEAL ${pad(healPct(g), 3)}%`)]
  },
}

// ── 02 X-ray: the same rule, seen through four hidden channels (2 × 2 small multiples on a 2× lattice).
// Positive state in `value`, negative in `mid`, dot size = |h| / panel peak, the silhouette faint. Loop [1.4 s, 11.4 s) from mid-growth;
// a wound in the head at 5 s shows the chemistry rushing back in, a reseed at 10 s closes the loop.
const XK = 2, XW = W * XK, XH = H * XK, GAP = 4, XO = (TILE.cols - 2 * XW - GAP) >> 1, XY0 = 12
const XRAY = (String(lizardNca.meta?.xray ?? '2,3,4,5')).split(',').map(Number).slice(0, 4)
const xrayRun = ncaRun({
  model, w: W, h: H, dt: DT, seed: 5, lead: 1.4, period: 10, every: 24,
  script: (g, n) => { if (n === at(5)) ncaDamage(g, 16, 4.5, 5); else if (n === at(10)) reseed(g) },
})
export const healXray: WidgetPreset = {
  id: 'heal-xray', name: 'Heal X-Ray', label: 'HEAL  HIDDEN STATE', ...tile,
  layers: ctx => {
    const g = ncaRunAt(xrayRun, ctx.t), out: Layer[] = []
    XRAY.forEach((ch, k) => {
      const col = XO + (k % 2) * (XW + GAP), row = XY0 + (k >> 1) * (XH + GAP / 2), L = T.lattice(XK, col, row)
      // each panel is normalised to its own peak |h|, so a quiet channel still reads (like an x-ray's window)
      let peak = .05
      for (let i = 0; i < g.cells.length; i += model.channels) if (g.cells[i] > .1) peak = Math.max(peak, Math.abs(g.cells[i + ch]))
      const put = (sign: 1 | -1) => L.at(L.place(ncaMapField(g, (c, i) => {
        if (c[i] <= .1) return 0
        const v = c[i + ch] * sign / peak
        return v <= .12 ? 0 : v > 1 ? 1 : v
      }), 0, 0, W, H))
      // the body's silhouette as small faint dots underneath, where the channel is quiet
      const ghost = L.at(L.place(ncaMapField(g, (c, i) => c[i] > .5 && Math.abs(c[i + ch]) / peak <= .12 ? .4 : 0), 0, 0, W, H))
      out.push(layer(ghost, 'faint'), layer(put(-1), 'mid'), layer(put(1), 'value'), layer(T.text(`H${ch}`, col, row), 'idle'))
    })
    return [...out, ...footer(xrayRun, ctx.t, `STEP ${pad(ncaStepAt(xrayRun, ctx.t) - xrayRun.start)}`, `${model.channels}CH ${model.hidden}H`)]
  },
}

// ── 03 Persist: a ghost hand scratches a different stroke every 4 s; the lizard never stops healing.
// Loop 16 s. The ghost's fingertip is a small ring of `mid` dots while it drags.
interface Stroke { at: number; from: [number, number]; to: [number, number] }
const STROKES: Stroke[] = [
  { at: 3.2, from: [6, 6], to: [26, 16] },
  { at: 7.2, from: [27, 22], to: [8, 25] },
  { at: 11.2, from: [16, 0], to: [16, 15] },
]
const STROKE_S = .6, GHOST_R = 2.4
const ghostAt = (phaseS: number): [number, number] | null => {
  for (const s of STROKES) {
    const k = (phaseS - s.at) / STROKE_S
    if (k >= 0 && k <= 1) return [s.from[0] + (s.to[0] - s.from[0]) * k, s.from[1] + (s.to[1] - s.from[1]) * k]
  }
  return null
}
const persistRun = ncaRun({
  model, w: W, h: H, dt: DT, seed: 9, lead: 2.5, period: 16, every: 24,
  script: (g, n) => {
    const p = ghostAt(n * DT)
    if (p) ncaDamage(g, p[0], p[1], GHOST_R)
  },
})
export const healPersist: WidgetPreset = {
  id: 'heal-persist', name: 'Heal Persist', label: 'HEAL  PERSIST', ...tile,
  controls: scratchPad('Scratch the lizard'), defaults: { sx: .5, sy: .5 },
  layers: ctx => {
    scratch(persistRun, ctx)
    const g = ncaRunAt(persistRun, ctx.t), s = ncaPhase(persistRun, ctx.t) * 16 + 2.5
    const ghost = persistRun.live ? null : ghostAt(s), ring: [number, number][] = []
    if (ghost) for (let a = 0; a < 12; a++) ring.push([OX + ghost[0] * K + Math.cos(a / 12 * Math.PI * 2) * GHOST_R * K, OY + ghost[1] * K + Math.sin(a / 12 * Math.PI * 2) * GHOST_R * K])
    const wounds = STROKES.filter(w => w.at <= s).length
    return [...body(g), layer(T.dots(ring, 1.4), 'mid'), ...footer(persistRun, ctx.t, `CUTS ${wounds}`, `HEAL ${pad(healPct(g), 3)}%`)]
  },
}

/** The board's runs (benches and checks reset or inspect them). */
export const healRuns: NcaRun[] = [heroRun, xrayRun, persistRun]
export const healBoard = [healMirror, healXray, healPersist]
