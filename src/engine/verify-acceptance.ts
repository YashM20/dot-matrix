/**
 * Programmatic acceptance harness — framework-free, runs headless.
 * Run: pnpm verify   (or: npx tsx src/engine/verify-acceptance.ts)
 * Covers the sampler, squircle geometry, text layout, waveform anchoring, halftone polarity,
 * spiral continuity, Poisson-disc, and a smoke render of every widget preset.
 */
import { quantize } from './sampler/quantize'
import { cellU, colorFor, sampleField, sampleLayers } from './sampler/gridSampler'
import { squircleExponent, squircleRadius45 } from './renderer/shapePath'
import { poissonDiscPoints, scatterField } from './fields/scatterField'
import { amplitudeField, ecgAmplitudes, sumOfSinesAmplitudes, traceField } from './fields/waveformField'
import { bayerDither, imageToLuminanceField } from './fields/haltoneField'
import { spiralField } from './fields/warpedField'
import { ringField } from './fields/polarField'
import { bitmapFont, glyph, scale2x, textWidth } from './fields/bitmapFont'
import { rasterizePath } from './fields/svgPath'
import { iconPaths } from './fields/iconSDF'
import { combine, hRule, ringCells, textAt, toCell } from './layout'
import { dot480 } from './theme/tokens'
import { widgetPresets, withChrome } from '../widgets'

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

if (failures) { console.error(`\n${failures} check(s) failed`); (globalThis as { process?: { exit(code: number): void } }).process?.exit(1) }
else console.log('\nAll acceptance checks passed')
