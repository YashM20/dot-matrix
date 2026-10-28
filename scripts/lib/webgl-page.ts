/**
 * Browser side of `scripts/webgl.ts` (bundled by esbuild, driven over CDP): GPU ≡ JS IR parity,
 * WebGL vs canvas pixel parity, context loss, and frame-rate probes. Exposed as `window.P5`.
 */
import { compileJS, parse, type IREnv } from '../../src/engine/ir'
import { cellU, sampleLayers } from '../../src/engine/sampler/gridSampler'
import { renderCanvas } from '../../src/engine/renderer/canvasRenderer'
import { gpuIR, gpuValues, layerPass, renderWebGL, sharedDotGL, splitGPULayers, type GPUField, type GPUPass } from '../../src/engine/renderer/webgl'
import { irProgram } from '../../src/engine/ir'
import '../../src/engine/noise/ir' // the IR noise pack, for the noise parity row
import { dot480 } from '../../src/engine/theme/tokens'
import type { DotInstance, DotStyle, GridConfig, Layer } from '../../src/engine/types'
import { widgetById, withChrome } from '../../src/widgets'
import { tileStyle } from '../../src/widgets/types'
import { PLASMA_SRC } from '../../src/widgets/boards/gpu'

const theme = dot480
const ENVS: IREnv[] = [
  { t: 0 },
  { t: 1.3, data: { value: .62, k: -2.5 }, pointer: { x: .3, y: .7, down: true } },
  { t: 7.77, data: { value: -1.4, k: 3 }, pointer: { x: 1.2, y: -.4 } },
]
const N = 48

function info() {
  const gl = sharedDotGL()
  if (!gl?.gl) return { webgl2: false }
  const ext = gl.gl.getExtension('WEBGL_debug_renderer_info')
  return { webgl2: true, floatTargets: gl.floatTargets, renderer: ext ? gl.gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.gl.getParameter(gl.gl.RENDERER), vendor: ext ? gl.gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : '' }
}

/**
 * 20 fields x 3 envs over 48x48: GPU readback (raw, float32) vs `compileJS(raw)` (float64). A cell off by
 * more than `tol` is a *discontinuity flip* when the GPU value lies within the range the JS field takes
 * within 1e-5 of the cell in u/v: the exact argument of a floor/fract/compare sits on its jump (e.g. u*3 + v*3 = 141/47 = 3)
 * and float32 rounding lands on the other side. Flips are counted; every other cell must agree.
 */
function irParity(IR_FIELDS: Record<string, string>, tol = 1e-3) {
  const gl = sharedDotGL()!
  const style: DotStyle = { ...tileStyle }, grid: GridConfig = { cols: N, rows: N }, E = 1e-5
  const rows: { name: string; maxAbs: number; maxSmooth: number; flips: number; nanMismatch: number; worstAt: string; error?: string }[] = []
  for (const [name, src] of Object.entries(IR_FIELDS)) {
    let maxAbs = 0, maxSmooth = 0, flips = 0, nanMismatch = 0, worstAt = '', error: string | undefined
    for (const [ei, env] of ENVS.entries()) {
      const pass = layerPass({ field: gpuIR(src, env) }, grid, style, 1)!
      gl.lastError = null
      const gpu = gl.readPass(pass)
      if (!gpu) { error = gl.lastError ?? 'no readback'; break }
      const js = compileJS(parse(src), { raw: true })(env)
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const u = cellU(c, N), v = cellU(r, N), a = gpu[r * N + c], b = js(u, v)
        if (Number.isNaN(a) || Number.isNaN(b)) { if (Number.isNaN(a) !== Number.isNaN(b)) nanMismatch++; continue }
        const d = a === b ? 0 : Math.abs(a - b)
        if (d > maxAbs) { maxAbs = d; worstAt = `env${ei} c${c} r${r} gpu=${a} js=${b}` }
        if (d <= tol) { maxSmooth = Math.max(maxSmooth, d); continue }
        const around = [[E, 0], [-E, 0], [0, E], [0, -E], [E, E], [-E, -E], [E, -E], [-E, E]].map(([du, dv]) => js(u + du, v + dv))
        if (a >= Math.min(b, ...around) - tol && a <= Math.max(b, ...around) + tol) flips++; else maxSmooth = Math.max(maxSmooth, d)
      }
    }
    rows.push({ name, maxAbs, maxSmooth, flips, nanMismatch, worstAt, error })
  }
  return rows
}

