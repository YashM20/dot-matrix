/**
 * Checks for the IQ5 noise additions (#66, docs/IQ-PLAN.md IQ5): `noised2`, `valueNoised2`, `fbmd2` against central
 * differences; `voronoiEdge2` against a brute-force distance to the cell border; smooth Voronoi converging to F1;
 * Voronoise at its four corners; fbm's H = −log2(gain); the nested warp against its formula. FNV-1a hashes of fixed
 * sweeps are pinned in `goldens/noise-iq.json` (the older functions stay in goldens/noise.json, untouched). The
 * determinism lint over `src/engine/noise/` runs in scripts/noise.ts.
 *
 *   npx tsx scripts/noise-iq.ts            # run the checks
 *   npx tsx scripts/noise-iq.ts --update   # rewrite goldens/noise-iq.json after an intended change
 *   bun scripts/noise-iq.ts --snapshot     # print the hashes as JSON (compare another engine with the golden)
 *
 * `pnpm verify` runs the same checks through `noiseIqChecks(assert)`, right after the noise slot.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { cellValue2, smoothVoronoi2, smoothVoronoiPow2, voronoiEdge2, voronoise2 } from '../src/engine/noise/cells'
import { erosionFbm2, fbmd2, noised2, valueNoised2 } from '../src/engine/noise/derivatives'
import { fbmGain, fbmH2, NOISE_COLORS, warpFbm2, type NoiseColor } from '../src/engine/noise/fractal'
import { fbm2, noise2 } from '../src/engine/noise/gradient'
import { ihash } from '../src/engine/noise/hash'
import { voronoi2, voronoiBorder2 } from '../src/engine/noise/voronoi'
import type { Assert } from './lib/check'

const FILE = 'goldens/noise-iq.json'
const time = <T>(f: () => T): [number, T] => { const a = performance.now(), r = f(); return [performance.now() - a, r] }
/** The fixed LCG and FNV-1a of scripts/noise.ts (same inputs in every engine). */
function lcg(seed: number) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 } }
function fnv(values: Float64Array): string {
  const b = new Uint8Array(values.buffer, values.byteOffset, values.byteLength)
  let h = 0x811c9dc5
  for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193) }
  return (h >>> 0).toString(16).padStart(8, '0')
}
const sweep = (n: number, f: (i: number) => number) => { const out = new Float64Array(n); for (let i = 0; i < n; i++) out[i] = f(i); return fnv(out) }

export function snapshotIq(): Record<string, string> {
  const g = (i: number, w: number) => [(i % w) * .113 - 9, Math.floor(i / w) * .127 - 9] as const
  const e = { d: 0, x: 0, y: 0, id: 0, nx: 0, ny: 0, nid: 0 }, w = { f: 0, qx: 0, qy: 0, rx: 0, ry: 0 }
  return {
    noised2: sweep(6e4, i => noised2((i % 317) * .173 - 20, (i / 317) * .211 - 30, i & 3)[i % 3]),
    valueNoised2: sweep(6e4, i => valueNoised2((i % 317) * .173 - 20, (i / 317) * .211 - 30, i & 3)[i % 3]),
    fbmd2: sweep(3e4, i => fbmd2((i % 199) * .0731, (i / 199) * .0917, 1 + (i % 8), 5)[i % 3]),
    fbmd2Value: sweep(3e4, i => fbmd2((i % 199) * .0731, (i / 199) * .0917, 4, 6, undefined, { basis: 'value', gain: .45, lacunarity: 2.03 })[i % 3]),
    erosionFbm2: sweep(2e4, i => erosionFbm2((i % 141) * .0731, (i / 141) * .0917, 7, { octaves: 1 + (i % 16), basis: i & 1 ? 'gradient' : 'value' })),
    voronoiEdge2: sweep(3e4, i => { const [x, y] = g(i, 199), o = voronoiEdge2(x, y, 3, i & 1 ? 1 : .6, e); return [o.d, o.nx, o.ny, o.nid, o.id][i % 5] }),
    smoothVoronoi2: sweep(3e4, i => { const [x, y] = g(i, 199); return smoothVoronoi2(x, y, 4, [1 / 32, 1 / 8, .3][i % 3]) }),
    smoothVoronoiPow2: sweep(3e4, i => { const [x, y] = g(i, 199); return smoothVoronoiPow2(x, y, 5, [1 / 16, 1 / 6, .05][i % 3]) }),
    voronoise2: sweep(2e4, i => { const [x, y] = g(i, 199); return voronoise2(x, y, (i % 5) / 4, ((i >> 2) % 5) / 4, 6) }),
    fbmH2: sweep(2e4, i => fbmH2((i % 141) * .0731, (i / 141) * .0917, (['blue', 'white', 'pink', 'brown', 'yellow', .3, .8] as const)[i % 7], 1 + (i % 8), 8)),
    warpFbm2: sweep(2e4, i => { const o = warpFbm2((i % 141) * .031, (i / 141) * .037, 9, w, { depth: (i % 3) as 0 | 1 | 2 }); return [o.f, o.qx, o.qy, o.rx, o.ry][i % 5] }),
  }
}

