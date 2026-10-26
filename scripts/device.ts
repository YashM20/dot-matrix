/**
 * P5-C checks: device profiles, `toDevice`, the display simulators and cross-tab clock sync.
 * Run from scripts/verify.ts (`deviceChecks(assert)`) or alone: npx tsx scripts/device.ts
 */
import { createClockSync, type ChannelPort } from '../src/engine/clockSync'
import {
  createEinkSim, createFlipSim, DEVICES, deviceMask, flipAngle, frameMean, plotAt, plotPaths, penPlanSVG, previewProfile, toDevice,
} from '../src/engine/device'
import { sampleLayers } from '../src/engine/sampler/gridSampler'
import { dot480 } from '../src/engine/theme/tokens'
import type { DotInstance } from '../src/engine/types'
import { withChrome } from '../src/widgets'
import { surfacesBoard, timerSpec } from '../src/widgets/boards/surfaces'

type Assert = (name: string, cond: boolean, detail?: string) => void
const same = (a: Float32Array, b: Float32Array) => a.length === b.length && a.every((x, i) => x === b[i])

export function deviceChecks(assert: Assert) {
  const ctx = (t: number) => ({ ctx: { t, data: {} } })
  // toDevice determinism + variant choice per device grid
  const ids = Object.keys(DEVICES) as (keyof typeof DEVICES)[]
  let det = true; const used: string[] = []
  for (const id of ids) {
    const a = toDevice(timerSpec, DEVICES[id], ctx(7.3)), b = toDevice(timerSpec, DEVICES[id], ctx(7.3))
    det &&= same(a.out, b.out) && same(a.level, b.level)
    used.push(`${id}:${a.variant ? 'variant' : 'resample'}`)
  }
  const glyphV = toDevice(timerSpec, DEVICES['glyph-matrix-25']).variant, flipV = toDevice(timerSpec, DEVICES['flipdisc-28x14']).variant, einkV = toDevice(timerSpec, DEVICES['trmnl-800x480']).variant
  assert('toDevice: deterministic on every profile; curated variants for 25×25 + 28×14, resampling otherwise', det && glyphV && flipV && !einkV, used.join(' '))
  const mask = deviceMask(DEVICES['glyph-matrix-25']).reduce((s, x) => s + x, 0)
  assert('glyph-matrix-25: round mask has 489 LEDs', mask === 489, `${mask}`)

  // area weighting: a flat field of full dots reads 1, half-opacity dots read .5 at any device grid
  const flat = (opacity: number): DotInstance[] => {
    const out: DotInstance[] = []
    for (let r = 0; r < 144; r++) for (let c = 0; c < 144; c++) out.push({ x: (c + .5) * 2.25, y: (r + .5) * 2.25, r: .95, opacity, color: dot480.value!, shape: 'squircle', roundness: .1 })
    return out
  }
  const src = (o: number) => ({ dots: flat(o), width: 324, height: 324, style: { shape: 'squircle' as const, sizeMin: .2, sizeMax: .95, cornerRoundness: .1 }, pitch: 2.25 })
  const g25 = toDevice(src(1), DEVICES['glyph-matrix-25']), half = toDevice(src(.5), { ...DEVICES.plotter, cols: 37, rows: 37, bits: 8, tones: { map: 'linear' } })
  assert('toDevice: area-weighted (full field → 1, half opacity → .5, off-grid resample)', Math.abs(frameMean(g25, 'level') - 1) < .02 && Math.abs(frameMean(half, 'level') - .5) < .01,
    `full ${frameMean(g25, 'level').toFixed(4)}, half ${frameMean(half, 'level').toFixed(4)}`)

  // e-ink: 1-bit blue-noise dither keeps the mean tone
  const trmnl = DEVICES['trmnl-800x480']
  let c0 = performance.now()
  const big = toDevice(timerSpec, trmnl, ctx(12)), ms = performance.now() - c0
  const grey = toDevice({ ...src(.37), width: 324, height: 324 }, { ...trmnl, cols: 300, rows: 300 })
  const dBig = Math.abs(frameMean(big) - frameMean(big, 'level')), dGrey = Math.abs(frameMean(grey) - .37)
  const binary = big.out.every(x => x === 0 || x === 1)
  assert('e-ink dither: 1-bit, mean tone within 1% of the level (timer at 800×480, flat .37 grey)', binary && dBig < .01 && dGrey < .01,
    `timer ${frameMean(big).toFixed(4)} vs ${frameMean(big, 'level').toFixed(4)}, grey ${frameMean(grey).toFixed(4)}; 800×480 in ${ms.toFixed(1)} ms`)

  // e-ink ghosting: partials leave ghosts, the full refresh flashes and clears them; pure in t (order-free)
  const prev = previewProfile(trmnl, 1 / 6), phys = trmnl.physics
  const fa = (k: number) => toDevice(timerSpec, prev, ctx(k))
  const s1 = createEinkSim(fa, phys), s2 = createEinkSim(fa, phys)
  const ghosts = (ink: Float32Array) => ink.reduce((n, x) => n + (x > .05 && x < .8 ? 1 : 0), 0)
  const v9 = s1.at(9.9), v10 = s1.at(10.1), v10b = s1.at(10 + phys.fullS + .02), order = same(s2.at(10.1).ink, v10.ink) && same(s2.at(9.9).ink, v9.ink)
  assert('e-ink: ghosts pile up over partials, a full refresh flashes (all ink) and clears them, any call order',
    ghosts(v9.ink) > 20 && v9.phase === 'idle' && v10.phase === 'full' && s1.at(10 + phys.fullS * .375).ink.every(x => x === 1) && ghosts(v10b.ink) === 0 && order,
    `ghost px before full ${ghosts(v9.ink)}, after ${ghosts(v10b.ink)}`)

  // flip-disc: old face before the column is written, new after it settles, the sweep goes left → right
  const fp = DEVICES['flipdisc-28x14'], ff = (k: number) => toDevice(timerSpec, fp, ctx(k))
  const fs = createFlipSim(ff, fp.physics), on = (k: number) => Array.from(ff(k).out, x => (x >= .5 ? 1 : 0))
  const k = 5, before = fs.at(k + 1e-4), after = fs.at(k + .99), mid = fs.at(k + 14 * fp.physics.columnS + .03)
  const old = on(k - 1), cur = on(k)
  let ok = before.face.every((f, i) => f === old[i]) && after.face.every((f, i) => f === cur[i]) && after.moving === 0
  for (let i = 0; i < cur.length; i++) { const c = i % 28; if (c >= 16) ok &&= mid.face[i] === old[i] }
  const changed = cur.reduce((n, x, i) => n + (x !== old[i] ? 1 : 0), 0), evs = fs.events(k, k + 1), evCount = evs.reduce((n, e) => n + e.count, 0)
  const peak = Math.max(...Array.from({ length: 200 }, (_, i) => flipAngle(i / 1000, fp.physics.omega, fp.physics.zeta)))
  assert('flip-disc: old face → column sweep → new face; inertia overshoots and settles; clack events = flips',
    ok && changed > 0 && evCount === changed && evs.every((e, i) => !i || e.t > evs[i - 1].t) && peak > 1.05 && Math.abs(flipAngle(.5, fp.physics.omega, fp.physics.zeta) - 1) < .01,
    `${changed} discs flip at t=${k}, ${evs.length} column writes, peak swing ${peak.toFixed(2)}`)

  // plotter: every lit pixel gets exactly one stroke with one loop per tone level, and the replay ends with all drawn
  const pf = toDevice(timerSpec, DEVICES.plotter, ctx(0)), plan = plotPaths(pf, DEVICES.plotter.physics)
  const L = 3, seen = new Map<number, number>()
  for (const s of plan.strokes) seen.set(s.row * pf.cols + s.col, (seen.get(s.row * pf.cols + s.col) ?? 0) + 1)
  let cover = true, lit = 0
  for (let i = 0; i < pf.out.length; i++) {
    const lv = Math.round(pf.out[i] * L)
    if (lv > 0) { lit++; cover &&= seen.get(i) === 1 && plan.strokes.find(s => s.row * pf.cols + s.col === i)!.loops.length === lv }
    else cover &&= !seen.has(i)
  }
  const end = plotAt(plan, plan.duration + 1e-6), svg = penPlanSVG(plan)
  assert('plotter: paths cover every lit dot once (loops = tone level), replay finishes, SVG has one path per stroke',
    cover && lit === plan.strokes.length && end.done === plan.strokes.length && (svg.match(/<path /g) ?? []).length === lit,
    `${lit} strokes, draw ${plan.drawLen.toFixed(0)} + travel ${plan.travelLen.toFixed(0)} cells, ${plan.duration.toFixed(1)} s`)

  // clock sync: three tabs that started at different times converge on the earliest epoch → same board time
  const bus: { port: ChannelPort; peers: ChannelPort[] }[] = []
  const channel = () => {
    const port: ChannelPort = { onmessage: null, close() {}, postMessage(msg) { for (const b of bus) if (b.port !== port) b.port.onmessage?.({ data: structuredClone(msg) }) } }
    bus.push({ port, peers: [] }); return port
  }
  let wall = 1_000_000
  const now = () => wall
  const a = createClockSync({ time: () => 5, now, channel }); wall += 3000
  const b = createClockSync({ time: () => 0, now, channel }); wall += 1500
  const c = createClockSync({ time: () => 1, now, channel })
  const board = [a, b, c].map((s, i) => [5, 0, 1][i] + s.offset())
  assert('clock sync: tabs converge on the earliest epoch, so all show the same board time', board.every(x => Math.abs(x - board[0]) < 1e-9) && a.epoch() === b.epoch() && b.epoch() === c.epoch(),
    `board t ${board.map(x => x.toFixed(2)).join(' / ')}`)

  // the board: every surface renders, the board spends red once (browser arc), frame cost
  const reds = surfacesBoard.filter(p => sampleLayers(withChrome(p)({ t: 9.6, data: p.defaults ?? {} }), p.grid, p.style, dot480).some(d => d.color === dot480.dotActive))
  const times = surfacesBoard.map(p => {
    const f = withChrome(p); sampleLayers(f({ t: 30, data: {} }), p.grid, p.style, dot480)
    c0 = performance.now()
    for (let i = 0; i < 10; i++) sampleLayers(f({ t: 31 + i * .1, data: {} }), p.grid, p.style, dot480)
    return `${p.id.replace('surface-', '')} ${((performance.now() - c0) / 10).toFixed(1)}`
  })
  assert('surfaces board: one red card (the browser arc); frame ms per card', reds.length === 1 && reds[0].id === 'surface-browser', times.join(', '))
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/device.ts')) {
  let failures = 0
  deviceChecks((name, cond, detail = '') => { console[cond ? 'log' : 'error'](`${cond ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (!cond) failures++ })
  if (failures) process.exit(1)
}
