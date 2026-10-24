/**
 * Halftone ladder + STBN checks (P4-F). `pnpm verify` runs them through `halftoneChecks()`;
 * `npx tsx scripts/halftone.ts` runs them alone and prints the flicker / timing table.
 *
 * Flicker metric: share of the card's cells whose dot level changes from one frame to the next, on a
 * static scene with per-frame sensor noise (what a webcam sends when nothing moves).
 */
import { blueNoise, halftone, halftoneStream, rasterChanges, stbn, type HalftoneOptions } from '../src/engine/halftone'
import { blur as rBlur, createRaster, rasterWindow, type Raster } from '../src/engine/raster'
import { sampleLayers } from '../src/engine/sampler/gridSampler'
import { dot480 } from '../src/engine/theme/tokens'
import { hash01 } from '../src/engine/math'
import { withChrome } from '../src/widgets'
import { mirrorCamera, mirrorPortrait } from '../src/widgets/boards/mirror'
import { spawnSync } from 'node:child_process'

type Assert = (name: string, cond: boolean, detail?: string) => void

/** `base` plus frame-seeded triangular noise of ±`amp` (σ ≈ amp / 2.45), inside its bounds. */
function noisy(base: Raster, frame: number, amp: number, shift = 0): Raster {
  const out = createRaster(base.grid, base.space, base.bounds), { cols } = base.grid, d = base.data, [c0, r0, c1, r1] = rasterWindow(base)
  for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) {
    const i = y * cols + x, src = y * cols + Math.max(c0, x - shift)
    out.data[i] = Math.min(1, Math.max(0, d[src] + (hash01(i, frame * 2 + 1) + hash01(i, frame * 2 + 2) - 1) * amp))
  }
  return out
}
const pct = (n: number, cells: number) => `${((100 * n) / cells).toFixed(2)}%`
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1] }

