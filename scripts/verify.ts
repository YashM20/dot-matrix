/**
 * Programmatic acceptance harness — framework-free, runs headless.
 * Run: pnpm verify   (or: npx tsx scripts/verify.ts)
 * Covers the sampler, squircle geometry, text layout, waveform anchoring, halftone polarity,
 * spiral continuity, Poisson-disc, and a smoke render of every widget preset.
 */
import { quantize } from '../src/engine/sampler/quantize'
import { cellU, colorFor, sampleField, sampleLayers } from '../src/engine/sampler/gridSampler'
import { squircleExponent, squircleRadius45 } from '../src/engine/renderer/shapePath'
import { poissonDiscPoints, scatterField } from '../src/engine/fields/scatterField'
import { amplitudeField, ecgAmplitudes, sumOfSinesAmplitudes, traceField } from '../src/engine/fields/waveformField'
import { bayerDither, imageToLuminanceField } from '../src/engine/fields/haltoneField'
import { spiralField } from '../src/engine/fields/warpedField'
import { ringField } from '../src/engine/fields/polarField'
import { bitmapFont, glyph, scale2x, textWidth } from '../src/engine/fields/bitmapFont'
import { rasterizePath } from '../src/engine/fields/svgPath'
import { iconPaths } from '../src/engine/fields/iconSDF'
import { combine, hRule, ringCells, textAt, toCell } from '../src/engine/layout'
import { dot480 } from '../src/engine/theme/tokens'
import { widgetPresets, withChrome } from '../src/widgets'
import { hash01, hash32 } from '../src/engine/math'
import { createMasterClock, quantizeTime } from '../src/engine/clock'
import { renderSVG } from '../src/engine/renderer/svgRenderer'
import { bounded } from '../src/engine/layout'
import { catmullRomField } from '../src/engine/fields/splineField'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Field } from '../src/engine/types'
import { irChecks } from './ir'
import { masks, ditherEdge, revealDots, transitionDots, criticalSpring, underdampedSpring, DataSprings, decodeText, splitFlapText, splitFlapCells, cubicBezier, ease } from '../src/engine/motion'

let failures = 0
function assert(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`)
  else { console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`); failures++ }
}
const close = (a: number, b: number, eps = 1e-3) => Math.abs(a - b) < eps

// 1) quantize
assert('quantize steps<2 returns bounded', quantize(0.33, 1) === 0.33)
assert('quantize 5-step ladder', quantize(0.5, 5) === 0.5 && quantize(0.24, 5) === 0.25 && quantize(0.76, 5) === 0.75)
assert('quantize clips', quantize(-1, 5) === 0 && quantize(2, 5) === 1)

// 2) sampler
{
  const grid = { cols: 10, rows: 5, pitch: 4 }, style = { shape: 'circle' as const, sizeMin: 0, sizeMax: 1 }
  const dots = sampleField((u, v) => (u > .95 && v > .95 ? 1 : 0), grid, style, dot480)
  assert('sampler visits every cell', dots.length === 50)
  assert('sampler u=1 reaches the last column', dots[49].r === 1 && dots[48].r === 0)
  assert('sampler guards NaN fields', sampleField(() => NaN, grid, style, dot480).every(d => d.r === 0))
  assert('cellU round-trips through toCell', [0, 3, 9].every(c => toCell(cellU(c, 10), 10) === c))
  const layered = sampleLayers([{ field: () => 1, tone: 'faint' }, { field: (u) => (u > .5 ? 1 : 0), tone: 'active' }], grid, style, dot480)
  assert('later layer wins ties and sets colour', layered[9].color === dot480.dotActive && layered[0].color === dot480.dotFaint)
  assert('colorFor bands', colorFor(.2, dot480) === dot480.dotFaint && colorFor(.5, dot480) === dot480.dotMid && colorFor(.9, dot480) === dot480.dotIdle)
}

// 3) squircle geometry — roundness 0 is a circle, higher is squarer, never narrower than a circle
{
  const r0 = squircleRadius45(0), r26 = squircleRadius45(0.26), r1 = squircleRadius45(1)
  assert('roundness 0 → circle (45° radius = 1)', close(r0, 1, 0.01), r0.toFixed(3))
  assert('roundness 0.26 → n≈4 squircle (45° radius ≈ 1.19)', close(squircleExponent(0.26), 4, 0.05) && close(r26, 2 ** -0.25 * Math.SQRT2, 0.02), r26.toFixed(3))
  assert('roundness 1 → near-square (45° radius > 1.3)', r1 > 1.3, r1.toFixed(3))
  assert('roundness is monotonic', [0, .1, .2, .3, .5, .7, 1].map(squircleRadius45).every((v, i, a) => i === 0 || v >= a[i - 1] - 1e-9))
}

// 4) text — integer alignment, glyph coverage
{
  const grid = { cols: 40, rows: 10 }
  const field = textAt(grid, 'A', 2, 1)
  const dots = sampleField(field, grid, { shape: 'circle', sizeMin: 0, sizeMax: 1 }, dot480)
  const on = dots.filter(d => d.r > 0).map(d => [Math.round((d.x - 2) / 4), Math.round((d.y - 2) / 4)])
  const expected = bitmapFont.A.flatMap((row, y) => row.map((b, x) => (b ? [x + 2, y + 1] : null)).filter(Boolean)) as number[][]
  assert('textAt lands every glyph pixel on exactly one dot', JSON.stringify(on) === JSON.stringify(expected), `${on.length} dots`)
  assert('textWidth: 5 per glyph + 1 gap', textWidth('ABC') === 17)
  for (const ch of ['+', ',', "'", '?', '$', '→', '%', '…']) assert(`glyph ${ch} exists`, ch in bitmapFont)
  const bigGrid = { cols: 12, rows: 21 }
  const big = textAt(bigGrid, '1', 0, 0, { scale: [2, 3] })
  const bigDots = sampleField(big, bigGrid, { shape: 'circle', sizeMin: 0, sizeMax: 1 }, dot480).filter(d => d.r > 0).length
  assert('scale [2,3] multiplies pixel count by 6', bigDots === bitmapFont['1'].flat().filter(Boolean).length * 6, `${bigDots}`)
}

