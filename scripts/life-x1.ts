/**
 * X1 checks (docs/living-matter/X-advanced.md §7 X1: #1 suminagashi, #5 the daily and ageing pond, #12's stateful
 * half, #18 view transitions; the browser half is in scripts/life-browser.ts). Called from scripts/life.ts.
 *
 * - Marbling math: a drop's backward map inverts its forward map; the op-major bake equals walking the list per cell;
 *   the pristine list has 40–80 operations and every station ring starts ≥ RING_MIN cells wide.
 * - `pond-marble`: t = 0 content (ink, the beni ring in red, koi lattice dots), one accent, pure in t, the 48 s loop
 *   closes exactly, the koi comb the ink (cells near a koi differ from the bake, far ones don't), a tap lays a drop
 *   (the newest is the red one) and a drag a stroke, both heal back to the pristine frame, violent input stays
 *   finite, frame and cold-bake budgets, memory.
 * - Day and age: day 0 / age 0 is the canonical spec (goldens), dates round-trip, the weather mixes over 1,000 days, a
 *   day changes the koi and the marble frames (purely), fry follow von Bertalanffy, and the 9-koi pond still passes
 *   L1.7's memory gate (288 KB with 6 working copies).
 * - Storage: nothing is written without the opt-in (the day source, a visit, a midnight roll); the opt-in writes one
 *   record ≤ 200 B, counts a visit once a day, and off deletes it; only `src/site/pondMemory.ts` touches storage.
 * - #12: the packed hysteresis state's memory, computed against the same gate (it is dropped: see LIFE.md "X1").
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { koiPathAt, koiView, marbleBake, marbleOps, marbleToneAt, OP_DROP, OP_STRIDE, RING_MIN, MARBLE_SIZE } from '../src/engine/life'
import { simReset } from '../src/engine/sim'
import { worldAt, worldReset } from '../src/engine/physics/world'
import { sampleLayers } from '../src/engine/sampler/gridSampler'
import { dot480 } from '../src/engine/theme/tokens'
import { withChrome, type WidgetPreset } from '../src/widgets/types'
import { fmtLoaded, medianLoaded, onceLoaded } from './lib/load'

type Assert = (name: string, cond: boolean, detail?: string) => void
const rng = (seed: number) => () => { seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) | 0; return ((seed ^ (seed >>> 13)) >>> 0) / 4294967296 }

export async function lifeX1Checks(assert: Assert, pond: () => Promise<typeof import('../src/widgets/boards/pond/index')>): Promise<void> {
  const { pondBoard } = await pond()
  const M = await import('../src/widgets/boards/pond/marble'), K = await import('../src/widgets/boards/pond/koi'), D = await import('../src/widgets/boards/pond/day')
  const card = (id: string) => pondBoard.find(p => p.id === id) as WidgetPreset
  const frame = (p: WidgetPreset, t: number, extra: Record<string, unknown> = {}) => sampleLayers(withChrome(p)({ t, data: {}, ...extra } as Parameters<WidgetPreset['layers']>[0]), p.grid, p.style, dot480)
  const key = (p: WidgetPreset, t: number, extra: Record<string, unknown> = {}) => JSON.stringify(frame(p, t, extra))
  const mc = card('pond-marble'), m = M.marble, W = m.world, P = m.spec.period

  // ── marbling math ──
  {
    const r = rng(5)
    let worst = 0
    for (let k = 0; k < 2000; k++) {
      const cx = r() * 144, cy = r() * 144, rad = 2 + r() * 20, x = r() * 144, y = r() * 144, dx = x - cx, dy = y - cy, q = dx * dx + dy * dy
      const f = Math.sqrt(1 + rad * rad / q), fx = cx + dx * f, fy = cy + dy * f
      const bx = fx - cx, by = fy - cy, g = Math.sqrt(1 - rad * rad / (bx * bx + by * by)), ex = cx + bx * g - x, ey = cy + by * g - y
      worst = Math.max(worst, Math.abs(ex), Math.abs(ey))
    }
    assert('marble: a drop\'s backward map inverts its forward map (2,000 random points, |error| < 1e-9 cells)', worst < 1e-9, `max ${worst.toExponential(1)}`)
    const ops = marbleOps(480, M.marbleSdf), n = ops.length / OP_STRIDE, bake = marbleBake(ops, m.spec.card, M.marbleSdf)
    let bad = 0
    for (let y = 0; y < 144; y++) for (let x = 0; x < 144; x++) if (M.marbleSdf(x, y) < 0 && bake[y * 144 + x] !== marbleToneAt(ops, x, y)) bad++
    // ring widths as laid: consecutive drops at one centre, newest-first radii
    let thin = 0
    for (let k = 1; k < n; k++) {
      const a = (k - 1) * OP_STRIDE, b = k * OP_STRIDE
      if (ops[a] !== OP_DROP || ops[b] !== OP_DROP || ops[a + 1] !== ops[b + 1] || ops[a + 2] !== ops[b + 2]) continue
      // drop a (older) then b (newer): a's ring spans [r_b, √(r_a² + r_b²)]
      const w = Math.sqrt(ops[a + 3] ** 2 + ops[b + 3] ** 2) - ops[b + 3]
      if (w < RING_MIN - 1e-9) thin++
    }
    assert(`marble: the pristine list has 40–80 operations, the op-major bake equals walking the list cell for cell, rings laid ≥ ${RING_MIN} cells`, n >= 40 && n <= 80 && !bad && !thin, `${n} ops, ${bad} cells differ, ${thin} thin rings`)
    const days = [1, 2, 369, 999].map(d => marbleOps(d * 7919, M.marbleSdf).length / OP_STRIDE)
    assert('marble: other seeds also give 40–80 operations', days.every(k => k >= 40 && k <= 80), days.join(', '))
  }

  // ── pond-marble at rest ──
  {
    worldReset(W); simReset(W.sim)
    const f0 = frame(mc, 0), red = f0.filter(d => d.color === dot480.dotActive).length, ink = f0.filter(d => d.color === dot480.value || d.color === dot480.dotMid).length
    const off = f0.concat(frame(mc, 1.3)).filter(d => ![dot480.dotFaint, dot480.dotMid, dot480.dotIdle, dot480.value, dot480.dotActive].includes(d.color)).length
    // koi interiors are lattice-4 dots: count the raster's big dots
    const big = M.marbleProbe.raster.bigCount
    assert('pond-marble: t = 0 shows ink (≥ 1,500 dots), the beni ring (20–200 red dots) and koi lattice dots (≥ 12); one accent (no activeDim, nothing off the palette)', ink >= 1500 && red >= 20 && red <= 200 && big >= 12 && off === 0, `${ink} ink, ${red} red, ${big} koi lattice dots, ${off} off-palette`)
    const ts = [0, 1.3, 7.7, 3600.2], first = ts.map(t => key(mc, t))
    worldReset(W); simReset(W.sim)
    const again = [...ts].reverse().map(t => key(mc, t)).reverse()
    assert('pond-marble: pure in t (0, 1.3, 7.7, 3600.2 in any order, after a reset)', first.every((k, i) => k === again[i]))
    const wrap = [0, 5.1, 30.4].every(t => key(mc, t) === key(mc, t + P))
    assert(`pond-marble: the loop closes exactly: frame(t) = frame(t + ${P} s)`, wrap)
    // the koi comb the ink: cells near a koi head differ from the bake, cells far from every koi's last 10 s don't
    const pt = new Float64Array(3), probe = M.marbleProbe.raster
    frame(mc, 20)
    let near = 0, nearN = 0, far = 0, farN = 0
    const heads: [number, number][] = []
    for (let k = 0; k < m.spec.koi.length; k++) for (let j = 0; j <= 24; j++) { koiPathAt(m, k, 20 - j * .4, pt); heads.push([pt[0], pt[1]]) }
    for (const i of m.cells) {
      const x = i % 144, y = (i / 144) | 0, d = Math.min(...heads.map(([hx, hy]) => Math.hypot(hx - x, hy - y)))
      const was = m.bake![i], now = probe.tone[i]
      if (probe.bigTone[Math.floor((y - 11) / 4) * 36 + Math.floor(x / 4)] >= 0) continue
      if (d > 36) { farN++; if (now !== was && !(now === -1 && was === -1)) far++ } else if (d < 14) { nearN++; if (now !== was) near++ }
    }
    assert('pond-marble: the koi comb the ink: ≥ 10 % of the cells within 14 cells of their last 10 s of path differ from the pristine bake, ≤ 1 % of those 36+ cells away', near >= .1 * nearN && far <= .01 * farN, `${near}/${nearN} near, ${far}/${farN} far`)
  }

  // ── pond-marble input ──
  {
    worldReset(W); simReset(W.sim)
    const ctx = (t: number, x: number, y: number, down: boolean, extra: Record<string, unknown> = {}) => ({ pointers: [{ id: 1, x, y, down, inside: true, tDown: 0, tUp: 0, vx: 0, vy: 0, pressure: 0 }], ...extra })
    let t = 30
    const pristine = key(mc, 40)
    worldReset(W)
    // a tap at (60, 70): down for 3 frames, up
    for (let i = 0; i < 3; i++) { frame(mc, t, ctx(t, 60, 70, true)); t += 1 / 20 }
    frame(mc, t, ctx(t, 60, 70, false)); t += 1 / 20
    for (let i = 0; i < 12; i++) { frame(mc, t, { pointers: [] }); t += 1 / 20 }
    const drops = M.marbleProbe.drops(W.live)
    const red = frame(mc, t).filter(d => d.color === dot480.dotActive)
    const nearTap = red.filter(d => Math.hypot(d.x / mc.grid.pitch! - .5 - 60, d.y / mc.grid.pitch! - .5 - 70) < 14).length
    assert('pond-marble: a tap forks the world and lays one drop that blooms (r ≥ 5 cells in .6 s, a water core opening); the newest drop is the red ring', W.mode !== 'pristine' && drops.length === 1 && drops[0][2] >= 5 && drops[0][3] > 1 && nearTap >= 20, `${W.mode}, drops ${JSON.stringify(drops.map(d => d.map(v => +v.toFixed(1))))}, ${nearTap} red dots near the tap`)
    // a second tap: it becomes the red one, the first turns sumi
    for (let i = 0; i < 3; i++) { frame(mc, t, ctx(t, 100, 100, true)); t += 1 / 20 }
    frame(mc, t, ctx(t, 100, 100, false)); t += 1 / 20
    for (let i = 0; i < 12; i++) { frame(mc, t, { pointers: [] }); t += 1 / 20 }
    const red2 = frame(mc, t).filter(d => d.color === dot480.dotActive), at = (cx: number, cy: number) => red2.filter(d => Math.hypot(d.x / mc.grid.pitch! - .5 - cx, d.y / mc.grid.pitch! - .5 - cy) < 12).length
    assert('pond-marble: a second tap takes the red; the first drop turns sumi', at(100, 100) >= 20 && at(60, 70) <= 4, `${at(100, 100)} red at the new drop, ${at(60, 70)} at the old`)
    // a drag lays a stroke
    for (let i = 0; i < 20; i++) { frame(mc, t, ctx(t, 30 + i * 3, 110, true)); t += 1 / 20 }
    frame(mc, t, ctx(t, 90, 110, false)); t += 1 / 20
    const strokes = M.marbleProbe.strokes(W.live), drops3 = M.marbleProbe.drops(W.live).length
    assert('pond-marble: a drag lays a stroke (≥ 10 points) and no drop', strokes >= 10 && drops3 === 2, `${strokes} stroke points, ${drops3} drops`)
    // heal: idle 6 s + heal 4 s
    for (let i = 0; i < 20 * 12; i++) { frame(mc, t, { pointers: [] }); t += 1 / 20 }
    assert('pond-marble: the visitor\'s ink heals back: pristine again 12 s after the last input, and the frame equals the pristine frame', W.mode === 'pristine' && key(mc, 40) === pristine, W.mode)
    // violent input
    worldReset(W)
    const rv = rng(23), resets = W.resets
    let tt = 30, finite = true
    for (let k = 0; k < 300; k++) { tt += 1 / 20; const s = worldAt(W, tt, { pointers: [{ id: 1, x: rv() * 200 - 30, y: rv() * 200 - 30, down: rv() < .5 }], kick: rv() < .05 }); if (!s.every(Number.isFinite)) finite = false; frame(mc, tt) }
    assert('pond-marble: 300 frames of violent random input stay finite (resets = 0)', finite && W.resets === resets, `resets ${W.resets - resets}`)
    worldReset(W); simReset(W.sim)
  }

  // ── budgets ──
  {
    const cold = onceLoaded(() => marbleBake(marbleOps(4242, M.marbleSdf), m.spec.card, M.marbleSdf))
    assert('pond-marble: the cold bake (once per day per mount: 40–80 ops × 18k cells) ≤ 40 ms × load', cold.ms <= 40 * cold.load, fmtLoaded(cold))
    for (let i = 0; i < 6; i++) frame(mc, 40 + i / 20)
    const fr = medianLoaded(i => frame(mc, 41 + i / 20), 15)
    console.log(`  life: X1 pond-marble frame ${fmtLoaded(fr)}, cold bake ${fmtLoaded(cold)}`)
    assert('pond-marble: frame (layers + sample, pristine) ≤ 4 ms median warm × load', fr.ms <= 4 * fr.load, fmtLoaded(fr))
    worldReset(W)
    let t = 50
    for (let i = 0; i < 3; i++) { frame(mc, t, { pointers: [{ id: 1, x: 58, y: 72, down: true, inside: true, tDown: 0, tUp: 0, vx: 0, vy: 0, pressure: 0 }] }); t += .05 }
    const live = medianLoaded(i => frame(mc, t + i / 20, { pointers: [{ id: 1, x: 40 + i * 2, y: 86, down: true, inside: true, tDown: 0, tUp: 0, vx: 0, vy: 0, pressure: 0 }] }), 15)
    assert('pond-marble: live frame while dragging (strokes + drops) ≤ 4 ms × load', live.ms <= 4 * live.load, `${fmtLoaded(live)}, mode ${W.mode}`)
    worldReset(W); simReset(W.sim)
    for (let k = 0; k <= 2 * P * 30; k += 9) worldAt(W, k / 30)
    const bytes = (W.sim.checkpoints.size + 6) * MARBLE_SIZE * 4 + m.bake!.length + m.cells.length * 12 + m.lut.length * 4
    assert('pond-marble: memory (checkpoints + 6 copies + bake + cell tables) ≤ 256 KB', bytes <= 256 * 1024, `${(bytes / 1024).toFixed(1)} KB (world ${((W.sim.checkpoints.size + 6) * MARBLE_SIZE * 4 / 1024).toFixed(1)} KB)`)
    worldReset(W); simReset(W.sim)
  }

  // ── the day and the age ──
  {
    assert('pond day: day 0 / age 0 is the canonical spec (the goldens\' pond); dates round-trip; malformed dates are refused',
      K.koiSpecFor(0, 0) === K.KOI_SPEC && D.dayIndex(D.DAY_EPOCH) === 0 && D.dayIndex('2026-10-31') === 369 && D.dayString(369) === '2026-10-31' && D.dayIndex('2026-02-30') === undefined && D.dayIndex('31/10/2026') === undefined
      && D.dayParam('?day=2026-10-31&x=1') === '2026-10-31' && D.dayParam('?day=yesterday') === undefined && D.dayLabel(369) === 'OCT 31')
    const n = { calm: 0, wind: 0, rain: 0 }
    for (let d = 1; d <= 1000; d++) n[K.weatherOf(d)]++
    let flips = 0
    for (let d = 2; d <= 1000; d++) if (K.weatherOf(d) !== K.weatherOf(d - 1)) flips++
    assert('pond day: over 1,000 days each weather (calm, wind, rain) has 15–60 % of the days and it changes on ≤ 35 % of days (smooth)', Object.values(n).every(v => v >= 150 && v <= 600) && flips <= 350, `${JSON.stringify(n)}, ${flips} changes`)
    const kc = card('pond-koi')
    const k0 = key(kc, 3), kd = key(kc, 3, { data: { ...kc.defaults, day: 369 } }), kd2 = key(kc, 3, { data: { ...kc.defaults, day: 369 } })
    const m0 = key(mc, 3), md = key(mc, 3, { data: { day: 369 } }), cap = frame(mc, 3, { data: { day: 369 } }).length
    assert('pond day: another day draws another koi pond and another marble (and the same one again: pure)', k0 !== kd && kd === kd2 && m0 !== md && cap > 0)
    const fl = [0, 9, 10, 15, 20, 30, 60, 400].map(a => K.fryLengths(a))
    const grows = K.fryLengths(10)[0] < K.fryLengths(25)[0] && K.fryLengths(25)[0] < K.fryLengths(80)[0]
    assert(`pond age: fry hatch every ${K.FRY_EVERY} days of visits (≤ ${K.FRY_MAX}), grow by von Bertalanffy toward ${K.FRY_LINF} cells`, fl[0].length === 0 && fl[1].length === 0 && fl[2].length === 1 && fl[4].length === 2 && fl[5].length === 3 && fl[7].length === 3 && grows && fl[7].every(l => l <= K.FRY_LINF), fl.map(f => f.join('/') || '-').join(' '))
    // the 9-koi pond (an old visitor's) against L1.7's gate
    const old = K.koiFor(369, 400), OW = old.world
    simReset(OW.sim)
    for (let k = 0; k <= 360 + 2 * 1440; k += 3) worldAt(OW, k / 30)
    const bytes = (OW.sim.checkpoints.size + 6) * OW.spec.size * 4
    let inside = true
    for (let k = 0; k < 600; k += 30) { const s = worldAt(OW, k / 30); for (let i = 0; i < old.spec.koi.length; i++) { const v = koiView(old, s, i); if (old.spec.sdf(v.x, v.y) > 2) inside = false } }
    const kf = card('pond-koi'), d9 = { data: { ...kf.defaults, day: 369, age: 400 } }, d0 = { data: { ...kf.defaults } }
    for (let i = 0; i < 6; i++) { frame(kf, 60 + i / 30, d9); frame(kf, 60 + i / 30, d0) }
    // best of 3 medians each (interleaved), as the browser benches do: one median on a crowded box catches other agents' bursts
    const best = (d: typeof d0, k: number) => [0, 1, 2].map(j => medianLoaded(i => frame(kf, 61 + 2 * j + k + i / 30, d), 15)).sort((x, y) => x.ms / x.load - y.ms / y.load)[0]
    const fr = best(d9, 0), base = best(d0, .5)
    // the canonical koi frame sits near 4 ms × load on a loaded box (its own budget check is L1's): the fry may add ≤ 25 %
    assert('pond age: the 9-koi pond (3 grown fry) passes L1.7\'s gate (≤ 288 KB with 6 copies), keeps every koi in the water, and draws ≤ 4 ms × load or ≤ 1.25 × the canonical koi frame', bytes <= 288 * 1024 && inside && (fr.ms <= 4 * fr.load || fr.ms / fr.load <= 1.25 * base.ms / base.load), `${(bytes / 1024).toFixed(1)} KB, ${old.spec.koi.length} koi, frame ${fmtLoaded(fr)} vs canonical ${fmtLoaded(base)}`)
    simReset(OW.sim); worldReset(OW)
    K.koiFor(0, 0)
    // #12's stateful half: 6 bits per tile, 4 tiles per float-exact 24-bit integer
    // (6 bits per tile, 4 tiles per float-exact 24-bit integer): it fits the six-koi pond with 1.5 KB to spare, not an
    // aged one; and any hysteresis in the pristine run moves pond-koi's goldens (frames depend on history), so X1 drops it
    const tiles = 36 * 33, packed = Math.ceil(tiles / 4), size0 = K.koiFor(0, 0).world.spec.size, size9 = old.spec.koi.length === 9 ? OW.spec.size : 0
    const with6 = (15 + 6) * (size0 + packed) * 4, with9 = (15 + 6) * (size9 + packed) * 4
    console.log(`  life: X1 #12 packed hysteresis: +${packed} floats per state; 6-koi total ${(with6 / 1024).toFixed(1)} KB, 9-koi ${(with9 / 1024).toFixed(1)} KB (gate 288; checkpoints alone ${(15 * (size0 + packed) * 4 / 1024).toFixed(1)} KB) → dropped`)
    assert('pond: #12\'s packed glyph hysteresis breaks L1.7\'s memory gate for an aged (9-koi) pond (dropped in X1)', with9 > 288 * 1024, `6 koi ${(with6 / 1024).toFixed(1)} KB, 9 koi ${(with9 / 1024).toFixed(1)} KB > 288 KB`)
  }

  // ── storage: never written without the opt-in ──
  {
    const writes: string[] = [], data = new Map<string, string>()
    const fake = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { writes.push(k); data.set(k, v) }, removeItem: (k: string) => { writes.push(`-${k}`); data.delete(k) } }
    const g = globalThis as Record<string, unknown>
    const saved = { localStorage: g.localStorage, window: g.window, location: g.location }
    const timers: (() => void)[] = []
    g.localStorage = fake
    g.location = { search: '?day=2026-10-31', href: 'https://x/pond/?day=2026-10-31' }
    g.window = { requestIdleCallback: (cb: () => void) => { timers.push(cb); return 1 }, cancelIdleCallback: () => {}, setTimeout: (cb: () => void) => { timers.push(cb); return 1 } }
    try {
      const S = await import('../src/site/pondMemory'), src = D.pondDaySource
      const seen: number[][] = []
      const off = src.subscribe(s => seen.push([s.data.day, s.data.age]))
      for (const f of timers.splice(0)) f()
      S.recordPondVisit('2026-11-01')
      const noWrite = writes.length === 0 && S.readPondMemory() === null && src.snapshot().data.day === 369 && src.snapshot().data.age === 0
      assert('pond memory: off by default: the day source (subscribe, the idle read, a visit) writes nothing; ?day= sets day 369, age 0', noWrite, `${writes.length} writes, ${JSON.stringify(seen)}`)
      S.setPondMemory(true, '2026-10-31')
      const rec = data.get(S.POND_MEMORY_KEY) ?? ''
      S.recordPondVisit('2026-10-31'); S.recordPondVisit('2026-11-01'); S.recordPondVisit('2026-11-01'); S.recordPondVisit('2026-11-02')
      const after = S.readPondMemory(), age = src.snapshot().data.age
      S.setPondMemory(false)
      assert('pond memory: the opt-in writes one record ≤ 200 B, counts a visit once a day (age = visits − 1), and off deletes it',
        rec.length > 0 && rec.length <= 200 && after?.visits === 3 && D.ageOf(after) === 2 && data.size === 0 && writes.every(k => k === S.POND_MEMORY_KEY || k === `-${S.POND_MEMORY_KEY}`) && age === 0,
        `record ${rec.length} B, visits ${after?.visits}, keys ${[...new Set(writes)].join(' ')}`)
      off()
      const l1 = S.withPondDay('https://x/pond/', true), l2 = S.withPondDay('https://x/widget/pond-koi/?theme=dark_signal', true), l3 = S.withPondDay('https://x/lock/', false)
      g.location = { search: '', href: 'https://x/pond/' }
      const l4 = S.withPondDay('https://x/pond/', true)
      assert('pond links carry ?day=: the page\'s own ?day= (a shared pond stays the one the sender saw), else today; other links pass through',
        l1 === 'https://x/pond/?day=2026-10-31' && l2 === 'https://x/widget/pond-koi/?theme=dark_signal&day=2026-10-31' && l3 === 'https://x/lock/' && /^https:\/\/x\/pond\/\?day=\d{4}-\d{2}-\d{2}$/.test(l4), [l1, l2, l3, l4].join(' '))
    } finally {
      g.localStorage = saved.localStorage; g.window = saved.window; g.location = saved.location
    }
    // only pondMemory.ts may touch storage on the pond's paths
    const files = ['src/widgets/boards/pond', 'src/engine/life'].flatMap(d => readdirSync(d, { recursive: true, encoding: 'utf8' }).filter(f => /\.tsx?$/.test(f)).map(f => join(d, f))).concat(['src/site/viewTransition.ts'])
    const touches = files.filter(f => /localStorage|sessionStorage|indexedDB|document\.cookie/.test(readFileSync(f, 'utf8')))
    assert('pond memory: no pond card, engine or the transition code touches storage (only src/site/pondMemory.ts does)', !touches.length, touches.join(', '))
  }
}