export function halftoneChecks(assert: Assert): { flicker: Record<string, number>; frameMs: number } {
  // ── mask: a permutation of 4096 ranks, blue (anti-correlated neighbours, flat 8×8 block means) ──
  const m = blueNoise(), ranks = new Set(Array.from(m, x => Math.round(x * 4096 - .5)))
  let lag = 0, worstBlock = 0
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) lag += (m[y * 64 + x] - .5) * (m[y * 64 + ((x + 1) & 63)] - .5 + m[((y + 1) & 63) * 64 + x] - .5)
  lag /= 2 * 4096 / 12
  for (let by = 0; by < 8; by++) for (let bx = 0; bx < 8; bx++) {
    let s = 0; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) s += m[(by * 8 + y) * 64 + bx * 8 + x]
    worstBlock = Math.max(worstBlock, Math.abs(s / 64 - .5))
  }
  // temporal: every cell's first 21 slices average to ~.5 (golden-ratio rotation is low-discrepancy)
  let worstSeq = 0
  for (let i = 0; i < 4096; i += 7) { let s = 0; for (let k = 0; k < 21; k++) s += stbn(i & 63, i >> 6, k); worstSeq = Math.max(worstSeq, Math.abs(s / 21 - .5)) }
  assert('halftone mask: 64² void-and-cluster is a permutation of 4096 ranks, blue (neighbour corr < -.2, 8×8 block means within .5 ± .03)',
    ranks.size === 4096 && Math.min(...m) > 0 && Math.max(...m) < 1 && lag < -.2 && worstBlock < .03, `corr ${lag.toFixed(3)}, worst block ±${worstBlock.toFixed(3)}`)
  assert('halftone STBN: every cell\'s 21-slice sequence averages to .5 ± .04; slices wrap for negative frames', worstSeq < .04 && stbn(5, 9, -3) >= 0 && stbn(5, 9, -3) < 1, `worst ±${worstSeq.toFixed(3)}`)

  // ── pure ladder: deterministic, on the level grid, tone-preserving on flat fields, bounds kept ──
  const portrait = mirrorPortrait(), grid = portrait.grid, cells = (grid.rows - portrait.bounds![1]) * grid.cols
  const same = (a: Raster, b: Raster) => rasterChanges(a, b) === 0
  const h1 = halftone(portrait, { step: 1 }), h2 = halftone(portrait, { step: 2 })
  const onLadder = (r: Raster, L = 6) => r.data.every(v => Math.abs(v * (L - 1) - Math.round(v * (L - 1))) < 1e-6)
  let flatErr = 0
  for (const v of [.1, .27, .5, .73, .9]) {
    const flat = createRaster({ cols: 64, rows: 64 }); flat.data.fill(v)
    const out = halftone(flat, { step: 1, levels: 4 }), mean = out.data.reduce((s, x) => s + x, 0) / out.data.length
    flatErr = Math.max(flatErr, Math.abs(mean - v))
  }
  const area = halftone(portrait, { step: 1, mode: 'area' })
  assert('halftone: pure steps 1 and 2 are deterministic, on the 6-level ladder, keep bounds; flat fields keep their mean tone; area = √size',
    same(h1, halftone(portrait, { step: 1 })) && same(h2, halftone(portrait, { step: 2 })) && onLadder(h1) && onLadder(h2)
      && h2.bounds?.join() === portrait.bounds?.join() && flatErr < .01 && area.data.every((v, i) => Math.abs(v - Math.sqrt(h1.data[i])) < 1e-6),
    `flat-field mean error ${flatErr.toFixed(4)}`)
  // structure-aware: on a noisy frame, step 2 lands closer to its own clean result than step 1 does
  const noise = noisy(portrait, 0, .1)
  const d1 = rasterChanges(halftone(noise, { step: 1 }), h1), d2 = rasterChanges(halftone(noise, { step: 2 }), h2)
  assert('halftone step 2 (structure-aware) is robust to sensor noise: fewer dots move than at step 1', d2 < d1 * .7, `noise moves ${pct(d1, cells)} (step 1) vs ${pct(d2, cells)} (step 2)`)

  // ── temporal flicker on a static scene with per-frame sensor noise (±.06, σ ≈ .025) ──
  const FRAMES = 30, AMP = .06
  const run = (frameFor: (f: number, input: Raster) => Raster) => {
    let prev: Raster | undefined, n = 0
    for (let f = 0; f < FRAMES; f++) { const out = frameFor(f, noisy(portrait, f, AMP)); if (prev) n += rasterChanges(prev, out); prev = { ...out, data: new Float32Array(out.data) } }
    return n / (FRAMES - 1) / cells
  }
  const pure = (o: HalftoneOptions, temporal = false) => run((f, r) => halftone(r, { ...o, frame: temporal ? f : 0 }))
  const streamed = (o: HalftoneOptions) => { const s = halftoneStream(o); return run((f, r) => s.push(r, f)) }
  const flicker = {
    'plain threshold (step 1, fixed mask)': pure({ step: 1 }),
    'STBN per frame (step 1, no hysteresis)': pure({ step: 1 }, true),
    'stream step 1 (STBN + hysteresis)': streamed({ step: 1 }),
    'stream step 2 (STBN + hysteresis)': streamed({ step: 2 }),
  }
  const plain = flicker['plain threshold (step 1, fixed mask)'], best = flicker['stream step 2 (STBN + hysteresis)']
  assert('halftone flicker: static scene + sensor noise, stream (STBN + hysteresis) changes ≤ 10% as many dots per frame as plain thresholding',
    best <= plain * .1 && flicker['stream step 1 (STBN + hysteresis)'] < plain * .25,
    Object.entries(flicker).map(([k, v]) => `${k} ${(100 * v).toFixed(2)}%`).join('; '))

  // ── stream: idempotent for a repeated frame, deterministic, and it still follows motion ──
  const sA = halftoneStream({ step: 2 }), sB = halftoneStream({ step: 2 })
  let det = true
  for (let f = 0; f < 8; f++) { const r = noisy(portrait, f, AMP, f); det &&= same(sA.push(r, f), sB.push(r, f)) }
  const again = noisy(portrait, 7, AMP, 7); sA.push(again, 7); const idem = sA.changes === 0
  // a scene moving 1 cell per frame: the stream follows it. Error = mean |local tone (gaussian r 2) of the output −
  // local tone of the pure halftone of the same frame|; a frozen stream (first frame held) is the failing reference
  const tone = (r: Raster) => rBlur(r, 2)
  const sM = halftoneStream({ step: 2 }); let lagErr = 0, frozenErr = 0, first: Raster | undefined
  for (let f = 0; f < 12; f++) {
    const r = noisy(portrait, f, AMP, f), a = sM.push(r, f), b = tone(halftone(r, { step: 2, frame: f }))
    first ??= { ...a, data: new Float32Array(a.data) }
    if (f > 3) {
      const ta = tone(a), tf = tone(first); let e = 0, z = 0
      for (let i = 0; i < b.data.length; i++) { e += Math.abs(ta.data[i] - b.data[i]); z += Math.abs(tf.data[i] - b.data[i]) }
      lagErr = Math.max(lagErr, e / cells); frozenErr = Math.max(frozenErr, z / cells)
    }
  }
  assert('halftone stream: deterministic, idempotent for a repeated frame, follows a moving scene (local-tone error < ½ of a frozen one)',
    det && idem && lagErr < frozenErr / 2, `motion error ${lagErr.toFixed(4)} vs frozen ${frozenErr.toFixed(4)}`)

  // ── timing in a fresh process (a heap full of other checks' garbage is not what a card pays in the app) ──
  const child = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/halftone.ts', '--timing'], { encoding: 'utf8' })
  const [frameMs, buildMs] = (child.stdout.trim().split(/\s+/).map(Number) as [number, number])
  assert('mirror-camera live frame at 144² (STBN stream step 2 + sample) ≤ 4 ms (median of 40, best of 3, fresh process)', child.status === 0 && frameMs <= 4,
    child.status === 0 ? `${frameMs.toFixed(2)} ms (halftone ${buildMs.toFixed(2)} ms)` : child.stderr.slice(0, 200))
  return { flicker, frameMs }
}

