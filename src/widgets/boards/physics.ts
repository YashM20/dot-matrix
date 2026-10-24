/**
 * Board · PHYSICS — dots you can touch (docs/WEB-PLAN.md C2). Every card is a `src/engine/physics` world:
 * a pure function of t (seeded, fixed dt, looped) until a pointer moves on it, then a live simulation that
 * takes the pointer, the keyboard (Enter on the card = a kick) and tilt (`data.gx` / `data.gy`, in g;
 * DeviceOrientation wiring is the app's job). Fluid / cloth / jelly heal back onto the loop after 3 s idle.
 * - 01 SPLASH: the departures word; a swipe knocks its dots loose as particles, they settle, then migrate
 *   (Hilbert-ranked, `src/engine/migrate`) back into the word, or into the next word after a full splash.
 *   The board's one red: dots in flight right now (live), cooling to grey as they slow.
 * - 02 INK: stable fluids; ink drops sink and bloom into vortex mushrooms, the pointer stirs (press = ink).
 * - 03 FLAG: a PBD banner hung from six rings, waving in a gusting wind, folds shaded by their normals; grab it.
 * - 04 JELLY: a shape-matched soft body with eyes; poke it, grab and stretch it.
 * - 05 PIT: dot sprites with a spatial hash; grab one and throw it. Pours in, plays, drains out each loop.
 * Interactive cards must keep their state where the input is: they refuse the sampling worker (one
 * console warning per card), so the app samples them on the main thread.
 */
import {
  clothInit, clothNearest, clothNormals, clothSize, clothStep, createCloth, createFluid, createParticles, createSoft, createWorld, fluidSize, fluidSplat, fluidStep,
  framePointers, nearestParticle, P_DYNAMIC, P_OFF, P_STATIC, particlesSize, particlesStep, setParticle, softFrame, softInit, softNearest, softSize, softStep,
  worldAt, worldStep, type FrameInput, type StepInput, type World,
} from '../../engine/physics'
import { migrate, MIGRATE_STRIDE, type Migration } from '../../engine/migrate'
import { glyph, glyphMetrics, textWidth } from '../../engine/fields/bitmapFont'
import { hash01 } from '../../engine/math'
import type { Control } from '../../engine/context'
import type { DotInstance, Field, Layer, Tone } from '../../engine/types'
import { TILE, layer, layoutFor, tileStyle, type WidgetContext, type WidgetPreset } from '../types'

const T = layoutFor(TILE)
const tile = { group: 'composite', chrome: 'dots', grid: TILE, style: tileStyle, animated: true } as const
type Pt = [number, number]
type Map2 = (x: number, y: number) => Pt
const ident: Map2 = (x, y) => [x, y]
const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x)

// The sampling worker would run its own (pristine) copy of a world and snap back when the pointer leaves.
const IN_WORKER = typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== 'undefined'
const mainThread = () => { if (IN_WORKER) throw new Error('physics cards keep their live state on the main thread') }
/** The whole card below the label is one press target: pointers reach the card, Enter / Space kick it. */
const touch = (key: string, label: string): Control[] => [{ key, kind: 'button', box: [0, 10, 144, 134], label }]
/** This frame's input: pointers mapped into world units, tilt from data, a keyboard press as a kick. */
function frameOf(ctx: WidgetContext, key: string, map: Map2 = ident): FrameInput {
  const busy = ctx.pointers?.some(p => !p.up && (p.down || p.inside)) ?? false
  return { pointers: framePointers(ctx.pointers, map), gx: ctx.data.gx, gy: ctx.data.gy, kick: (ctx.data[key] ?? 0) >= .5 && !busy }
}

interface Site { x: number; y: number; size: number; tone: Tone; value?: number }
/** Moving dots as site layers, grouped by tone, snapped size and value (a handful of layers per frame). */
function siteLayers(sites: Site[], step = .2): Layer[] {
  const groups = new Map<string, { pts: Pt[]; size: number; value: number; tone: Tone }>()
  for (const s of sites) {
    const size = Math.max(step, Math.round(s.size / step) * step), value = s.value ?? 1, key = `${s.tone}|${size}|${value}`
    let g = groups.get(key)
    if (!g) groups.set(key, (g = { pts: [], size, value, tone: s.tone }))
    g.pts.push([s.x, s.y])
  }
  return [...groups.values()].map(g => ({ field: () => g.value, sites: g.pts, size: +g.size.toFixed(3), tone: g.tone }))
}
/** Floats [0, n) blend; the discrete tail (grab indices) is left alone. */
const blendHead = (n: number) => (a: Float32Array, b: Float32Array, k: number) => { for (let i = 0; i < n; i++) a[i] += (b[i] - a[i]) * k }