/** Feature points of the 9×9 cells around p (voronoi.ts's formula, any jitter). */
function points(x: number, y: number, seed: number, jitter: number): [number, number][] {
  const cx = Math.floor(x), cy = Math.floor(y), ps: [number, number][] = []
  for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) { const h = ihash(cx + i, cy + j, seed); ps.push([cx + i + jitter * (h & 0xffff) / 65536, cy + j + jitter * (h >>> 16) / 65536]) }
  return ps
}
/** Max |analytic − central difference| of a [v, dx, dy] function over random points, and the largest |∇| seen. */
function fdError(f: (x: number, y: number, s: number) => Float64Array, r: () => number, n: number, span: number, h = 1e-5): [number, number] {
  let err = 0, gmax = 0
  for (let i = 0; i < n; i++) {
    const x = (r() - .5) * span, y = (r() - .5) * span, s = i & 15, a = f(x, y, s), gx = a[1], gy = a[2]
    const dx = (f(x + h, y, s)[0] - f(x - h, y, s)[0]) / (2 * h), dy = (f(x, y + h, s)[0] - f(x, y - h, s)[0]) / (2 * h)
    err = Math.max(err, Math.abs(dx - gx), Math.abs(dy - gy)); gmax = Math.max(gmax, Math.abs(gx), Math.abs(gy))
  }
  return [err, gmax]
}