/** The live camera card's frame cost: median of 40 frames, best of 3 runs (a busy machine only adds time). */
export function cameraFrameMs(): [number, number] {
  // ── timing: the live camera card at 144² (stream step 2 + sampling + chrome): median of 40 frames, best of 3
  // runs (a busy machine only ever adds time, so the best run is the closest to the card's own cost) ──
  const portrait = mirrorPortrait(), grid = portrait.grid, AMP = .06
  const cam = createRaster(grid, 'card', portrait.bounds), layers = withChrome(mirrorCamera), runs: [number, number][] = []
  for (let run = 0; run < 3; run++) {
    const times: number[] = [], build: number[] = []
    for (let f = 0; f < 48; f++) {
      cam.data.set(noisy(portrait, f, AMP, f & 3).data)
      const a = performance.now()
      const ls = layers({ t: f / 30, frame: run * 48 + f, data: { cam: 1, camState: 2 }, media: { camera: cam } }), b = performance.now()
      sampleLayers(ls, mirrorCamera.grid, mirrorCamera.style, dot480)
      if (f >= 8) { times.push(performance.now() - a); build.push(b - a) }
    }
    runs.push([median(times), median(build)])
  }
  const [frameMs, buildMs] = runs.reduce((a, b) => (b[0] < a[0] ? b : a))
  return [frameMs, buildMs]
}

if (process.argv.includes('--timing')) console.log(cameraFrameMs().join(' '))
else if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/halftone.ts')) {
  let failed = 0
  halftoneChecks((name, cond, detail = '') => { console[cond ? 'log' : 'error'](`${cond ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (!cond) failed++ })
  if (failed) process.exit(1)
}