// ── 01 SPLASH ───────────────────────────────────────────────────────────────
// The word's dots are discs: static obstacles while home, dynamic once a swipe hits them. 1.5 s after the
// last hit the loose dots migrate home along a Hilbert-ranked path; a full splash re-forms as the next word.
const WORDS = ['DEPARTURES', 'ARRIVALS'], SL = 2.3, SY = 56
function homesOf(word: string): Pt[] {
  const adv = glyphMetrics().advance, left = (144 - textWidth(word) * SL) / 2, out: Pt[] = []
  ;[...word].forEach((ch, ci) => glyph(ch).forEach((row, gy) => row.forEach((on, gx) => {
    if (on) out.push([left + (ci * adv + gx + .5) * SL - .5, SY + (gy + .5) * SL - .5])
  })))
  return out
}
const HOMES = WORDS.map(homesOf), CAP = Math.max(...HOMES.map(h => h.length)) + 1, PTR = CAP - 1
const splashR = new Float32Array(CAP).fill(SL * .46); splashR[PTR] = 4.5
const sp = createParticles({ n: CAP, radius: splashR, bounds: [1, 12, 143, 142], restitution: .35, bounce: .25, friction: .8, g: 260, iterations: 2, maxSpeed: 320 })
const S_HOME = particlesSize(sp), S_MODE = S_HOME + CAP, S_MX = S_MODE + CAP, S_MY = S_MX + CAP, S_G = S_MY + CAP
const G_WORD = S_G, G_KICK = S_G + 1, G_MIG = S_G + 2, G_TARGET = S_G + 3, G_FULL = S_G + 4
const HOME = 0, FREE = 1, FLYING = 2
const S_DT = 1 / 60, HALF = 7, S_PERIOD = 2 * HALF, S_LEN = Math.round(S_PERIOD / S_DT)
const SWIPE: Pt = [2, 2.55], SETTLE = Math.round(1.5 / S_DT), MIG_STEPS = Math.round(1.7 / S_DT)
/** Steps from m to n on the loop (a live world's folded step wraps). */
const since = (n: number, m: number) => { const d = n - m; return d < 0 ? d + S_LEN : d }

