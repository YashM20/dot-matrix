/**
 * Checks for the niche-algorithm sources (`src/engine/algo`, docs/ALGORITHMS.md) and the `algorithms` board.
 * Called from verify.ts (`algorithmsChecks(assert)`); also runnable alone: `npx tsx scripts/algorithms.ts`.
 * Covers, per algorithm: determinism (fresh instances agree bit for bit), bounds / invariants (stipples stay
 * on the density, the WFC tiling is consistent and its history monotone, DLA discs never overlap and each
 * touches its parent, the attractor path never collapses), and a timing budget. Then the board: t = 0 is
 * the finished picture, frames are pure in t, and a frame fits the 4 ms hero budget (median, warm).
 * Timings are printed; budgets scale by a measured load factor so a busy CI box doesn't fail them.
 */
import { attractorDensity, dla, dsin, stipple, tsin, wfc } from '../src/engine/algo'
import { sampleLayers } from '../src/engine/sampler/gridSampler'
import { dot480 } from '../src/engine/theme/tokens'
import { withChrome, type WidgetPreset } from '../src/widgets'
import { algorithmsBoard, algorithmsSources as A } from '../src/widgets/boards/algorithms'

type Assert = (name: string, cond: boolean, detail?: string) => void
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1] }
const time = <T>(f: () => T): [number, T] => { const a = performance.now(), r = f(); return [performance.now() - a, r] }
const same = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === b.length && Array.prototype.every.call(a, (x: number, i: number) => Object.is(x, b[i]))

/**
 * How much slower this machine is right now than the one the budgets were set on: a fixed float loop that
 * takes ~12 ms there. Timing budgets scale by it (never below 1), so a loaded CI box doesn't fail them.
 */
function loadFactor(): number {
  const run = () => { let s = 0; for (let i = 0; i < 1e7; i++) s += (i & 7) * .5; return s }
  run()
  const ms = median([0, 1, 2].map(() => time(run)[0]))
  return Math.max(1, ms / 12)
}