// 5) waveform anchoring
assert('amplitudeField bars grow up from the bottom', amplitudeField([0.5])(0.5, 0.9) === 1 && amplitudeField([0.5])(0.5, 0.1) === 0)
assert('amplitudeField center baseline is symmetric', amplitudeField([0.5], { baseline: 'center' })(0.5, 0.3) === amplitudeField([0.5], { baseline: 'center' })(0.5, 0.7))
assert('amplitudeField gap leaves slots empty', amplitudeField([1, 1], { gap: 0.5 })(0.4, 0.5) === 0 && amplitudeField([1, 1], { gap: 0.5 })(0.1, 0.5) === 1)
assert('amplitudeField empty input is 0', amplitudeField([])(0.5, 0.5) === 0)
assert('traceField renders thin line at amp', traceField([0.5], 0.02)(0.5, 0.5) > 0.9)

// 6) halftone polarity & bayer indexing
{
  const px = (r: number) => ({ width: 2, height: 1, data: new Uint8ClampedArray([r, r, r, 255, 255 - r, 255 - r, 255 - r, 255]), colorSpace: 'srgb' } as ImageData)
  const lum = imageToLuminanceField(px(255))
  assert('bright pixel → big dot (not inverted)', lum(0, 0) > 0.95 && lum(0.9, 0) < 0.05)
  const grid = { cols: 8, rows: 8 }
  const d = bayerDither(() => 0.5, 4, grid)
  const pattern = Array.from({ length: 4 }, (_, c) => d(cellU(c, 8), 0) > 0.4)
  const repeat = Array.from({ length: 4 }, (_, c) => d(cellU(c + 4, 8), 0) > 0.4)
  assert('bayer matrix indexed per dot (4-cell period)', JSON.stringify(pattern) === JSON.stringify(repeat) && pattern.includes(true) && pattern.includes(false))
}

// 7) spiral continuity & ring wrap
{
  const s = spiralField(0.5, 0.5, 3, 20)
  const samples = Array.from({ length: 64 }, (_, i) => { const a = (i / 64) * Math.PI * 2, r = (a + Math.PI * 2) / 20; return s(0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r) })
  assert('spiral arm is continuous across θ=0', samples.every(v => v > 0.95), `min ${Math.min(...samples).toFixed(2)}`)
  const ring = ringField(0.5, 0.5, 0.3, 0.4, Math.PI * 1.5, Math.PI / 2)
  assert('ringField with thetaStart > π still sweeps a quarter', ring(0.5, 0.15) > 0.9 && ring(0.5, 0.85) === 0 && ring(0.15, 0.5) === 0)
}

// 8) Poisson-disc
{
  const pts = poissonDiscPoints(100, 100, 12, 42)
  let minD = Infinity
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) minD = Math.min(minD, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]))
  assert('poisson minDistance respected', pts.length > 10 && minD + 1e-6 >= 12, `n=${pts.length} minD=${minD.toFixed(2)}`)
  assert('poisson deterministic seed', JSON.stringify(pts) === JSON.stringify(poissonDiscPoints(100, 100, 12, 42)))
  assert('scatterField near/far', scatterField([[10, 10]], 4, 100, 100)(0.1, 0.1) > 0.9 && scatterField([[10, 10]], 4, 100, 100)(0.5, 0.5) < 0.1)
  const a0 = sumOfSinesAmplitudes(64, 0), ecg = ecgAmplitudes(64, 0)
  assert('sine amplitudes bounded', a0.every(v => v >= 0 && v <= 1))
  assert('ecg shifts with t', ecg.some((v, i) => Math.abs(v - ecgAmplitudes(64, 0.5)[i]) > 0.02))
}

// 9) every preset renders headlessly, within bounds, with a scarce accent
{
  const ids = new Set<string>()
  for (const p of widgetPresets) {
    const dots = sampleLayers(withChrome(p)({ t: 0.5, data: p.defaults ?? {} }), p.grid, p.style, dot480)
    const vis = dots.filter(d => d.opacity > 0), red = vis.filter(d => d.color === dot480.dotActive).length
    const pitch = p.grid.pitch ?? dot480.gridPx, W = p.grid.cols * pitch, H = p.grid.rows * pitch
    const ok = vis.length > 0 && dots.every(d => Number.isFinite(d.r) && Number.isFinite(d.opacity) && d.x >= 0 && d.y >= 0 && d.x <= W && d.y <= H)
    assert(`preset ${p.id} renders`, ok && !ids.has(p.id), `${vis.length} dots, ${red} accent`)
    ids.add(p.id)
  }
}