function placeWord(s: Float32Array, word: number) {
  const h = HOMES[word]
  for (let i = 0; i < CAP; i++) {
    if (i < h.length) { setParticle(sp, s, i, h[i][0], h[i][1], 0, 0, S_DT, P_STATIC); s[S_HOME + i] = i; s[S_MODE + i] = HOME }
    else { s[sp.K + i] = P_OFF; s[S_HOME + i] = -1; s[S_MODE + i] = -1 }
  }
  s[G_WORD] = word; s[G_MIG] = -1
}
// The migration is rebuilt from the state (start positions are stored), so a replay from a checkpoint finds it.
const migCache = new Map<string, { m: Migration; from: number[] }>()
const dotAt = (x: number, y: number): DotInstance => ({ x, y, r: 1, opacity: 1, color: 'value' })
function migrationOf(s: Float32Array): { m: Migration; from: number[] } {
  const from: number[] = []
  let sum = 0
  for (let i = 0; i < PTR; i++) if (s[S_MODE + i] === FLYING) { from.push(i); sum += s[S_MX + i] * 7 + s[S_MY + i] * 13 }
  const key = `${s[G_MIG]}|${s[G_TARGET]}|${s[G_FULL]}|${from.length}|${sum.toFixed(3)}`
  let hit = migCache.get(key)
  if (!hit) {
    const word = s[G_WORD], to = s[G_FULL] ? HOMES[s[G_TARGET]] : from.map(i => HOMES[word][s[S_HOME + i]])
    hit = { m: migrate(from.map(i => dotAt(s[S_MX + i], s[S_MY + i])), to.map(([x, y]) => dotAt(x, y)), { stagger: .4, arc: .22 }), from }
    if (migCache.size >= 4) migCache.delete(migCache.keys().next().value!)
    migCache.set(key, hit)
  }
  return hit
}
function land(s: Float32Array) {
  const { m, from } = migrationOf(s)
  if (s[G_FULL]) { placeWord(s, s[G_TARGET]); return }
  const h = HOMES[s[G_WORD]], homes = from.map(i => s[S_HOME + i])
  for (let k = 0; k < m.count; k++) {
    const i = from[m.fromIndex[k]], home = homes[m.toIndex[k]]
    setParticle(sp, s, i, h[home][0], h[home][1], 0, 0, S_DT, P_STATIC); s[S_HOME + i] = home; s[S_MODE + i] = HOME
  }
  s[G_MIG] = -1
}
function knock(s: Float32Array, i: number, vx: number, vy: number, n: number, salt: number) {
  const jx = (hash01(i, n, salt) - .5) * 90, jy = hash01(i, n, salt + 1)
  setParticle(sp, s, i, s[sp.X + i], s[sp.Y + i], vx * .32 + jx, vy * .32 - 30 - 70 * jy, S_DT, P_DYNAMIC)
  s[S_MODE + i] = FREE; s[G_KICK] = n
}
function splashStep(s: Float32Array, n: number, inp: StepInput) {
  const th = ((n * S_DT) % S_PERIOD) % HALF
  // the autopilot's swipe (only while nobody is playing): a vertical sweep that knocks every dot it passes
  if (inp.quiet > 4 && th >= SWIPE[0] && th < SWIPE[1]) {
    const span = SWIPE[1] - SWIPE[0], gx = -6 + ((th - SWIPE[0]) / span) * 156
    for (let i = 0; i < PTR; i++) if (s[S_MODE + i] === HOME && Math.abs(s[sp.X + i] - gx) < 2.6) knock(s, i, 0, -60, n, 3)
  }
  s[sp.K + PTR] = P_OFF
  inp.pointers.forEach((p, k) => {
    if (k === 0) { s[sp.X + PTR] = s[sp.PX + PTR] = p.x; s[sp.Y + PTR] = s[sp.PY + PTR] = p.y; s[sp.K + PTR] = P_STATIC }
    if (Math.hypot(p.vx, p.vy) < 25) return
    for (let i = 0; i < PTR; i++) {
      const dx = s[sp.X + i] - p.x, dy = s[sp.Y + i] - p.y
      if (dx * dx + dy * dy > 36) continue
      if (s[S_MODE + i] === HOME) knock(s, i, p.vx, p.vy, n, 7)
      else if (s[S_MODE + i] === FREE) { s[sp.PX + i] -= p.vx * S_DT * .3; s[sp.PY + i] -= p.vy * S_DT * .3 }
    }
  })
  if (inp.kick) for (let i = 0; i < PTR; i++) if (s[S_MODE + i] === HOME) knock(s, i, (s[sp.X + i] - 72) * 3, -80, n, 11)
  particlesStep(sp, s, S_DT, inp.gx, inp.gy)
  if (s[G_MIG] >= 0) { if (since(n, s[G_MIG]) >= MIG_STEPS) land(s); return }
  let free = 0, home = 0
  for (let i = 0; i < PTR; i++) { const m = s[S_MODE + i]; if (m === FREE) free++; else if (m === HOME) home++ }
  if (!free || since(n, s[G_KICK]) < SETTLE) return
  s[G_FULL] = home ? 0 : 1; s[G_TARGET] = home ? s[G_WORD] : (s[G_WORD] + 1) % WORDS.length; s[G_MIG] = n
  for (let i = 0; i < PTR; i++) if (s[S_MODE + i] === FREE) { s[S_MODE + i] = FLYING; s[sp.K + i] = P_OFF; s[S_MX + i] = s[sp.X + i]; s[S_MY + i] = s[sp.Y + i] }
}
const splashWorld = createWorld({
  size: S_G + 8, dt: S_DT, lead: 1.2, period: S_PERIOD, every: 30, maxSteps: 1200, idle: Infinity, maxLiveSteps: 6,
  init: s => { placeWord(s, 0); s[G_KICK] = 0 },
  step: splashStep,
  // nothing to blend: the loop ends exactly on its start (word 0 at rest), and a live splash never heals
  blend: () => {},
})
const SPLASH_CAPTION = ['08:42  PLATFORM 3', '08:47  PLATFORM 1']
export const physicsSplash: WidgetPreset = {
  id: 'phys-splash', name: 'Physics Splash', label: '01  SPLASH', ...tile, controls: touch('splash', 'Splash the word'),
  layers: ctx => {
    mainThread()
    const s = worldAt(splashWorld, ctx.t, frameOf(ctx, 'splash')), n = worldStep(splashWorld, ctx.t), sites: Site[] = []
    for (let i = 0; i < PTR; i++) {
      const m = s[S_MODE + i], x = s[sp.X + i], y = s[sp.Y + i]
      if (m === HOME) sites.push({ x, y, size: SL, tone: 'value' })
      else if (m === FREE) {
        const vx = (x - s[sp.PX + i]) / S_DT, vy = (y - s[sp.PY + i]) / S_DT, v = Math.hypot(vx, vy)
        // afterglow, not smear: one faint ghost a frame behind a fast dot
        if (v > 60) sites.push({ x: x - vx * .03, y: y - vy * .03, size: SL * .6, tone: 'faint' })
        sites.push({ x, y, size: SL, tone: v > 35 + 55 * hash01(i, 5) ? 'active' : 'mid' })
      }
    }
    if (s[G_MIG] >= 0) {
      const { m } = migrationOf(s), f = m.frame(clamp(since(n, s[G_MIG]) / MIG_STEPS, 0, 1))
      for (let k = 0; k < m.count; k++) { const w = k * MIGRATE_STRIDE; sites.push({ x: f[w], y: f[w + 1], size: SL, tone: f[w + 4] > .5 ? 'value' : 'mid' }) }
    }
    const word = s[G_MIG] >= 0 && s[G_FULL] ? s[G_TARGET] : s[G_WORD]
    return [layer(T.text(SPLASH_CAPTION[word], 72, 34, { align: 'center' }), 'idle'), ...siteLayers(sites)]
  },
}

