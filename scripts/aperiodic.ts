/**
 * Checks for the aperiodic floors, phase XQ (#20, docs/living-matter/X-advanced.md #7): the hex lattice and kite
 * grid, the hat metatile substitution over 3 levels (no two hats overlap, every hat is 8 kites of area 8√3, the
 * mirrored-hat ratio close to φ⁴ : 1), the Ammann–Beenker multigrid (one tile over every point, the square : rhombus
 * ratio, inflation by δ keeps the vertices), and the two cards (the red, the seamless loops, the bake and frame).
 * Called from verify.ts (`aperiodicChecks(assert)`); also runnable alone: `npx tsx scripts/aperiodic.ts`.
 * Timings are warnings unless DOT_TIMING=strict (scripts/lib/check.ts).
 */
import { KITE_AREA, R3, hexSites, kiteAt, kiteCentroid, kiteOutline } from '../src/engine/algo/hex'
import { HAT, HAT_AREA, bakeHats, hatKites, hatOutline, inside, polyArea, type HatTiling } from '../src/engine/algo/hat'
import { SILVER, abArea, abOutline, ammannBeenker, type AbTile } from '../src/engine/algo/ammann'
import { installSquares } from '../src/engine/squares'
import { sampleLayersInto } from '../src/engine/sampler/gridSampler'
import { dot480 } from '../src/engine/theme/tokens'
import { withChrome, type WidgetPreset } from '../src/widgets'
import { HAT_CARD, bakeHatFloor, hatCells, hatFloor, sqHat } from '../src/widgets/boards/squaresHat'
import { abFrame, sqAmmann } from '../src/widgets/boards/squaresAmmann'
import { sampleCard } from './lib/cards'
import { detLint } from './lib/detLint'
import { fmtLoaded, medianLoaded, onceLoaded } from './lib/load'

type Assert = (name: string, cond: boolean, detail?: string) => void
const PHI4 = ((1 + Math.sqrt(5)) / 2) ** 4
/** Deterministic PRNG (mulberry32). */
const rng = (seed: number) => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }

/** Hats that overlap, found without the kite map: a kite centroid of one hat inside another hat's outline. */
function polygonOverlaps(t: HatTiling): number {
  const outlines = t.hats.map(hatOutline), cs = hatKites(), centre = t.hats.map(h => { const [x, y] = [h.m[2], h.m[5]]; return [x, y] })
  const bucket = new Map<string, number[]>(), key = (x: number, y: number) => `${Math.floor(x / 8)},${Math.floor(y / 8)}`
  centre.forEach(([x, y], i) => { const k = key(x, y); const b = bucket.get(k); if (b) b.push(i); else bucket.set(k, [i]) })
  let bad = 0
  t.hats.forEach((h, i) => {
    const [x, y] = centre[i], bx = Math.floor(x / 8), by = Math.floor(y / 8)
    const pts = cs.map(c => [h.m[0] * c[0] + h.m[1] * c[1] + h.m[2], h.m[3] * c[0] + h.m[4] * c[1] + h.m[5]])
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const j of bucket.get(`${bx + dx},${by + dy}`) ?? []) {
      if (j !== i && pts.some(([px, py]) => inside(outlines[j], px, py))) bad++
    }
  })
  return bad
}

/** Points of a fine grid inside radius r covered by 0 or by 2+ tiles (interiors, a hair inside each edge). */
function abCoverage(ts: AbTile[], r: number): { holes: number; doubles: number; points: number } {
  const bucket = new Map<string, number[]>(), key = (x: number, y: number) => `${Math.floor(x / 2)},${Math.floor(y / 2)}`
  ts.forEach((t, i) => { const k = key(t.centre[0], t.centre[1]); const b = bucket.get(k); if (b) b.push(i); else bucket.set(k, [i]) })
  let holes = 0, doubles = 0, points = 0
  for (let y = -r; y <= r; y += .173) for (let x = -r; x <= r; x += .191) {
    if (x * x + y * y > r * r) continue
    points++
    let open = 0, closed = 0
    const bx = Math.floor(x / 2), by = Math.floor(y / 2)
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const i of bucket.get(`${bx + dx},${by + dy}`) ?? []) {
      const [p0, p1, , p3] = abOutline(ts[i]), ax = p1[0] - p0[0], ay = p1[1] - p0[1], bx2 = p3[0] - p0[0], by2 = p3[1] - p0[1], det = ax * by2 - ay * bx2
      const px = x - p0[0], py = y - p0[1], u = (px * by2 - py * bx2) / det, v = (ax * py - ay * px) / det
      if (u > -1e-9 && u < 1 + 1e-9 && v > -1e-9 && v < 1 + 1e-9) closed++
      if (u > 1e-6 && u < 1 - 1e-6 && v > 1e-6 && v < 1 - 1e-6) open++
    }
    if (!closed) holes++
    if (open > 1) doubles++
  }
  return { holes, doubles, points }
}

