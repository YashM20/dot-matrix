/**
 * Materials checks, growth group (scripts/materials.ts `--only growth`): phase XM's two workshop cards
 * (docs/living-matter/X-advanced.md #10, #11). The Lichtenberg plate: the growth model is deterministic and resumable,
 * a pristine figure joins its electrodes, the red is the live front only, a tap burns a figure to the finger, and the
 * growth frames' cost. The erosion stone: droplets in batches ≡ in one run, a checkpointed replay ≡ a cold one, mass is
 * kept, every digit still reads at 19:59 and 23:59 (the oldest cuts of the day), and the bake and rebake costs. The
 * frost window: the 1/12-wedge automaton ≡ a plain full-disc one, the vetted table, the daily pick, the red tips.
 */
import { dbm, dbmPath, dbmWeights } from '../../src/engine/matter/lichtenberg'
import { rain, EROSION, type Terrain } from '../../src/engine/matter/erosion'
import { reiter } from '../../src/engine/matter/reiter'
import { frostHooks as Fr } from '../../src/widgets/boards/workshop-frost'
import { worldReset } from '../../src/engine/physics/world'
import { sampleLayers } from '../../src/engine/sampler/gridSampler'
import { dot480 } from '../../src/engine/theme/tokens'
import type { Pointer } from '../../src/engine/context'
import { withChrome, type WidgetPreset } from '../../src/widgets/types'
import { plateHooks as P } from '../../src/widgets/boards/workshop-plate'
import { stoneHooks as S } from '../../src/widgets/boards/workshop-stone'
import { workshopBoard } from '../../src/widgets/boards/workshop'
import { fmtLoaded, medianLoaded, onceLoaded } from '../lib/load'
import { freezeWallClock } from '../lib/freeze'
import { type Assert, same, type MaterialsOptions } from './util'
import { POINTER, atClock } from './board'

const frame = (p: WidgetPreset, t: number, pointers?: Pointer[]) => sampleLayers(withChrome(p)({ t, data: { ...p.defaults }, pointers }), p.grid, p.style, dot480)
/** Run `f` with the wall clock frozen at h:m on the golden day (then back to the golden 09:41). */
function at<T>(h: number, m: number, f: () => T): T {
  const Real = Date
  freezeWallClock(2026, 0, 1, h, m)
  try { return f() } finally { globalThis.Date = Real }
}

