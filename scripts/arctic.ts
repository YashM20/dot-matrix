/**
 * Checks for the arctic circle and the sandpile (#36, docs/living-matter/X-advanced.md #2 and #8): domino shuffling
 * tiles the Aztec diamond with no holes or overlaps at several orders, every domino's direction follows the parity
 * rule, small orders come out uniform (all 2^(n(n+1)/2) tilings, evenly), the frozen corners and the circle; the
 * sandpile identity is stable and its own double, toppling is order-independent (same grid and odometer from
 * parallel sweeps and from a stack), the burn topples every cell once and ends on e; and the two cards (one red
 * thing, joined dominoes stay apart, seamless loops, bake and frame).
 * Called from verify.ts (`arcticChecks(assert)`); also runnable alone: `npx tsx scripts/arctic.ts`.
 * Timings are warnings unless DOT_TIMING=strict (scripts/lib/check.ts).
 */
import { aztecShuffle, colourDominoes, dirOf, frozenOf, horizontal, inDiamond, ownerGrid, partner, tilingAt, type Domino } from '../src/engine/squares/aztec'
import { borderGrains, relax, relaxScan, relaxSerial, sandpileBurn, sandpileIdentity } from '../src/engine/squares/sandpile'
import { rngFor } from '../src/engine/noise/dmath'
import { installSquares } from '../src/engine/squares'
import { sampleLayersInto } from '../src/engine/sampler/gridSampler'
import { dot480 } from '../src/engine/theme/tokens'
import { withChrome, type WidgetPreset } from '../src/widgets'
import { ARCTIC_CARD, arcticBeat, arcticCells, sqArctic } from '../src/widgets/boards/squaresArctic'
import { SAND_CARD, sandBurn, sandLoop, sandSweep, sqSandpile } from '../src/widgets/boards/squaresSandpile'
import { sampleCard } from './lib/cards'
import { detLint } from './lib/detLint'
import { fmtLoaded, medianLoaded, onceLoaded } from './lib/load'

type Assert = (name: string, cond: boolean, detail?: string) => void

/** Cells of the order-n diamond covered 0 times, more than once, or covered outside it. */
function coverage(ds: Domino[], n: number): { holes: number; doubles: number; outside: number } {
  const s = 2 * n, hit = new Uint8Array(s * s)
  let outside = 0
  for (const d of ds) for (const [x, y] of [[d.x, d.y], partner(d)]) {
    if (!inDiamond(x, y, n)) { outside++; continue }
    hit[(y + n) * s + x + n]++
  }
  let holes = 0, doubles = 0
  for (let y = -n; y < n; y++) for (let x = -n; x < n; x++) {
    if (!inDiamond(x, y, n)) continue
    const k = hit[(y + n) * s + x + n]
    if (k === 0) holes++
    if (k > 1) doubles++
  }
  return { holes, doubles, outside }
}

