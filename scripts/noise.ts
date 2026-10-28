/**
 * Checks for the shared noise toolkit (`src/engine/noise`, docs/living-matter/F0-foundation.md §2.1–2.4):
 * deterministic scalar math (dsin/tsin moved unchanged, datan2, dexp, dpow, ihash, rngFor) against `Math.*`,
 * plus FNV-1a hashes of fixed input sweeps pinned in `goldens/noise.json` so any bit drift fails, and the
 * per-call timing budgets (§4, scaled by a measured load factor so a busy box doesn't fail them), and the IR noise
 * pack (§2.4): closure ≡ function ≡ library on `IR_NOISE_FIELDS`, unreserved pack names, bytecode rejection, and the
 * GLSL snapshot in `goldens/noise-glsl.json` (GPU parity: the noise row of scripts/webgl.ts). Also the determinism
 * lint (scripts/lib/detLint.ts, F0.9) and, when Bun is installed, the Bun/JSC ≡ Node/V8 snapshot comparison.
 *
 *   npx tsx scripts/noise.ts             # run the checks
 *   npx tsx scripts/noise.ts --update    # rewrite goldens/noise.json after an intended change
 *   npx tsx scripts/noise.ts --snapshot  # print the determinism hashes as JSON (used for the Bun/JSC cross-engine run)
 *
 * `pnpm verify` runs the same checks through `noiseChecks(assert)` (the noise slot, right after `algorithmsChecks`).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { compileBytecode, compileJS, deserialize, emitGLSL, IRError, parse, referenceField, serialize, type IREnv } from '../src/engine/ir'
import '../src/engine/noise/ir' // the IR noise pack (F0.4)
import { NOISE_GLSL } from '../src/engine/noise/glsl'
import { DET_PATHS, detLint } from './lib/detLint'
import { hash01, hash32 } from '../src/engine/math'
import { curl2, datan2, dexp, dpow, dsin, fbm2, ihash, noise2, noise3, noise3Grad, octaveSeed, ridge2, rngFor, tsin, turb2, valueNoise2, voronoi2, voronoiBorder2, type Metric, type VoronoiOut } from '../src/engine/noise'

type Assert = (name: string, cond: boolean, detail?: string) => void
const NOISE_FILE = 'goldens/noise.json', NOISE_GLSL_FILE = 'goldens/noise-glsl.json'
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1] }
const time = <T>(f: () => T): [number, T] => { const a = performance.now(), r = f(); return [performance.now() - a, r] }

/**
 * How much slower this machine is right now than the one the budgets were set on: a fixed float loop that
 * takes ~12 ms there (same loop as scripts/algorithms.ts). Timing budgets scale by it (never below 1).
 */
function loadFactor(): number {
  const run = () => { let s = 0; for (let i = 0; i < 1e7; i++) s += (i & 7) * .5; return s }
  run()
  const ms = median([0, 1, 2].map(() => time(run)[0]))
  return Math.max(1, ms / 12)
}

/** A fixed LCG stream (the inputs of every sweep below; plain integer arithmetic, the same in every engine). */
function lcg(seed: number) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 } }
/** FNV-1a 32 over the little-endian bytes of the doubles. */
function fnv(values: Float64Array): string {
  const b = new Uint8Array(values.buffer, values.byteOffset, values.byteLength)
  let h = 0x811c9dc5
  for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193) }
  return (h >>> 0).toString(16).padStart(8, '0')
}
const sweep = (n: number, f: (i: number) => number) => { const out = new Float64Array(n); for (let i = 0; i < n; i++) out[i] = f(i); return fnv(out) }

/** The determinism hashes: fixed inputs in, FNV of the output bits. Same values under every engine or the module is broken. */
export function snapshot(): Record<string, string> {
  const xs = (i: number) => (i - 50000) * 0.0123456789 + (i % 7) * 1e-3
  const r1 = lcg(1), r2 = lcg(2), r3 = lcg(3)
  return {
    dsin: sweep(1e5, i => dsin(xs(i))),
    tsin: sweep(1e5, i => tsin(xs(i))),
    datan2: sweep(1e5, () => datan2((r1() - .5) * 20, (r1() - .5) * 20)),
    dexp: sweep(1e5, () => dexp(r2() * 1450 - 740)),
    dpow: sweep(1e5, i => i % 4 === 0 ? dpow(r3() * 10 - 5, Math.floor(r3() * 129) - 64) : dpow(r3() * 100, (r3() - .5) * 20)),
    ihash: sweep(1e5, i => ihash(i * 2654435761, -i, i * 7)),
    rngFor: sweep(1e5, i => rngFor(7, i >> 4, i & 15)()),
    noise2: sweep(1e5, i => noise2((i % 317) * .173 - 20, (i / 317) * .211 - 30, i & 3)),
    noise3: sweep(1e5, i => noise3((i % 317) * .173 - 20, (i / 317) * .211 - 30, (i % 13) * .37, i & 3)),
    fbm2: sweep(1e5, i => fbm2((i % 317) * .0731, (i / 317) * .0917, 1 + (i % 8), 5)),
    turb2: sweep(2e4, i => turb2((i % 141) * .0731, (i / 141) * .0917, 4, 6)),
    ridge2: sweep(2e4, i => ridge2((i % 141) * .0731, (i / 141) * .0917, 5, 7)),
    valueNoise2: sweep(2e4, i => valueNoise2((i % 141) * .37, (i / 141) * .29, 9)),
    voronoiL2: sweep(4e4, i => { const o = voronoi2((i % 199) * .113 - 9, (i / 199) * .127 - 9, 3, 'l2'); return i & 1 ? o.f2 - o.f1 : o.id + o.x * o.y }),
    voronoiL1: sweep(4e4, i => { const o = voronoi2((i % 199) * .113 - 9, (i / 199) * .127 - 9, 4, 'l1'); return i & 1 ? o.f2 : o.f1 + o.id }),
    voronoiLinf: sweep(4e4, i => { const o = voronoi2((i % 199) * .113 - 9, (i / 199) * .127 - 9, 5, 'linf'); return i & 1 ? o.f2 : o.f1 + o.x }),
    voronoiBorder2: sweep(4e4, i => voronoiBorder2((i % 199) * .113 - 9, (i / 199) * .127 - 9, 6)),
    curl2: sweep(4e4, i => curl2((i % 199) * .113 - 9, (i / 199) * .127 - 9, (i % 5) * .7, 7)[i & 1]),
  }
}