export async function growthChecks(assert: Assert, opts: MaterialsOptions): Promise<void> {
  const byId = (id: string) => workshopBoard.find(p => p.id === id)!
  // ── Lichtenberg ──
  {
    const [a, b] = P.electrodes(0), G = P.PLATE.grid
    const opt = { cols: G.cols, rows: G.rows, a: [a], b: [b], eta: 3, field: .25, seed: 11, max: 2400 }
    const one = dbm(opt), two = dbm(opt)
    one.grow(2400); two.grow(300); two.grow(700); two.grow(2400)
    const resumable = one.count === two.count && same(one.order.subarray(0, one.count), two.order.subarray(0, two.count)) && same(one.parent.subarray(0, one.count), two.parent.subarray(0, two.count))
    const path = dbmPath(one), ends = path.length > 0 && one.parent[path[0]] < 0 && one.parent[path[path.length - 1]] < 0 && one.side[path[0]] !== one.side[path[path.length - 1]]
    let steps = true
    for (let k = 1; k < path.length; k++) { const p = one.order[path[k - 1]], q = one.order[path[k]], dx = Math.abs(p % G.cols - q % G.cols), dy = Math.abs(Math.floor(p / G.cols) - Math.floor(q / G.cols)); if (dx + dy !== 1) steps = false }
    assert('lichtenberg: growth is deterministic and resumable (grow 300, 700, all ≡ all at once, bit for bit)', resumable, `${one.count} cells`)
    assert('lichtenberg: a two-electrode figure joins, and its discharge path runs electrode to electrode in lattice steps', one.joined >= 0 && ends && steps, `joined at cell ${one.joined}, path ${path.length} cells`)
    const w = dbmWeights(one), roots = [0, 1].map(s => { let n = 0; for (let k = 0; k < one.count; k++) if (one.side[k] === s) n++; return n })
    assert('lichtenberg: branch weights: each electrode carries its whole side, every tip carries 1', w[0] === roots[0] && w[1] === roots[1], `sides ${roots.join(' + ')}`)
    let thin = true
    for (const eta of [1, 2, 3]) { const f = dbm({ ...opt, b: undefined, a: [[63, 54]], eta, max: 500 }); f.grow(500); if (f.count !== 500) thin = false }
    assert('lichtenberg: η 1, 2 and 3 grow (one-sided, to 500 cells); a non-integer, non-half η is refused', thin && (() => { try { dbm({ ...opt, eta: 2.3 }); return false } catch { return true } })())
    // the card: red is the front while it burns and the path while it flashes, none while the char cools
    const card = byId('mat-lichtenberg'), red = (t: number) => atClock(() => frame(card, t)).filter(d => d.color === dot480.dotActive).length
    const f0 = P.cycleFigure(0)
    f0.grow(P.PLATE.max)
    const burnt = f0.count / P.PLATE.rate - P.PLATE.offset
    assert('lichtenberg: t = 0 burns (red front); the discharge flashes once joined; the cooled char has no red', red(0) > 0 && red(burnt + .2) > 0 && red(burnt + P.PLATE.arc + .5) === 0 && f0.joined >= 0,
      `red ${red(0)} / ${red(burnt + .2)} / ${red(burnt + P.PLATE.arc + .5)}, burn ${(burnt + P.PLATE.offset).toFixed(2)} s`)
    const w0 = P.plateWorld()
    worldReset(w0)
    atClock(() => { frame(card, 3, [POINTER(110, 40)]); for (let k = 0; k < 3; k++) frame(card, 3.02 + k / 30, [POINTER(110, 40, true)]) })
    const tapped = w0.live[3], live = w0.mode
    let tt = 3.2
    while (tt < 4.5) { atClock(() => frame(card, tt)); tt += 1 / 30 }
    const tf = P.tapFigure(w0.live[3], w0.live[1], w0.live[2])
    let healed = tt
    while (w0.mode !== 'pristine' && healed < 20) { healed += 1 / 12; atClock(() => frame(card, healed)) }
    assert('lichtenberg: a tap grounds the plate there: a figure burns from the nearer electrode to the finger, then the plate heals', tapped === 1 && live === 'live' && tf.joined >= 0 && w0.mode === 'pristine', `figure ${tf.count} cells, joined ${tf.joined >= 0}, pristine again at t ${healed.toFixed(1)}`)
    worldReset(w0)
    const grow = onceLoaded(() => { const f = dbm({ ...opt, seed: 23 }); f.grow(2400); return f.count })
    assert('lichtenberg: a whole figure grows in ≤ 40 ms (× load)', grow.ms <= 40 * grow.load, `${fmtLoaded(grow)} for ${grow.value} cells`)
    if (!opts.quick) {
      // consecutive frames of one burn, 1/12 s apart (cycle 40 starts at t = 480 − offset): each grows ~47 cells and re-cuts the char
      const c0 = 12 * 40 - P.PLATE.offset
      atClock(() => frame(card, c0 + .05))
      const burn = medianLoaded(i => atClock(() => frame(card, c0 + .1 + i / 12)), 13)
      assert('lichtenberg: a frame during the burn ≤ 4 ms (median, × load)', burn.ms <= 4 * burn.load, fmtLoaded(burn))
    }
  }
  // ── erosion ──
  {
    const base = S.baseStone(), mk = (): Terrain => ({ cols: 96, rows: 96, h: Float32Array.from(base), region: [8, 14, 86, 80] })
    const x = mk(), y = mk()
    const lostX = rain(x, 0, 900, 5)
    const lostY = rain(y, 0, 250, 5) + rain(y, 250, 900, 5)
    assert('erosion: the first N droplets are one state, whatever the batches (0–900 ≡ 0–250 + 250–900, heights bit for bit)', same(x.h, y.h), `carried ${lostX.toFixed(4)} / ${lostY.toFixed(4)}`)
    let before = 0, after = 0
    for (let i = 0; i < base.length; i++) { before += base[i]; after += x.h[i] }
    assert('erosion: mass is kept (stone + sediment carried off = the stone before, ± 1e-3)', Math.abs(before - after - lostX) / before < 1e-3, `Δ ${(before - after).toFixed(3)}, carried ${lostX.toFixed(3)}`)
    // a cold replay at a late minute ≡ the checkpointed walk through the day (minute by minute)
    S.stoneReset()
    for (const m of [0, 333, 700, 1000, 1438, 1439]) S.stoneAt(m)
    const walked = Float32Array.from(S.stoneAt(1439).t.h)
    S.stoneReset()
    const cold = onceLoaded(() => Float32Array.from(S.stoneAt(1439).t.h))
    const back = onceLoaded(() => S.stoneAt(1200).t.h)
    assert('erosion: a cold replay of the day ≡ the checkpointed one (bit for bit)', same(walked, cold.value))
    assert('erosion: a cold start at 23:59 replays the whole day in ≤ 60 ms (× load)', cold.ms <= 60 * cold.load, fmtLoaded(cold))
    assert('erosion: a jump back to 20:00 starts from a checkpoint, ≤ 15 ms (× load)', back.ms <= 15 * back.load, fmtLoaded(back))
    const next = onceLoaded(() => S.stoneAt(1201))
    assert('erosion: a new minute runs only its own rain, ≤ 2 ms (× load)', next.ms <= 2 * next.load, fmtLoaded(next))
    // legibility: each weathered digit's relief (proud of the pristine stone by .5) is still nearest its own glyph
    const read = (m: number) => {
      const st = S.stoneAt(m), s = S.hhmm(m), out: string[] = []
      let ok = true
      for (const i of [0, 1, 3]) {
        const scores = '0123456789'.split('').map(ch => {
          const g = S.glyph(ch, i), [c0, r0, c1, r1] = g.box
          let both = 0, either = 0
          for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const j = r * 96 + c, lit = st.t.h[j] - base[j] > .5, want = g.m.data[j] > 0; if (lit && want) both++; if (lit || want) either++ }
          return both / Math.max(1, either)
        })
        const best = scores.indexOf(Math.max(...scores)), sorted = [...scores].sort((p, q) => q - p)
        if (String(best) !== s[i] || sorted[0] - sorted[1] < .1) ok = false
        out.push(`${s[i]}→${best} (${sorted[0].toFixed(2)} vs ${sorted[1].toFixed(2)})`)
      }
      return { ok, detail: `${s}: ${out.join(', ')}` }
    }
    const late = read(1439), worst = read(1199)
    assert('erosion: legible at 23:59 and 19:59: each weathered digit is still nearest its own glyph (IoU margin ≥ .1)', late.ok && worst.ok, `${late.detail}; ${worst.detail}`)
    const card = byId('mat-erosion'), reds = at(23, 59, () => frame(card, 1.3)).filter(d => d.color === dot480.dotActive), dots = S.minuteDigit('23:59').dots
    assert('erosion: the minute\'s digit is the one red, crisp (every dot of its glyph, nothing else)', reds.length === dots.length && dots.length > 20, `${reds.length} red dots, glyph ${dots.length}`)
    assert('erosion: the rain obeys its parameters (Beyer\'s defaults but the brush, capacity, erosion and lifetime)', S.RAIN.inertia === EROSION.inertia && S.RAIN.evaporate === EROSION.evaporate && S.RAIN.perMinute * 1440 === 8640)
    if (!opts.quick) {
      at(9, 41, () => { for (let i = 0; i < 4; i++) frame(card, i / 12) })
      const warm = at(9, 41, () => medianLoaded(i => frame(card, 5.5 + i / 12), 13))
      const rebake = at(9, 42, () => onceLoaded(() => frame(card, 0)))
      assert('erosion: frame ≤ 4 ms (median, warm, × load)', warm.ms <= 4 * warm.load, fmtLoaded(warm))
      assert('erosion: a new minute\'s frame (rain, normals, AO, light) ≤ 10 ms (× load)', rebake.ms <= 10 * rebake.load, fmtLoaded(rebake))
    }
  }
  // ── frost ──
  {
    // the wedge run ≡ a plain run over the whole disc (Reiter's rule written out cell by cell), bit for bit
    const R = 12, beta = .4, gamma = .001, steps = 120, a = reiter({ radius: R, beta, gamma, maxSteps: steps, margin: -1 })
    const n = a.q.length, key = (q: number, r: number) => (r + 64) * 128 + q + 64, at = new Map<number, number>()
    for (let i = 0; i < n; i++) at.set(key(a.q[i], a.r[i]), i)
    const NB = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]], nb = (i: number, d: number) => at.get(key(a.q[i] + NB[d][0], a.r[i] + NB[d][1])) ?? -1
    let s = new Float64Array(n).fill(beta), froze = new Int32Array(n).fill(-1)
    const c = at.get(key(0, 0))!
    s[c] = 1; froze[c] = 0
    for (let t = 1; t <= steps; t++) {
      const u = new Float64Array(n), v = new Float64Array(n), next = new Float64Array(n)
      for (let i = 0; i < n; i++) {
        let rc = s[i] >= 1
        for (let d = 0; d < 6 && !rc; d++) { const j = nb(i, d); if (j >= 0 && s[j] >= 1) rc = true }
        if (rc) v[i] = s[i] + gamma; else u[i] = s[i]
      }
      for (let i = 0; i < n; i++) { let sum = 0; for (let d = 0; d < 6; d++) { const j = nb(i, d); sum += j < 0 ? beta : u[j] } next[i] = u[i] + 1 / 12 * (sum - 6 * u[i]) + v[i] }
      s = next
      for (let i = 0; i < n; i++) if (froze[i] < 0 && s[i] >= 1) froze[i] = t
    }
    // (the plain run adds each cell's neighbours in its own direction order, so its water is symmetric only to rounding)
    let dw = 0
    for (let i = 0; i < n; i++) dw = Math.max(dw, Math.abs(s[i] - a.s[i]))
    assert('frost: the 1/12-wedge automaton ≡ the plain one over the whole disc (froze-at steps exact, water ± 1e-9)', same(froze, a.frozeAt) && dw < 1e-9, `${n} cells, ${a.steps} steps, water off by ${dw.toExponential(1)}`)
    let table = true, detail = ''
    for (let k = 0; k < Fr.FLAKES.length; k++) {
      const f = Fr.flake(k)
      let frozen = 0
      for (const v of f.frozeAt) if (v >= 0) frozen++
      if (f.steps >= 6000 || frozen / f.frozeAt.length >= .48) { table = false; detail = `row ${k}: ${f.steps} steps, ${(100 * frozen / f.frozeAt.length).toFixed(0)}%` }
    }
    assert('frost: every vetted (β, γ) row reaches the rim with arms, not a blob (under 48% of the disc frozen)', table, detail || `${Fr.FLAKES.length} rows`)
    const days = Array.from({ length: 60 }, (_, d) => Fr.flakeOf(new Date(2026, 0, 1 + d, 9)))
    assert('frost: one flake a day (the same all day, every row of the table within two months)', Fr.flakeOf(new Date(2026, 0, 1, 0, 1)) === Fr.flakeOf(new Date(2026, 0, 1, 23, 59)) && new Set(days).size === Fr.FLAKES.length)
    const card = byId('mat-frost'), red = (t: number) => atClock(() => frame(card, t)).filter(d => d.color === dot480.dotActive).length
    assert('frost: the freezing cells are the red while it grows (t = 0); none on the held flake', red(0) > 0 && red(1.3) === 0, `red ${red(0)} / ${red(1.3)}`)
    const bake = onceLoaded(() => reiter({ radius: Fr.FROST.radius, beta: .3, gamma: .0001, maxSteps: 6000 }).steps)
    assert('frost: the slowest flake of the table (β .3, γ 10⁻⁴) bakes in ≤ 30 ms (× load)', bake.ms <= 30 * bake.load, `${fmtLoaded(bake)}, ${bake.value} steps`)
  }
}