// ── 02 INK ──────────────────────────────────────────────────────────────────
// A 48×38 tank on a 3-cell lattice. Each drop lands with downward speed and sinks (ink is heavier than
// water), so it rolls up into a vortex mushroom. Dots are density: size steps, faint → mid → value.
const FW = 48, FH = 38, FL = 3, FY = 30
const fluid = createFluid({ w: FW, h: FH, iterations: 8, vorticity: 7, dissipation: .08, damping: .22, sink: 20 })
const I_DT = 1 / 24, I_PERIOD = 10, I_LEN = Math.round(I_PERIOD / I_DT), FALL = .45
const DROPS = [{ at: .4, x: .32 }, { at: 2.9, x: .66 }, { at: 5.4, x: .45 }, { at: 7.9, x: .74 }]
const toTank: Map2 = (x, y) => [(x + .5) / FL - .5, (y - FY + .5) / FL - .5]
function inkStep(s: Float32Array, n: number, inp: StepInput) {
  const cyc = n % I_LEN
  for (const d of DROPS) if (cyc === Math.round(d.at / I_DT)) fluidSplat(fluid, s, d.x * FW, 1.5, 2, 0, 30, 2.6, 2.6)
  if (inp.kick) fluidSplat(fluid, s, FW / 2, 1.5, 2.6, 0, 45, 2.6, 2.6)
  for (const p of inp.pointers) {
    if (p.y < -1.5 || p.y > FH || p.x < -1 || p.x > FW) continue
    fluidSplat(fluid, s, p.x, p.y, 2.2, clamp(p.vx, -60, 60) * .6, clamp(p.vy, -60, 60) * .6, p.down ? .3 : 0)
  }
  fluidStep(fluid, s, I_DT, inp.gx, inp.gy)
}
const inkWorld = createWorld({ size: fluidSize(fluid), dt: I_DT, lead: 3, period: I_PERIOD, seam: 1.2, every: 12, maxSteps: 720, maxLiveSteps: 4, init: () => {}, step: inkStep })
const inkTone = (v: number): Tone => (v >= .86 ? 'value' : v >= .68 ? 'idle' : v >= .48 ? 'mid' : 'faint')
export const physicsInk: WidgetPreset = {
  id: 'phys-ink', name: 'Physics Ink', label: '02  INK', ...tile, controls: touch('ink', 'Stir the ink'),
  layers: ctx => {
    mainThread()
    const s = worldAt(inkWorld, ctx.t, frameOf(ctx, 'ink', toTank)), tau = ((worldStep(inkWorld, ctx.t) % I_LEN) * I_DT), D = fluid.D
    const field: Field = (u, v) => {
      const d = s[D + Math.round(v * (FH - 1)) * FW + Math.round(u * (FW - 1))]
      return d < .035 ? 0 : Math.min(1, .2 + Math.sqrt(d) * .85)
    }
    const drops: Site[] = []
    for (const d of DROPS) {
      const k = (tau - d.at + FALL) / FALL
      if (k >= 0 && k < 1) drops.push({ x: (d.x * FW + .5) * FL - .5, y: 12 + (FY - 16) * k * k, size: 3, tone: 'value' })
    }
    return [
      { ...T.lattice(FL, 0, FY).at(field), toneOf: inkTone },
      layer(T.dotLine(1, FY - 3, 142, FY - 3, { spacing: 3, size: .9 }), 'faint'),
      ...siteLayers(drops),
    ]
  },
}