interface Cmp { inkA: number; inkB: number; ink: number; max: number; mean: number; over16: number; psnr: number }
function compare(a: ImageData, b: ImageData, diff?: ImageData): Cmp {
  let max = 0, sum = 0, over = 0, se = 0, inkA = 0, inkB = 0
  for (let i = 0; i < a.data.length; i += 4) {
    let m = 0
    inkA += a.data[i] + a.data[i + 1] + a.data[i + 2] - 57; inkB += b.data[i] + b.data[i + 1] + b.data[i + 2] - 57
    for (let k = 0; k < 3; k++) { const d = Math.abs(a.data[i + k] - b.data[i + k]); m = Math.max(m, d); sum += d; se += d * d }
    max = Math.max(max, m); if (m > 16) over++
    if (diff) { const v = Math.min(255, m * 4); diff.data[i] = v; diff.data[i + 1] = v; diff.data[i + 2] = v; diff.data[i + 3] = 255 }
  }
  const n = a.data.length / 4, mse = se / (n * 3)
  return { inkA, inkB, ink: +(inkB / inkA).toFixed(4), max, mean: +(sum / (n * 3)).toFixed(3), over16: +(over / n * 100).toFixed(3), psnr: +(mse ? 10 * Math.log10(255 * 255 / mse) : 99).toFixed(2) }
}
function surface(w: number, h: number, scale: number) {
  const c = document.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(h * scale)
  const ctx = c.getContext('2d')!; ctx.fillStyle = theme.surface; ctx.fillRect(0, 0, c.width, c.height); ctx.setTransform(scale, 0, 0, scale, 0, 0)
  return { c, ctx }
}
const grab = (s: { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D }) => s.ctx.getImageData(0, 0, s.c.width, s.c.height)
function diffPng(w: number, h: number, a: ImageData, b: ImageData) {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const ctx = c.getContext('2d')!, d = ctx.createImageData(w, h), r = compare(a, b, d)
  ctx.putImageData(d, 0, 0)
  return { r, png: c.toDataURL('image/png') }
}

/** A preset's CPU dots drawn by canvas 2D vs WebGL2 (explicit-dot path). `gpuDensity`: also draw its GPU passes at that density vs the CPU sample. */
function presetParity(id: string, t: number, scale: number, gpuDensity?: number) {
  const p = widgetById(id)!, grid = p.grid, pitch = grid.pitch ?? theme.gridPx, w = grid.cols * pitch, h = grid.rows * pitch
  const layers = withChrome(p)({ t, data: { ...p.defaults } })
  const dots = sampleLayers(layers, grid, p.style, theme)
  const A = surface(w, h, scale), B = surface(w, h, scale)
  renderCanvas(A.ctx, dots)
  let ok = true, cpuDots: DotInstance[] = dots, passes: GPUPass[] = []
  if (gpuDensity !== undefined) {
    const retag = layers.map(l => { const g = (l.field as GPUField).gpu; if (!g) return l; const f: GPUField = Object.assign((u: number, v: number) => l.field(u, v), { bounds: l.field.bounds, gpu: { ...g, density: gpuDensity } }); return { ...l, field: f } })
    const split = splitGPULayers(retag, grid, p.style, pitch)
    cpuDots = sampleLayers(split.cpu, grid, p.style, theme); passes = split.passes
  }
  ok = renderWebGL(B.ctx, cpuDots, passes, theme)
  const a = grab(A), b = grab(B), d = diffPng(A.c.width, A.c.height, a, b)
  return { id, ok, dots: dots.length, passes: passes.map(q => q.cols * q.rows), ...d.r, canvas: A.c.toDataURL('image/png'), webgl: B.c.toDataURL('image/png'), diff: d.png }
}