// 10) lattice layers, display weight, bounds, path rasterizer
{
  const grid = { cols: 20, rows: 10, pitch: 2 }, style = { shape: 'circle' as const, sizeMin: 0, sizeMax: 1, opacityMode: 'fromValue' as const }
  const lit = (u: number, v: number) => (u < .01 && v < .01 ? 1 : 0) // first lattice cell only
  const dots = sampleLayers([{ field: () => 1, tone: 'faint' }, { field: lit, tone: 'value', lattice: 3, origin: [2, 1] }], grid, style, dot480)
  const big = dots.find(d => d.color === dot480.value)
  assert('lattice dot sits at origin + k/2 and is k× bigger', !!big && big.x === (2 + 1.5) * 2 && big.y === (1 + 1.5) * 2 && big.r === 3)
  assert('card cells under a lit lattice dot are suppressed', dots.filter(d => d.color === dot480.dotFaint).length === 20 * 10 - 9)
  const seven = glyph('7', { smooth: true })
  assert('smooth glyphs are 10×14', seven.length === 14 && seven.every(r => r.length === 10) && textWidth('77', { smooth: true }) === 22)
  const block = scale2x([[true, true, true], [true, true, true], [true, true, true]])
  assert('scale2x keeps interiors solid and rounds outer corners', block.slice(1, 5).every(r => r.slice(1, 5).every(Boolean)) && !block[0][0] && block[0][2])
  assert('scale2x rounds a diagonal', scale2x([[true, false], [false, true]])[1][1] === true && scale2x([[true, false], [false, true]])[0][3] === false)
  const g2 = { cols: 40, rows: 30 }, a = [hRule(g2, 3, 5, 20), ringCells(g2, 20, 15, 9, { every: 2 }), textAt(g2, 'AB', 4, 20)]
  const full = a.map(f => Object.assign((u: number, v: number) => f(u, v)))
  const s1 = sampleLayers(a.map(field => ({ field })), g2, style, dot480), s2 = sampleLayers(full.map(field => ({ field })), g2, style, dot480)
  assert('bounded sampling equals full-grid sampling', JSON.stringify(s1) === JSON.stringify(s2))
  assert('combine keeps bounds as a union', JSON.stringify(combine(hRule(g2, 3, 5, 4), hRule(g2, 10, 8, 2)).bounds) === JSON.stringify([3, 5, 11, 8]))
  const count = (m: Uint8ClampedArray) => m.reduce((n, x) => n + x, 0)
  assert('path rasterizer strokes a line headlessly', count(rasterizePath('M4 16h24', 32, { stroke: 2 })) >= 40)
  assert('path rasterizer fills a square', count(rasterizePath('M8 8h16v16H8Z', 32, { stroke: 0, fill: true })) === 256)
  const circle = count(rasterizePath('M16 6a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z', 64, { stroke: 0, fill: true }))
  assert('path rasterizer handles arcs (circle area)', Math.abs(circle - Math.PI * 20 * 20) / (Math.PI * 400) < 0.03, `${circle}`)
  const sited = sampleLayers([{ field: () => 1, tone: 'faint' }, { field: () => 1, tone: 'idle', sites: [[5, 5], [10, 5]], lattice: 2 }, { field: () => 1, tone: 'active', sites: [[10, 5]], lattice: 2 }], { cols: 20, rows: 10, pitch: 2 }, style, dot480)
  assert('sites merge (later layer wins) and clear the cells under them', sited.filter(d => d.color === dot480.dotActive).length === 1 && sited.filter(d => d.color === dot480.dotIdle).length === 1 && sited.filter(d => d.color === dot480.dotFaint).length === 200 - 10)
  assert('every icon rasterizes non-empty', Object.entries(iconPaths).every(([, d]) => count(rasterizePath(d, 32)) > 10))
}

// 11) P0 hardening: deterministic hash, master clock, quantized cover, input guards, compact SVG
{
  assert('hash32 is a fixed function (cross-engine golden)', hash32(1, 2, 3) === hash32(1, 2, 3) && hash32(0) !== hash32(1) && hash32(1, 2) !== hash32(2, 1))
  let sum = 0, lo = 1, hi = 0
  for (let i = 0; i < 4096; i++) { const h = hash01(i, 7); sum += h; lo = Math.min(lo, h); hi = Math.max(hi, h) }
  assert('hash01 is uniform-ish in [0,1)', Math.abs(sum / 4096 - .5) < .02 && lo >= 0 && hi < 1, `mean ${(sum / 4096).toFixed(3)}`)
  assert('hash01 separates fractional inputs', hash01(3.5) !== hash01(3))

  assert('quantizeTime snaps to the card frame rate', quantizeTime(1.26, 12).frame === 15 && Math.abs(quantizeTime(1.26, 12).t - 1.25) < 1e-9)
  let clockNow = 0
  const queue: ((time: number) => void)[] = []
  const clock = createMasterClock({ now: () => clockNow, raf: cb => { queue.push(cb); return queue.length }, caf: () => {} })
  const step = (ms: number) => { clockNow += ms; const cb = queue.shift(); cb?.(clockNow) }
  const seen: number[] = []
  const unsub = clock.subscribe({ fps: 12, onFrame: t => seen.push(t) })
  step(16); step(16); step(60)
  assert('clock draws once per card frame, at quantized t', seen.length === 2 && seen[0] === 0 && Math.abs(seen[1] - 1 / 12) < 1e-9, seen.join(','))
  clock.pause(); clockNow += 5000; clock.resume(); step(1)
  assert('clock does not advance while paused and never resets', clock.time() > .09 && clock.time() < .1, clock.time().toFixed(3))
  unsub()

  const qStyle = { shape: 'circle' as const, sizeMin: 0, sizeMax: 1, quantizeSteps: 5 }
  const holes = sampleLayers([{ field: () => 1, tone: 'faint' }, { field: () => .1, tone: 'idle', lattice: 2 }], { cols: 8, rows: 8, pitch: 2 }, qStyle, dot480)
  assert('a lattice dot that quantizes to 0 does not punch a hole', holes.filter(d => d.color === dot480.dotFaint).length === 64 && !holes.some(d => d.color === dot480.dotIdle))
  const g3 = { cols: 6, rows: 6, pitch: 2 }, style = { shape: 'circle' as const, sizeMin: 0, sizeMax: 1 }
  let guarded = true
  try {
    sampleLayers([{ field: () => 1, lattice: 0 }, { field: () => 1, lattice: NaN }, { field: () => 1, lattice: -2 }], g3, style, dot480)
    guarded = sampleLayers([{ field: () => 1, sites: [[NaN, 2], [2, Infinity], [3, 3]] }], g3, style, dot480).every(d => Number.isFinite(d.x) && Number.isFinite(d.y))
    guarded &&= catmullRomField([])(.5, .5) === 0
  } catch { guarded = false }
  assert('sampler guards bad lattice, NaN sites and empty splines', guarded)
  const shared = () => 1
  const b = bounded(shared, 1, 1, 2, 2)
  assert('bounded() does not mutate its argument', !('bounds' in shared) && JSON.stringify(b.bounds) === '[1,1,2,2]' && b(.5, .5) === 1)

  const svgDots = sampleLayers([{ field: () => .75 }], { cols: 20, rows: 20, pitch: 2.25 }, { shape: 'squircle', sizeMin: .2, sizeMax: .95, cornerRoundness: .1, quantizeSteps: 5 }, dot480)
  const svg = renderSVG(svgDots, 45, 45)
  assert('SVG defines each dot shape once and places dots with <use>', (svg.match(/<use /g) ?? []).length === 400 && (svg.match(/<path /g) ?? []).length === 1)
  assert('SVG coordinates are rounded to 2 dp', !/\d\.\d{3,}/.test(svg) && svg.length / 400 < 60, `${(svg.length / 400).toFixed(1)} B/dot`)
}

