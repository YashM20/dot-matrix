/**
 * P5-B checks: struct-of-arrays `DotBuffer` sampling, the buffer canvas renderer and the worker protocol.
 * Called from verify.ts (`bufferChecks(assert)`); also runnable alone: `npx tsx scripts/buffer.ts`.
 */
import { sampleLayers, sampleLayersInto } from '../src/engine/sampler/gridSampler'
import { createDotBuffer, toDots } from '../src/engine/buffer/dotBuffer'
import { renderCanvas } from '../src/engine/renderer/canvasRenderer'
import { renderCanvasBuffer } from '../src/engine/renderer/canvasBuffer'
import { handleSample } from '../src/workers/protocol'
import { dot480 } from '../src/engine/theme/tokens'
import { withChrome } from '../src/widgets'
import { uniquePresets } from './lib/cards'

/** FNV-1a 32, as in scripts/golden.ts (importing it would run that script). */
const fnv1a = (str: string, h: number) => { for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h >>> 0 }
type Assert = (name: string, cond: boolean, detail?: string) => void

/** Headless Path2D / context stand-ins: count sub-paths and fills. */
class FakePath { ops = 0; moveTo() { this.ops++ } lineTo() {} arcTo() {} bezierCurveTo() {} arc() {} rect() { this.ops++ } closePath() {} }
const fakeCtx = () => { const c = { fills: 0, ops: 0, globalAlpha: 1, fillStyle: '' as unknown, fill(p: FakePath) { c.fills++; c.ops += p.ops } }; return c }

export function bufferChecks(assert: Assert): void {
  const g = globalThis as { Path2D?: unknown }, hadPath = g.Path2D
  g.Path2D = FakePath
  try {
    let same = 0, total = 0, maxErr = 0, hashSame = 0, worstFills = 0, worstId = '', fillsMatch = true
    const q = (d: { x: number; y: number; r: number; opacity: number; color: string }) => `${d.x.toFixed(2)},${d.y.toFixed(2)},${d.r.toFixed(3)},${d.opacity.toFixed(3)},${d.color}`
    const hash = (keys: string[]) => { let h = 0x811c9dc5; for (const k of keys.sort()) h = fnv1a(k + ';', h); return h }
    const buf = createDotBuffer(64)
    for (const p of uniquePresets()) for (const t of p.animated ? [0, 1.3] : [0]) {
      const L = withChrome(p)({ t, data: { ...p.defaults } })
      const a = sampleLayers(L, p.grid, p.style, dot480), b = sampleLayersInto(L, p.grid, p.style, dot480, buf), d = toDots(b)
      total++
      let ok = a.length === b.n
      for (let i = 0; ok && i < a.length; i++) {
        const x = a[i], y = d[i]
        const err = Math.max(Math.abs(x.x - y.x), Math.abs(x.y - y.y), Math.abs(x.r - y.r), Math.abs(x.opacity - y.opacity))
        maxErr = Math.max(maxErr, err)
        ok = x.color === y.color && x.shape === y.shape && x.roundness === y.roundness && err <= 1e-4 * Math.max(1, Math.abs(x.x), Math.abs(x.y))
      }
      if (ok) same++
      if (hash(a.map(q)) === hash(d.map(q))) hashSame++
      const c1 = fakeCtx(), c2 = fakeCtx()
      renderCanvas(c1 as unknown as CanvasRenderingContext2D, a)
      const fills = renderCanvasBuffer(c2 as unknown as CanvasRenderingContext2D, b, () => new FakePath() as never)
      // one fill per (colour, opacity step) either way, and the same dots drawn
      if (c1.fills !== c2.fills || c1.ops !== c2.ops) fillsMatch = false
      if (p.style.quantizeSteps && fills > worstFills) { worstFills = fills; worstId = `${p.id}@${t}` }
    }
    assert('DotBuffer: sampleLayersInto ≡ sampleLayers for every preset (same order, colour, shape; float32 rounding only)', same === total, `${same}/${total} frames, max |Δ| ${maxErr.toExponential(1)}; goldens hash the float64 DotInstance path (a float32 toDots hash matches on ${hashSame}/${total}: toFixed ties)`)
    assert('renderCanvasBuffer: same fills and sub-paths as renderCanvas; quantized UI cards ≤ 30 fills', fillsMatch && worstFills <= 30, `worst ${worstFills} fills (${worstId})`)

    // reuse: a buffer big enough is filled in place, the array path allocates per call
    const p = uniquePresets().find(x => x.id === 'silhouette') ?? uniquePresets()[0], L = withChrome(p)({ t: 0, data: { ...p.defaults } })
    const r = createDotBuffer(p.grid.cols * p.grid.rows * 2), bytes = r.bytes
    sampleLayersInto(L, p.grid, p.style, dot480, r); sampleLayersInto(L, p.grid, p.style, dot480, r)
    assert('DotBuffer: re-sampling reuses the backing store', r.bytes === bytes && r.n > 0, `${r.n} dots in ${(bytes.byteLength / 1024).toFixed(0)} KB`)

    // worker protocol: the reply equals local sampling; a handed-over store is reused, a small one grows
    const req = { kind: 'sample' as const, card: 1, seq: 1, preset: p.id, t: 0, frame: 0, data: { ...p.defaults }, grid: p.grid, style: p.style, theme: dot480 }
    const big = createDotBuffer(p.grid.cols * p.grid.rows * 2), small = createDotBuffer(16)
    const r1 = handleSample({ ...req, bytes: big.bytes, capacity: big.capacity }), r2 = handleSample({ ...req, bytes: small.bytes, capacity: small.capacity })
    const bad = handleSample({ ...req, preset: 'no-such-card' })
    const okReply = r1.kind === 'frame' && r2.kind === 'frame' && r1.bytes === big.bytes && r2.bytes !== small.bytes && r1.n === r.n && r2.n === r.n
      && new Float32Array(r1.bytes, 0, r1.n).every((v, i) => v === r.x[i])
    assert('worker protocol: reply ≡ local sample, reuses a big-enough store, grows a small one, unknown preset → error', okReply && bad.kind === 'error')
  } finally { g.Path2D = hadPath }
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('buffer.ts')) {
  let failures = 0
  bufferChecks((name, cond, detail = '') => { console.log(`${cond ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (!cond) failures++ })
  if (failures) process.exit(1)
}