/** Brute-force Worley over the 7×7 cells around p, with voronoi.ts's own point and distance formulas: [f1, f2]. */
function bruteVoronoi(x: number, y: number, seed: number, metric: Metric): [number, number] {
  const cx = Math.floor(x), cy = Math.floor(y), ds: number[] = []
  for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
    const h = ihash(cx + i, cy + j, seed), dx = cx + i + (h & 0xffff) / 65536 - x, dy = cy + j + (h >>> 16) / 65536 - y, ax = Math.abs(dx), ay = Math.abs(dy)
    ds.push(metric === 'l2' ? dx * dx + dy * dy : metric === 'l1' ? ax + ay : Math.max(ax, ay))
  }
  ds.sort((a, b) => a - b)
  return metric === 'l2' ? [Math.sqrt(ds[0]), Math.sqrt(ds[1])] : [ds[0], ds[1]]
}
/** Feature points of the 9×9 cells around p (for the bisector check). */
const pointsAround = (x: number, y: number, seed: number) => {
  const cx = Math.floor(x), cy = Math.floor(y), ps: [number, number][] = []
  for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) { const h = ihash(cx + i, cy + j, seed); ps.push([cx + i + (h & 0xffff) / 65536, cy + j + (h >>> 16) / 65536]) }
  return ps
}

/** Frozen copy of cinema.ts's former private `vnoise` (F0.3 migrates the board to `valueNoise2`). */
const cinemaVnoise = (x: number, y: number, s: number) => {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy)
  const a = hash01(xi, yi, s), b = hash01(xi + 1, yi, s), c = hash01(xi, yi + 1, s), d = hash01(xi + 1, yi + 1, s)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
}

/**
 * The IR noise parity fields (F0.4): every pack builtin, fbm at 1 / 4 / 8 octaves, all four voronoi outputs over the
 * three metrics, and a program that binds the name `noise`. `scripts/webgl.ts` runs them as its noise row (GPU vs JS).
 */
export const IR_NOISE_FIELDS: Record<string, string> = {
  noise: '.5 + .5 * noise(u * 9 - 4.5, v * 9 + t * .3, 7)',
  fbm1: '.5 + .5 * fbm(u * 6, v * 6 - t * .2, 1, 3)',
  fbm4: '.5 + .5 * fbm(u * 6 + 11, v * 6, 4, 3)',
  fbm8: '.5 + .5 * fbm(u * 5 - t * .1, v * 5, 8, -9)',
  turb: 'turb(u * 7, v * 7 + t * .25, 5, 2)',
  voronoiF1: 'voronoi(u * 8, v * 8 + t * .2, 1, 0)',
  voronoiF2: 'voronoi(u * 6 - 3, v * 6, 2, 5) * .5',
  voronoiEdge: 'voronoi(u * 7, v * 7 - t * .1, 3, 10)',
  voronoiId: 'voronoi(u * 5 + 2, v * 5, 4, 3)',
  letShadow: 'let noise = 3; noise * .1 + noise(u * 4, v * 4, 1) * .5',
}
/** The same fields as direct library calls, in the IR's operation order (the oracle the backends must equal bit for bit). */
const IR_NOISE_LIB: Record<string, (u: number, v: number, t: number) => number> = {
  noise: (u, v, t) => .5 + .5 * noise2(u * 9 - 4.5, v * 9 + t * .3, 7),
  fbm1: (u, v, t) => .5 + .5 * fbm2(u * 6, v * 6 - t * .2, 1, 3),
  fbm4: (u, v) => .5 + .5 * fbm2(u * 6 + 11, v * 6, 4, 3),
  fbm8: (u, v, t) => .5 + .5 * fbm2(u * 5 - t * .1, v * 5, 8, -9),
  turb: (u, v, t) => turb2(u * 7, v * 7 + t * .25, 5, 2),
  voronoiF1: (u, v, t) => voronoi2(u * 8, v * 8 + t * .2, 1, 'l2').f1,
  voronoiF2: (u, v) => voronoi2(u * 6 - 3, v * 6, 2, 'l1').f2 * .5,
  voronoiEdge: (u, v, t) => { const o = voronoi2(u * 7, v * 7 - t * .1, 3, 'linf'); return o.f2 - o.f1 },
  voronoiId: (u, v) => voronoi2(u * 5 + 2, v * 5, 4, 'l2').id / 4294967296,
  letShadow: (u, v) => 3 * .1 + noise2(u * 4, v * 4, 1) * .5,
}
/** The three frame inputs of the parity runs (as scripts/lib/webgl-page.ts). */
const IR_NOISE_ENVS: IREnv[] = [
  { t: 0 },
  { t: 1.3, data: { value: .62, k: -2.5 }, pointer: { x: .3, y: .7, down: true } },
  { t: 7.77, data: { value: -1.4, k: 3 }, pointer: { x: 1.2, y: -.4 } },
]
const fnv1a = (str: string) => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h.toString(16).padStart(8, '0') }