export function algorithmsChecks(assert: Assert): void {
  const load = loadFactor()
  console.log(`  algorithms: load factor ${load.toFixed(2)} (timing budgets scale by it)`)
  // ── stippling ───────────────────────────────────────────────────────────────────────────────────
  {
    const density = (x: number, y: number) => { const d = Math.sqrt((x - 60) ** 2 + (y - 60) ** 2) / 52; return d > 1 ? 0 : (1 - d) * (x / 120) }
    const mk = (exact?: number) => stipple({ w: 120, h: 120, n: 600, seed: 5, iterations: 12, density, exact })
    const a = mk(), b = mk(), ex = mk(Infinity)
    const fa = a.frame(12)
    assert('stipple: deterministic (fresh instances agree bit for bit)', same(fa, b.frame(12)) && same(a.frame(0), b.frame(0)))
    let maxDiff = 0, sumDiff = 0
    const fe = ex.frame(12)
    for (let i = 0; i < fa.length; i++) { const e = Math.abs(fa[i] - fe[i]); maxDiff = Math.max(maxDiff, e); sumDiff += e }
    assert('stipple: the Voronoi-neighbour walk lands where the exact bucket search does (max < .5 px, mean < .01 px)', maxDiff < .5 && sumDiff / fa.length < .01,
      `max ${maxDiff.toExponential(1)}, mean ${(sumDiff / fa.length).toExponential(1)} px`)
    let off = 0
    for (let i = 0; i < 600; i++) { const x = fa[i * 2], y = fa[i * 2 + 1]; if (!(x >= 0 && y >= 0 && x <= 120 && y <= 120) || a.densityAt(x, y) <= 0) off++ }
    const m = [1, 2, 4, 8, 12].map(k => a.moved(k))
    assert('stipple: every stipple ends on the density; Lloyd steps shrink (converging)', off === 0 && m[4] < m[0] / 10 && m.every((x, i) => i === 0 || x <= m[i - 1] * 1.05),
      `${off} off; mean move ${m.map(x => x.toFixed(3)).join(' → ')} px`)
    // the card's moon: build + every Lloyd iteration, cold (it is built lazily on the first frame)
    const [ms, moon] = time(() => { const s = stipple({ w: A.moon().w, h: A.moon().h, n: A.STIPPLES, seed: 9, iterations: A.LLOYD, density: (x, y) => A.moon().rho[Math.floor(y) * A.moon().w + Math.floor(x)] }); s.frame(A.LLOYD); return s })
    assert('stipple: the moon card (2,400 stipples, 12 Lloyd iterations at 1.5× pitch) builds cold in ≤ 400 ms', ms <= 400 * load && moon.moved(A.LLOYD) < .05, `${ms.toFixed(0)} ms, last move ${moon.moved(A.LLOYD).toFixed(4)} px`)
  }

  // ── attractor ───────────────────────────────────────────────────────────────────────────────────
  {
    let es = 0, et = 0
    for (let i = -5000; i <= 5000; i++) { const x = i * .0137; es = Math.max(es, Math.abs(dsin(x) - Math.sin(x))); et = Math.max(et, Math.abs(tsin(x) - Math.sin(x))) }
    assert('attractor: dsin within 1e-8 of Math.sin, the table sine within 1e-6', es < 1e-8 && et < 1e-6, `${es.toExponential(1)}, ${et.toExponential(1)}`)
    const p = A.attractorAt(0), o = { w: 144, h: 114, iterations: A.AT_ITER, margin: 2 }
    const r1 = attractorDensity(p, o), r2 = attractorDensity(p, o)
    let inRange = true, top = 0
    for (const v of r1.density) { if (!(v >= 0 && v <= 1)) inRange = false; top = Math.max(top, v) }
    assert('attractor: deterministic, log density in [0, 1] with the busiest pixel at 1', same(r1.density, r2.density) && inRange && top === 1, `${r1.covered} px hit, max ${r1.max} hits`)
    // the card's parameter path, sampled over one full beat of its two periods (37 s × 23 s), never collapses
    let worst = Infinity, nudged = 0
    const ms: number[] = []
    for (let t = 0; t < 851; t += 7.3) {
      const [dt, r] = time(() => attractorDensity(A.attractorAt(t), { ...o, minCovered: A.AT_MIN_COVER }))
      ms.push(dt); worst = Math.min(worst, r.covered); if (r.a !== A.attractorAt(t).a || r.b !== A.attractorAt(t).b) nudged++
    }
    assert('attractor: the drifting card path never collapses into a periodic window (nudged out when it would)', worst >= A.AT_MIN_COVER, `worst ${worst} px over ${ms.length} samples, ${nudged} nudged`)
    console.log(`  attractor: ${A.AT_ITER / 1000}k orbit steps per frame, median ${median(ms).toFixed(2)} ms (the card frame budget below covers it)`)
  }

  // ── wave function collapse ────────────────────────────────────────────────────────────────────────
  {
    const tiles = A.knotTiles, [W, H] = A.KNOT_GRID, ms: number[] = [], prints = new Set<string>()
    let bad = 0, monotone = true, border = true, observedOk = true
    for (let seed = 1; seed <= 32; seed++) {
      const [dt, r] = time(() => wfc({ w: W, h: H, tiles, seed, border: 0 }))
      ms.push(dt)
      if (!r.ok) { bad++; continue }
      prints.add(Array.from(r.tiles).join(','))
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const e = tiles[r.tiles[y * W + x]].edges
        if (x + 1 < W && e[1] !== tiles[r.tiles[y * W + x + 1]].edges[3]) bad++
        if (y + 1 < H && e[2] !== tiles[r.tiles[(y + 1) * W + x]].edges[0]) bad++
        if ((x === 0 && e[3]) || (y === 0 && e[0]) || (x === W - 1 && e[1]) || (y === H - 1 && e[2])) border = false
      }
      for (let s = 1; s < r.history.length; s++) for (let i = 0; i < W * H; i++) if (r.history[s][i] > r.history[s - 1][i]) monotone = false
      // each observed cell is settled from its step on, and the last row is fully collapsed
      r.observed.forEach((c, s) => { if (r.settledAt[c] > s + 1 || r.history[s + 1][c] !== 1) observedOk = false })
      if (r.history[r.history.length - 1].some(n => n !== 1)) observedOk = false
    }
    const again = wfc({ w: W, h: H, tiles, seed: 7, border: 0 }), first = wfc({ w: W, h: H, tiles, seed: 7, border: 0 })
    assert('wfc: 32 seeds solve; every touching socket matches and the border stays closed', bad === 0 && border, `${bad} failures / mismatches`)
    assert('wfc: history is monotone (options only shrink), observed cells settle at their step, the end is fully collapsed', monotone && observedOk)
    assert('wfc: deterministic for a seed, different seeds give different knots', same(again.tiles, first.tiles) && same(again.observed, first.observed) && prints.size >= 30, `${prints.size}/32 distinct`)
    assert('wfc: a 15 × 12 knot solves in ≤ 60 ms (median, backtracking included)', median(ms) <= 60 * load, `median ${median(ms).toFixed(1)} ms, worst ${Math.max(...ms).toFixed(1)} ms`)
  }

  // ── diffusion-limited aggregation ───────────────────────────────────────────────────────────────
  {
    const [W, H] = A.DLA_DOMAIN
    const [ms, d] = time(() => dla({ w: W, h: H, n: 4000, seed: 12 })), e = dla({ w: W, h: H, n: 4000, seed: 12 })
    assert('dla: deterministic (fresh runs agree bit for bit)', d.count === e.count && same(d.x, e.x) && same(d.y, e.y) && same(d.parent, e.parent))
    let overlap = 0, detached = 0, outside = 0, grows = true
    const cell = new Map<number, number[]>()
    for (let i = 0; i < d.count; i++) {
      const x = d.x[i], y = d.y[i], cx = Math.floor(x), cy = Math.floor(y)
      if (x < 0 || y < 0 || x > W || y > H) outside++
      for (let yy = cy - 1; yy <= cy + 1; yy++) for (let xx = cx - 1; xx <= cx + 1; xx++) for (const j of cell.get(yy * 4096 + xx) ?? []) if (Math.hypot(d.x[j] - x, d.y[j] - y) < 1 - 1e-3) overlap++
      ;(cell.get(cy * 4096 + cx) ?? cell.set(cy * 4096 + cx, []).get(cy * 4096 + cx)!).push(i)
      if (i > 0 && Math.abs(Math.hypot(d.x[d.parent[i]] - x, d.y[d.parent[i]] - y) - 1) > 1e-3) detached++
      if (i > 0 && d.radius[i] < d.radius[i - 1]) grows = false
    }
    assert('dla: discs never overlap, each touches the disc it stuck to, all inside the domain, radius only grows', overlap === 0 && detached === 0 && outside === 0 && grows, `${d.count} discs, ${overlap} overlaps, ${detached} detached, ${outside} outside, grows ${grows}`)
    let sx = 0, sy = 0, sxx = 0, sxy = 0, m = 0
    for (let i = 60; i < d.count; i += 8) { const x = Math.log(d.gyration[i]), y = Math.log(i + 1); sx += x; sy += y; sxx += x * x; sxy += x * y; m++ }
    const D = (m * sxy - sx * sy) / (m * sxx - sx * sx)
    assert('dla: mass–gyration fractal dimension is the plane DLA value (1.6–1.85; 1.71 in the limit)', D > 1.6 && D < 1.85, D.toFixed(3))
    assert('dla: the card cluster grows cold in ≤ 300 ms', ms <= 300 * load, `${ms.toFixed(0)} ms, ${d.steps} jumps`)
  }

  // ── the board ──────────────────────────────────────────────────────────────────────────────────
  {
    const frame = (p: WidgetPreset, t: number) => sampleLayers(withChrome(p)({ t, data: {} }), p.grid, p.style, dot480)
    const key = (p: WidgetPreset, t: number) => JSON.stringify(frame(p, t))
    const pure = algorithmsBoard.every(p => [0, 1.3, 7.7, 3600].every(t => key(p, t) === key(p, t)))
    assert('algorithms board: every card is a pure function of t (same t, same dots, any order)', pure)
    const texts = (p: WidgetPreset, t: number) => withChrome(p)({ t, data: {} }).map(l => l.field.text).filter(Boolean).join('|')
    const done = texts(algorithmsBoard[0], 0).includes(`LLOYD ${A.LLOYD}/${A.LLOYD}`) && texts(algorithmsBoard[2], 0).includes('180/180')
    assert('algorithms board: t = 0 (goldens, thumbnails, reduced motion) is the finished picture', done && !frame(algorithmsBoard[0], 0).some(d => d.color === dot480.dotActive))
    const red = algorithmsBoard.map(p => [0, 6, 9.5].some(t => frame(p, t).some(d => d.color === dot480.dotActive)))
    assert('algorithms board: one accent, used only for the live front (stipple knob, observed tile, newest grains)', red[0] && !red[1] && red[2] && red[3])
    const warmMedian = (p: WidgetPreset) => {
      for (let i = 0; i < 4; i++) frame(p, i / 60)
      return median(Array.from({ length: 13 }, (_, i) => time(() => frame(p, 5.5 + i / 60))[0]))
    }
    const rows = algorithmsBoard.map(p => [p.id, warmMedian(p)] as const)
    assert('algorithms board: a frame (layers + sample) of each card in ≤ 4 ms (median, warm; × load)', rows.every(([, ms]) => ms <= 4 * load),
      rows.map(([id, ms]) => `${id} ${ms.toFixed(2)}`).join(', ') + ' ms')
  }
}

const self = process.argv[1]?.replace(/\\/g, '/')
if (self && import.meta.url.endsWith(self.split('/').slice(-2).join('/'))) {
  let failures = 0
  algorithmsChecks((name, cond, detail = '') => { if (!cond) failures++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) })
  if (failures) process.exit(1)
}