export function arcticChecks(assert: Assert): void {
  installSquares()

  // ── domino shuffling ───────────────────────────────────────────────────────────────────────────────
  {
    const h = aztecShuffle(40, 7), rows: string[] = []
    let ok = h.bad === 0, parity = 0
    for (const n of [1, 2, 5, 12, 29, 40]) {
      const ds = tilingAt(h, n), c = coverage(ds, n)
      ok &&= c.holes === 0 && c.doubles === 0 && c.outside === 0 && ds.length === n * (n + 1)
      parity += ds.filter(d => d.dir !== dirOf(d.x, d.y, n, horizontal(d))).length
      rows.push(`n ${n}: ${ds.length} dominoes, ${c.holes} holes, ${c.doubles} doubles, ${c.outside} outside`)
    }
    assert('arctic: domino tiling (orders 1, 2, 5, 12, 29, 40: every diamond cell covered once, no cell outside, n(n + 1) dominoes, no unfillable hole)', ok, `${h.bad} bad holes; ` + rows.join('; '))
    assert('arctic: directions (every domino\'s N / S / E / W matches its anchor\'s checkerboard parity against the order)', parity === 0, `${parity} off`)
    // the create pass only makes pairs that move apart, and annihilation only takes facing pairs
    let facing = 0
    for (const st of h.steps) for (let i = 0; i < st.born.length; i += 2) { const a = st.born[i], b = st.born[i + 1]; if (!((a.dir === 0 && b.dir === 1) || (a.dir === 3 && b.dir === 2))) facing++ }
    assert('arctic: new pairs (every created block is N over S or W left of E, so it never collides on the next step)', facing === 0, `${facing} facing`)
    // uniform: order 3 has 64 tilings; 6,400 seeded shuffles hit each about 100 times
    const counts = new Map<string, number>(), runs = 6400
    for (let s = 0; s < runs; s++) {
      const key = tilingAt(aztecShuffle(3, 1000 + s), 3).map(d => `${d.x},${d.y},${horizontal(d) ? 'h' : 'v'}`).sort().join(';')
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const v = [...counts.values()], chi = v.reduce((a, k) => a + (k - 100) ** 2 / 100, 0)
    // 63 degrees of freedom: the 99.9% point is about 103
    assert('arctic: uniform (order 3: all 64 tilings appear over 6,400 seeds, χ² < 103)', counts.size === 64 && chi < 103, `${counts.size} tilings, χ² ${chi.toFixed(1)}, ${Math.min(...v)}–${Math.max(...v)} each`)
    const a = aztecShuffle(29, 11), b = aztecShuffle(29, 11)
    assert('arctic: determinism (two fresh shuffles with one seed are equal)', tilingAt(a, 29).every((d, i) => { const e = tilingAt(b, 29)[i]; return d.x === e.x && d.y === e.y && d.dir === e.dir }))
    const det = detLint(['src/engine/squares/aztec', 'src/engine/squares/sandpile'])
    assert('det: no engine-specific Math in the shuffle and the sandpile (in the determinism lint)', !det.violations.length && det.scanned.length === 2, det.violations.map(x => `${x.file}:${x.line} ${x.rule}`).join('; ') || `${det.scanned.length} files`)
  }

  // ── the arctic circle ──────────────────────────────────────────────────────────────────────────────
  {
    const n = 60, hist = aztecShuffle(n, 3), ds = tilingAt(hist, n), g = ownerGrid(ds, n), fz = frozenOf(ds, g, n), r = n / Math.SQRT2
    const shareOf = (m: number) => { const dm = tilingAt(hist, m); return frozenOf(dm, ownerGrid(dm, m), m).reduce((a, k) => a + k, 0) / dm.length }
    // the frozen share falls toward 1 − π/4 as the order grows (the edge is a band about n^(1/3) wide)
    const share = shareOf(n), share30 = shareOf(30), theory = 1 - Math.PI / 4
    // every unfrozen domino's centre sits inside the circle, give or take the edge's n^(1/3) wobble
    let worst = 0
    ds.forEach((d, i) => { if (!fz[i]) { const [x2, y2] = partner(d); worst = Math.max(worst, Math.sqrt(((d.x + x2) / 2 + .5) ** 2 + ((d.y + y2) / 2 + .5) ** 2) - r) } })
    // frozen dominoes face one way per corner: north of the circle every frozen one is N, and so on
    const wrong = ds.filter((d, i) => fz[i] && Math.abs(d.y) > Math.abs(d.x) + 2 && d.dir !== (d.y > 0 ? 0 : 1)).length
    assert('arctic: the circle (frozen share above 1 − π/4 and falling toward it from order 30 to 60, within .1 at 60; no unfrozen domino more than 2·n^⅓ outside radius n/√2; frozen corners point outward)', share > theory && share < share30 && share - theory < .1 && worst < 2 * Math.cbrt(n) && wrong === 0, `frozen ${(share30 * 100).toFixed(1)}% at 30, ${(share * 100).toFixed(1)}% at 60 (limit 21.5%), worst ${worst.toFixed(2)} cells past r = ${r.toFixed(1)}, ${wrong} wrong way`)
    let clash = 0
    for (const m of [5, 29, 60]) {
      const dm = tilingAt(aztecShuffle(60, 3), m), gm = ownerGrid(dm, m), col = colourDominoes(dm, gm, m)
      dm.forEach((d, i) => { for (const [x, y] of [[d.x, d.y], partner(d)]) for (const [dx, dy] of [[1, 0], [0, 1]]) { const xx = x + dx, yy = y + dy; if (xx < m && yy < m) { const j = gm[(yy + m) * 2 * m + xx + m]; if (j >= 0 && j !== i && col[j] === col[i]) clash++ } } })
    }
    assert('arctic: domino colouring (no two touching dominoes share a join group)', clash === 0, `${clash} clashes`)
  }

  // ── the sandpile ───────────────────────────────────────────────────────────────────────────────────
  {
    const { w, h } = SAND_CARD, e = sandpileIdentity(w, h), full = sandpileIdentity(w, h, true)
    const stable = e.every(v => v >= 0 && v <= 3), same = e.every((v, i) => v === full[i])
    const ee = Int32Array.from(e, v => 2 * v)
    relax(ee, w, h)
    assert('sandpile: identity (72 × 58: every height 0–3, the folded quarter equals the full grid, and (e + e)° = e)', stable && same && ee.every((v, i) => v === e[i]), `heights ${[0, 1, 2, 3].map(k => e.filter(v => v === k).length).join('/')}`)
    // abelian: a random pile relaxed by parallel sweeps and by a stack ends the same, with the same odometer
    const rand = rngFor(36, 8), rows: string[] = []
    let ok = true
    for (const [rw, rh, top] of [[40, 30, 16], [17, 23, 9], [72, 58, 7]]) {
      const z0 = Int32Array.from({ length: rw * rh }, () => Math.floor(rand() * top)), a = Int32Array.from(z0), b = Int32Array.from(z0), c = Int32Array.from(z0)
      const pa = relax(a, rw, rh), ob = relaxSerial(b, rw, rh), oc = relaxScan(c, rw, rh)
      const eq = a.every((v, i) => v === b[i] && v === c[i]) && pa.odometer.every((v, i) => v === ob[i] && v === oc[i]), st = a.every(v => v >= 0 && v <= 3)
      ok &&= eq && st
      rows.push(`${rw}×${rh} 0–${top - 1}: ${pa.sweeps} sweeps, ${pa.odometer.reduce((s, k) => s + k, 0)} topples, ${eq ? 'equal' : 'DIFFERENT'}${st ? '' : ', unstable'}`)
    }
    assert('sandpile: abelian (3 random piles toppled 3 ways, parallel sweeps, a last-in-first-out stack and alternating in-place scans: the same stable grid, all heights ≤ 3, and the same odometer)', ok, rows.join('; '))
    const burn = sandpileBurn(w, h, e), once = burn.odometer.every(k => k === 1), back = burn.z[burn.sweeps].every((v, i) => v === e[i])
    const zero = new Int32Array(w * h), bz = borderGrains(w, h)
    for (let i = 0; i < zero.length; i++) zero[i] += bz[i]
    const z = relax(zero, w, h).odometer.filter(k => k === 1).length
    assert('sandpile: burning test (border grains on e: every cell topples exactly once and e comes back; on the empty grid most cells never topple)', once && back && z < w * h / 4, `${burn.sweeps} sweeps; empty grid: ${z} of ${w * h} topple`)
  }

  // ── the cards ──────────────────────────────────────────────────────────────────────────────────────
  {
    const { side, orders, loop } = ARCTIC_CARD
    // joined pieces are dominoes: per step and beat, the two cells of a domino share tone and group, neighbours don't
    let split = 0, merged = 0
    for (let step = 1; step <= orders; step++) for (let beat = 0; beat < 3; beat++) {
      const a = arcticCells(step, beat)
      for (let r = 0; r < side; r++) for (let c = 0; c < side; c++) {
        const j = r * side + c
        if (a.tone[j] === 255) continue
        let mates = 0
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const cc = c + dc, rr = r + dr, k = rr * side + cc
          if (cc < 0 || rr < 0 || cc >= side || rr >= side || a.tone[k] === 255) continue
          if (a.tone[k] === a.tone[j] && a.group[k] === a.group[j]) mates++
        }
        if (mates === 0) split++
        if (mates > 1) merged++
      }
    }
    assert('arctic: joined dominoes (every step and beat: each lit cell joins exactly one neighbour, its partner)', split === 0 && merged === 0, `${split} alone, ${merged} joined to two`)
    const keys = (p: WidgetPreset, t: number) => sampleCard(p, t).map(d => `${d.x},${d.y},${d.r},${d.color},${d.join}`).join()
    const wrap = loop - (ARCTIC_CARD.orders * ARCTIC_CARD.step + 2)
    const b0 = arcticBeat(wrap - 1e-4), b1 = arcticBeat(wrap)
    assert('arctic: loop (the rewind ends on the empty diamond the growth starts from: seamless where the loop wraps; t = 0 is the full order-29 diamond)', b0.order === 0 && b1.order === 0 && keys(sqArctic, wrap - 1e-4) === keys(sqArctic, wrap) && arcticBeat(0).order === orders, `${b0.order} → ${b1.order}`)
    const burn = sandBurn(), sl = sandLoop(), lead = burn.sweeps * SAND_CARD.beat / 3, red = (t: number) => sampleCard(sqSandpile, t).filter(d => d.color === dot480.dotActive).length
    const hold = burn.sweeps * SAND_CARD.beat + .5 - lead, wrapS = sl - lead
    // the wrap: the last frame is e; the first adds the border grains, so only the edge ring of cells may differ
    const ring = (d: { x: number; y: number }) => { const c = Math.round(d.x / 2.25 - .5), r = Math.round(d.y / 2.25 - .5); return c <= 1 || c >= 142 || r <= 13 || r >= 126 }
    const inner = (t: number) => sampleCard(sqSandpile, t).filter(d => !ring(d) && d.y < 128 * 2.25).map(d => `${d.x},${d.y},${d.r},${d.color}`).join()
    assert('sandpile: card (the hold shows e with no red, the burn shows red; where the loop wraps only the border ring changes as the grains land, and the joins beside it)', sandSweep(hold) === burn.sweeps && red(hold) === 0 && red(0) > 0 && keys(sqSandpile, wrapS - 1e-4) === keys(sqSandpile, hold) && inner(wrapS - 1e-4) === inner(wrapS), `sweep ${sandSweep(hold)} at t ${hold.toFixed(2)}, ${red(0)} red at t 0`)

    // bake and frame (warn-only timings)
    for (let i = 0; i < 2; i++) aztecShuffle(29, i)
    const bake = onceLoaded(() => aztecShuffle(29, 5))
    assert('arctic: shuffle bake ≤ 10 ms (29 orders, once and cached)', bake.ms <= 10 * bake.load, fmtLoaded(bake, 1))
    sandpileBurn(SAND_CARD.w, SAND_CARD.h)
    const sb = onceLoaded(() => sandpileBurn(SAND_CARD.w, SAND_CARD.h))
    assert('sandpile: identity and burn bake ≤ 40 ms (72 × 58, the identity on a folded quarter, once and cached)', sb.ms <= 40 * sb.load, fmtLoaded(sb, 1))
    const frame = (p: WidgetPreset, t: number) => sampleLayersInto(withChrome(p)({ t, data: {} }), p.grid, p.style, dot480)
    for (const p of [sqArctic, sqSandpile]) {
      for (let i = 0; i < 4; i++) frame(p, i / 12)
      const r = medianLoaded(i => frame(p, 1.5 + i * .37), 13)
      assert(`arctic: ${p.id} frame ≤ 4 ms (layers + sample, median warm × load)`, r.ms <= 4 * r.load, `${fmtLoaded(r)}, ${frame(p, 1.5).n} dots`)
    }
  }
}

const self = process.argv[1]?.replace(/\\/g, '/')
if (self && import.meta.url.endsWith(self.split('/').slice(-2).join('/'))) {
  const { assert, done } = (await import('./lib/check')).checker('arctic')
  arcticChecks(assert)
  done()
}