export function noiseChecks(assert: Assert, opts: { update?: boolean } = {}): void {
  const load0 = loadFactor()
  console.log(`  noise: load factor ${load0.toFixed(2)} (timing budgets scale by it)`)
  const snap = snapshot()
  if (opts.update || !existsSync(NOISE_FILE)) {
    writeFileSync(NOISE_FILE, JSON.stringify({ about: 'FNV-1a 32 of fixed input sweeps through src/engine/noise (scripts/noise.ts snapshot()). Identical under every JS engine; re-baseline with `npx tsx scripts/noise.ts --update` only for an intended change.', hashes: snap }, null, 1) + '\n')
    console.log(`${NOISE_FILE}: wrote ${Object.keys(snap).length} hashes`)
  }
  const golden: Record<string, string> = JSON.parse(readFileSync(NOISE_FILE, 'utf8')).hashes
  const drift = (keys: string[]) => keys.filter(k => snap[k] !== golden[k])

  // ── F0.1 deterministic scalar math ──────────────────────────────────────────────────────────────
  {
    const d = drift(['dsin', 'tsin'])
    assert('noise: dsin/tsin moved unchanged (FNV of 1e5 outputs = goldens/noise.json)', !d.length, d.map(k => `${k} ${snap[k]} ≠ ${golden[k]}`).join(', '))
    const rest = drift(Object.keys({ ...snap, ...golden }).filter(k => k !== 'dsin' && k !== 'tsin'))
    assert('noise: determinism hashes (dexp, dpow, datan2, ihash, rngFor, …) = goldens/noise.json', !rest.length, rest.length ? `changed: ${rest.join(', ')}` : `${Object.keys(snap).length} sweeps`)
  }
  {
    const r = lcg(11)
    let err = 0
    for (let i = 0; i < 2e6; i++) {
      // magnitudes over 8 decades, all four quadrants
      const y = (r() - .5) * 10 ** (r() * 8 - 4), x = (r() - .5) * 10 ** (r() * 8 - 4), e = Math.abs(datan2(y, x) - Math.atan2(y, x))
      if (e > err) err = e
    }
    const P = Math.PI, axes = datan2(0, 1) === 0 && datan2(1, 0) === P / 2 && datan2(-1, 0) === -P / 2 && datan2(0, -1) === P && datan2(5, 5) === P / 4 && datan2(-3, -3) === -3 * P / 4
    const edges = datan2(0, 0) === 0 && Number.isNaN(datan2(NaN, 1)) && Number.isNaN(datan2(1, NaN))
    assert('noise: datan2 ≤ 1e-9 vs Math.atan2 on 2e6 samples; axes, (0,0)=0, NaN→NaN', err <= 1e-9 && axes && edges, `max |Δ| ${err.toExponential(2)} rad`)
  }
  {
    const r = lcg(12)
    let err = 0
    for (let i = 0; i < 1e6; i++) { const x = -708 + r() * 1417, a = dexp(x), b = Math.exp(x), e = Math.abs(a - b) / b; if (e > err) err = e }
    const edges = dexp(0) === 1 && dexp(710) === Infinity && dexp(-746) === 0 && Number.isNaN(dexp(NaN)) && dexp(Infinity) === Infinity && dexp(-Infinity) === 0
    assert('noise: dexp rel err ≤ 1e-13 vs Math.exp on 1e6 samples over [−708, 709]; dexp(0) === 1; overflow → Infinity, underflow → 0, NaN → NaN', err <= 1e-13 && edges, `max rel ${err.toExponential(2)}`)
  }
  {
    const r = lcg(13)
    let near = 0, far = 0, nNear = 0, nFar = 0
    while (nNear + nFar < 1e6) {
      // x log-uniform over e^[−700, 700]; half the y keep |y·ln x| ≤ 50, half spread to the edge of the normal range
      const lx = (r() * 2 - 1) * 700, x = dexp(lx), lim = r() < .5 ? 50 : 700, y = (r() * 2 - 1) * lim / Math.max(Math.abs(lx), 1e-3)
      const b = Math.pow(x, y)
      if (!(b > 2.3e-308 && b < 1.7e308)) continue
      const e = Math.abs(dpow(x, y) - b) / b
      if (Math.abs(y * Math.log(x)) <= 50) { nNear++; if (e > near) near = e } else { nFar++; if (e > far) far = e }
    }
    assert('noise: dpow rel err ≤ 1e-12 vs Math.pow where |y·ln x| ≤ 50, ≤ 1e-9 elsewhere in the normal range (1e6 samples)', near <= 1e-12 && far <= 1e-9,
      `${near.toExponential(2)} over ${nNear}, ${far.toExponential(2)} over ${nFar}`)
  }
  {
    const r = lcg(14)
    let bad = 0
    for (let i = 0; i < 2e5; i++) {
      const x = (r() - .5) * (i % 3 === 0 ? 4 : 1.2), n = Math.floor(r() * 129) - 64
      let p = n === 0 ? 1 : x
      for (let k = 1; k < Math.abs(n); k++) p *= x
      if (n < 0) p = 1 / p
      if (!Object.is(dpow(x, n), p)) bad++
    }
    const edges = dpow(0, 0) === 1 && dpow(0, -1) === Infinity && dpow(-2, 3) === -8 && Number.isNaN(dpow(-2, .5)) && Math.abs(dpow(-2, 66) / 2 ** 66 - 1) < 1e-14 && Math.abs(dpow(-2, 67) / -(2 ** 67) - 1) < 1e-14 && dpow(0, .5) === 0 && dpow(0, -.5) === Infinity && Number.isNaN(dpow(NaN, 2)) && dpow(NaN, 0) === 1
    assert('noise: dpow integer path (|y| ≤ 64) matches repeated multiplication bit-for-bit; edges 0^0, 0^−1, (−2)^3, (−2)^0.5', !bad && edges, `${bad} of 2e5 differ`)
  }
  {
    const P = 2 ** 23, seen = new Set<number>()
    let dup = 0
    for (const base of [0, P, -P, 2 ** 30, -(2 ** 31), 2 ** 31 - 4096]) for (let k = 0; k < 4096; k++) { const h = ihash(base + k); if (seen.has(h)) dup++; seen.add(h) }
    const pairs = ihash(P) !== ihash(-P) && ihash(P, 1) !== ihash(P + 1, 1) && ihash(0, 0, 1) !== ihash(0, 1, 0) && ihash(1, 0, 0) !== ihash(0, 1, 0)
    const legacyAliases = hash32(P) === hash32(-P)
    const u32 = [1, -1, 2 ** 31 - 1, -(2 ** 31)].every(a => { const h = ihash(a, 3, 5); return Number.isInteger(h) && h >= 0 && h < 2 ** 32 })
    assert('noise: ihash full-range ints, no aliasing at ±2²³ (hash32 does)', !dup && pairs && legacyAliases && u32, `${seen.size} ints around 0, ±2²³, 2³⁰, ±2³¹: ${dup} collisions; hash32(2²³) ${legacyAliases ? '===' : '!=='} hash32(−2²³)`)
  }
  {
    const first = (seed: number, id: number, step: number) => { const g = rngFor(seed, id, step); return [g(), g(), g()].join(',') }
    const streams = new Set<string>()
    for (let id = 0; id < 64; id++) for (let step = 0; step < 64; step++) streams.add(first(9, id, step))
    const again = first(9, 3, 4) === first(9, 3, 4), seeded = first(9, 3, 4) !== first(10, 3, 4), dflt = first(9, 3, 0) === (() => { const g = rngFor(9, 3); return [g(), g(), g()].join(',') })()
    let lo = 1, hi = 0
    const g = rngFor(1, 2, 3)
    for (let i = 0; i < 1e4; i++) { const v = g(); if (v < lo) lo = v; if (v > hi) hi = v }
    assert('noise: rngFor streams differ per id and step', streams.size === 64 * 64 && again && seeded && dflt && lo >= 0 && hi < 1, `${streams.size}/4096 distinct (id × step), in [${lo.toFixed(4)}, ${hi.toFixed(4)}]`)
  }

  // ── F0.2 gradient noise and fBm ──────────────────────────────────────────────────────────────────
  {
    const r = lcg(21)
    let m2 = 0, m3 = 0, in2 = true, in3 = true, sum = 0
    for (let i = 0; i < 1e6; i++) {
      const x = r() * 256 - 128, y = r() * 256 - 128, z = r() * 64, a = noise2(x, y, 3), b = noise3(x, y, z, 3)
      sum += a
      if (!(a >= -1 && a <= 1)) in2 = false
      if (!(b >= -1 && b <= 1)) in3 = false
      if (Math.abs(a) > m2) m2 = Math.abs(a)
      if (Math.abs(b) > m3) m3 = Math.abs(b)
    }
    assert('noise: noise2/noise3 ∈ [−1,1], max |n| ≥ .9 over 1e6', in2 && in3 && m2 >= .9 && m3 >= .9, `max |noise2| ${m2.toFixed(4)}, max |noise3| ${m3.toFixed(4)}`)
    let fIn = true, tIn = true, rIn = true
    for (let i = 0; i < 2e5; i++) {
      const x = r() * 64 - 32, y = r() * 64 - 32, o = 1 + (i & 7), f = fbm2(x, y, o, i & 15), t = turb2(x, y, o, 2), g = ridge2(x, y, o, 3)
      if (!(f >= -1 && f <= 1)) fIn = false
      if (!(t >= 0 && t <= 1)) tIn = false
      if (!(g >= 0 && g <= 1)) rIn = false
    }
    const mean = sum / 1e6
    assert('noise: fbm2 ∈ [−1,1], turb2/ridge2 ∈ [0,1], |mean(noise2)| < .02', fIn && tIn && rIn && Math.abs(mean) < .02, `mean(noise2) ${mean.toExponential(2)} over 1e6; fbm/turb/ridge over 2e5 × 1–8 octaves`)
  }
  {
    const r = lcg(22), eps = 1e-4
    let worst = 0
    for (let i = 0; i < 1e5; i++) {
      // a pair ε apart that straddles an integer line (x for even i, y for odd i)
      const k = Math.floor(r() * 200) - 100, off = r() * eps, other = r() * 200 - 100, s = i & 7
      const d = i & 1 ? Math.abs(noise2(other, k - off + eps, s) - noise2(other, k - off, s)) : Math.abs(noise2(k - off + eps, other, s) - noise2(k - off, other, s))
      if (d > worst) worst = d
    }
    assert('noise: Lipschitz across lattice lines (|Δn| ≤ 4·ε at ε = 1e-4, 1e5 pairs straddling integers)', worst <= 4 * eps, `max |Δn| ${worst.toExponential(2)} (= ${(worst / eps).toFixed(2)}·ε)`)
  }
  {
    const r = lcg(23), N = 1e5
    let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0
    for (let i = 0; i < N; i++) { const x = r() * 500, y = r() * 500, a = noise2(x, y, 1), b = noise2(x, y, 2); sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b }
    const rho = (sab / N - (sa / N) * (sb / N)) / Math.sqrt((saa / N - (sa / N) ** 2) * (sbb / N - (sb / N) ** 2))
    const seeds = [0, 1, 7, -5, 123456].every(seed => new Set(Array.from({ length: 8 }, (_, o) => octaveSeed(seed, o))).size === 8)
    assert('noise: seeds decorrelated (|ρ(seed 1, seed 2)| < .05) and octave seeds distinct', Math.abs(rho) < .05 && seeds && octaveSeed(42, 0) === 42, `ρ = ${rho.toFixed(4)}`)
  }
  {
    const r = lcg(24), h = 1e-4, c = Math.SQRT1_2
    let v0 = 0, v45 = 0, v90 = 0
    for (let i = 0; i < 1e5; i++) {
      const x = r() * 200 - 100, y = r() * 200 - 100
      const d0 = (fbm2(x + h, y) - fbm2(x - h, y)) / (2 * h), d45 = (fbm2(x + h * c, y + h * c) - fbm2(x - h * c, y - h * c)) / (2 * h), d90 = (fbm2(x, y + h) - fbm2(x, y - h)) / (2 * h)
      v0 += d0 * d0; v45 += d45 * d45; v90 += d90 * d90
    }
    const q = v0 / v45, q90 = v90 / v45
    assert('noise: fbm2 isotropic (derivative variance along 0° vs 45° within ±15%)', q > .85 && q < 1.15 && q90 > .85 && q90 < 1.15, `var 0°/45° = ${q.toFixed(3)}, 90°/45° = ${q90.toFixed(3)}`)
  }
  {
    const r = lcg(25), h = 1e-5, out = new Float64Array(3)
    let err = 0, same = true
    for (let i = 0; i < 1e5; i++) {
      const x = r() * 100 - 50, y = r() * 100 - 50, z = r() * 20, s = i & 15
      noise3Grad(x, y, z, s, out)
      if (out[0] !== noise3(x, y, z, s)) same = false
      const dx = (noise3(x + h, y, z, s) - noise3(x - h, y, z, s)) / (2 * h), dy = (noise3(x, y + h, z, s) - noise3(x, y - h, z, s)) / (2 * h)
      err = Math.max(err, Math.abs(dx - out[1]), Math.abs(dy - out[2]))
    }
    assert('noise: noise3Grad matches central differences (h = 1e-5) to 1e-6', err <= 1e-6 && same, `max |Δ| ${err.toExponential(2)} over 1e5 points; n === noise3`)
  }
  {
    const r = lcg(26)
    let bad = 0
    for (let i = 0; i < 1e5; i++) { const x = r() * 300 - 50, y = r() * 300 - 50, s = Math.floor(r() * 64); if (!Object.is(valueNoise2(x, y, s), cinemaVnoise(x, y, s))) bad++ }
    assert('noise: valueNoise2 ≡ cinema vnoise on 1e5 samples (===)', bad === 0, `${bad} differ`)
  }

  // ── F0.3 Voronoi and curl ────────────────────────────────────────────────────────────────────────
  {
    const r = lcg(31), metrics: Metric[] = ['l2', 'l1', 'linf'], f1Bad = [0, 0, 0], f2Bad = [0, 0, 0]
    for (let i = 0; i < 1e5; i++) {
      const x = r() * 400 - 200, y = r() * 400 - 200, s = i & 31
      metrics.forEach((m, k) => {
        const o = voronoi2(x, y, s, m), [b1, b2] = bruteVoronoi(x, y, s, m)
        if (o.f1 !== b1) f1Bad[k]++
        if (o.f2 !== b2) f2Bad[k]++
      })
    }
    assert('noise: voronoi2 F1 exact vs 7×7 brute force, all 3 metrics, 1e5 samples (===)', f1Bad.every(n => n === 0), `mismatches l2/l1/linf ${f1Bad.join('/')}`)
    const l1Rate = f2Bad[1] / 1e5
    assert('noise: F2 exact for l2/linf; l1 F2 mismatch rate ≤ 1e-4 (reported)', f2Bad[0] === 0 && f2Bad[2] === 0 && l1Rate <= 1e-4, `F2 mismatches l2 ${f2Bad[0]}, linf ${f2Bad[2]}, l1 ${f2Bad[1]} (rate ${l1Rate.toExponential(1)})`)
  }
  {
    const r = lcg(32), mine: VoronoiOut = { f1: 0, f2: 0, id: 0, x: 0, y: 0 }
    let ordered = true, stable = true, reused = true
    const ids = new Set<number>()
    for (let i = 0; i < 2e4; i++) {
      const x = r() * 100 - 50, y = r() * 100 - 50, s = i & 7, m: Metric = (['l2', 'l1', 'linf'] as const)[i % 3]
      const o = voronoi2(x, y, s, m)
      if (!(o.f1 <= o.f2)) ordered = false
      const { id, x: px, y: py } = o
      ids.add(id)
      // a query nudged towards the feature point stays in its cell: same id and point
      const q = voronoi2(x + (px - x) * .5, y + (py - y) * .5, s, m, mine)
      if (q.id !== id || q.x !== px || q.y !== py) stable = false
      if (q !== mine || voronoi2(x, y, s, m) !== o) reused = false
    }
    assert('noise: f1 ≤ f2, id stable per cell, out object reused (no new object per call)', ordered && stable && reused && ids.size > 1e4, `${ids.size} distinct ids over 2e4 queries`)
  }
  {
    const r = lcg(33)
    let neg = 0, bisect = 0, bisectMax = 0, below = 0
    for (let i = 0; i < 2e4; i++) {
      const x = r() * 200 - 100, y = r() * 200 - 100, s = i & 15, d = voronoiBorder2(x, y, s), o = voronoi2(x, y, s, 'l2')
      if (!(d >= 0)) neg++
      if (d < (o.f2 - o.f1) / 2 - 1e-12) below++
      // the midpoint of the two nearest points lies on their bisector; when no third point is nearer there it is on the border
      const ps = pointsAround(x, y, s).map(([px, py]) => [px, py, (px - x) ** 2 + (py - y) ** 2] as const).sort((a, b) => a[2] - b[2])
      const mx = (ps[0][0] + ps[1][0]) / 2, my = (ps[0][1] + ps[1][1]) / 2, half = Math.hypot(ps[0][0] - mx, ps[0][1] - my)
      if (pointsAround(mx, my, s).every(([px, py]) => Math.hypot(px - mx, py - my) >= half - 1e-9)) { bisect++; bisectMax = Math.max(bisectMax, voronoiBorder2(mx, my, s)) }
    }
    assert('noise: voronoiBorder2 ≥ 0, ≈ 0 on bisectors (±1e-9), ≥ (f2 − f1)/2 (lower bound)', !neg && !below && bisect > 1e4 && bisectMax <= 1e-9,
      `${neg} negative, ${below} under the bound; ${bisect} border midpoints, max ${bisectMax.toExponential(1)}`)
  }
  {
    const r = lcg(34), h = 1e-5, out: [number, number] = [0, 0]
    // ψ exactly as curl2 documents it: Σ gainᵒ·noise3(x·2ᵒ, y·2ᵒ, t·speed, seedᵒ), 2 octaves, speed .25, gain .5
    const psi = (x: number, y: number, t: number, s: number) => noise3(x, y, t * .25, octaveSeed(s, 0)) + .5 * noise3(x * 2, y * 2, t * .25, octaveSeed(s, 1))
    let err = 0, vmax = 0
    for (let i = 0; i < 2e4; i++) {
      const x = r() * 60 - 30, y = r() * 60 - 30, t = r() * 10, s = i & 7
      curl2(x, y, t, s, out)
      const vx = (psi(x, y + h, t, s) - psi(x, y - h, t, s)) / (2 * h), vy = -(psi(x + h, y, t, s) - psi(x - h, y, t, s)) / (2 * h)
      err = Math.max(err, Math.abs(vx - out[0]), Math.abs(vy - out[1])); vmax = Math.max(vmax, Math.abs(out[0]), Math.abs(out[1]))
    }
    assert('noise: curl2 = (∂ψ/∂y, −∂ψ/∂x) of ψ by central differences (≤ 1e-5·max|v|)', err <= 1e-5 * vmax, `max |Δ| ${err.toExponential(2)}, max |v| ${vmax.toFixed(3)}`)
    let div = 0, vm = 0
    const a: [number, number] = [0, 0], b: [number, number] = [0, 0], dh = 1e-4
    for (let j = 0; j < 64; j++) for (let i = 0; i < 64; i++) {
      const x = 3.1 + i / 16, y = -2.7 + j / 16, t = 1.7
      curl2(x + dh, y, t, 5, a); curl2(x - dh, y, t, 5, b)
      const dvx = (a[0] - b[0]) / (2 * dh)
      vm = Math.max(vm, Math.abs(a[0]), Math.abs(a[1]))
      curl2(x, y + dh, t, 5, a); curl2(x, y - dh, t, 5, b)
      div = Math.max(div, Math.abs(dvx + (a[1] - b[1]) / (2 * dh)))
    }
    assert('noise: curl2 divergence ≤ 1e-4·max|v| (FD over a 64² patch)', div <= 1e-4 * vm, `max |div| ${div.toExponential(2)}, max |v| ${vm.toFixed(3)}`)
  }


  // ── F0.4 the IR builtin pack ─────────────────────────────────────────────────────────────────────
  {
    const N = 48, cell = (k: number) => (k + .5) / N
    const rows = Object.entries(IR_NOISE_FIELDS).map(([name, src]) => {
      const ast = parse(src), closure = compileJS(ast, { raw: true }), fn = compileJS(ast, { mode: 'function', raw: true }), lib = IR_NOISE_LIB[name]
      let bad = 0
      for (const env of IR_NOISE_ENVS) {
        const a = closure(env), b = fn(env), ref = referenceField(ast, env)
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
          const u = cell(c), v = cell(r), want = lib(u, v, env.t ?? 0)
          if (!Object.is(a(u, v), want) || !Object.is(b(u, v), want) || !Object.is(ref(u, v), want)) bad++
        }
      }
      return [name, bad, fn.mode] as const
    })
    const off = rows.filter(([, bad]) => bad).map(([n, bad]) => `${n} ${bad}`)
    assert(`ir+noise: closure ≡ function ≡ library call on ${rows.length} fields, 48×48 × 3 envs (===)`, !off.length && rows.every(([, , m]) => m === 'function'),
      off.length ? off.join(', ') : `${rows.map(([n]) => n).join(', ')}; the reference interpreter agrees too`)
  }
  {
    const src = 'let noise = 3; noise + noise(u, v, 1)'
    let ok = false, detail = ''
    try {
      const f = compileJS(parse(src), { raw: true })()
      ok = Object.is(f(.3, .7), 3 + noise2(.3, .7, 1))
      // core builtins stay reserved; a pack name is still a function when called, and an error when bare and unbound
      const sinBinds = (() => { try { parse('let sin = 1; sin'); return true } catch { return false } })()
      const bare = (() => { try { parse('noise + 1'); return 'parsed' } catch (e) { return (e as Error).message } })()
      ok = ok && !sinBinds && /is a function/.test(bare) && deserialize(serialize(parse(src))) !== null
      detail = `value ${f(.3, .7).toFixed(6)}; "let sin" rejected: ${!sinBinds}; bare "noise": ${bare}`
    } catch (e) { detail = (e as Error).message }
    assert('ir+noise: "let noise = 3; noise + noise(u, v, 1)" parses (pack names are not reserved)', ok, detail)
  }
  {
    const msgs = ['noise(u, v, 1)', 'fbm(u, v, 4, 1)', 'turb(u, v, 4, 1)', 'voronoi(u, v, 1, 0)'].map(src => { try { compileBytecode(parse(src)); return 'compiled' } catch (e) { return e instanceof IRError ? e.message : `not an IRError: ${(e as Error).message}` } })
    const core = (() => { try { return compileBytecode(parse('sin(u) + hash(u, v)')).length > 0 } catch { return false } })()
    assert('ir+noise: compileBytecode rejects noise() with "not in device bytecode v1"', msgs.every(m => m.includes('not in device bytecode v1')) && core, msgs[0])
  }
  {
    const glsl = Object.fromEntries(Object.entries(IR_NOISE_FIELDS).map(([k, src]) => [k, fnv1a(emitGLSL(parse(src)))]))
    if (opts.update || !existsSync(NOISE_GLSL_FILE)) {
      writeFileSync(NOISE_GLSL_FILE, JSON.stringify({ about: 'FNV-1a 32 of emitGLSL() per IR noise field (scripts/noise.ts IR_NOISE_FIELDS), prelude included. Re-baseline with `npx tsx scripts/noise.ts --update` when a codegen change is intended.', prelude: fnv1a(NOISE_GLSL), fields: glsl }, null, 1) + '\n')
      console.log(`${NOISE_GLSL_FILE}: wrote ${Object.keys(glsl).length} GLSL hashes`)
    }
    const golden = JSON.parse(readFileSync(NOISE_GLSL_FILE, 'utf8')) as { prelude: string; fields: Record<string, string> }
    const drift = Object.keys({ ...glsl, ...golden.fields }).filter(k => glsl[k] !== golden.fields[k])
    if (golden.prelude !== fnv1a(NOISE_GLSL)) drift.unshift('prelude')
    const mixed = emitGLSL(parse('noise(u, v, 1) + fbm(u, v, 4, 2) + turb(v, u, 3, 3) + voronoi(u * 4, v * 4, 1, 2) + noise(v, u, 2) + hash(u, v)'))
    const count = (s: string, needle: string) => s.split(needle).length - 1
    const once = count(mixed, 'uint ir_ih(') === 1 && count(mixed, 'float ir_voronoi(') === 1 && count(mixed, 'uint ir_fmix(') === 1 && count(mixed, 'ir_noise(') === 3
    const plain = !emitGLSL(parse('sin(u) + hash(u, v)')).includes('ir_ih')
    assert('ir+noise: GLSL snapshot = goldens/noise-glsl.json; prelude emitted once per program', !drift.length && once && plain, drift.length ? `changed: ${drift.join(', ')}` : `${Object.keys(glsl).length} fields + prelude; one prelude with the core hash helper beside it`)
  }


  // ── F0.9 the determinism lint and the cross-engine snapshot ──────────────────────────────────────────
  {
    const res = detLint()
    if (res.skipped.length) console.log(`  det: not created yet, skipped: ${res.skipped.join(', ')}`)
    assert('det: no engine-specific Math in deterministic paths', !res.violations.length && res.scanned.length > 0,
      res.violations.length ? res.violations.map(v => `${v.file}:${v.line} ${v.rule}`).join('; ') : `${res.scanned.length} files under ${DET_PATHS.length - res.skipped.length}/${DET_PATHS.length} registered paths`)
    const root = mkdtempSync(join(tmpdir(), 'detlint-'))
    try {
      mkdirSync(join(root, 'src/engine/noise'), { recursive: true }); mkdirSync(join(root, 'src/engine/other'), { recursive: true }); mkdirSync(join(root, 'src/engine/matter'), { recursive: true })
      writeFileSync(join(root, 'src/engine/noise/planted.ts'), '/** Math.sin in a doc comment is fine */\nexport const a = (x: number) => Math.sin(x) // planted\n')
      writeFileSync(join(root, 'src/engine/noise/allowed.ts'), 'export const b = (x: number) => Math.exp(x) // det-ok: a host-only diagnostic\nexport const c = (x: number) => x ** 2 + x ** -1 + Math.floor(x) + Math.PI\n')
      writeFileSync(join(root, 'src/engine/matter/sandpile.ts'), 'export const d = (x: number) => x ** .5\n')
      writeFileSync(join(root, 'src/engine/other/free.ts'), 'export const e = () => Math.random() + Math.atan2(1, 2)\n')
      const t = detLint(['src/engine/noise/', 'src/engine/matter/sand', 'src/engine/life/'], root)
      const got = t.violations.map(v => `${v.file}:${v.line}:${v.rule}`).sort().join(' ')
      const want = ['src/engine/matter/sandpile.ts:1:** with a non-integer exponent', 'src/engine/noise/planted.ts:2:Math.sin'].join(' ')
      assert('det: a planted Math.sin in a temp file under a registered path fails; det-ok passes; unregistered paths ignored', got === want && t.skipped.join() === 'src/engine/life/', got || 'no violations')
    } finally { rmSync(root, { recursive: true, force: true }) }
  }
  {
    // optional cross-engine run (Bun / JavaScriptCore): the same sweeps must hash the same as under Node (V8)
    const bun = [process.env.BUN, join(homedir(), '.bun/bin/bun.exe'), join(homedir(), '.bun/bin/bun')].find(p => p && existsSync(p))
    if (!bun) console.log('  noise: Bun/JSC snapshot skipped (no bun on this box; set $BUN)')
    else {
      const r = spawnSync(bun, ['scripts/noise.ts', '--snapshot'], { encoding: 'utf8', timeout: 120000 })
      let theirs: Record<string, string> | null = null
      try { theirs = JSON.parse(r.stdout.trim().split('\n').pop() ?? '') } catch { /* reported below */ }
      if (!theirs) console.log(`  noise: Bun/JSC snapshot skipped (bun failed: ${(r.stderr || r.error?.message || 'no output').trim().split('\n')[0]})`)
      else {
        const diff = Object.keys({ ...snap, ...theirs }).filter(k => snap[k] !== theirs![k])
        assert('noise: Bun/JSC snapshot ≡ Node/V8', !diff.length, diff.length ? `differ: ${diff.join(', ')}` : `${Object.keys(snap).length} sweeps incl. dexp/dpow, bun ${spawnSync(bun, ['--version'], { encoding: 'utf8' }).stdout.trim()}`)
      }
    }
  }

  // ── budgets (§4): ratio gates are machine-independent; absolute gates scale by the load factor ─────────
  {
    const r = lcg(15), xs = Float64Array.from({ length: 1e6 }, () => r() * 20 - 10), ys = Float64Array.from({ length: 1e6 }, () => r() * 3 + .01)
    let sink = 0
    // interleaved runs, fastest of each: a ratio of two medians swings with the other processes on a shared box
    const ratio = (a: () => void, b: () => void) => { a(); b(); let ta = Infinity, tb = Infinity; for (let k = 0; k < 7; k++) { ta = Math.min(ta, time(a)[0]); tb = Math.min(tb, time(b)[0]) } return ta / tb }
    const at = ratio(() => { for (let i = 0; i < 1e6; i++) sink += datan2(xs[i], ys[i] - 1.5) }, () => { for (let i = 0; i < 1e6; i++) sink += Math.atan2(xs[i], ys[i] - 1.5) })
    const ex = ratio(() => { for (let i = 0; i < 1e6; i++) sink += dexp(xs[i]) }, () => { for (let i = 0; i < 1e6; i++) sink += Math.exp(xs[i]) })
    const pw = ratio(() => { for (let i = 0; i < 1e6; i++) sink += dpow(ys[i], xs[i]) }, () => { for (let i = 0; i < 1e6; i++) sink += Math.pow(ys[i], xs[i]) })
    assert('noise: budget datan2 ≤ 2× Math.atan2, dexp ≤ 4× Math.exp, dpow ≤ 6× Math.pow (1e6 calls, fastest of 7 interleaved)', at <= 2 && ex <= 4 && pw <= 6 && Number.isFinite(sink),
      `datan2 ${at.toFixed(2)}×, dexp ${ex.toFixed(2)}×, dpow ${pw.toFixed(2)}×`)
  }
  {
    // A shared box changes load within seconds, so each timing is normalised by load samples interleaved with it:
    // n rounds of (a 1e6-step copy of the load-factor loop, ~1.2 ms at load 1; the timed call), then the fastest
    // call over the fastest load sample (clamped to ≥ 1). Same scale as loadFactor(), but immune to load swings.
    const spin = () => { let s = 0; for (let i = 0; i < 1e6; i++) s += (i & 7) * .5; return s }
    const timed = (f: () => unknown, n = 15): [number, number] => {
      f(); spin()
      let tb = Infinity, tl = Infinity
      for (let k = 0; k < n; k++) { tl = Math.min(tl, time(spin)[0]); tb = Math.min(tb, time(f)[0]) }
      const lf = Math.max(1, tl / 1.2)
      return [tb, lf]
    }
    const fmt = ([ms, lf]: [number, number]) => `${ms.toFixed(2)} ms @ load ${lf.toFixed(2)} → ${(ms / lf).toFixed(2)}`
    const ok = ([ms, lf]: [number, number], gate: number) => ms <= gate * lf
    // explicit loops (a shared `f(c, r)` call site would go polymorphic and time the harness, not the noise)
    const G = 144, g = 48
    const n2 = timed(() => { let s = 0; for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) s += noise2(c * 6 / G, r * 6 / G, 1); return s })
    const fb = timed(() => { let s = 0; for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) s += fbm2(c * 6 / G, r * 6 / G, 4, 1); return s })
    const fl = timed(() => { let s = 0; for (let r = 0; r < g; r++) for (let c = 0; c < g; c++) s += fbm2(c * 6 / g, r * 6 / g, 4, 1); return s }, 15)
    assert('noise: budget noise2 144² ≤ 1.2 ms, fbm2 4 oct 144² ≤ 4.5 ms, fbm2 4 oct 48² ≤ 0.8 ms (fastest warm run, × interleaved load)', ok(n2, 1.2) && ok(fb, 4.5) && ok(fl, .8),
      `noise2 ${fmt(n2)}, fbm2 ${fmt(fb)}, fbm2 48² ${fmt(fl)}`)
    const out = { f1: 0, f2: 0, id: 0, x: 0, y: 0 }
    const vor = (['l2', 'l1', 'linf'] as const).map(m => timed(() => { let s = 0; for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) s += voronoi2(c * 8 / G, r * 8 / G, 1, m, out).f1; return s }))
    assert('noise: budget voronoi2 l2 / l1 / linf 144² ≤ 3.5 ms each (fastest warm run, × interleaved load)', vor.every(t => ok(t, 3.5)), vor.map(fmt).join(' / '))
    const r = lcg(35), px = Float64Array.from({ length: 1000 }, () => r() * 40), py = Float64Array.from({ length: 1000 }, () => r() * 40), v: [number, number] = [0, 0]
    const cu = timed(() => { let s = 0; for (let i = 0; i < 1000; i++) s += curl2(px[i], py[i], 2.5, 3, v)[0]; return s }, 21)
    assert('noise: budget curl2 2 oct, 1000 points ≤ 0.3 ms (fastest warm run, × interleaved load)', ok(cu, .3), fmt(cu))
  }
}

const self = process.argv[1]?.replace(/\\/g, '/')
if (self && import.meta.url.endsWith(self.split('/').slice(-2).join('/'))) {
  if (process.argv.includes('--snapshot')) console.log(JSON.stringify(snapshot()))
  else {
    let failures = 0
    noiseChecks((name, cond, detail = '') => {
      if (cond) console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`)
      else { console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`); failures++ }
    }, { update: process.argv.includes('--update') })
    if (failures) { console.error(`\n${failures} noise check(s) failed`); process.exit(1) }
  }
}