/** Arbitrary dots, canvas 2D vs WebGL2 (shape / size / opacity probes). */
function dotsParity(dots: DotInstance[], w: number, h: number, scale: number) {
  const A = surface(w, h, scale), B = surface(w, h, scale)
  renderCanvas(A.ctx, dots)
  const ok = renderWebGL(B.ctx, dots, [], theme)
  return { ok, ...compare(grab(A), grab(B)) }
}

/** A GPU card at its authored density (the picture the board shows on WebGL2). */
function gpuShot(id: string, t: number, scale: number) {
  const p = widgetById(id)!, grid = p.grid, pitch = grid.pitch ?? theme.gridPx
  const s = surface(grid.cols * pitch, grid.rows * pitch, scale)
  const { cpu, passes } = splitGPULayers(withChrome(p)({ t, data: { ...p.defaults } }), grid, p.style, pitch)
  const ok = renderWebGL(s.ctx, sampleLayers(cpu, grid, p.style, theme), passes, theme)
  return { ok, dots: passes.reduce((n, q) => n + q.cols * q.rows, 0), png: s.c.toDataURL('image/png') }
}

async function contextLoss() {
  const gl = sharedDotGL()!, ext = gl.gl!.getExtension('WEBGL_lose_context')
  if (!ext) return { supported: false }
  const s = surface(100, 100, 1), dots: DotInstance[] = [{ x: 50, y: 50, r: 20, opacity: 1, color: '#ffffff' }]
  const before = renderWebGL(s.ctx, dots, [], theme)
  const event = (name: string) => new Promise<boolean>(r => { (gl.canvas as HTMLCanvasElement).addEventListener(name, () => r(true), { once: true }); setTimeout(() => r(false), 8000) })
  const lost = event('webglcontextlost')
  ext.loseContext()
  const lostEvent = await lost
  const during = renderWebGL(s.ctx, dots, [], theme)
  const restored = event('webglcontextrestored')
  let restoreError = ''
  try { ext.restoreContext() } catch (e) { restoreError = String(e) }
  const restoredEvent = await restored
  // restored in place, or replaced by a fresh context after REPLACE_MS: either way the next frame draws again
  let after = false, waited = 0
  const s2 = surface(100, 100, 1)
  while (!(after = renderWebGL(s2.ctx, dots, [], theme)) && waited < 5000) { await new Promise(r => setTimeout(r, 100)); waited += 100 }
  const px = s2.ctx.getImageData(50, 50, 1, 1).data[0]
  return { supported: true, before, lostEvent, during, restoredEvent, restoreError, replaced: sharedDotGL() !== gl, recoveredMs: waited, after, centrePixel: px }
}

/**
 * Frame-rate probe on a 1000×1000 px card: `ir` = GPU IR plasma (value computed on the GPU), `values` = the same
 * plasma as a CPU field sampled into the value texture, `table` = a precomputed value table (renderer cost only), `dots` = CPU `sampleLayers` → DotInstance[] → instance
 * buffer, `canvas` = those dots on canvas 2D. Reports rAF fps (what the page sees), main-thread ms per frame,
 * GPU ms per frame (EXT_disjoint_timer_query_webgl2 around the GL work, when exposed) and a forced-sync ms per
 * frame (GL work + gl.readPixels of one texel, i.e. until the GPU is done; excludes the 2D blit readback).
 */
