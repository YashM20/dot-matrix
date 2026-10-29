/**
 * L2 checks (docs/living-matter/L-pond.md §L2 "L2 steps"): the ecosystem engine (physarum and ants, Kuramoto and
 * Mirollo–Strogatz, space colonisation and L-systems, flock / kNearest) and the five L2 pond cards (jelly, slime,
 * fireflies, murmur, terrarium): t = 0 content, accent masks, interaction and heal, purity, seams, memory and frame
 * budgets, plus the board's totals. Called from scripts/life.ts (`lifeChecks`), so `npx tsx scripts/life.ts` runs it.
 */
import {
  antsInit, antsStep, antViews, bellView, colonise, createAnts, createPhysarum, creeperGrowing, creeperShown,
  flock, flySync, flyViews, falconView, hashPoints, kNearest, kuramotoOrder, kuramotoStep, lsystem, physarumInit, physarumStep, pulseStep,
  slimeFoods, slimeLevel, SLIME_H, SLIME_W, turtleSites, BIRDS, FLIES, type ColonySpec,
} from '../src/engine/life'
import { createHash, createHash as particleHash } from '../src/engine/physics/particles'
import { simAtStep, simLoop, simReset } from '../src/engine/sim'
import { worldAt, worldReset, type FrameInput, type World } from '../src/engine/physics/world'
import { sampleLayers } from '../src/engine/sampler/gridSampler'
import { dot480 } from '../src/engine/theme/tokens'
import { withChrome, type WidgetPreset } from '../src/widgets/types'
import { fmtLoaded, medianLoaded, onceLoaded } from './lib/load'

type Assert = (name: string, cond: boolean, detail?: string) => void
const rng = (seed: number) => () => { seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) | 0; return ((seed ^ (seed >>> 13)) >>> 0) / 4294967296 }
const fnv = (a: ArrayLike<number>) => {
  let h = 0x811c9dc5
  const f = new Float32Array(1), u = new Uint32Array(f.buffer)
  for (let i = 0; i < a.length; i++) { f[0] = a[i]; const w = u[0]; for (let b = 0; b < 4; b++) { h ^= (w >>> (8 * b)) & 0xff; h = Math.imul(h, 0x01000193) >>> 0 } }
  return h.toString(16).padStart(8, '0')
}
/** Card cell of a sampled dot (TILE pitch 2.25, centres at (i + .5)·2.25). */
const cellOf = (d: { x: number; y: number }) => [Math.round(d.x / 2.25 - .5), Math.round(d.y / 2.25 - .5)] as const
const tileOfCell = (cx: number, cy: number) => Math.floor((cy - 11) / 4) * 36 + Math.floor(cx / 4)

