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
import { masks, ditherEdge, revealDots, transitionDots, criticalSpring, underdampedSpring, DataSprings, decodeText, splitFlapText, cubicBezier, ease } from '../src/engine/motion'

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
}

if (failures) { console.error(`\n${failures} check(s) failed`); (globalThis as { process?: { exit(code: number): void } }).process?.exit(1) }
else console.log('\nAll acceptance checks passed')