async function perf(kind: 'ir' | 'values' | 'table' | 'dots' | 'canvas', side: number, seconds: number) {
  const size = 1000, pitch = size / side, grid: GridConfig = { cols: side, rows: side, pitch }
  const style: DotStyle = { ...tileStyle, sizeMin: pitch * .09, sizeMax: pitch * .42 }
  const cv = document.createElement('canvas'); cv.width = size; cv.height = size; document.body.appendChild(cv)
  const ctx = cv.getContext('2d')!
  const plasma = irProgram(PLASMA_SRC, { mode: 'function' })
  // `table`: values already computed elsewhere (a sim, a worker, a decoded frame): the field is a scrolling table
  // read, so the frame cost is the renderer's own (u/v loop, texture upload, draw), not the field's maths
  const tbl = new Float32Array(side * side); for (let i = 0; i < tbl.length; i++) tbl[i] = plasma({ t: 0 })((i % side) / (side - 1), Math.floor(i / side) / (side - 1))
  const scroll = (t: number) => { const o = Math.floor(t * 60) * side; return (u: number, v: number) => tbl[(Math.round(u * (side - 1)) + Math.round(v * (side - 1)) * side + o) % tbl.length] }
  const dg = sharedDotGL()!, gl = dg.gl!
  const tq = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null
  const queries: WebGLQuery[] = [], gpuMs: number[] = []
  const gpuOnly = (t: number) => {
    if (kind === 'canvas') return true
    let passes: GPUPass[] = [], dots: DotInstance[] = []
    if (kind === 'dots') dots = sampleLayers([{ field: plasma({ t }), tone: 'auto' }], grid, style, theme)
    else passes = [layerPass({ field: kind === 'ir' ? gpuIR(PLASMA_SRC, { t }) : gpuValues(kind === 'table' ? scroll(t) : plasma({ t })), tone: 'auto' } as Layer, grid, style, pitch)!]
    let q: WebGLQuery | null = null
    if (tq) { q = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, q!) }
    const ok = dg.render({ width: size, height: size, scale: 1, dots, passes, theme })
    if (tq && q) { gl.endQuery(tq.TIME_ELAPSED_EXT); queries.push(q) }
    return ok
  }
  const frame = (t: number) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, size, size)
    if (kind === 'canvas') { renderCanvas(ctx, sampleLayers([{ field: plasma({ t }), tone: 'auto' }], grid, style, theme)); return true }
    const ok = gpuOnly(t)
    if (ok) dg.blit(ctx)
    return ok
  }
  const poll = () => {
    while (tq && queries.length && gl.getQueryParameter(queries[0], gl.QUERY_RESULT_AVAILABLE)) {
      const q = queries.shift()!
      if (!gl.getParameter(tq.GPU_DISJOINT_EXT)) gpuMs.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6)
      gl.deleteQuery(q)
    }
  }
  let frames = 0, cpu = 0, ok = true
  const t0 = performance.now()
  await new Promise<void>(done => {
    const step = () => {
      const a = performance.now()
      ok = frame((a - t0) / 1000) && ok
      cpu += performance.now() - a; frames++; poll()
      if (performance.now() - t0 < seconds * 1000) requestAnimationFrame(step); else done()
    }
    requestAnimationFrame(step)
  })
  const fps = frames / ((performance.now() - t0) / 1000)
  for (let i = 0; i < 20 && queries.length; i++) { await new Promise(r => setTimeout(r, 50)); poll() }
  const k = 10, px = new Uint8Array(4), s0 = performance.now()
  for (let i = 0; i < k; i++) { gpuOnly(i / 30); if (kind !== 'canvas') gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px) }
  const syncMs = (performance.now() - s0) / k
  for (const q of queries) gl.deleteQuery(q)
  cv.remove()
  const med = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[xs.length >> 1] : NaN)
  return { kind, dots: side * side, fps: +fps.toFixed(1), cpuMsPerFrame: +(cpu / frames).toFixed(2), gpuMsPerFrame: +med(gpuMs).toFixed(2), gpuSamples: gpuMs.length, syncMsPerFrame: kind === 'canvas' ? null : +syncMs.toFixed(2), ok }
}

Object.assign(window, { P5: { info, irParity, presetParity, dotsParity, gpuShot, contextLoss, perf } })