/** 4-connected pieces among card dots (centres one pitch apart). */
function pieces(dots: { x: number; y: number }[], P: number): number {
  const at = new Map(dots.map((d, i) => [`${Math.round(d.x / P)},${Math.round(d.y / P)}`, i])), seen = new Set<number>()
  let n = 0
  for (let i = 0; i < dots.length; i++) {
    if (seen.has(i)) continue
    n++
    const stack = [i]; seen.add(i)
    while (stack.length) {
      const d = dots[stack.pop()!], x = Math.round(d.x / P), y = Math.round(d.y / P)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = at.get(`${x + dx},${y + dy}`); if (j !== undefined && !seen.has(j)) { seen.add(j); stack.push(j) } }
    }
  }
  return n
}

export function aperiodicChecks(assert: Assert): void {
  installSquares()

  // ── hex lattice and kite grid ──────────────────────────────────────────────────────────────────────
  {
    const s = hexSites(5, 4, { pitch: 2, origin: [10, 20] })
    const ok = s.length === 20 && s[0][0] === 10 && s[0][1] === 20 && s[5][0] === 11 && Math.abs(s[5][1] - (20 + R3)) < 1e-12 && Math.abs(s[10][1] - (20 + 2 * R3)) < 1e-12 && s[10][0] === 10
    let nearest = Infinity
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) nearest = Math.min(nearest, Math.hypot(s[i][0] - s[j][0], s[i][1] - s[j][1]))
    assert('aperiodic: hexSites (cols × rows, odd rows shifted half a pitch, rows √3/2 apart, every neighbour one pitch away)', ok && Math.abs(nearest - 2) < 1e-9, `${s.length} sites, nearest ${nearest.toFixed(6)}`)
    const rand = rng(20), o: [number, number] = [.7, -1.3]
    let miss = 0
    for (let i = 0; i < 4000; i++) {
      const x = (rand() - .5) * 60, y = (rand() - .5) * 60, k = kiteAt(x, y, o)
      if (!inside(kiteOutline(k.a, k.b, k.k, o), x, y)) miss++
      const [cx, cy] = kiteCentroid(k.a, k.b, k.k, o), back = kiteAt(cx, cy, o)
      if (back.a !== k.a || back.b !== k.b || back.k !== k.k) miss++
    }
    const kiteArea = polyArea(kiteOutline(0, 0, 0))
    assert('aperiodic: kite lookup (4,000 random points: the kite kiteAt returns holds the point, its centroid looks up to itself; kite area √3)', miss === 0 && Math.abs(kiteArea - KITE_AREA) < 1e-12, `${miss} misses, area ${kiteArea.toFixed(6)}`)
  }

  // ── hat substitution over 3 levels ─────────────────────────────────────────────────────────────────
  {
    const kites = hatKites(), unit = polyArea(HAT)
    assert('aperiodic: the unit hat (13 corners, 8 kites, area 8√3)', HAT.length === 13 && kites.length === 8 && Math.abs(unit - HAT_AREA) < 1e-9 && kites.every(c => inside(HAT, c[0], c[1])), `${kites.length} kites, area ${unit.toFixed(6)}`)
    const COUNTS = [4, 25, 169, 1156]
    const rows: string[] = []
    let ok = true, ratio = 0, err2 = 0
    for (const level of [1, 2, 3]) {
      const t = bakeHats(level), n = t.hats.length, m = t.hats.filter(h => h.mirrored).length
      const badArea = t.hats.filter(h => Math.abs(polyArea(hatOutline(h)) - HAT_AREA) > 1e-6 || Math.abs(Math.abs(h.m[0] * h.m[4] - h.m[1] * h.m[3]) - 1) > 1e-9).length
      const poly = level <= 3 ? polygonOverlaps(t) : 0, r = (n - m) / m
      ok &&= n === COUNTS[level] && t.overlaps === 0 && t.offGrid === 0 && t.kites.size === 8 * n && badArea === 0 && poly === 0
      if (level === 2) err2 = Math.abs(r - PHI4)
      if (level === 3) ratio = r
      rows.push(`L${level} ${n} hats (${m} mirrored), ${t.overlaps} shared kites, ${t.offGrid} off-grid, ${poly} polygon overlaps, ${badArea} bad areas`)
    }
    assert('aperiodic: hat substitution (levels 1–3: 25, 169, 1,156 hats; no two hats share a kite or overlap as polygons; every hat is a unit-area-scale copy on the kite grid, area 8√3)', ok, rows.join('; '))
    assert('aperiodic: mirrored-hat ratio (unmirrored : mirrored at level 3 within 0.5% of φ⁴ = 6.854, closer than level 2)', Math.abs(ratio - PHI4) / PHI4 < .005 && Math.abs(ratio - PHI4) < err2, `L3 ${ratio.toFixed(4)} : 1, L2 off by ${err2.toFixed(4)}`)
    const a = bakeHats(3), b = bakeHats(3)
    assert('aperiodic: hat determinism (two fresh bakes are bit-equal)', a.hats.every((h, i) => h.m.every((x, j) => x === b.hats[i].m[j]) && h.cluster === b.hats[i].cluster))
    const det = detLint(['src/engine/algo/hex', 'src/engine/algo/hat', 'src/engine/algo/ammann'])
    assert('det: no engine-specific Math in the aperiodic floors (hex, hat, ammann; registered with the determinism lint)', !det.violations.length && det.scanned.length === 3, det.violations.map(v => `${v.file}:${v.line} ${v.rule}`).join('; ') || `${det.scanned.length} files`)
  }

  // ── Ammann–Beenker multigrid ───────────────────────────────────────────────────────────────────────
  {
    const R = 14, ts = ammannBeenker(R + 3), cov = abCoverage(ts, R)
    assert('aperiodic: ammann coverage (a fine grid inside r = 14: every point in a tile, no point inside two)', cov.holes === 0 && cov.doubles === 0, `${cov.points} points, ${cov.holes} holes, ${cov.doubles} doubles, ${ts.length} tiles`)
    const big = ammannBeenker(30), sq = big.filter(t => t.kind <= 1).length, rh = big.length - sq, area = big.reduce((s, t) => s + abArea(t), 0)
    assert('aperiodic: ammann frequencies (rhombi : squares within 3% of √2; tile area within 3% of the disc)', Math.abs(rh / sq - Math.SQRT2) / Math.SQRT2 < .03 && Math.abs(area / (Math.PI * 900) - 1) < .03, `${rh} rhombi, ${sq} squares, ratio ${(rh / sq).toFixed(4)}, area ${(area / (Math.PI * 900)).toFixed(4)} of the disc`)
    const V = new Set<string>(), k = (x: number, y: number) => `${Math.round(x * 1e6)},${Math.round(y * 1e6)}`
    for (const t of big) for (const [x, y] of abOutline(t)) V.add(k(x, y))
    let inflated = 0, kept = 0
    for (const t of big) for (const [x, y] of abOutline(t)) if (Math.hypot(x, y) * SILVER < 26) { inflated++; if (V.has(k(x * SILVER, y * SILVER))) kept++ }
    assert('aperiodic: ammann inflation (δ = 1 + √2 maps every vertex near the centre to a vertex)', inflated > 50 && kept === inflated, `${kept}/${inflated} vertices`)
  }

  // ── the cards ──────────────────────────────────────────────────────────────────────────────────────
  {
    const f = hatFloor(), cellOf = (d: { x: number; y: number }) => { const c = Math.round(d.x / 2.25 - .5) - HAT_CARD.origin[0], r = Math.round(d.y / 2.25 - .5) - HAT_CARD.origin[1]; return c < 0 || r < 0 || c >= HAT_CARD.w || r >= HAT_CARD.h ? -1 : r * HAT_CARD.w + c }
    const holes = f.hat.filter(i => i < 0).length
    assert('aperiodic: hat floor covers the card (every floor cell finds a hat in the level-3 supertile)', holes === 0, `${f.shown} hats shown, ${holes} empty cells`)
    const reds = [0, 1.3, 5.7, 8, 10.5].map(t => {
      const r = sampleCard(sqHat, t).filter(d => d.color === dot480.dotActive)
      return { n: pieces(r, 2.25), stray: r.filter(d => { const j = cellOf(d); return j < 0 || !f.mirrored[f.hat[j]] }).length }
    })
    assert('aperiodic: hat red (every red dot is a mirrored hat, one piece per mirrored hat shown, every frame)', reds.every(r => r.n === f.shownMirrored && r.stray === 0), `${f.shownMirrored} mirrored; ` + reds.map(r => `${r.n} pieces ${r.stray} stray`).join(', '))
    const fusedMid = hatCells(f.reach / 2).group.some(g => g >= 128), splitAll = hatCells(Infinity).group.every(g => g < 128)
    const keys = (t: number) => sampleCard(sqHat, t).map(d => `${d.x},${d.y},${d.r},${d.color},${d.join}`).join()
    const wrap = (HAT_CARD.loop - 7) % HAT_CARD.loop
    assert('aperiodic: hat loop (mid-sweep some metatiles fused and some split; on hold every hat apart; seamless where the loop wraps)', fusedMid && splitAll && keys(wrap - 1e-4) === keys(wrap))
    const a0 = abFrame(0).code, a1 = abFrame(1 - 1e-7).code
    let same = 0
    for (let i = 0; i < a0.length; i++) if ((a0[i] & 7) === (a1[i] & 7)) same++
    assert('aperiodic: ammann loop (after one inflation by δ every tile has split and the floor matches the first frame: ≥ 99.5% of cells)', same / a0.length >= .995, `${(100 * same / a0.length).toFixed(2)}% of cells`)
    // pinholes: an empty cell whose 4 neighbours are one tile (a cell centre lost on a shared edge)
    let pin = 0
    for (let q = 0; q < 40; q++) {
      const c = abFrame(q / 40).tile, w = 144
      for (let i = w + 1; i < c.length - w - 1; i++) if (c[i] < 0 && c[i - 1] >= 0 && c[i - 1] === c[i + 1] && c[i - 1] === c[i - w] && c[i - 1] === c[i + w]) pin++
    }
    assert('aperiodic: ammann raster (40 phases: no pinholes inside a tile)', pin === 0, `${pin} pinholes`)
    const ls = withChrome(sqAmmann)({ t: 2.2, data: {} }), sites = ls.flatMap(l => l.sites ?? [])
    const reds2 = [0, 1.3, 2.2, 4.4].map(t => pieces(sampleCard(sqAmmann, t).filter(d => d.color === dot480.dotActive), 2.25))
    assert('aperiodic: ammann dots (rhombi are round sites on cell centres; the red is one tile, at most one piece)', sites.length > 1000 && sites.every(([x, y]) => Number.isInteger(x) && Number.isInteger(y)) && reds2.every(n => n <= 1), `${sites.length} sites, red ${reds2.join('/')}`)

    // bake and frame (warn-only timings)
    for (let i = 0; i < 2; i++) bakeHatFloor()
    const bake = onceLoaded(() => bakeHatFloor())
    assert('aperiodic: hat bake ≤ 20 ms (level-3 substitution, kite map and the card lookup, once and cached)', bake.ms <= 20 * bake.load, fmtLoaded(bake, 1))
    const look = medianLoaded(i => abFrame((i * .0731) % 1), 15)
    console.log(`  aperiodic: ammann per-frame raster ${fmtLoaded(look)}; hat per-frame lookup is a cached array read (re-baked only when a cluster splits)`)
    const frame = (p: WidgetPreset, t: number) => sampleLayersInto(withChrome(p)({ t, data: {} }), p.grid, p.style, dot480)
    for (const p of [sqHat, sqAmmann]) {
      for (let i = 0; i < 4; i++) frame(p, i / 12)
      const r = medianLoaded(i => frame(p, 1.5 + i * .37), 13)
      assert(`aperiodic: ${p.id} frame ≤ 4 ms (layers + sample, median warm × load)`, r.ms <= 4 * r.load, `${fmtLoaded(r)}, ${frame(p, 1.5).n} dots`)
    }
  }
}

const self = process.argv[1]?.replace(/\\/g, '/')
if (self && import.meta.url.endsWith(self.split('/').slice(-2).join('/'))) {
  const { assert, done } = (await import('./lib/check')).checker('aperiodic')
  aperiodicChecks(assert)
  done()
}