// ── 03 FLAG ─────────────────────────────────────────────────────────────────
// A 21×15 banner hung from six rings on a rail; the wind gusts toward the viewer with a travelling wave, so
// the sheet billows and folds. Perspective scales dots with depth; tone is the fold's light (|n·L|).
const FC = 21, FR = 15, FSP = 5.4, FX0 = 72 - ((FC - 1) * FSP) / 2, FY0 = 26
const cloth = createCloth({ cols: FC, rows: FR, spacing: FSP, origin: [FX0, FY0, 0], pin: (i, j) => j === 0 && i % 4 === 0, iterations: 6, g: 150, lift: 6, drag: .99, shear: .7, bend: .2 })
const C_GRAB = clothSize(cloth), F_DT = 1 / 30, F_PERIOD = 10
const PRINT = new Uint8Array(FC * FR)
;[...'480'].forEach((ch, ci) => glyph(ch).forEach((row, gy) => row.forEach((on, gx) => { if (on) PRINT[(4 + gy) * FC + 2 + ci * 6 + gx] = 1 })))
let windT = 0
const W = (2 * Math.PI) / F_PERIOD
const wind = (_p: number, x: number, y: number, _z: number, out: Float32Array) => {
  out[0] = 9 * Math.sin(W * windT); out[1] = 0
  out[2] = 16 + 12 * Math.sin(2 * W * windT) + 26 * Math.sin(.11 * x - 4 * W * windT + .08 * y)
}
const grabTarget = { p: 0, x: 0, y: 0, z: 0 }
function flagStep(s: Float32Array, n: number, inp: StepInput) {
  windT = n * F_DT
  let grab = s[C_GRAB]
  const p0 = inp.pointers[0]
  if (!p0 || !p0.down) grab = -1
  else if (grab < 0) { const g = clothNearest(cloth, s, p0.x, p0.y, 12); if (g >= 0 && cloth.invMass[g] > 0) { grab = g; s[C_GRAB + 1] = s[cloth.Z + g] + 6 } }
  if (p0 && !p0.down) {
    // a moving hand blows the cloth away from the viewer under it
    const v = Math.hypot(p0.vx, p0.vy)
    for (let p = 0; p < cloth.n; p++) {
      const d = Math.hypot(s[cloth.X + p] - p0.x, s[cloth.Y + p] - p0.y)
      if (d < 14 && cloth.invMass[p]) s[cloth.PZ + p] += Math.min(2, v * .004) * (1 - d / 14)
    }
  }
  if (inp.kick) for (let p = 0; p < cloth.n; p++) if (cloth.invMass[p]) s[cloth.PZ + p] -= 2.5 * (s[cloth.Y + p] - FY0) / (FR * FSP)
  if (grab >= 0 && p0) { grabTarget.p = grab; grabTarget.x = p0.x; grabTarget.y = p0.y; grabTarget.z = s[C_GRAB + 1] }
  clothStep(cloth, s, F_DT, { gx: inp.gx, gy: inp.gy, wind, grab: grab >= 0 ? grabTarget : undefined })
  s[C_GRAB] = grab
}
const flagWorld = createWorld({
  size: C_GRAB + 2, dt: F_DT, lead: 4, period: F_PERIOD, seam: 1, every: 15, maxSteps: 600, maxLiveSteps: 4,
  init: s => { clothInit(cloth, s); s[C_GRAB] = -1 }, step: flagStep, blend: blendHead(C_GRAB),
})
const LIGHT = (() => { const v = [-.75, -.35, .55], l = Math.hypot(...v); return v.map(x => x / l) })()
const FOCAL = 170
export const physicsFlag: WidgetPreset = {
  id: 'phys-flag', name: 'Physics Flag', label: '03  FLAG', ...tile, controls: touch('flag', 'Grab the flag'),
  layers: ctx => {
    mainThread()
    const s = worldAt(flagWorld, ctx.t, frameOf(ctx, 'flag'))
    clothNormals(cloth, s)
    const sites: Site[] = [], rings: Pt[] = []
    for (let p = 0; p < cloth.n; p++) {
      const k = clamp(FOCAL / (FOCAL - s[cloth.Z + p]), .7, 1.5), x = 72 + (s[cloth.X + p] - 72) * k, y = 20 + (s[cloth.Y + p] - 20) * k
      if (!cloth.invMass[p]) { rings.push([x, y]); continue }
      const shade = Math.abs(cloth.nx[p] * LIGHT[0] + cloth.ny[p] * LIGHT[1] + cloth.nz[p] * LIGHT[2])
      const tone: Tone = PRINT[p] ? (shade > .3 ? 'value' : 'idle') : shade > .55 ? 'mid' : 'faint'
      sites.push({ x, y, size: (PRINT[p] ? 2.6 : 2.1) * k * (.6 + .5 * shade), tone })
    }
    return [
      layer(T.dotLine(FX0 - 8, FY0, FX0 + (FC - 1) * FSP + 8, FY0, { spacing: 2.4, size: 1 }), 'faint'),
      ...siteLayers(sites),
      layer(T.dots(rings, 2.6), 'idle'),
    ]
  },
}