export function noiseIqChecks(assert: Assert, opts: { update?: boolean } = {}): void {
  // ── hash snapshot ────────────────────────────────────────────────────────────────────────────────
  {
    const snap = snapshotIq()
    if (opts.update || !existsSync(FILE)) {
      writeFileSync(FILE, JSON.stringify({ about: 'FNV-1a 32 of fixed input sweeps through the IQ5 noise additions (scripts/noise-iq.ts snapshotIq()). Identical under every JS engine; re-baseline with `npx tsx scripts/noise-iq.ts --update` only for an intended change.', hashes: snap }, null, 1) + '\n')
      console.log(`${FILE}: wrote ${Object.keys(snap).length} hashes`)
    }
    const golden: Record<string, string> = JSON.parse(readFileSync(FILE, 'utf8')).hashes
    const drift = Object.keys({ ...snap, ...golden }).filter(k => snap[k] !== golden[k])
    assert('noise-iq: determinism hashes = goldens/noise-iq.json', !drift.length, drift.length ? `changed: ${drift.join(', ')}` : `${Object.keys(snap).length} sweeps`)
  }

  // ── analytic derivatives ─────────────────────────────────────────────────────────────────────────
  {
    const r = lcg(41)
    let same = 0, fsame = 0
    for (let i = 0; i < 1e5; i++) { const x = r() * 400 - 200, y = r() * 400 - 200, s = i & 31; if (Object.is(noised2(x, y, s)[0], noise2(x, y, s))) same++ }
    for (let i = 0; i < 2e4; i++) {
      const x = r() * 100 - 50, y = r() * 100 - 50, o = 1 + (i & 7), opt = i & 1 ? { gain: .6, lacunarity: 1.97 } : undefined
      if (Object.is(fbmd2(x, y, o, i & 15, undefined, opt)[0], fbm2(x, y, o, i & 15, opt))) fsame++
    }
    assert('noise-iq: noised2 value === noise2 and fbmd2 value === fbm2 (bit for bit)', same === 1e5 && fsame === 2e4, `${same}/1e5, ${fsame}/2e4`)
    const [gErr, gMax] = fdError(noised2, lcg(42), 1e5, 200)
    const [vErr, vMax] = fdError(valueNoised2, lcg(43), 1e5, 200)
    assert('noise-iq: noised2 / valueNoised2 gradients match central differences (h = 1e-5) to 1e-6', gErr <= 1e-6 && vErr <= 1e-6,
      `max |Δ| ${gErr.toExponential(2)} (|∇| ≤ ${gMax.toFixed(2)}), ${vErr.toExponential(2)} (|∇| ≤ ${vMax.toFixed(2)})`)
    const out = new Float64Array(3)
    const fb = (o: { basis?: 'gradient' | 'value'; gain?: number; lacunarity?: number }) => fdError((x, y, s) => fbmd2(x, y, 6, s, out, o), lcg(44), 2e4, 60, 1e-6)
    const [a, am] = fb({}), [b, bm] = fb({ basis: 'value', gain: .45, lacunarity: 2.1 })
    assert('noise-iq: fbmd2 gradient (6 octaves, both bases) matches central differences (h = 1e-6) to 1e-5·max|∇|', a <= 1e-5 * am && b <= 1e-5 * bm,
      `gradient ${a.toExponential(2)} of ${am.toFixed(1)}, value ${b.toExponential(2)} of ${bm.toFixed(1)}`)
  }
  {
    const r = lcg(45)
    let inRange = true, one = 0, vIn = true
    for (let i = 0; i < 2e4; i++) {
      const x = r() * 100 - 50, y = r() * 100 - 50, s = i & 7, e = erosionFbm2(x, y, s, { octaves: 1 + (i % 16), basis: i & 1 ? 'gradient' : 'value' })
      if (!(e >= -1 && e <= 1)) inRange = false
      const v = valueNoised2(x, y, s), want = v[0] / (1 + v[1] * v[1] + v[2] * v[2])
      if (!(v[0] >= -1 && v[0] <= 1)) vIn = false
      if (Object.is(erosionFbm2(x, y, s, { octaves: 1 }), want)) one++
    }
    assert('noise-iq: erosionFbm2 ∈ [−1, 1]; one octave = n / (1 + |∇n|²); valueNoised2 ∈ [−1, 1]', inRange && vIn && one === 2e4, `${one}/2e4 one-octave identities`)
  }

  // ── Voronoi border ───────────────────────────────────────────────────────────────────────────────
  {
    const r = lcg(46)
    let err = 0, same = 0, nBad = 0, n = 0
    const e = { d: 0, x: 0, y: 0, id: 0, nx: 0, ny: 0, nid: 0 }
    for (let i = 0; i < 2e4; i++) {
      const x = r() * 200 - 100, y = r() * 200 - 100, s = i & 15, jit = i % 3 === 0 ? .5 : 1
      voronoiEdge2(x, y, s, jit, e)
      if (Object.is(e.d, voronoiBorder2(x, y, s, jit))) same++
      // brute force: nearest of 81 points, then the nearest bisector over all the others
      const ps = points(x, y, s, jit).map(([px, py]) => [px, py, (px - x) ** 2 + (py - y) ** 2] as const).sort((p, q) => p[2] - q[2])
      const [ax, ay] = ps[0]
      let best = Infinity, bx = 0, by = 0
      for (const [px, py] of ps.slice(1)) {
        const l = Math.hypot(px - ax, py - ay), d = ((px + ax) / 2 - x) * (px - ax) / l + ((py + ay) / 2 - y) * (py - ay) / l
        if (d < best) { best = d; bx = px; by = py }
      }
      err = Math.max(err, Math.abs(e.d - Math.max(best, 0)))
      const l = Math.hypot(bx - ax, by - ay), nid = voronoi2(bx, by, s, 'l2', undefined, jit).id
      // the normal and neighbour are checked away from ties (a corner where two borders are equally near)
      if (ps[0][2] < ps[1][2] - 1e-9 && best < 1e9) { n++; if (Math.abs(e.nx - (bx - ax) / l) > 1e-9 || Math.abs(e.ny - (by - ay) / l) > 1e-9 || e.nid !== nid || e.x !== ax || e.y !== ay) nBad++ }
    }
    assert('noise-iq: voronoiEdge2 = brute-force distance to the cell border (81 points, ±1e-12), === voronoiBorder2; normal and neighbour id agree',
      err <= 1e-12 && same === 2e4 && nBad <= n * 1e-3, `max |Δ| ${err.toExponential(2)}, ${same}/2e4 bit-equal, ${nBad}/${n} normal/neighbour mismatches (near-ties)`)
  }

  // ── smooth Voronoi ───────────────────────────────────────────────────────────────────────────────
  {
    const r = lcg(47), L = Math.log2(25), ss = [1 / 8, 1 / 32, 1 / 128, 1 / 512, 1 / 4096]
    const devE = ss.map(() => 0), devP = ss.map(() => 0)
    let bounds = true, exact = 0
    for (let i = 0; i < 1e4; i++) {
      const x = r() * 200 - 100, y = r() * 200 - 100, s = i & 15, f1 = voronoi2(x, y, s).f1
      if (Object.is(smoothVoronoi2(x, y, s, 0), f1) && Object.is(smoothVoronoiPow2(x, y, s, 0), f1)) exact++
      ss.forEach((k, j) => {
        const a = smoothVoronoi2(x, y, s, k), b = smoothVoronoiPow2(x, y, s, k)
        if (!(a <= f1 + 1e-12 && a >= f1 - k * L - 1e-12 && b <= f1 * (1 + 1e-12) && b >= f1 * 25 ** -k - 1e-12)) bounds = false
        devE[j] = Math.max(devE[j], f1 - a); devP[j] = Math.max(devP[j], f1 - b)
      })
    }
    const falls = (d: number[]) => d.every((v, j) => j === 0 || v < d[j - 1])
    assert('noise-iq: smooth Voronoi (exp, pow) → F1 as smoothness → 0; F1 − s·log2 25 ≤ exp ≤ F1, F1·25^−s ≤ pow ≤ F1; s = 0 === F1',
      bounds && falls(devE) && falls(devP) && devE[ss.length - 1] < 1e-3 && devP[ss.length - 1] < 1e-3 && exact === 1e4,
      `max F1 − value at s = 1/8 … 1/4096: exp ${devE.map(v => v.toExponential(1)).join(' ')}; pow ${devP.map(v => v.toExponential(1)).join(' ')}`)
  }

  // ── Voronoise corners ────────────────────────────────────────────────────────────────────────────
  {
    const r = lcg(48), o = { f1: 0, f2: 0, id: 0, x: 0, y: 0 }
    let inRange = true, vorN = 0, vorErr = 0, cellN = 0, cellErr = 0
    const slope = [0, 0, 0, 0], eps = 1e-4
    for (let i = 0; i < 2e4; i++) {
      const x = r() * 100 - 50, y = r() * 100 - 50, s = i & 7
      for (const [u, v] of [[0, 0], [0, 1], [1, 0], [1, 1], [.5, .5]]) { const n = voronoise2(x, y, u, v, s); if (!(n >= 0 && n < 1)) inRange = false }
      // (1, 0) is Voronoi: away from a border (F2 − F1 > .25) it is the nearest cell's value
      voronoi2(x, y, s, 'l2', o, 1)
      if (o.f2 - o.f1 > .25) { vorN++; vorErr = Math.max(vorErr, Math.abs(voronoise2(x, y, 1, 0, s) - cellValue2(Math.floor(o.x), Math.floor(o.y), s))) }
      // (0, 0) is cell noise: the same on the unjittered lattice, so the nearest lattice corner's value
      voronoi2(x, y, s, 'l2', o, 0)
      if (o.f2 - o.f1 > .25) { cellN++; cellErr = Math.max(cellErr, Math.abs(voronoise2(x, y, 0, 0, s) - cellValue2(o.x, o.y, s))) }
      // (0, 1) noise and (1, 1) voronoise are smooth; v = 0 steps between cells
      ;[[0, 1], [1, 1], [0, 0], [1, 0]].forEach(([u, v], k) => { slope[k] = Math.max(slope[k], Math.abs(voronoise2(x + eps, y, u, v, s) - voronoise2(x, y, u, v, s)) / eps) })
    }
    assert('noise-iq: voronoise2 ∈ [0, 1); (1, 0) = Voronoi cell value and (0, 0) = cell noise away from borders (±1e-3)', inRange && vorErr <= 1e-3 && cellErr <= 1e-3 && vorN > 5e3 && cellN > 5e3,
      `max |Δ| Voronoi ${vorErr.toExponential(1)} over ${vorN}, cell noise ${cellErr.toExponential(1)} over ${cellN}`)
    assert('noise-iq: voronoise2 at v = 1 (noise, voronoise) is smooth (max slope ≤ 3); at v = 0 it is ≥ 5× steeper', slope[0] <= 3 && slope[1] <= 3 && Math.min(slope[2], slope[3]) >= 5 * Math.max(slope[0], slope[1]),
      `max slope (0,1) ${slope[0].toFixed(2)}, (1,1) ${slope[1].toFixed(2)}, (0,0) ${slope[2].toFixed(1)}, (1,0) ${slope[3].toFixed(1)}`)
  }

  // ── fbm by H, noise colours, nested warp ─────────────────────────────────────────────────────────
  {
    let rel = 0, ints = true, same = 0
    for (let k = 0; k <= 400; k++) { const H = -2 + k / 100; rel = Math.max(rel, Math.abs(fbmGain(H) / 2 ** -H - 1)) }
    for (const H of [-2, -1, 0, 1, 2]) if (fbmGain(H) !== 2 ** -H) ints = false
    const r = lcg(49)
    for (let i = 0; i < 1e4; i++) { const x = r() * 60, y = r() * 60, H = r() * 2 - 1, oc = 1 + (i & 7); if (Object.is(fbmH2(x, y, H, oc, i & 3), fbm2(x, y, oc, i & 3, { gain: fbmGain(H), lacunarity: 2 }))) same++ }
    const colors = NOISE_COLORS.pink === 0 && NOISE_COLORS.yellow === 1 && fbmGain(NOISE_COLORS.yellow) === .5 && fbmGain(NOISE_COLORS.pink) === 1 && Math.abs(fbmGain(NOISE_COLORS.brown) - Math.SQRT1_2) < 1e-15 && fbmH2(1.3, 2.7, 1) === fbm2(1.3, 2.7)
    // the rougher colours carry more slope: mean |∇|² of 8-octave fbm falls from blue to yellow
    const order: NoiseColor[] = ['blue', 'white', 'pink', 'brown', 'yellow'], g = new Float64Array(3)
    const rough = order.map(c => { const rr = lcg(50); let s = 0; for (let i = 0; i < 4e3; i++) { fbmd2(rr() * 80, rr() * 80, 8, 1, g, { gain: fbmGain(NOISE_COLORS[c]) }); s += g[1] * g[1] + g[2] * g[2] } return s / 4e3 })
    const falls = rough.every((v, j) => j === 0 || v < rough[j - 1])
    assert('noise-iq: fbm gain = 2^−H (rel ≤ 1e-12, exact at integer H); fbmH2 === fbm2 at that gain; colour presets; roughness falls blue → yellow',
      rel <= 1e-12 && ints && same === 1e4 && colors && falls, `max rel ${rel.toExponential(1)}, ${same}/1e4 equal; mean |∇|² ${order.map((c, j) => `${c} ${rough[j].toFixed(2)}`).join(', ')}`)
  }
  {
    const r = lcg(51), w = { f: 0, qx: 0, qy: 0, rx: 0, ry: 0 }
    let bad = 0, inRange = true
    for (let i = 0; i < 5e3; i++) {
      const x = r() * 40, y = r() * 40, s = i & 7, a = i & 1 ? 2.5 : 4, oc = 2 + (i % 5)
      warpFbm2(x, y, s, w, { amount: a, octaves: oc })
      const qx = fbm2(x, y, oc, s), qy = fbm2(x + 5.2, y + 1.3, oc, s)
      const rx = fbm2(x + a * qx + 1.7, y + a * qy + 9.2, oc, s), ry = fbm2(x + a * qx + 8.3, y + a * qy + 2.8, oc, s)
      if (w.qx !== qx || w.qy !== qy || w.rx !== rx || w.ry !== ry || w.f !== fbm2(x + a * rx, y + a * ry, oc, s)) bad++
      if (warpFbm2(x, y, s, w, { depth: 1, amount: a, octaves: oc }).f !== fbm2(x + a * qx, y + a * qy, oc, s) || w.rx !== 0) bad++
      if (warpFbm2(x, y, s, w, { depth: 0, octaves: oc }).f !== fbm2(x, y, oc, s) || w.qx !== 0) bad++
      if (!(Math.abs(w.f) <= 1)) inRange = false
    }
    assert('noise-iq: warpFbm2 = fbm(p + a·r), r = fbm(p + a·q + …), q = fbm(p + …) at depth 2, 1, 0 (===)', !bad && inRange, `${bad} of 1.5e4 differ`)
  }

  // ── cost per 144² card (timing: warns, enforced only under DOT_TIMING=strict) ─────────────────────────
  {
    const spin = () => { let s = 0; for (let i = 0; i < 1e6; i++) s += (i & 7) * .5; return s }
    const timed = (f: () => unknown, n = 7): [number, number] => {
      f(); spin()
      let tb = Infinity, tl = Infinity
      for (let k = 0; k < n; k++) { tl = Math.min(tl, time(spin)[0]); tb = Math.min(tb, time(f)[0]) }
      return [tb, Math.max(1, tl / 1.2)]
    }
    const G = 144, k = 8 / G, e = { d: 0, x: 0, y: 0, id: 0, nx: 0, ny: 0, nid: 0 }, out = new Float64Array(3), w = { f: 0, qx: 0, qy: 0, rx: 0, ry: 0 }
    const rows: [string, number, [number, number]][] = [
      ['noised2', 1.5, timed(() => { let s = 0; for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) s += noised2(c * k, r * k, 1, out)[1]; return s })],
      ['fbmd2 4 oct', 9, timed(() => { let s = 0; for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) s += fbmd2(c * k, r * k, 4, 1, out)[1]; return s })],
      ['erosionFbm2 8 oct', 12, timed(() => { let s = 0; for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) s += erosionFbm2(c * k, r * k, 1); return s })],
      ['voronoiEdge2', 15, timed(() => { let s = 0; for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) s += voronoiEdge2(c * k, r * k, 1, 1, e).d; return s })],
      ['smoothVoronoi2', 22, timed(() => { let s = 0; for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) s += smoothVoronoi2(c * k, r * k, 1); return s })],
      ['smoothVoronoiPow2', 15, timed(() => { let s = 0; for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) s += smoothVoronoiPow2(c * k, r * k, 1); return s })],
      ['voronoise2 (.5, .5)', 30, timed(() => { let s = 0; for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) s += voronoise2(c * k, r * k, .5, .5, 1); return s })],
      ['warpFbm2 4 oct', 25, timed(() => { let s = 0; for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) s += warpFbm2(c * k, r * k, 1, w).f; return s })],
    ]
    const over = rows.filter(([, gate, [ms, lf]]) => ms > gate * lf)
    assert('noise-iq: budget per 144² grid ≤ its ms gate (fastest warm run, × interleaved load)', !over.length,
      rows.map(([n, gate, [ms, lf]]) => `${n} ${(ms / lf).toFixed(2)}/${gate}`).join(', ') + ` ms @ load ${rows[0][2][1].toFixed(2)}`)
  }
}

const self = process.argv[1]?.replace(/\\/g, '/')
if (self && import.meta.url.endsWith(self.split('/').slice(-2).join('/'))) {
  if (process.argv.includes('--snapshot')) { console.log(JSON.stringify(snapshotIq())); process.exit(0) }
  const { assert, done } = (await import('./lib/check')).checker('noise-iq')
  noiseIqChecks(assert, { update: process.argv.includes('--update') })
  done()
}