export async function lifeL2Checks(assert: Assert, pond: () => Promise<typeof import('../src/widgets/boards/pond/index')>): Promise<void> {
  const { pondBoard, pondWorlds, pondProbe } = await pond()
  const card = (id: string) => pondBoard.find(p => p.id === id) as WidgetPreset
  const frame = (p: WidgetPreset, t: number, extra: object = {}) => sampleLayers(withChrome(p)({ t, data: {}, ...extra }), p.grid, p.style, dot480)
  const key = (p: WidgetPreset, t: number) => JSON.stringify(frame(p, t))
  const reds = (dots: ReturnType<typeof frame>) => dots.filter(d => d.color === dot480.dotActive)
  const tapAt = (w: World, t0: number, x: number, y: number) => {
    let t = t0
    const at = (f?: FrameInput) => { t += 1 / 30; return worldAt(w, t, f) }
    at({ pointers: [{ id: 7, x, y, down: true }] }); at({ pointers: [{ id: 7, x, y, down: true }] })
    const s = at() // the touch lifts: the pointer leaves the frame
    return { s, t, at }
  }

  // ── L2.1 physarum ───────────────────────────────────────────────────────────────────────────────
  {
    const run = () => { const p = createPhysarum({ w: 48, h: 44, agents: 600, seed: 7, so: 5, decay: .15, blur: .5 }), s = new Float32Array(p.size); physarumInit(p, s); for (let n = 0; n < 300; n++) physarumStep(p, s, n, [10, 10, 1.2, 38, 30, 1.2], 60); return { p, s } }
    const a = run(), b = run()
    assert('life/physarum: deterministic (fresh runs bit-equal after 300 steps)', fnv(a.s) === fnv(b.s), fnv(a.s))
    const sl = pondProbe.slime, mask = sl.phys.mask!
    simReset(sl.world.sim); worldReset(sl.world)
    let out = 0
    for (const n of [0, 150, 300, 450, 599, 899]) {
      const s = simAtStep(sl.world.sim, n)
      for (let i = 0; i < sl.phys.agents; i++) { const x = s[sl.phys.AX + i], y = s[sl.phys.AY + i]; if (!(x >= 0 && y >= 0 && x < SLIME_W && y < SLIME_H) || !mask[(y | 0) * SLIME_W + (x | 0)]) out++ }
    }
    assert('life/physarum: agents stay in bounds / mask', out === 0, `${out} agents off the dish`)
    // two food dots end connected: BFS over lattice cells with level ≥ .2
    const connected = (s: Float32Array, from: [number, number], to: [number, number][]) => {
      const seen = new Uint8Array(SLIME_W * SLIME_H), q: number[] = [], ok = (i: number) => slimeLevel(s[i]) >= .2
      const start = (from[1] | 0) * SLIME_W + (from[0] | 0)
      if (!ok(start)) return 0
      q.push(start); seen[start] = 1
      while (q.length) { const i = q.pop()!, x = i % SLIME_W, y = (i / SLIME_W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, j = ny * SLIME_W + nx; if (nx >= 0 && ny >= 0 && nx < SLIME_W && ny < SLIME_H && !seen[j] && ok(j)) { seen[j] = 1; q.push(j) } } }
      return to.filter(([x, y]) => seen[(y | 0) * SLIME_W + (x | 0)]).length
    }
    const pp = a.p, link = connected(a.s, [10, 10], [[38, 30]])
    assert('life/physarum: two food dots end connected (a trail path ≥ .2 between them, BFS on the lattice)', link === 1)
    const ss = a.s.slice(), ms = medianLoaded(k => { for (let i = 0; i < 10; i++) physarumStep(pp, ss, 300 + k * 10 + i, [10, 10, 1.2, 38, 30, 1.2], 60) }, 9)
    assert('life/physarum: step ≤ .45 ms × load (600 agents, 48 × 44)', ms.ms / 10 <= .45 * ms.load, `${(ms.ms / 10).toFixed(3)} ms × load ${ms.load.toFixed(2)}`)
    // pond-slime at t = 0
    const s0 = worldAt(sl.world, 0), foods = slimeFoods(sl, s0).filter(f => f.on).map(f => [f.x / 3, (f.y - 11) / 3] as [number, number])
    const joined = connected(s0, foods[0], foods.slice(1))
    assert('pond-slime: t = 0 network joins the 5 foods', foods.length === 5 && joined === 4, `${joined + 1}/${foods.length} foods on one network`)
    let bad = 0, nred = 0
    for (const t of [0, 1.3, 9, 17, 25]) {
      const fs = slimeFoods(sl, worldAt(sl.world, t)).filter(f => f.on)
      for (const d of reds(frame(card('pond-slime'), t))) { nred++; const [cx, cy] = cellOf(d); if (!fs.some(f => Math.hypot(f.x - cx, f.y - cy) <= 2.5)) bad++ }
    }
    assert('pond-slime: red only on food', nred > 0 && bad === 0, `${nred} red dots, ${bad} off food`)
    // tap: add a food, then the world heals back
    simReset(sl.world.sim); worldReset(sl.world)
    worldAt(sl.world, 10)
    const { s: s1, at } = tapAt(sl.world, 10, 100, 70)
    const added = slimeFoods(sl, s1).filter(f => f.on).length
    const { s: s2 } = tapAt(sl.world, 10.2, 100, 70)
    const removed = slimeFoods(sl, s2).filter(f => f.on).length
    for (let k = 0; k < 220; k++) at()
    assert('pond-slime: tap toggles food (add, then remove), heals', added === 6 && removed === 5 && sl.world.mode === 'pristine', `${added} → ${removed} foods, ${sl.world.mode}`)
    worldReset(sl.world)
  }

  // ── L2.3 oscillators ────────────────────────────────────────────────────────────────────────────
  {
    const r = rng(21), N = 60, all = (i: number, visit: (j: number) => void) => { for (let j = 0; j < N; j++) if (j !== i) visit(j) }
    const th0 = Float32Array.from({ length: N }, () => r() * 6.283185307179586), om = Float32Array.from({ length: N }, () => 6.283 * (1 + .1 * (r() - .5)))
    const a = th0.slice(), b = th0.slice()
    for (let n = 0; n < 1500; n++) { kuramotoStep(a, om, 2, all, 1 / 30); kuramotoStep(b, om, 0, all, 1 / 30) }
    assert('life/kuramoto: r → > .95 for K = 2 on all-to-all, stays < .3 for K = 0', kuramotoOrder(a) > .95 && kuramotoOrder(b) < .3, `r ${kuramotoOrder(a).toFixed(3)} / ${kuramotoOrder(b).toFixed(3)}`)
    // 50 globally coupled Mirollo–Strogatz oscillators (identical period 1 s): one cluster within 30 periods
    const M = 50, pos = new Float32Array(3 * M), ph = new Float32Array(M), age = new Float32Array(M).fill(1)
    for (let i = 0; i < M; i++) { pos[i] = r() * 10; pos[M + i] = r() * 10; pos[2 * M + i] = 1; ph[i] = r() }
    const hs = particleHash(M, [0, 0, 10, 10], 20), spec = { n: M, period: 1, eps: .05, refractory: .05, radius: 100 }
    let synced = -1
    for (let n = 0; n < 30 * 30 && synced < 0; n++) { pulseStep(ph, age, pos, hs, spec, n, 1 / 30); if (n % 30 === 0 && ph.every(v => Math.abs(v - ph[0]) < 1e-6)) synced = n }
    assert('life/pulse: 50 globally coupled MS oscillators synchronise within 30 periods (Mirollo–Strogatz theorem)', synced >= 0, `one cluster after ${(synced / 30).toFixed(1)} periods`)
    // index order: shuffle the oscillators, run, map back
    const run = (perm: number[]) => {
      const P = new Float32Array(3 * 40), F = new Float32Array(40), A = new Float32Array(40).fill(1), r2 = rng(5), base = Array.from({ length: 40 }, () => [r2() * 60, r2() * 60, r2()])
      perm.forEach((src, i) => { P[i] = base[src][0]; P[40 + i] = base[src][1]; P[80 + i] = 1; F[i] = base[src][2] })
      const h = particleHash(40, [0, 0, 60, 60], 15), fires: string[] = []
      for (let n = 0; n < 200; n++) { pulseStep(F, A, P, h, { n: 40, period: 1, eps: .08, refractory: .1, radius: 15 }, n, 1 / 30); fires.push(perm.map((src, i) => [src, A[i] === 0] as const).filter(x => x[1]).map(x => x[0]).sort((p, q) => p - q).join(',')) }
      return fires.join('|')
    }
    const ident = Array.from({ length: 40 }, (_, i) => i), shuf = [...ident].sort((p, q) => ((p * 7919) % 41) - ((q * 7919) % 41))
    assert('life/pulse: result independent of index order (shuffle → same fires)', run(ident) === run(shuf))
  }

  // ── L2.4 growth ─────────────────────────────────────────────────────────────────────────────────
  {
    const r = rng(33), att: [number, number][] = Array.from({ length: 500 }, () => [6 + r() * 132, 16 + r() * 124])
    const spec: ColonySpec = { seed: 9, root: [[12, 20]], attractors: att, influence: 16, kill: 2.5, step: 1.5, tropism: [.6, .8, .2], maxNodes: 700, maxIterations: 400 }
    const once = onceLoaded(() => colonise(spec)), c = once.value, again = colonise({ ...spec, attractors: att.map(p => [p[0], p[1]] as [number, number]) })
    colonise({ ...spec, seed: 91 }); colonise({ ...spec, seed: 92 }) // evict (the cache keeps 2)
    const fresh = colonise(spec)
    let nearLive = 0, badParent = 0
    for (let a = 0; a < att.length; a++) { if (!c.alive[a]) continue; for (let i = 0; i < c.count; i++) if (Math.hypot(att[a][0] - c.x[i], att[a][1] - c.y[i]) <= 2.5) { nearLive++; break } }
    for (let i = 1; i < c.count; i++) { const p = c.parent[i]; if (p < 0 || Math.abs(Math.hypot(c.x[i] - c.x[p], c.y[i] - c.y[p]) - 1.5) > 1e-4) badParent++ }
    assert('life/colonise: deterministic; no node within dk of a live attractor at the end; every node\'s parent is D away ± 1e-4',
      again === c && fresh !== c && fnv(c.x) === fnv(fresh.x) && c.count === fresh.count && nearLive === 0 && badParent === 0 && c.count > 100, `${c.count} nodes, ${c.iterations} iterations, ${nearLive} live attractors in reach, ${badParent} bad parents`)
    assert('life/colonise: cold build ≤ 60 ms × load', once.ms <= 60 * once.load, `${once.ms.toFixed(1)} ms × load ${once.load.toFixed(2)}`)
    const plant = { axiom: 'X', rules: { X: 'F[+X]F[-X]+X', F: 'FF' }, generations: 3, seed: 1 }
    const g2 = lsystem({ ...plant, generations: 2 }), g3 = lsystem(plant)
    assert('life/lsystem: known string for the fractal-plant rules at gen 3 (ABOP fig 1.24: X → F[+X]F[−X]+X, F → FF)',
      g2 === 'FF[+F[+X]F[-X]+X]FF[-F[+X]F[-X]+X]+F[+X]F[-X]+X' && g3.length === 156 && g3.startsWith('FFFF[+FF[+F[+X]F[-X]+X]'), `gen 3: ${g3.length} symbols`)
    const ts = turtleSites('F+F', { x: 0, y: 0, heading: 0, angle: Math.PI / 2, step: 2, spacing: 1 })
    assert('life/turtle: F+F emits sites along a right angle (y down: + turns clockwise)', ts.count === 4 && Math.abs(ts.x[3] - 2) < 1e-9 && Math.abs(ts.y[3] - 2) < 1e-9, `${ts.count} sites, last (${ts.x[3]}, ${ts.y[3]})`)
  }

  // ── L2.5 fireflies ──────────────────────────────────────────────────────────────────────────────
  {
    const f = pondProbe.fireflies, W = f.world, p = card('pond-fireflies')
    simReset(W.sim); worldReset(W)
    const s0 = worldAt(W, 0), act = flyViews(f, s0).filter(v => v.age < .2).length / FLIES
    assert('pond-fireflies: t = 0 shows a flash wave (5–40 % flies in active)', act >= .05 && act <= .4, `${(act * 100).toFixed(0)} % flashing, sync ${(flySync(f, s0) * 100).toFixed(0)} %`)
    let bad = 0, nred = 0
    for (const t of [0, 1.3, 5.1, 12.4, 20.7]) {
      const flash = new Set(flyViews(f, worldAt(W, t)).filter(v => v.age < .2).map(v => tileOfCell(Math.floor(v.x), Math.floor(v.y))))
      for (const d of reds(frame(p, t))) { nred++; const [cx, cy] = cellOf(d); if (!flash.has(tileOfCell(cx, cy))) bad++ }
    }
    assert('pond-fireflies: red only on flashing flies', nred > 0 && bad === 0, `${nred} red dots, ${bad} off a flashing fly`)
    // tap: every fly within 30 cells fires now
    worldReset(W)
    const t0 = 7, pre = flyViews(f, worldAt(W, t0)), cx = 72, cy = 64
    const near = pre.map((v, i) => (Math.hypot(v.x - cx, v.y - cy) < 30 ? i : -1)).filter(i => i >= 0)
    let t = t0, fired = new Set<number>()
    const at = (fr?: FrameInput) => { t += 1 / 30; const s = worldAt(W, t, fr); flyViews(f, s).forEach((v, i) => { if (v.age < 1.5 / 30) fired.add(i) }); return s }
    at({ pointers: [{ id: 2, x: cx, y: cy, down: true }] }); at({ pointers: [{ id: 2, x: cx, y: cy, down: true }] }); fired = new Set(); at(); at()
    const share = near.filter(i => fired.has(i)).length / Math.max(1, near.length)
    for (let k = 0; k < 220; k++) at()
    assert('pond-fireflies: tap → ≥ 80 % of flies within 30 cells fire within 2 steps; heals', share >= .8 && W.mode === 'pristine', `${(share * 100).toFixed(0)} % of ${near.length}, ${W.mode}`)
    worldReset(W)
  }

  // ── L2.6 flock + murmur ─────────────────────────────────────────────────────────────────────────
  {
    const r = rng(8), N = 400, s = new Float32Array(2 * N)
    for (let i = 0; i < N; i++) { s[i] = 20 + r() * 100; s[N + i] = 20 + r() * 100 }
    s[5] = s[6]; s[N + 5] = s[N + 6] // a tie
    const hs = createHash(N, [-30, -20, 174, 174], 6), out = new Int32Array(N * 7)
    hashPoints(hs, s, N, 0, N); kNearest(s, N, 0, N, hs, 7, out)
    let diff = 0
    for (let i = 0; i < N; i++) {
      const brute = Array.from({ length: N }, (_, j) => j).filter(j => j !== i).map(j => [(s[j] - s[i]) ** 2 + (s[N + j] - s[N + i]) ** 2, j]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, 7).map(x => x[1])
      if (brute.join() !== Array.from(out.subarray(i * 7, i * 7 + 7)).join()) diff++
    }
    assert('life/flock: k-nearest equals brute force on 400 birds (ties by index)', diff === 0, `${diff} birds differ`)
    const f2 = new Float32Array(2 * N), v = new Float32Array(4 * N)
    v.set(s.subarray(0, N), 0); v.set(s.subarray(N), N)
    hashPoints(hs, v, N, 0, N); flock(v, N, { X: 0, Y: N, VX: 2 * N, VY: 3 * N }, hs, { k: 7, sep: 3, wSep: 2, wAli: 1, wCoh: .6 }, f2)
    assert('life/flock: forces finite and bounded (≤ Σ weights + separation)', f2.every(x => Number.isFinite(x) && Math.abs(x) < 30))
    const m = pondProbe.murmur, W = m.world, p = card('pond-murmur'), { X, Y, A } = m.layout
    const st = new Float32Array(m.layout.size), pristine = { pointers: [], gx: 0, gy: 1, kick: false, live: -1, quiet: Infinity }
    W.spec.init(st)
    let outside = 0
    for (let n = 0; n < 18000; n++) { W.spec.step(st, n, pristine); if (n % 10 === 0) for (let i = 0; i < BIRDS; i++) if (st[X + i] < 0 || st[X + i] >= 144 || st[Y + i] < 11 || st[Y + i] >= 144) outside++ }
    assert('pond-murmur: no bird leaves the card in 10 min', outside === 0 && st.every(Number.isFinite), `${outside} bird-samples outside`)
    // agitation: one alarmed bird; after 3 steps its 3-hop neighbourhood (7NN graph) is above .5
    const sa = simAtStep(W.sim, 600).slice(), nn = new Int32Array(BIRDS * 7), hb = createHash(BIRDS, [-30, -20, 174, 174], 6)
    hashPoints(hb, sa, BIRDS, X, Y); kNearest(sa, BIRDS, X, Y, hb, 7, nn)
    const a = new Float32Array(BIRDS); a[0] = 1
    for (let k = 0; k < 3; k++) { const b = a.slice(); for (let i = 0; i < BIRDS; i++) for (let q = 0; q < 7; q++) { const j = nn[i * 7 + q]; if (j >= 0 && .88 * a[j] > b[i]) b[i] = .88 * a[j] } a.set(b) }
    const hop = new Int32Array(BIRDS).fill(-1); hop[0] = 0
    for (let d = 0; d < 3; d++) for (let i = 0; i < BIRDS; i++) if (hop[i] < 0) for (let q = 0; q < 7; q++) { const j = nn[i * 7 + q]; if (j >= 0 && hop[j] === d) { hop[i] = d + 1; break } }
    const reach3 = Array.from(hop).filter(h => h === 3).length, lit3 = Array.from(hop).map((h, i) => (h === 3 ? a[i] : 1)).every(x => x > .5)
    assert('pond-murmur: agitation front travels ≥ 3 neighbours in 3 steps (a = .88 per hop)', reach3 > 0 && lit3, `${reach3} birds 3 hops out, all > .5; agitation plane at offset ${A}`)
    simReset(W.sim); worldReset(W)
    let bad = 0, nred = 0
    for (const t of [0, 1.3, 6.2, 14.9, 31]) {
      const fv = falconView(m, worldAt(W, t)), ft = [Math.floor(fv.x / 4), Math.floor((fv.y - 11) / 4)]
      for (const d of reds(frame(p, t))) { nred++; const [cx, cy] = cellOf(d), tx = Math.floor(cx / 4), ty = Math.floor((cy - 11) / 4); if (Math.abs(tx - ft[0]) > 2 || Math.abs(ty - ft[1]) > 2) bad++ }
    }
    assert('pond-murmur: red only on the falcon', nred > 0 && bad === 0, `${nred} red dots, ${bad} away from the falcon`)
    // a tap swoops
    const { s: sw, at } = tapAt(W, 9, 60, 80)
    const mode = falconView(m, sw).mode
    for (let k = 0; k < 220; k++) at()
    assert('pond-murmur: a tap is a swoop; heals', mode === 2 && W.mode === 'pristine', `falcon mode ${mode}, ${W.mode}`)
    worldReset(W)
  }

  // ── L2.7 ants + terrarium ───────────────────────────────────────────────────────────────────────
  {
    const a = createAnts({ w: 48, h: 44, ants: 90, nest: [11, 35], seed: 4, deposit: .05, blur: .4 }), s = new Float32Array(a.size), crumbs = new Float32Array([34, 33, 40, 23, 15, 40, 42, 12, 40])
    antsInit(a, s)
    let trail = -1, monotone = true, prev = [...crumbs]
    for (let n = 0; n < 450 && monotone; n++) {
      antsStep(a, s, n, crumbs)
      for (let c = 0; c < 3; c++) { if (crumbs[3 * c + 2] > prev[3 * c + 2]) monotone = false; prev[3 * c + 2] = crumbs[3 * c + 2] }
      if (trail < 0 && n % 15 === 0) {
        // a trail: FOOD ≥ .2 on a chain of cells from a crumb to within 4 cells of the nest (BFS)
        for (let c = 0; c < 3 && trail < 0; c++) {
          const seen = new Uint8Array(48 * 44), q = [(crumbs[3 * c + 1] | 0) * 48 + (crumbs[3 * c] | 0)]
          seen[q[0]] = 1
          while (q.length) { const i = q.pop()!, x = i % 48, y = (i / 48) | 0; if (Math.hypot(x - 11, y - 35) < 4) { trail = n; break } for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const nx = x + dx, ny = y + dy, j = ny * 48 + nx; if (nx >= 0 && ny >= 0 && nx < 48 && ny < 44 && !seen[j] && s[a.FOOD + j] >= .2) { seen[j] = 1; q.push(j) } } }
        }
      }
    }
    assert('life/ants: ≥ 1 trail forms to a crumb within 30 s; crumb amount only decreases', trail >= 0 && monotone, `trail at ${(trail / 15).toFixed(1)} s, bites left ${[2, 5, 8].map(k => crumbs[k]).join('/')}`)
    const T = pondProbe.terrarium, W = T.world, p = card('pond-terrarium')
    simReset(W.sim); worldReset(W)
    const { creeperNow } = await import('../src/widgets/boards/pond/terrarium'), c = creeperNow(9 + 41 / 60)
    let bad = 0, nred = 0
    for (const t of [0, 1.3, 20, 55]) {
      const shown = creeperShown(t) * c.iterations, fresh = creeperGrowing(t) ? creeperShown(t - 1) * c.iterations : Infinity, ok = new Set<number>()
      for (let i = 0; i < c.count; i++) if (c.born[i] <= shown && c.born[i] > fresh) ok.add(tileOfCell(Math.floor(c.x[i]), Math.floor(c.y[i])))
      for (const d of reds(frame(p, t))) { nred++; const [cx, cy] = cellOf(d); if (!ok.has(tileOfCell(cx, cy))) bad++ }
    }
    assert('pond-terrarium: red only on newest growth (born in the last second of display)', nred > 0 && bad === 0, `${nred} red dots, ${bad} elsewhere; creeper ${c.count} nodes`)
    const s0 = worldAt(W, 0), carrying = antViews(T, s0).filter(v => v.carrying).length
    let trailCells = 0
    for (let i = 0; i < 48 * 44; i++) if (s0[T.ants.FOOD + i] >= .22) trailCells++
    assert('pond-terrarium: t = 0 shows ants on trails (≥ 60 trail cells, ≥ 10 ants carrying) and a lush creeper (≥ 300 nodes shown)', trailCells >= 60 && carrying >= 10 && creeperShown(0) * c.iterations > 0 && c.count >= 300, `${trailCells} trail cells, ${carrying} carrying`)
    const { s: s1, at } = tapAt(W, 6, 90, 60)
    const added = Array.from({ length: 5 }, (_, k) => T.layout.CR + 3 * k).some(o => s1[o + 2] >= 39 && Math.hypot(s1[o] - 30, s1[o + 1] - (60 - 11) / 3) < 1)
    for (let k = 0; k < 220; k++) at()
    assert('pond-terrarium: a tap drops a crumb; heals', added && W.mode === 'pristine', `${W.mode}`)
    worldReset(W)
  }

  // ── L2.8 jelly ──────────────────────────────────────────────────────────────────────────────────
  {
    const j = pondProbe.jelly, W = j.world, p = card('pond-jelly'), NB = j.spec.bells.length
    const st = new Float32Array(j.layout.size), pristine = { pointers: [], gx: 0, gy: 1, kick: false, live: -1, quiet: Infinity }
    W.spec.init(st)
    let off = 0, thrustLeak = 0, kicks = 0
    const prev = Array.from({ length: NB }, (_, b) => bellView(j, st, b))
    for (let n = 0; n < 18000; n++) {
      W.spec.step(st, n, pristine)
      for (let b = 0; b < NB; b++) {
        const v = bellView(j, st, b), u = prev[b]
        if (v.x - v.R < 0 || v.x + v.R > 144 || v.y - v.R < 11 || v.y + v.R > 144) off++
        // axial acceleration beyond what drag toward the current and the sink can give means thrust
        const acc = ((v.vx - u.vx) * u.ax + (v.vy - u.vy) * u.ay) * 30, passive = .9 * (Math.hypot(u.vx, u.vy) + 4) + 2
        if (acc > passive) { if (v.dc <= 0) thrustLeak++; else kicks++ }
        prev[b] = v
      }
    }
    assert('pond-jelly: bells stay on the card (10 min); thrust only during contraction (ċ > 0)', off === 0 && thrustLeak === 0 && kicks > 100, `${off} off-card samples, ${kicks} thrust steps, ${thrustLeak} without contraction`)
    simReset(W.sim); worldReset(W)
    let bad = 0, nred = 0
    for (const t of [0, 1.3, 8.8, 19.5]) {
      const s = worldAt(W, t), ok = new Set<number>()
      for (let b = 0; b < NB; b++) { const v = bellView(j, s, b); for (const side of [-1, 1]) { const a = .1 * v.H, bb = side * .35 * v.R; ok.add(tileOfCell(Math.floor(v.x + v.ax * a - v.ay * bb), Math.floor(v.y + v.ay * a + v.ax * bb))) } }
      for (const d of reds(frame(p, t))) { nred++; const [cx, cy] = cellOf(d); if (!ok.has(tileOfCell(cx, cy))) bad++ }
    }
    assert('pond-jelly: red only on gonads', nred > 0 && bad === 0, `${nred} red dots, ${bad} off the gonads`)
    const { s: s1, at } = tapAt(W, 12, 72, 80)
    const pulsed = Array.from({ length: NB }, (_, b) => bellView(j, s1, b).theta).every(th => th < .5)
    for (let k = 0; k < 220; k++) at()
    assert('pond-jelly: a tap pulses every bell; heals', pulsed && W.mode === 'pristine', `${W.mode}`)
    worldReset(W)
  }

  // ── the board ───────────────────────────────────────────────────────────────────────────────────
  {
    const l2 = ['pond-jelly', 'pond-slime', 'pond-fireflies', 'pond-murmur', 'pond-terrarium']
    const gate: Record<string, number> = { 'pond-koi': 288, 'pond-jelly': 256, 'pond-slime': 256, 'pond-fireflies': 256, 'pond-murmur': 256, 'pond-terrarium': 256 }
    let total = 0
    const mem: string[] = [], frames: string[] = []
    for (const id of l2) {
      const p = card(id), W = pondWorlds[pondBoard.indexOf(p)], sim = W.sim, [start, len] = simLoop(sim)
      simReset(sim); worldReset(W)
      const ts = [0, 1.3, 7.7, 3600.2], first = ts.map(t => key(p, t))
      simReset(sim)
      const again = [...ts].reverse().map(t => key(p, t)).reverse()
      const chroma = frame(p, 0).concat(frame(p, 1.3)).filter(d => ![dot480.dotFaint, dot480.dotMid, dot480.dotIdle, dot480.value, dot480.dotActive].includes(d.color)).length
      assert(`${id}: pristine is pure in t (0, 1.3, 7.7, 3600.2, any order, after a cold replay); one accent (dotActive only, no dotActiveDim)`, first.every((k, i) => k === again[i]) && chroma === 0, `${chroma} off-palette dots`)
      // seam: the frame across the wrap changes little
      const dt = W.spec.dt, a = new Set(frame(p, (len - 1) * dt).map(d => `${d.x},${d.y},${d.r},${d.color}`)), b = new Set(frame(p, len * dt).map(d => `${d.x},${d.y},${d.r},${d.color}`))
      let diff = 0
      for (const d of a) if (!b.has(d)) diff++
      for (const d of b) if (!a.has(d)) diff++
      const share = diff / Math.max(a.size, b.size)
      // a normal frame-to-frame change, for scale
      const c1 = new Set(frame(p, 20 * dt).map(d => `${d.x},${d.y},${d.r},${d.color}`)), c2 = new Set(frame(p, 21 * dt).map(d => `${d.x},${d.y},${d.r},${d.color}`))
      let nd = 0
      for (const d of c1) if (!c2.has(d)) nd++
      for (const d of c2) if (!c1.has(d)) nd++
      const normal = nd / Math.max(c1.size, c2.size)
      assert(`${id}: seam: the frame change across the loop wrap ≤ 1.5 × an ordinary frame change (+ 5 %)`, share <= 1.5 * normal + .05, `${(share * 100).toFixed(1)} % at the wrap, ${(normal * 100).toFixed(1)} % normally`)
      // memory: 2 loops + 20 scrubs, nothing evicted once warm
      simReset(sim)
      for (let k = 0; k <= start + 2 * len; k += 7) worldAt(W, k * dt)
      const warm = [...sim.checkpoints.keys()].sort((x, y) => x - y).join(), r = rng(3)
      for (let k = 0; k < 20; k++) worldAt(W, r() * 200)
      const after = [...sim.checkpoints.keys()].sort((x, y) => x - y).join(), bytes = (sim.checkpoints.size + 6) * W.spec.size * 4
      total += bytes
      mem.push(`${id.slice(5)} ${(bytes / 1024).toFixed(0)}`)
      assert(`${id}: total memory (checkpoints + 6 working copies) ≤ ${gate[id]} KB after 2 loops + 20 scrubs, 0 evictions once warm`, bytes <= gate[id] * 1024 && warm === after && sim.checkpoints.size <= sim.maxCheckpoints,
        `${(bytes / 1024).toFixed(1)} KB (${sim.checkpoints.size} checkpoints × ${(W.spec.size * 4 / 1024).toFixed(1)} KB + 6 copies)`)
      // violent input stays finite
      worldReset(W)
      const rv = rng(17), resets = W.resets
      let tt = 30, finite = true
      for (let k = 0; k < 300; k++) { tt += 1 / 30; const s = worldAt(W, tt, { pointers: [{ id: 1, x: rv() * 200 - 30, y: rv() * 200 - 30, down: rv() < .5 }], kick: rv() < .05 }); if (!s.every(Number.isFinite)) finite = false }
      assert(`${id}: 300 frames of violent random input stay finite (resets = 0)`, finite && W.resets === resets, `resets ${W.resets - resets}`)
      worldReset(W)
      // frame budget, warm, pristine (each frame a new t: the world steps)
      for (let i = 0; i < 6; i++) frame(p, 40 + i / 30)
      const fr = medianLoaded(i => frame(p, 41 + i / 30), 15)
      frames.push(`${id.slice(5)} ${fr.ms.toFixed(2)}`)
      assert(`${id}: frame (step + layers + sample) ≤ 4 ms median warm × load`, fr.ms <= 4 * fr.load, fmtLoaded(fr))
      simReset(sim); worldReset(W)
    }
    // koi: its own check measured it; add it to the board total from its world
    const koiW = pondWorlds[0]
    simReset(koiW.sim)
    for (let k = 0; k <= 1800 + 1440; k += 9) worldAt(koiW, k / 30)
    const koiBytes = (koiW.sim.checkpoints.size + 6) * koiW.spec.size * 4
    total += koiBytes
    simReset(koiW.sim); worldReset(koiW)
    assert('pond board: Σ total memory of the six warm worlds ≤ 1.4 MB', total <= 1.4 * 1024 * 1024, `${(total / 1024).toFixed(0)} KB (koi ${(koiBytes / 1024).toFixed(0)}, ${mem.join(', ')})`)
    console.log(`  life: L2 frame medians (ms): ${frames.join(', ')}`)
  }
}