// ── 04 JELLY ────────────────────────────────────────────────────────────────
// A 40-particle ring with shape matching (rotation + some squash) and an area constraint. It hops, gets
// poked from the side and pressed from above; a hand pokes it, a press grabs and stretches it.
const FLOOR = 128
const soft = createSoft({ count: 40, cx: 72, cy: 100, rx: 34, ry: 25, flat: .45, stiffness: .16, squash: .45, pressure: .6, perimeter: .5, iterations: 4, g: 240, bounds: [4, 14, 140, FLOOR], friction: .85 })
const J_REST = FLOOR - Math.max(...soft.qy), J_GRAB = softSize(soft), J_DT = 1 / 60, J_PERIOD = 8
const pokeA = { x: 0, y: 0, r: 0 }, pokeB = { x: 0, y: 0, r: 0 }, pokes: { x: number; y: number; r: number }[] = [], jGrab = { p: 0, x: 0, y: 0 }
const hop = (s: Float32Array, up: number) => { for (let i = 0; i < soft.n; i++) s[soft.PY + i] = s[soft.Y + i] + up }
function jellyStep(s: Float32Array, n: number, inp: StepInput) {
  const tau = (n * J_DT) % J_PERIOD
  pokes.length = 0
  if (inp.quiet > 3) {
    if (Math.abs(tau - .6) < J_DT / 2) hop(s, 2.3)
    if (tau >= 3.6 && tau < 4.6) { const k = Math.sin(Math.PI * (tau - 3.6)); pokeA.x = 152 - 44 * k; pokeA.y = 112; pokeA.r = 10; pokes.push(pokeA) }
    if (tau >= 6 && tau < 6.9) { const k = Math.sin((Math.PI * (tau - 6)) / .9); pokeA.x = 72; pokeA.y = 38 + 30 * k; pokeA.r = 16; pokes.push(pokeA) }
  }
  if (inp.kick) hop(s, 2.3)
  let grab = s[J_GRAB]
  const p0 = inp.pointers[0]
  if (!p0 || !p0.down) grab = -1
  else if (grab < 0) grab = softNearest(soft, s, p0.x, p0.y, 10)
  if (p0 && grab < 0) { pokeB.x = p0.x; pokeB.y = p0.y; pokeB.r = 6; pokes.push(pokeB) }
  if (grab >= 0 && p0) { jGrab.p = grab; jGrab.x = p0.x; jGrab.y = p0.y }
  softStep(soft, s, J_DT, { gx: inp.gx, gy: inp.gy, pokes, grab: grab >= 0 ? jGrab : undefined })
  s[J_GRAB] = grab
}
const jellyWorld = createWorld({
  size: J_GRAB + 2, dt: J_DT, lead: .3, period: J_PERIOD, seam: .8, every: 30, maxSteps: 900, maxLiveSteps: 6,
  init: s => { softInit(soft, s, 72, J_REST); s[J_GRAB] = -1 }, step: jellyStep, blend: blendHead(J_GRAB),
})
// raster on a 2-cell lattice under the label: value + tone per lattice cell, rebuilt per frame
const JL = 2, JOY = 12, JC = 72, JR = 66
const jVal = new Float32Array(JC * JR), jTone = new Int8Array(JC * JR), jIn = new Uint8Array(JC * JR), xs = new Float64Array(64)
const J_TONES: Tone[] = ['faint', 'mid', 'idle', 'value']
function jellyRaster(s: Float32Array, t: number): [number, number] {
  jVal.fill(0); jIn.fill(0)
  const { n, X, Y } = soft, f = softFrame(soft, s), cs = Math.cos(f.angle), sn = Math.sin(f.angle)
  let y0 = Infinity, y1 = -Infinity, x0 = Infinity, x1 = -Infinity
  for (let i = 0; i < n; i++) { y0 = Math.min(y0, s[Y + i]); y1 = Math.max(y1, s[Y + i]); x0 = Math.min(x0, s[X + i]); x1 = Math.max(x1, s[X + i]) }
  const blink = (t % 3.3) > 3.12 ? .15 : 1
  const r0 = Math.max(0, Math.ceil((y0 - JOY + .5) / JL - .5)), r1 = Math.min(JR - 1, Math.floor((y1 - JOY + .5) / JL - .5))
  for (let r = r0; r <= r1; r++) {
    const y = JOY + (r + .5) * JL - .5
    let m = 0
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const yi = s[Y + i], yj = s[Y + j]
      if ((yi > y) !== (yj > y) && m < xs.length) xs[m++] = s[X + i] + ((y - yi) * (s[X + j] - s[X + i])) / (yj - yi)
    }
    for (let a = 1; a < m; a++) { const v = xs[a]; let b = a - 1; while (b >= 0 && xs[b] > v) { xs[b + 1] = xs[b]; b-- } xs[b + 1] = v }
    for (let q = 0; q + 1 < m; q += 2) {
      const c0 = Math.max(0, Math.ceil((xs[q] + .5) / JL - .5)), c1 = Math.min(JC - 1, Math.floor((xs[q + 1] + .5) / JL - .5))
      for (let c = c0; c <= c1; c++) {
        const x = (c + .5) * JL - .5, dx = x - f.cx, dy = y - f.cy
        const lx = (cs * dx + sn * dy) / soft.rx, ly = (-sn * dx + cs * dy) / soft.ry
        // eyes: void holes in the body frame; they blink every 3.3 s
        const i = r * JC + c, ex = Math.abs(lx) - .33, ey = (ly + .12) / (.2 * blink)
        jIn[i] = 1
        if ((ex / .11) ** 2 + ey * ey < 1) continue
        const hl = ((lx + .42) / .2) ** 2 + ((ly + .5) / .13) ** 2
        let tone = 1, v = clamp(.62 - .3 * ly, .35, .95)
        if (hl < 1) { tone = 3; v = 1 } else if (ly > .5) { tone = 0; v = .7 }
        jVal[i] = v; jTone[i] = tone
      }
    }
  }
  // the rim: body cells with a 4-neighbour outside the body (one lattice cell ≈ 2 card cells, a soft glassy edge)
  for (let r = r0; r <= r1; r++) for (let c = 0; c < JC; c++) {
    const i = r * JC + c
    if (!jIn[i] || !jVal[i] || jTone[i] === 3) continue
    if (c === 0 || c === JC - 1 || r === 0 || r === JR - 1 || !jIn[i - 1] || !jIn[i + 1] || !jIn[i - JC] || !jIn[i + JC]) { jTone[i] = 2; jVal[i] = .9 }
  }
  return [x0, x1]
}
const jellyField: Field = (u, v) => jVal[Math.round(v * (JR - 1)) * JC + Math.round(u * (JC - 1))]
const jellyToneOf = (_: number, u: number, v: number): Tone => J_TONES[jTone[Math.round(v * (JR - 1)) * JC + Math.round(u * (JC - 1))]]
export const physicsJelly: WidgetPreset = {
  id: 'phys-jelly', name: 'Physics Jelly', label: '04  JELLY', ...tile, controls: touch('jelly', 'Poke the jelly'),
  layers: ctx => {
    mainThread()
    const s = worldAt(jellyWorld, ctx.t, frameOf(ctx, 'jelly')), [x0, x1] = jellyRaster(s, ctx.t)
    let bottom = -Infinity
    for (let i = 0; i < soft.n; i++) bottom = Math.max(bottom, s[soft.Y + i])
    // contact shadow: the floor under the jelly lights up, narrowing as it leaves the floor
    const lift = clamp(1 - (FLOOR - bottom) / 30, 0, 1), cx = (x0 + x1) / 2, half = ((x1 - x0) / 2) * (.3 + .6 * lift)
    const floor: Pt[] = [], contact: Pt[] = []
    for (let x = 2; x <= 142; x += 3) (Math.abs(x - cx) < half ? contact : floor).push([x, FLOOR + 4])
    return [
      { field: jellyField, lattice: JL, origin: [0, JOY], toneOf: jellyToneOf },
      layer(T.dots(floor, .9), 'faint'), layer(T.dots(contact, 1.3), 'mid'),
    ]
  },
}