// 12) determinism lint: the engine never reads ambient randomness or time, and never sin-hashes
{
  const files: string[] = []
  const walk = (dir: string) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.ts')) files.push(p) } }
  walk(join(import.meta.dirname, '../src/engine'))
  const offenders = files.filter(f => {
    const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    return /Math\.random\(|Date\.now\(|new Date\(|43758\.5453/.test(code)
  })
  assert('src/engine has no Math.random / Date.now / new Date / sin-hash', offenders.length === 0, offenders.join(', '))
}

// 13) motion primitives: masks, reveal/transition, springs, easing, text
{
  const names = Object.keys(masks) as (keyof typeof masks)[]
  let inRange = true
  for (const n of names) for (let r = 0; r < 24; r++) for (let c = 0; c < 24; c++) { const m = masks[n](c, r, 24, 24); if (!(m >= 0 && m < 1)) inRange = false }
  const edged = ditherEdge(masks.radial)
  for (let r = 0; r < 24; r++) for (let c = 0; c < 24; c++) { const m = edged(c, r, 24, 24); if (!(m >= 0 && m < 1)) inRange = false }
  assert('every mask ranks cells in [0, 1)', inRange, names.join(' '))
  const bayerRanks = new Set<number>(); for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) bayerRanks.add(masks.bayer(c, r, 8, 8))
  assert('bayer 8×8 gives 64 distinct ranks', bayerRanks.size === 64)

  const geo = { cols: 12, rows: 12, pitch: 2, mask: masks.bayer }
  const full = sampleLayers([{ field: () => 1 }], { cols: 12, rows: 12, pitch: 2 }, { shape: 'circle', sizeMin: 0, sizeMax: 1 }, dot480)
  const other = full.map(d => ({ ...d, color: '#123456' }))
  assert('reveal at p=0 shows nothing, at p=1 everything', revealDots(full, { ...geo, p: 0 }).length === 0 && revealDots(full, { ...geo, p: 1 }) === full)
  const half = revealDots(full, { ...geo, p: .5 }).length
  assert('reveal at p=.5 shows about half (bayer is exact)', half === 72, String(half))
  assert('exit is the complement of enter', revealDots(full, { ...geo, p: .5, exit: true }).length === 144 - half)
  const mid = transitionDots(full, other, { ...geo, p: .5 })
  assert('transition shows each cell from exactly one frame', mid.length === 144 && mid.filter(d => d.color === '#123456').length === half)
  assert('transition endpoints are the frames themselves', transitionDots(full, other, { ...geo, p: 0 }) === full && transitionDots(full, other, { ...geo, p: 1 }) === other)
  const flashed = revealDots(full.map(d => ({ ...d, opacity: .3 })), { ...geo, p: .5, edge: .1 })
  assert('reveal scan edge flashes dots near the front, keeps the rest', flashed.some(d => d.opacity > .9) && flashed.some(d => d.opacity === .3))

  const c0 = criticalSpring(0, 0, 1, .2, 0), c1 = criticalSpring(0, 0, 1, .2, .2), c9 = criticalSpring(0, 0, 1, .2, 3)
  assert('critical spring starts at x0, is ~half way at one half-life, settles without overshoot', c0.x === 0 && Math.abs(c1.x - .5) < .1 && Math.abs(c9.x - 1) < 1e-3, `${c1.x.toFixed(3)}`)
  let over = false; for (let t = 0; t < 2; t += .01) if (criticalSpring(0, 0, 1, .2, t).x > 1 + 1e-9) over = true
  assert('critical spring never overshoots', !over)
  let peak = 0; for (let t = 0; t < 2; t += .005) peak = Math.max(peak, underdampedSpring(0, 0, 1, 2, .3, t).x)
  assert('under-damped spring overshoots then settles', peak > 1.05 && Math.abs(underdampedSpring(0, 0, 1, 2, .3, 6).x - 1) < 1e-3, peak.toFixed(3))
  const ds = new DataSprings(.15)
  ds.set({ a: 0 }, 0); ds.set({ a: 10 }, 1)
  const midA = ds.at(1.15).a
  ds.set({ a: 0 }, 1.15)
  assert('data springs re-target from the current value without a jump', Math.abs(ds.at(1.15).a - midA) < 1e-9 && midA > 2 && midA < 8, midA.toFixed(2))
  assert('data springs settle', ds.settled(4) && !ds.settled(1.2))

  const em = cubicBezier(.2, 0, 0, 1)
  assert('cubic-bezier hits its endpoints and is monotone', em(0) === 0 && Math.abs(em(1) - 1) < 1e-6 && em(.25) < em(.5) && em(.5) < em(.75))
  assert('decelerate front-loads progress, accelerate back-loads it', ease.decelerate(.3) > .5 && ease.accelerate(.3) < .2)

  assert('decode resolves to the target and keeps unchanged characters', decodeText('21:30', '21:31', 5) === '21:31' && decodeText('21:30', '21:31', 0).startsWith('21:3'))
  let digitsOnly = true; for (let t = 0; t < .6; t += .05) if (!/^\d\d:\d\d$/.test(decodeText('09:59', '10:00', t))) digitsOnly = false
  assert('decode scrambles digits within digits (no width change)', digitsOnly)
  const flap = splitFlapText('09', '12', 0), done = splitFlapText('09', '12', 5)
  assert('split-flap steps forward and lands on the target', flap.moving && flap.text.length === 2 && !done.moving && done.text === '12')
  // cells: only changed columns stagger; a column holds its old character until its turn, then flips
  const f0 = splitFlapCells('11:17', '11:18', 0, { flip: .3, stagger: .1 }), fMid = splitFlapCells('11:17', '11:18', .15, { flip: .3, stagger: .1 })
  const fEnd = splitFlapCells('11:17', '11:18', 1, { flip: .3, stagger: .1 }), late = splitFlapCells('17:59', '18:00', .05, { flip: .3, stagger: .1 })
  assert('split-flap cells: unchanged columns are settled, the changed one flips at once',
    f0.slice(0, 4).every(c => c.phase === 1 && c.from === c.to) && f0[4].from === '7' && fMid[4].from === '7' && fMid[4].to === '8' && Math.abs(fMid[4].phase - .5) < 1e-9)
  assert('split-flap cells: settle on the target; later changed columns hold their old character first',
    fEnd.every((c, i) => c.phase === 1 && c.to === '11:18'[i]) && late[3].from === '5' && late[3].phase === 1 && late[1].phase < 1)
}

// 14) bounds are only an optimisation: every preset samples identically with its layers' `bounds` stripped
//     (a field that lights cells outside its bounds would be clipped by the sampler). Site layers carry
//     their dot size as `size`, never as `lattice` (which means pitch).
{
  const t0 = performance.now(), mismatched: string[] = [], legacySize: string[] = [], seen = new Set<string>()
  const strip = (f: Field): Field => (u, v) => f(u, v)
  for (const p of widgetPresets) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    for (const t of p.animated ? [0, 1.3] : [0]) {
      const layers = withChrome(p)({ t, data: { ...p.defaults } })
      if (layers.some(l => l.sites && l.lattice !== undefined)) legacySize.push(p.id)
      if (!layers.some(l => l.field.bounds)) continue
      const a = sampleLayers(layers, p.grid, p.style, dot480), b = sampleLayers(layers.map(l => ({ ...l, field: strip(l.field) })), p.grid, p.style, dot480)
      if (JSON.stringify(a) !== JSON.stringify(b)) mismatched.push(`${p.id}@t=${t}`)
    }
  }
  assert('every preset renders identically with and without bounds', mismatched.length === 0, mismatched.length ? mismatched.join(', ') : `${seen.size} presets, ${(performance.now() - t0).toFixed(0)} ms`)
  assert('site layers set their dot size with `size`, not `lattice`', legacySize.length === 0, legacySize.join(', '))
  // sites merge exactly when `${x.toFixed(2)},${y.toFixed(2)}` matches (the sampler keys them numerically)
  const sg = { cols: 20, rows: 10, pitch: 2 }, ss = { shape: 'circle' as const, sizeMin: 0, sizeMax: 1 }
  const pairs: [number, number][] = [[1, 1.004999], [1, 1.005], [3.125, 3.13], [2.115, 2.11], [-0.001, 0.001], [-0.001, -0.004], [0, -0], [7.994999, 7.995], [12.345, 12.35]]
  const wrong = pairs.filter(([x1, x2]) => {
    const n = sampleLayers([{ field: () => 1, tone: 'idle', sites: [[x1, 5]], size: 1 }, { field: () => 1, tone: 'active', sites: [[x2, 5]], size: 1 }], sg, ss, dot480).length
    return (n === 1) !== (x1.toFixed(2) === x2.toFixed(2))
  })
  assert('sites merge exactly when their toFixed(2) positions match', wrong.length === 0, wrong.map(p => p.join('/')).join(', '))
  const sized = sampleLayers([{ field: () => 1, sites: [[5, 5]], size: 3 }], sg, ss, dot480)
  assert('a site layer\'s `size` sets its dot size', sized.length === 1 && sized[0].r === 3)
}

// 15) input layer (P2-A): toLocal, pick, dragValue, keyValue, clamp + quantize
import { beginDrag, dragValue, keyValue, pick, releaseValue, settle, toLocal, type Control } from '../src/engine/interaction'
{
  const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps
  const tl = toLocal(110, 220, { left: 100, top: 200, width: 100, height: 50 }, { cols: 10, rows: 5 })
  assert('toLocal maps client px to cell centres', near(tl.x, .5) && near(tl.y, 1.5), `${tl.x},${tl.y}`)
  const corner = toLocal(100, 200, { left: 100, top: 200, width: 100, height: 50 }, { cols: 10, rows: 5 })
  assert('toLocal: the element corner is half a cell before cell 0', near(corner.x, -.5) && near(corner.y, -.5))

  const slider: Control = { key: 's', kind: 'slider', box: [10, 10, 100, 10], label: 'S' }
  const knob: Control = { key: 'k', kind: 'knob', box: [0, 40, 20, 20], label: 'K' }
  const ctrls = [slider, knob]
  assert('pick: box hit, miss, and hit pad', pick(ctrls, 50, 15) === 's' && pick(ctrls, 50, 30) === null && pick(ctrls, 50, 21) === 's' && pick(ctrls, 50, 21, 0) === null)
  assert('pick: knobs use the inscribed circle (box corner misses)', pick(ctrls, 10, 50) === 'k' && pick(ctrls, 1, 41, 0) === null && pick(ctrls, 1, 41) === null)
  const over: Control = { key: 'o', kind: 'button', box: [40, 10, 10, 10], label: 'O' }
  assert('pick: later controls sit on top; exact hits beat padded ones', pick([slider, over], 45, 15) === 'o' && pick([over, slider], 45, 15) === 's' && pick([slider, over], 52, 15) === 's')

  const drag = (c: Control, x: number, y: number, data: Record<string, number>, to: { x: number; y: number }) => dragValue(c, beginDrag(c, x, y, data), to)
  assert('slider: value from position, clamped', near(drag(slider, 60, 15, { s: 0 }, { x: 60, y: 15 }).s, .5) && drag(slider, 60, 15, {}, { x: 500, y: 15 }).s === 1 && drag(slider, 60, 15, {}, { x: -50, y: 15 }).s === 0)
  const stepped: Control = { ...slider, min: 0, max: 10, step: 2 }
  assert('slider: quantized to step', drag(stepped, 10, 15, {}, { x: 44, y: 15 }).s === 4, String(drag(stepped, 10, 15, {}, { x: 44, y: 15 }).s))
  const vslider: Control = { key: 'v', kind: 'slider', orientation: 'vertical', box: [0, 0, 10, 100], label: 'V' }
  assert('vertical slider grows upwards', near(drag(vslider, 5, 25, {}, { x: 5, y: 25 }).v, .75))
  assert('knob: drag up / right increases, relative to the value at press', near(drag(knob, 10, 50, { k: .5 }, { x: 10, y: 30 }).k, 1) && near(drag(knob, 10, 50, { k: .5 }, { x: 0, y: 50 }).k, .25) && drag(knob, 10, 50, { k: .5 }, { x: 10, y: 90 }).k === 0)

  const crank: Control = { key: 'c', kind: 'crank', box: [0, 0, 20, 20], label: 'C' }
  const cs = beginDrag(crank, 20, 10, { c: 0 })
  let cv = 0
  for (let i = 1; i <= 36 * 2.5; i++) { const a = i / 36 * Math.PI * 2; cv = dragValue(crank, cs, { x: 10 + 10 * Math.cos(a), y: 10 + 10 * Math.sin(a) }).c }
  assert('crank: atan2 accumulation, unbounded (2.5 clockwise turns = 2.5)', near(cv, 2.5, 1e-6), cv.toFixed(4))
  const cs2 = beginDrag(crank, 20, 10, { c: 0 })
  for (let i = 1; i <= 36; i++) { const a = -i / 36 * Math.PI * 2; cv = dragValue(crank, cs2, { x: 10 + 10 * Math.cos(a), y: 10 + 10 * Math.sin(a) }).c }
  assert('crank: counter-clockwise goes negative', near(cv, -1, 1e-6), cv.toFixed(4))
  const wrapCrank: Control = { ...crank, min: 0, max: 1, wrap: true, step: .25 }
  const cs3 = beginDrag(wrapCrank, 20, 10, { c: 0 })
  for (let i = 1; i <= 45; i++) { const a = i / 36 * Math.PI * 2; cv = dragValue(wrapCrank, cs3, { x: 10 + 10 * Math.cos(a), y: 10 + 10 * Math.sin(a) }).c }
  assert('crank: wrap + step (1.25 turns on 0..1 → .25)', near(cv, .25), String(cv))

  const xy: Control = { key: 'px', keyY: 'py', kind: 'xy', box: [0, 0, 100, 100], label: 'XY' }
  const pxy = drag(xy, 25, 25, {}, { x: 25, y: 25 })
  assert('xy: returns two values (y grows upwards)', near(pxy.px, .25) && near(pxy.py, .75) && Object.keys(pxy).length === 2)

  const stepper: Control = { key: 'n', kind: 'stepper', box: [0, 0, 40, 10], min: 0, max: 10, step: 1, label: 'N' }
  assert('stepper: tap zones step down / up, clamped', drag(stepper, 5, 5, { n: 3 }, { x: 5, y: 5 }).n === 2 && drag(stepper, 35, 5, { n: 3 }, { x: 35, y: 5 }).n === 4 && drag(stepper, 35, 5, { n: 10 }, { x: 35, y: 5 }).n === 10)
  const seg: Control = { key: 'g', kind: 'segmented', box: [0, 0, 30, 10], options: 3, label: 'G' }
  assert('segmented: the option under the pointer', drag(seg, 5, 5, {}, { x: 5, y: 5 }).g === 0 && drag(seg, 5, 5, {}, { x: 15, y: 5 }).g === 1 && drag(seg, 5, 5, {}, { x: 99, y: 5 }).g === 2)
  const tog: Control = { key: 't', kind: 'toggle', box: [0, 0, 10, 10], label: 'T' }
  const btn: Control = { key: 'b', kind: 'button', box: [0, 0, 10, 10], label: 'B' }
  assert('toggle flips the value at press; button is max while held, min on release',
    drag(tog, 5, 5, { t: 0 }, { x: 5, y: 5 }).t === 1 && drag(tog, 5, 5, { t: 1 }, { x: 5, y: 5 }).t === 0 && drag(btn, 5, 5, {}, { x: 5, y: 5 }).b === 1 && releaseValue(btn)?.b === 0 && releaseValue(slider) === null)

  assert('keys: arrows step, PageUp/Down 10 %, Home/End ends', near(keyValue(slider, .5, 'ArrowRight')!, .51) && near(keyValue(slider, .5, 'ArrowDown')!, .49)
    && near(keyValue(slider, .5, 'PageUp')!, .6) && keyValue(slider, .5, 'Home') === 0 && keyValue(slider, .5, 'End') === 1 && keyValue(slider, .5, 'a') === null)
  assert('keys: clamp and quantize', keyValue(slider, 1, 'ArrowUp') === 1 && keyValue(stepped, 4, 'ArrowRight') === 6 && keyValue(stepper, 0, 'ArrowLeft') === 0)
  assert('keys: unbounded crank has no Home/End, arrows step 1/24 turn', keyValue(crank, 0, 'Home') === null && near(keyValue(crank, 0, 'ArrowRight')!, 1 / 24))
  assert('keys: segmented wraps, toggle / button on Space / Enter', keyValue(seg, 2, 'ArrowRight') === 0 && keyValue(seg, 0, 'ArrowLeft') === 2 && keyValue(seg, 1, 'End') === 2
    && keyValue(tog, 0, ' ') === 1 && keyValue(tog, 1, 'Enter') === 0 && keyValue(tog, 0, 'ArrowRight') === null && keyValue(btn, 0, 'Enter') === 1)
  assert('settle: quantize from min, then clamp; no float noise', settle({ ...slider, min: .1, max: .9, step: .2 }, .62) === .7 && settle(slider, 3) === 1 && settle({ ...slider, step: .1 }, .3) === .3)

  // every declared control (all boards) has a usable box and a label, and its key is unique per card
  const bad: string[] = []
  for (const p of widgetPresets) {
    const keys = new Set<string>()
    for (const c of p.controls ?? []) {
      const [col, row, w, h] = c.box
      if (!(w > 0 && h > 0 && col >= -1 && row >= -1 && col + w <= p.grid.cols + 1 && row + h <= p.grid.rows + 1) || !c.label || keys.has(c.key)) bad.push(`${p.id}:${c.key}`)
      keys.add(c.key)
    }
  }
  assert('preset controls: in-grid boxes, labels, unique keys', bad.length === 0, bad.join(', '))
}

// IR) Field IR v0: parser limits, JSON round trip, JS ≡ GLSL-semantics reference, GLSL snapshot (scripts/ir.ts)
irChecks(assert)
// 16) P3-A raster + light stack: rasterize/sample, blur, morphology, distance, height → normals → lambert/phong, bloom, torch perf
import { blur as rBlur, createRaster, cut as rCut, dilate as rDilate, distanceRaster, erode as rErode, moat as rMoat, outline as rOutline, rasterSum, rasterize, sample as rSample } from '../src/engine/raster'
import { bloom, heightRaster, illuminate, lambert, lightDir, normalRaster, phong, sdfBox, sdfCircle, stackHeights, torch, type HeightRaster } from '../src/engine/light'
{
  const G = { cols: 37, rows: 23 }, U = cellU
  const wave: Field = (u, v) => .5 + .5 * Math.sin(u * 9.1) * Math.cos(v * 5.3)
  const ras = rasterize(wave, G), near = rSample(ras), bil = rSample(ras, 'bilinear')
  let exact = true
  for (let r = 0; r < G.rows; r++) for (let c = 0; c < G.cols; c++) {
    const want = Math.fround(wave(U(c, G.cols), U(r, G.rows)))
    if (near(U(c, G.cols), U(r, G.rows)) !== want || bil(U(c, G.cols), U(r, G.rows)) !== want) exact = false
  }
  assert('raster: sample round-trip is exact on cell centres (nearest + bilinear)', exact)
  const mid = bil(3.5 / (G.cols - 1), U(4, G.rows)), avg = (ras.data[4 * G.cols + 3] + ras.data[4 * G.cols + 4]) / 2
  assert('raster: bilinear halfway between centres is their mean; off-grid is 0', close(mid, avg, 1e-6) && near(-.2, .5) === 0 && bil(.5, 1.2) === 0)
  const br = rasterize(bounded(wave, 5, 3, 9, 8), G), bs = rSample(br)
  assert('raster: a bounded field rasterizes only its bounds; sample keeps them', br.data[0] === 0 && br.data[3 * G.cols + 5] > 0 && String(bs.bounds) === '5,3,9,8')

  // blur preserves mass, also for a blob in the corner (weight off the edge is reflected back in)
  const C = { cols: 40, rows: 30 }, blob = rasterize(bounded((u, v) => (Math.hypot(u * 39 - 2, v * 29 - 1) <= 3 ? 1 : 0), 0, 0, 6, 5), C)
  const m0 = rasterSum(blob), g = rBlur(blob, 4), bx = rBlur(blob, 3, 'box'), wr = rasterize(wave, C), whole = rBlur(wr, 6)
  assert('blur: gaussian + box preserve mass (corner blob, unbounded field)', close(rasterSum(g), m0, 1e-3) && close(rasterSum(bx), m0, 1e-3) && close(rasterSum(whole), rasterSum(wr), 1e-2),
    `${m0} → ${rasterSum(g).toFixed(4)} / ${rasterSum(bx).toFixed(4)}`)
  assert('blur: spreads (lower peak, bounds grown by the reach)', Math.max(...g.data) < 1 && String(g.bounds) === '0,0,10,9')

  // morphology on a disc of radius 6
  const D = { cols: 41, rows: 41 }, discAt = (rad: number) => rasterize((u, v) => (Math.hypot(u * 40 - 20, v * 40 - 20) <= rad ? 1 : 0), D)
  const discR = discAt(6), count = (r: { data: Float32Array }) => r.data.reduce((a, b) => a + b, 0)
  const dil = rDilate(discR, 2), ero = rErode(discR, 2)
  assert('dilate / erode grow and shrink a disc by the radius', Math.abs(count(dil) - count(discAt(8))) <= 12 && Math.abs(count(ero) - count(discAt(4))) <= 12 && ero.data[20 * 41 + 20] === 1 && ero.data[20 * 41 + 25] === 0,
    `${count(discR)} → +${count(dil)} / −${count(ero)}`)
  const inner = rOutline(discR, 1), mo = rMoat(discR, 2)
  let edgeOk = true
  for (let i = 0; i < inner.data.length; i++) { if (inner.data[i] && !discR.data[i]) edgeOk = false; if (mo.data[i] && discR.data[i]) edgeOk = false }
  assert('outline sits on the edge inside, moat just outside', edgeOk && count(inner) > 20 && count(inner) < 60 && mo.data[20 * 41 + 27] === 1 && mo.data[20 * 41 + 29] === 0 && count(rCut(dil, mo)) === count(discR))
  const sd = distanceRaster(discR)
  assert('distanceRaster: signed, ≈ −r at the centre, ±.5 across the edge', close(sd.data[20 * 41 + 20], -6, .6) && sd.data[20 * 41 + 26] < 0 && sd.data[20 * 41 + 27] > 0 && close(sd.data[20 * 41 + 30], 3.5, .01))

  // height → normals: a flat plateau and a tilted plane have constant normals
  const P = { cols: 60, rows: 60 }, boxSdf = sdfBox(P, 30, 30, 20, 20, 4), plate = heightRaster(boxSdf, { width: 4 }, P), pn = normalRaster(plate)
  let flat = true
  for (let r = 15; r <= 45; r++) for (let c = 15; c <= 45; c++) { const i = r * 60 + c; if (pn.x[i] !== 0 || pn.y[i] !== 0 || pn.z[i] !== 1) flat = false }
  const tilt: HeightRaster = { ...createRaster(P), mask: new Float32Array(3600).fill(1) }
  for (let r = 0; r < 60; r++) for (let c = 0; c < 60; c++) tilt.data[r * 60 + c] = .5 * c
  const tn = normalRaster(tilt), want = [-.5 / Math.sqrt(1.25), 0, 1 / Math.sqrt(1.25)]
  let tiltOk = true
  for (let i = 0; i < 3600; i++) if (!close(tn.x[i], want[0], 1e-6) || tn.y[i] !== 0 || !close(tn.z[i], want[2], 1e-6)) tiltOk = false
  assert('normals of a plane are flat (a plateau faces the viewer, a 0.5 slope tilts every normal alike)', flat && tiltOk)
  assert('heightRaster / normalRaster are cached per geometry, grid and profile', heightRaster(boxSdf, { shape: 'round', width: 4 }, P) === plate && normalRaster(plate) === pn
    && heightRaster(boxSdf, { width: 5 }, P) !== plate && heightRaster(boxSdf, { width: 4 }, { cols: 30, rows: 30 }) !== plate)

  // lambert of a hemisphere peaks where the normal equals L; phong where it bisects L and the view
  const S = { cols: 144, rows: 144 }, R = 40, sphere = normalRaster(heightRaster(sdfCircle(S, 72, 72, R), { width: R }, S))
  const argmax = (f: Field): [number, number, number] => { let best = -1, bc = 0, brr = 0; for (let r = 0; r < 144; r++) for (let c = 0; c < 144; c++) { const x = f(U(c, 144), U(r, 144)); if (x > best) { best = x; bc = c; brr = r } } return [bc, brr, best] }
  const L = lightDir(-Math.PI / 4, Math.PI / 4), [lc, lr, lmax] = argmax(lambert(sphere, L))
  assert('lambert of a hemisphere peaks toward L', Math.hypot(lc - (72 + R * L[0]), lr - (72 + R * L[1])) <= 1.5 && lmax > .99, `peak (${lc},${lr}) value ${lmax.toFixed(3)}`)
  const hv = [L[0], L[1], L[2] + 1], hk = 1 / Math.hypot(...hv), [pc, pr, pmax] = argmax(phong(sphere, L, [0, 0, 1], 40))
  assert('phong highlight sits on the half vector', Math.hypot(pc - (72 + R * hv[0] * hk), pr - (72 + R * hv[1] * hk)) <= 1.5 && pmax > .98 && pmax <= 1, `peak (${pc},${pr})`)
  const lit = lambert(sphere, L, { ambient: .2 })
  assert('lambert: ambient floor on the shadow side, 0 off the shape', close(lit(U(98, 144), U(98, 144)), .2, .02) && lit(U(2, 144), U(2, 144)) === 0)
  const tl = lambert(sphere, torch(52, 52, 60)), tr = lambert(sphere, torch(92, 92, 60))
  assert('torch: a point light brightens the side it is over', tl(U(60, 144), U(60, 144)) > tl(U(84, 144), U(84, 144)) && tr(U(84, 144), U(84, 144)) > tr(U(60, 144), U(60, 144)))

  // bloom: normalised to strength, the moat keeps it off the source
  const dotR = rasterize(bounded((u, v) => (Math.hypot(u * 40 - 20, v * 40 - 20) <= 2 ? 1 : 0), 18, 18, 22, 22), D), bl = bloom(dotR, 5, { strength: .8, gap: 1 })
  assert('bloom: peak = strength, source + 1-cell moat cut out, halo beyond', close(Math.max(...bl.data), .8, 1e-6) && bl.data[20 * 41 + 20] === 0 && bl.data[20 * 41 + 23] === 0 && bl.data[20 * 41 + 24] > 0 && bl.data[20 * 41 + 26] > 0)

  // perf: torch relight of a 144² card (an embossed plate + a dome): one illuminate pass + reading every cell back
  const card = stackHeights(heightRaster(sdfBox(S, 72, 72, 56, 56, 14), { width: 6 }, S), heightRaster(sdfCircle(S, 72, 72, 30), { width: 30, height: 12 }, S))
  const cn = normalRaster(card), into = createRaster(S), intoS = createRaster(S), tightCount = (n: { mask: Float32Array }) => n.mask.reduce((a, m) => a + (m > 0 ? 1 : 0), 0)
  const relight = (k: number) => illuminate(cn, torch(30 + (k % 80), 40 + (k % 50), 40, 90), { ambient: .1, shininess: 24, into, intoSpecular: intoS })
  const readBack = (f: { diffuse: Field; specular: Field }) => { let s = 0; for (let r = 0; r < 144; r++) { const v = U(r, 144); for (let c = 0; c < 144; c++) { const u = U(c, 144); s += f.diffuse(u, v) + f.specular(u, v) } } return s }
  const median = (fn: (k: number) => unknown) => {
    for (let k = 0; k < 40; k++) fn(k)
    const ts: number[] = []
    for (let k = 0; k < 101; k++) { const t0 = performance.now(); fn(k); ts.push(performance.now() - t0) }
    return ts.sort((a, b) => a - b)[50]
  }
  const pass = median(relight), full = median(k => readBack(relight(k)))
  console.log(`  torch relight 144² (one lambert + phong pass, ${tightCount(cn)} lit cells): median ${pass.toFixed(3)} ms; with every cell of both fields read back: ${full.toFixed(3)} ms`)
  assert('perf: torch relight of a 144² card ≤ 1 ms median after warm-up', pass <= 1, `${pass.toFixed(3)} ms`)
}

if (failures) { console.error(`\n${failures} check(s) failed`); (globalThis as { process?: { exit(code: number): void } }).process?.exit(1) }
else console.log('\nAll acceptance checks passed')