// ── 05 PIT ──────────────────────────────────────────────────────────────────
// 45 dot sprites in four sizes. They pour in from above, the autopilot throws two and shakes the pit, then
// the floor opens and they drain; in a live pit the drained ones pour back in. Grab one, throw it.
const BALLS: [number, Tone][] = [[9, 'value'], ...Array.from({ length: 6 }, (): [number, Tone] => [6.2, 'idle']),
  ...Array.from({ length: 14 }, (): [number, Tone] => [4.4, 'mid']), ...Array.from({ length: 30 }, (): [number, Tone] => [3.2, 'faint'])]
const NB = BALLS.length, PIT_PTR = NB
const pitR = new Float32Array(NB + 1); BALLS.forEach(([r], i) => { pitR[i] = r }); pitR[PIT_PTR] = 5
const PIT_FLOOR = 141
const pit = createParticles({ n: NB + 1, radius: pitR, bounds: [2, -400, 142, PIT_FLOOR], restitution: .4, bounce: .3, friction: .85, g: 240, iterations: 3 })
const P_GRAB = particlesSize(pit), P_DT = 1 / 60, P_PERIOD = 16, P_LEN = Math.round(P_PERIOD / P_DT)
const queue = (i: number): Pt => [10 + hash01(i, 1) * 124, -8 - i * 5.5]
let pitGrab = -1
const held = (i: number) => i === pitGrab
const throwBall = (s: Float32Array, i: number, vx: number, vy: number) => setParticle(pit, s, i, s[pit.X + i], s[pit.Y + i], vx, vy, P_DT)
function pitStep(s: Float32Array, n: number, inp: StepInput) {
  const cyc = n % P_LEN, tau = cyc * P_DT, auto = inp.quiet > 3
  if (cyc === 0) for (let i = 0; i < NB; i++) if (inp.live < 0 || s[pit.Y + i] > 150) { const [x, y] = queue(i); setParticle(pit, s, i, x, y, 0, 30, P_DT) }
  if (auto && cyc === Math.round(5 / P_DT)) throwBall(s, 0, -110, -300)
  if (auto && cyc === Math.round(8.5 / P_DT)) throwBall(s, 1, 140, -280)
  if (auto && cyc === Math.round(11.5 / P_DT)) for (let i = 0; i < NB; i++) throwBall(s, i, (hash01(i, n) - .5) * 60, -60 - 80 * hash01(i, n, 1))
  if (inp.kick) throwBall(s, 0, (hash01(n) - .5) * 200, -320)
  pit.bounds[3] = auto && tau >= 13.2 ? 1e5 : PIT_FLOOR
  pitGrab = s[P_GRAB]
  const p0 = inp.pointers[0]
  if (!p0 || !p0.down) pitGrab = -1
  else if (pitGrab < 0) pitGrab = nearestParticle(pit, s, p0.x, p0.y, 6)
  s[pit.K + PIT_PTR] = P_OFF
  if (p0 && pitGrab < 0) { s[pit.X + PIT_PTR] = s[pit.PX + PIT_PTR] = p0.x; s[pit.Y + PIT_PTR] = s[pit.PY + PIT_PTR] = p0.y; s[pit.K + PIT_PTR] = P_STATIC }
  if (pitGrab >= 0 && p0) {
    // held: follows the hand; its implied velocity is the hand's, so letting go throws it
    const i = pitGrab, x = s[pit.X + i] + (p0.x - s[pit.X + i]) * .5, y = s[pit.Y + i] + (p0.y - s[pit.Y + i]) * .5
    setParticle(pit, s, i, x, y, clamp(p0.vx, -400, 400), clamp(p0.vy, -400, 400), P_DT)
  }
  particlesStep(pit, s, P_DT, inp.gx, inp.gy, held)
  s[P_GRAB] = pitGrab
}
const pitWorld = createWorld({
  size: P_GRAB + 2, dt: P_DT, lead: 4, period: P_PERIOD, every: 30, maxSteps: 1200, idle: Infinity, maxLiveSteps: 6,
  init: s => { for (let i = 0; i < NB; i++) { const [x, y] = queue(i); setParticle(pit, s, i, x, y, 0, 30, P_DT, P_DYNAMIC) } s[pit.K + PIT_PTR] = P_OFF; s[P_GRAB] = -1 },
  step: pitStep, blend: () => {},
})
/** Site size for a disc of radius r cells (a full card dot is ~.95 of the pitch). */
const discSize = (r: number) => (2 * r) / .95
export const physicsPit: WidgetPreset = {
  id: 'phys-pit', name: 'Physics Pit', label: '05  PIT', ...tile, controls: touch('pit', 'Throw a dot'),
  layers: ctx => {
    mainThread()
    const s = worldAt(pitWorld, ctx.t, frameOf(ctx, 'pit')), sites: Site[] = [], grab = s[P_GRAB]
    for (let i = 0; i < NB; i++) {
      const x = s[pit.X + i], y = s[pit.Y + i], r = pitR[i]
      if (y < 10 - r || y > 144 + r) continue
      sites.push({ x, y, size: discSize(r), tone: BALLS[i][1] })
    }
    return [...siteLayers(sites, .1), ...(grab >= 0 ? [layer(T.dotRing(s[pit.X + grab], s[pit.Y + grab], pitR[grab] + 3, { spacing: 2.6, size: 1 }), 'faint')] : [])]
  },
}

/** The board's worlds (tests reset them; see scripts/physics.ts). */
export const physicsWorlds: World[] = [splashWorld, inkWorld, flagWorld, jellyWorld, pitWorld]
export const physicsBoard: WidgetPreset[] = [physicsSplash, physicsInk, physicsFlag, physicsJelly, physicsPit]

/** Read-outs for tests (scripts/physics.ts): splash dot modes, a pit ball, the grabs, total ink. */
export const physicsProbe = {
  splash(s: Float32Array) {
    let home = 0, free = 0, flying = 0
    for (let i = 0; i < PTR; i++) { const m = s[S_MODE + i]; if (m === HOME) home++; else if (m === FREE) free++; else if (m === FLYING) flying++ }
    return { home, free, flying, word: s[G_WORD] }
  },
  ball: (s: Float32Array, i: number) => ({ x: s[pit.X + i], y: s[pit.Y + i], vx: (s[pit.X + i] - s[pit.PX + i]) / P_DT, vy: (s[pit.Y + i] - s[pit.PY + i]) / P_DT, grab: s[P_GRAB] }),
  flagGrab: (s: Float32Array) => s[C_GRAB],
  jellyGrab: (s: Float32Array) => s[J_GRAB],
  fluid, cloth, soft, pit, sp,
}
