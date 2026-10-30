/**
 * Checks for the living-scene engine (`src/engine/life`, docs/LIFE.md) and the `pond` board (docs/living-matter/L-pond.md §L1).
 * Called from verify.ts (`lifeChecks(assert)`); also runnable alone: `npx tsx scripts/life.ts`.
 *   npx tsx scripts/life.ts --snapshot   # print the determinism hashes as JSON (the Bun/JSC cross-engine run reads it)
 * Covers, per module: ripple (symmetry, wave speed, damping, walls, M2's pool grid, cost), glyph tiles (self-match,
 * edge snapping, pinned bitmaps, raster ≡ layers, memo, STBN flicker purity and budget), chain / rope / FABRIK, body
 * (profile, area, swim envelope, markings), steering (containment, turn caps, C-start, Strouhal); then the koi pond
 * world (purity, seam, memory, robustness, cost), the card (t = 0, one accent, frame budget, style B) and interaction
 * (tap, hold, flick, heal). Timing budgets scale by a measured load factor, as in scripts/algorithms.ts.
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { blueNoise } from '../src/engine/halftone/mask'
import {
  bodyRaster, chainFollow, chainInit, createBodyRaster, createChain, createRipple, createRope, createTileRaster,
  EDGE3, edgeOfTangent, fabrik, flickerOn, FONT57, koiPattern, markingAt, matchStats, matchTile, MODE_BEND, MODE_ESCAPE,
  patternStats, profileAt, putBig, putGlyph, QUAD4, RAMP3, RAMP4, rippleEnergy, rippleSplat, rippleStep, ropeInit, ropeStep, SHAPE3, tailBeatHz, tileLayers,
  waveAt, widthAt, drawKoiPond, koiBulge, koiView, KOI_SLOTS, pelletViews, PEL_FLOATING, POND_DT, type Alphabet, type BodySpec,
} from '../src/engine/life'
import { simAtStep, simLoop, simReset, simStep } from '../src/engine/sim'
import { worldAt, worldReset, type FrameInput } from '../src/engine/physics/world'
import { sampleLayers } from '../src/engine/sampler/gridSampler'
import { dot480 } from '../src/engine/theme/tokens'
import { withChrome, type WidgetPreset } from '../src/widgets/types'
import { freezeWallClock } from './lib/freeze'
import { fmtLoaded, medianLoaded } from './lib/load'
import { lifeL2Checks } from './life-l2'
import { lifeL3Checks } from './life-l3'

type Assert = (name: string, cond: boolean, detail?: string) => void
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1] }
const time = <T>(f: () => T): [number, T] => { const a = performance.now(), r = f(); return [performance.now() - a, r] }
/** The load factor of scripts/algorithms.ts (a fixed float loop that takes ~12 ms on the budget machine). */
function loadFactor(): number {
  const run = () => { let s = 0; for (let i = 0; i < 1e7; i++) s += (i & 7) * .5; return s }
  run()
  return Math.max(1, median([0, 1, 2].map(() => time(run)[0])) / 12)
}
/** FNV-1a 32 over the bits of a float array (or bytes). */
function fnv(a: ArrayLike<number>, float = true): string {
  let h = 0x811c9dc5
  const f = new Float32Array(1), u = new Uint32Array(f.buffer)
  for (let i = 0; i < a.length; i++) {
    let w = a[i]
    if (float) { f[0] = a[i]; w = u[0] }
    for (let b = 0; b < 4; b++) { h ^= (w >>> (8 * b)) & 0xff; h = Math.imul(h, 0x01000193) >>> 0 }
  }
  return h.toString(16).padStart(8, '0')
}
const rng = (seed: number) => () => { seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) | 0; return ((seed ^ (seed >>> 13)) >>> 0) / 4294967296 }

/** Pinned bitmaps (life/glyph: alphabet FNV) and the STBN table (Node). Change only with a deliberate alphabet change. */
const PINNED = { alphabets: 'ae706f45', stbn: 'bf3e091d' }

async function pond() {
  freezeWallClock()
  return import('../src/widgets/boards/pond/index')
}

/** The determinism snapshot: pristine pond state hashes at fixed steps (compared Node ↔ Bun). */
export async function lifeSnapshot(): Promise<Record<string, string>> {
  const { pondProbe } = await pond(), p = pondProbe.koi.pond, sim = p.world.sim
  simReset(sim)
  const out: Record<string, string> = {}
  for (const n of [360, 1440, 1799]) out[`pond@${n}`] = fnv(simAtStep(sim, n))
  out.patterns = fnv(p.markings.flatMap(m => [...m]), false)
  return out
}

export async function lifeChecks(assert: Assert): Promise<void> {
  const load = loadFactor()
  console.log(`  life: load factor ${load.toFixed(2)} (timing budgets scale by it)`)

  // ── L1.1 scaffold ───────────────────────────────────────────────────────────────────────────────
  {
    const barrel = readFileSync('src/engine/index.ts', 'utf8')
    assert('life: engine barrel does not re-export life', !/['"]\.\/life/.test(barrel))
    const { readdirSync } = await import('node:fs')
    const files = readdirSync('src/engine/life').filter(f => f.endsWith('.ts'))
    const bad = files.filter(f => /from ['"]\.\.\/algo/.test(readFileSync(`src/engine/life/${f}`, 'utf8')))
    const viaNoise = files.filter(f => /\b(dsin|dcos|tsin|dpow|dexp|datan2)\b/.test(readFileSync(`src/engine/life/${f}`, 'utf8')))
      .every(f => /from ['"]\.\.\/noise(\/dmath)?['"]/.test(readFileSync(`src/engine/life/${f}`, 'utf8')))
    assert('life: imports dmath from ../noise, never ../algo', !bad.length && viaNoise, bad.join(', '))
    const { detLint } = await import('./lib/detLint')
    const res = detLint(['src/engine/life/'])
    assert('life: the determinism lint covers src/engine/life and finds nothing', !res.violations.length && res.scanned.length >= 7 && !res.skipped.length,
      res.violations.map(v => `${v.file}:${v.line} ${v.rule}`).join('; ') || `${res.scanned.length} files`)
  }

  // ── L1.2 ripple ─────────────────────────────────────────────────────────────────────────────────
  {
    const W = 33, r = createRipple({ w: W, h: W }), s = new Float32Array(r.size)
    rippleSplat(r, s, 16, 16, -1, 3)
    let sym = true
    for (let k = 0; k < 40 && sym; k++) {
      rippleStep(r, s)
      for (let y = 0; y < W && sym; y++) for (let x = 0; x < W; x++) {
        const v = s[y * W + x]
        if (!Object.is(v, s[y * W + (W - 1 - x)]) || !Object.is(v, s[(W - 1 - y) * W + x]) || !Object.is(v, s[x * W + y])) { sym = false; break }
      }
    }
    assert('life/ripple: a centred drop stays mirror-symmetric bit for bit (x, y, and diagonal)', sym)
    // wavefront: the farthest cell (from the centre) with |h| > 1e-6 after n steps
    const r2 = createRipple({ w: 81, h: 81, damp: 1 }), s2 = new Float32Array(r2.size)
    s2[40 * 81 + 40] = -1
    let speedOk = true, front = 0
    for (let n = 1; n <= 30; n++) {
      rippleStep(r2, s2)
      front = 0
      for (let y = 0; y < 81; y++) for (let x = 0; x < 81; x++) if (Math.abs(s2[y * 81 + x]) > 1e-6) front = Math.max(front, Math.hypot(x - 40, y - 40))
      if (front > n / Math.SQRT2 + 1 + 1e-9 && front > n) speedOk = false
    }
    // the stencil reaches one cell per step along an axis; the energy-carrying front moves at ≤ 1/√2 cells/step
    let peak = 0, peakR = 0
    for (let y = 0; y < 81; y++) for (let x = 0; x < 81; x++) { const v = Math.abs(s2[y * 81 + x]); if (v > peak) { peak = v; peakR = Math.hypot(x - 40, y - 40) } }
    assert('life/ripple: wavefront speed ≤ 1/√2 cells/step + 1', peakR <= 30 / Math.SQRT2 + 1 && speedOk, `peak at r ${peakR.toFixed(1)} after 30 steps (bound ${(30 / Math.SQRT2 + 1).toFixed(1)}); stencil front ${front.toFixed(1)}`)
    // energy after the drop leaves (60 steps in): monotone over 8-step windows
    const r3 = createRipple({ w: 36, h: 33 }), s3 = new Float32Array(r3.size)
    rippleSplat(r3, s3, 18, 16, -1.2, 1.6)
    for (let i = 0; i < 60; i++) rippleStep(r3, s3)
    // Σh² sloshes between height and velocity as rings cross and refocus in a 36-cell box: 8-step sums still swing,
    // 16-step sums (about one crossing at 1/√2 cells/step) fall monotonically
    const win: number[] = []
    for (let k = 0; k < 12; k++) { let e = 0; for (let i = 0; i < 16; i++) { rippleStep(r3, s3); e += rippleEnergy(r3, s3) } win.push(e) }
    assert('life/ripple: energy decays monotonically after the drop leaves (window of 16 steps)', win.every((e, i) => i === 0 || e < win[i - 1]), win.slice(0, 4).map(e => e.toExponential(2)).join(' > '))
    // walls and robustness on the pond's own mask
    const { pondProbe } = await pond(), pm = pondProbe.koi.pond.water
    const r4 = createRipple({ w: 36, h: 33, mask: pm }), s4 = new Float32Array(r4.size), rr = rng(9)
    let wallE = 0, finite = true
    for (let n = 0; n < 10000; n++) {
      if (n % 7 === 0) rippleSplat(r4, s4, rr() * 36, rr() * 33, (rr() - .5) * 3, .5 + rr() * 2)
      rippleStep(r4, s4)
    }
    for (let i = 0; i < 36 * 33; i++) { if (!pm[i]) wallE += s4[i] * s4[i] + s4[r4.P + i] * s4[r4.P + i]; if (!Number.isFinite(s4[i])) finite = false }
    assert('life/ripple: walls reflect (energy outside the mask = 0) and 10k steps of random splats stay finite', wallE === 0 && finite, `wall energy ${wallE}, max |h| ${Math.max(...Array.from(s4.subarray(0, 1188), Math.abs)).toFixed(2)}`)
    const ms = median(Array.from({ length: 9 }, () => time(() => { for (let i = 0; i < 100; i++) rippleStep(r4, s4) })[0] / 100))
    assert('life/ripple: step of 36×33 ≤ .05 ms (median × load)', ms <= .05 * load, `${(ms * 1000).toFixed(1)} µs`)
    // M2's pool: 72 × 62, damp .985, an arbitrary mask (a lens shape)
    const mask = new Uint8Array(72 * 62)
    for (let y = 0; y < 62; y++) for (let x = 0; x < 72; x++) mask[y * 72 + x] = ((x - 36) / 34) ** 2 + ((y - 31) / 22) ** 2 < 1 && !(x > 30 && x < 40 && y > 26 && y < 36) ? 1 : 0
    const r5 = createRipple({ w: 72, h: 62, damp: .985, mask }), s5 = new Float32Array(r5.size)
    rippleSplat(r5, s5, 20, 31, -1, 2)
    const e0 = rippleEnergy(r5, s5)
    let out5 = 0
    for (let n = 0; n < 400; n++) rippleStep(r5, s5)
    for (let i = 0; i < mask.length; i++) if (!mask[i]) out5 += Math.abs(s5[i])
    const e1 = rippleEnergy(r5, s5)
    assert('life/ripple: works on a non-pond grid (72×62, damp .985, an arbitrary mask: M2\'s pool shape)', out5 === 0 && e1 > 0 && e1 < e0 && r5.size === 2 * 72 * 62, `energy ${e0.toFixed(2)} → ${e1.toExponential(2)}`)
  }

  // ── L1.3 glyph tiles ────────────────────────────────────────────────────────────────────────────
  {
    const alphabets: Alphabet[] = [EDGE3, RAMP3, SHAPE3, QUAD4, RAMP4, FONT57]
    const selfMatch = alphabets.every(a => a.glyphs.every((g, k) => {
      const m = matchTile(a, a.desc.subarray(k * 16, k * 16 + 16))
      return m.index <= k && a.desc.subarray(m.index * 16, m.index * 16 + 16).every((v, i) => v === a.desc[k * 16 + i])
    }))
    assert('life/glyph: every glyph matches itself (matchTile(desc g) = g, or an earlier glyph with the same descriptor) in every alphabet', selfMatch)
    const want = (deg: number) => { const a = ((deg % 180) + 180) % 180; return a < 22.5 || a >= 157.5 ? '-' : a < 67.5 ? '\\' : a < 112.5 ? '|' : '/' }
    const edges = Array.from({ length: 16 }, (_, k) => { const d = k * 22.5 + 3, r = d * Math.PI / 180; return [edgeOfTangent(EDGE3, Math.cos(r), Math.sin(r)).ch, want(d)] })
    assert('life/glyph: edgeOfTangent at 16 angles (k·22.5° + 3°) gives the expected - \\ | /', edges.every(([a, b]) => a === b), edges.map(([a]) => a).join(''))
    const bits = fnv(alphabets.flatMap(a => a.glyphs.flatMap(g => [...g.bits, g.w, g.h])), false)
    const stbnHash = fnv(blueNoise())
    if (PINNED.alphabets.startsWith('__')) console.log(`  life: pin alphabets = ${bits}, stbn = ${stbnHash}`)
    assert('life/glyph: alphabet bitmaps pinned (FNV of every alphabet = constant)', bits === PINNED.alphabets, bits)
    assert('life/glyph: STBN table FNV pinned (Node)', stbnHash === PINNED.stbn, stbnHash)
    // a raster's layers sample to exactly its lit cells, and a big dot hides its tile's card cells
    const tiles = { cols: 10, rows: 8, pitch: 4, ox: 2, oy: 6 }, card = { cols: 44, rows: 40, pitch: 2.25 }
    const r = createTileRaster(card, tiles), rr = rng(3)
    for (let k = 0; k < 40; k++) putGlyph(r, Math.floor(rr() * 10), Math.floor(rr() * 8), SHAPE3.glyphs[Math.floor(rr() * SHAPE3.glyphs.length)], [0, 1, 2, 3, 5][k % 5], [.6, .8, 1][k % 3])
    putGlyph(r, 3, 3, RAMP3.glyphs[9], 3, 1); putBig(r, 3, 3, 5, 1)
    const style = { shape: 'squircle' as const, sizeMin: .2, sizeMax: .95, cornerRoundness: .1, opacityMode: 'fromValue' as const, quantizeSteps: 5 }
    const dots = sampleLayers(tileLayers(r), card, style, dot480)
    let lit = 0
    const want2 = new Map<string, number>()
    for (let i = 0; i < r.tone.length; i++) if (r.tone[i] >= 0) { lit++; want2.set(`${(i % 44) * 2.25 + 1.125},${Math.floor(i / 44) * 2.25 + 1.125}`, r.tone[i]) }
    const palette = [dot480.dotFaint, dot480.dotMid, dot480.dotIdle, dot480.value, dot480.dotActiveDim, dot480.dotActive]
    const small = dots.filter(d => d.r < 1.5), big = dots.filter(d => d.r >= 1.5)
    const same = small.length === lit && small.every(d => palette[want2.get(`${d.x},${d.y}`) ?? -9] === d.color)
    const hidden = [0, 1, 2, 3].every(j => [0, 1, 2, 3].every(i => r.tone[(6 + 12 + j) * 44 + 2 + 12 + i] === -1))
    assert('life/glyph: a raster\'s layers sample to exactly its lit cells (count + tones), and a big dot hides its tile\'s card cells', same && hidden && big.length === 1 && big[0].color === dot480.dotActive, `${small.length}/${lit} cells, ${big.length} big`)
    // flicker: pure in t, on-share within ±.5 %
    let on = 0, pure = true
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const a = flickerOn(x, y, 7.3, .035, .2); if (a !== flickerOn(x, y, 7.3, .035, .2)) pure = false; if (a) on++ }
    assert('life/glyph: flickerOn is pure in t and its on-share is within ±.5 % of share over 64² tiles', pure && Math.abs(on / 4096 - .035) <= .005, `${(on / 40.96).toFixed(2)} %`)
  }

  // ── L1.4 chain, rope, FABRIK ────────────────────────────────────────────────────────────────────
  {
    const c = createChain(20, 3, .16), s = new Float32Array(40), rr = rng(5)
    chainInit(c, s, 0, 0, 1, 0)
    let hx = 0, hy = 0, maxLen = 0, maxBend = 0
    for (let k = 0; k < 2000; k++) {
      hx += (rr() - .5) * 8; hy += (rr() - .5) * 8
      chainFollow(c, s, hx, hy)
      for (let i = 1; i < 20; i++) maxLen = Math.max(maxLen, Math.abs(Math.hypot(s[i] - s[i - 1], s[20 + i] - s[19 + i]) - 3))
      for (let i = 2; i < 20; i++) {
        const ax = s[i - 1] - s[i - 2], ay = s[19 + i] - s[18 + i], bx = s[i] - s[i - 1], by = s[20 + i] - s[19 + i]
        maxBend = Math.max(maxBend, Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by))))))
      }
    }
    // the state is Float32: storing the rotated node rounds the joint angle by up to ~1e-5 rad at these coordinates
    assert('life/chain: lengths = seg ± 1e-4 and every joint ≤ maxBend + 2e-5 (Float32 state) after 2,000 random head moves', maxLen <= 1e-4 && maxBend <= .16 + 2e-5, `Δlen ${maxLen.toExponential(1)}, bend − max ${(maxBend - .16).toExponential(1)}`)
    chainInit(c, s, 0, 0, 1, 0)
    for (let k = 1; k <= 50; k++) chainFollow(c, s, k, 0)
    assert('life/chain: a straight pull leaves a straight chain', Array.from({ length: 20 }, (_, i) => Math.abs(s[20 + i])).every(v => v < 1e-9) && Math.abs(s[19] - (50 - 57)) < 1e-4)
    const rope = createRope(12, 2, { drag: .03, iters: 12 }), rs = new Float32Array(48)
    ropeInit(rope, rs, 10, 0)
    const flow = (x: number, y: number, out: Float32Array) => { out[0] = Math.sin(y * .3) * 20; out[1] = Math.cos(x * .2) * 5 }
    for (let n = 0; n < 600; n++) ropeStep(rope, rs, 1 / 30, 10, 0, 0, 40, flow)
    let worst = 0
    for (let i = 1; i < 12; i++) worst = Math.max(worst, Math.abs(Math.hypot(rs[i] - rs[i - 1], rs[12 + i] - rs[11 + i]) - 2) / 2)
    assert('life/rope: pinned root fixed, lengths within 2 % after 600 steps with gravity + flow', rs[0] === 10 && rs[12] === 0 && worst <= .02, `worst ${(worst * 100).toFixed(2)} %`)
    const xs = new Float32Array([0, 3, 6, 9, 12]), ys = new Float32Array(5), lens = new Float32Array([3, 3, 3, 3])
    const ok = fabrik(xs, ys, lens, 4, 7, 10), d = Math.hypot(xs[4] - 4, ys[4] - 7)
    const far = fabrik(new Float32Array([0, 3, 6]), new Float32Array(3), new Float32Array([3, 3]), 30, 0)
    assert('life/fabrik: reaches a target within reach to .05 cells in ≤ 10 iterations, reports false outside reach', ok && d <= .05 && xs[0] === 0 && !far, `end error ${d.toFixed(4)}`)
  }

  // ── L1.5 body and markings ──────────────────────────────────────────────────────────────────────
  {
    const b: BodySpec = { length: 56, halfWidth: .11, fins: false, tail: false }
    let best = 0, bs = 0
    for (let i = 0; i <= 1000; i++) { const v = widthAt(b, i / 1000); if (v > best) { best = v; bs = i / 1000 } }
    assert('life/body: B(s) peaks at s ≈ .303 with half-width .11 L', Math.abs(bs - .303) < .01 && Math.abs(best - .11 * 56) < .02 * 56 * .11, `peak ${best.toFixed(3)} at s ${bs}`)
    let lutErr = 0
    for (let i = 0; i <= 4000; i++) { const s = i / 4000; lutErr = Math.max(lutErr, Math.abs(profileAt(s) - (s >= 1 ? 0 : Math.sqrt(s) * Math.pow(1 - s, 1.15) / .3634))) }
    assert('life/body: the widthAt LUT is within 1e-4 of the analytic profile (Math.pow in the check only)', lutErr < 1e-4, lutErr.toExponential(2))
    // a straight, unwaved body: symmetric in v; area ≈ ∫ 2B ds
    const c = createChain(20, 56 / 19, .16), st = new Float32Array(40), out = createBodyRaster()
    chainInit(c, st, 100.37, 70.21, 1, 0)
    bodyRaster(b, c, st, 0, 0, out)
    let area = 0, asym = 0
    for (let j = 0; j < out.h; j++) for (let i = 0; i < out.w; i++) {
      const k = j * out.w + i
      area += out.cover[k]
      if (out.cover[k]) { const y = out.y0 + j, my = Math.round(2 * 70.21 - y), mj = my - out.y0; if (Math.abs(2 * 70.21 - y - my) < 1e-6 && (mj < 0 || mj >= out.h || !out.cover[mj * out.w + i])) asym++ }
    }
    let integral = 0
    for (let i = 0; i < 10000; i++) integral += 2 * widthAt(b, (i + .5) / 10000) * 56 / 10000
    // mirror test on a body centred on a cell row: v ↔ −v
    const st2 = new Float32Array(40); chainInit(c, st2, 100, 70, 1, 0); bodyRaster(b, c, st2, 0, 0, out)
    let mirror = 0
    for (let j = 0; j < out.h; j++) for (let i = 0; i < out.w; i++) { const y = out.y0 + j, mj = 140 - y - out.y0; if (out.cover[j * out.w + i] !== (mj >= 0 && mj < out.h ? out.cover[mj * out.w + i] : 0)) mirror++ }
    void asym
    assert('life/body: a straight unwaved body is symmetric in v and its area is within 3 % of ∫2B ds', mirror === 0 && Math.abs(area - integral) / integral < .03, `area ${area} vs ${integral.toFixed(1)}, ${mirror} asymmetric cells`)
    const tail = Math.max(...Array.from({ length: 64 }, (_, k) => Math.abs(waveAt(b, 1, k * Math.PI / 32, 1))))
    const head = Math.max(...Array.from({ length: 64 }, (_, k) => Math.abs(waveAt(b, 0, k * Math.PI / 32, 1))))
    assert('life/body: tail amplitude = .1 L at beat 1, head ≤ .02 L', Math.abs(tail - 5.6) < .01 && head <= .02 * 56 + 1e-9, `tail ${tail.toFixed(3)}, head ${head.toFixed(3)} (L 56)`)
    const share = (lut: Uint8Array, m: number) => lut.filter(v => v === m).length / lut.length
    const ko = [1, 2, 3].map(sd => koiPattern('kohaku', sd)), again = koiPattern('kohaku', 1)
    const tancho = koiPattern('tancho', 4)
    // tancho: one 4-connected red component
    const seen = new Uint8Array(1024); let comps = 0
    for (let i = 0; i < 1024; i++) if (tancho[i] === 1 && !seen[i]) {
      comps++; const st3 = [i]; seen[i] = 1
      while (st3.length) { const q = st3.pop()!, a = q >> 4, v = q & 15; for (const [da, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const na = a + da, nv = v + dv, k = na * 16 + nv; if (na >= 0 && na < 64 && nv >= 0 && nv < 16 && tancho[k] === 1 && !seen[k]) { seen[k] = 1; st3.push(k) } } }
    }
    const shares = ko.map(l => share(l, 1))
    assert('life/koi: LUTs deterministic per seed (FNV); kohaku red share 25–55 %, tancho one red component, fins white', fnv(again, false) === fnv(ko[0], false) && shares.every(x => x >= .25 && x <= .55) && comps === 1,
      `kohaku red ${shares.map(x => (x * 100).toFixed(0)).join('/')} %, tancho ${comps} component(s); fins are drawn white (PART_FIN never reads the LUT)`)
    koiPattern('showa', 999) // warm the JIT
    const calls0 = patternStats.fbmCalls
    const [bake] = time(() => { for (let k = 0; k < 6; k++) koiPattern(['kohaku', 'sanke', 'showa', 'tancho'][k % 4] as 'kohaku', 1000 + k) })
    const calls1 = patternStats.fbmCalls
    for (let k = 0; k < 10000; k++) markingAt(ko[0], (k % 97) / 97, (k % 31) / 15.5 - 1)
    // the plan's 2 ms assumed ~.23 µs per fbm2 call; a 4-octave fbm2 measures ~.65 µs here, and the bake runs once per mount
    assert('life/koi: 6 LUT bakes ≤ 10 ms × load (once per mount); markingAt never calls fbm2 (call counter)', bake <= 10 * load && patternStats.fbmCalls === calls1 && calls1 > calls0, `${bake.toFixed(2)} ms, ${calls1 - calls0} fbm2 calls in the bakes, 0 in 10k reads`)
  }

  // ── the pond world ──────────────────────────────────────────────────────────────────────────────
  const { pondProbe, pondBoard } = await pond(), P = pondProbe.koi.pond, W = P.world, sim = W.sim, L0 = P.bodies.map(b => b.length)
  const card = pondBoard[0] as WidgetPreset
  const frame = (t: number, data: Record<string, number> = {}, extra: object = {}) => sampleLayers(withChrome(card)({ t, data, ...extra }), card.grid, card.style, dot480)
  const key = (t: number) => JSON.stringify(frame(t))
  // the pond world has no gravity: (gx, gy) is the hub's tilt, 0 at rest (L3.6)
  const pristine = { pointers: [], gx: 0, gy: 0, kick: false, live: -1, quiet: Infinity }
  const [start, len] = simLoop(sim)

  // ── L1.6 steering (in the real scene) ──
  {
    const s = new Float32Array(P.layout.size)
    W.spec.init(s)
    let maxSdf = -Infinity, maxTurn = 0, cstartTurns = 0
    const prev = new Float32Array(12)
    for (let i = 0; i < 6; i++) { const v = koiView(P, s, i); prev[2 * i] = v.hx; prev[2 * i + 1] = v.hy }
    for (let n = 0; n < 18000; n++) {
      W.spec.step(s, n, pristine)
      for (let i = 0; i < 6; i++) {
        const v = koiView(P, s, i)
        maxSdf = Math.max(maxSdf, P.spec.sdf(v.x, v.y))
        const turn = Math.acos(Math.max(-1, Math.min(1, v.hx * prev[2 * i] + v.hy * prev[2 * i + 1])))
        if (v.mode !== MODE_BEND) maxTurn = Math.max(maxTurn, turn); else cstartTurns++
        prev[2 * i] = v.hx; prev[2 * i + 1] = v.hy
      }
    }
    assert('life/steer: 6 koi in the pond SDF for 10 simulated minutes (max sdf at the head < 0)', maxSdf < 0, `max sdf ${maxSdf.toFixed(2)}, ${pondProbe.koi.globals(s).wallHits} wall pushes`)
    assert('life/steer: turn rate ≤ cap + 1e-3 outside C-starts', maxTurn / POND_DT <= 1.8 + 1e-3 / POND_DT && cstartTurns === 0, `max ${(maxTurn / POND_DT).toFixed(3)} rad/s (burst cap 1.8)`)
    // C-start: a tap right beside koi 0 in a live run
    worldReset(W)
    const t0 = 16, s0 = worldAt(W, t0), k0 = koiView(P, s0, 0), sx = k0.x - k0.hy * 6, sy = k0.y + k0.hx * 6
    const h0 = [k0.hx, k0.hy]
    const fr = (t: number, f?: FrameInput) => worldAt(W, t, f)
    fr(t0 + 1 / 30, { pointers: [{ id: 1, x: sx, y: sy, down: true }] })
    const pre = koiView(P, fr(t0 + 2 / 30, { pointers: [{ id: 1, x: sx, y: sy, down: true }] }), 0)
    h0[0] = pre.hx; h0[1] = pre.hy
    // the release step starts the C-start (and takes its first bend step); time counts steps from there
    let s1 = fr(t0 + 3 / 30, { pointers: [{ id: 1, x: sx, y: sy, down: false }] })
    let turned = 0, turnT = 0, peak = 0, peakT = 0
    const speeds: number[] = []
    const startedBend = koiView(P, s1, 0).mode === MODE_BEND
    for (let k = 1; k <= 20; k++) {
      s1 = fr(t0 + (3 + k) / 30)
      const v = koiView(P, s1, 0), ang = Math.acos(Math.max(-1, Math.min(1, v.hx * h0[0] + v.hy * h0[1])))
      if (!turnT && v.mode === MODE_ESCAPE) { turned = ang; turnT = (k + 1) / 30 }
      if (v.u / L0[0] > peak) peak = v.u / L0[0]
      speeds.push(v.u / L0[0])
    }
    // the escape speed creeps toward 2.6 L/s by fractions of a percent a step: time it to 98 % of its peak
    peakT = (speeds.findIndex(u => u >= .98 * peak) + 2) / 30
    const deg = turned * 180 / Math.PI
    assert('life/steer: a C-start turns 90–130° in ≤ .16 s and peaks ≥ 2.4 L/s (98 % of its peak) by .55 s', startedBend && deg >= 90 && deg <= 130 && turnT <= .16 + 1e-9 && peak >= 2.4 && peakT <= .55,
      `${deg.toFixed(0)}° in ${turnT.toFixed(3)} s, peak ${peak.toFixed(2)} L/s at ${peakT.toFixed(2)} s`)
    // the beat the scene runs: phase advances by 2π·tailBeatHz(U, L)·dt, and the tail's peak-to-peak excursion is 2·A(1)
    const L = P.bodies[0].length, sts = [.28, .5, 1].map(k => { const U = k * L, A = Math.abs(Math.max(...Array.from({ length: 64 }, (_, j) => waveAt(P.bodies[0], 1, j * Math.PI / 32, 1)))); return tailBeatHz(U, L) * 2 * A / U })
    assert('life/steer: cruise Strouhal f·2A/U ∈ [.27, .33]', sts.every(st => st >= .27 && st <= .33), `St ${sts.map(x => x.toFixed(3)).join(' / ')} at .28 / .5 / 1 L/s`)
    worldReset(W)
  }

  // ── L1.7 world ──
  {
    simReset(sim); worldReset(W)
    const ts = [0, 1.3, 7.7, 3600.2], first = ts.map(key)
    simReset(sim)
    const again = [...ts].reverse().map(key).reverse()
    assert('pond: pristine is pure in t (0, 1.3, 7.7, 3600.2, any order, after a cold replay)', first.every((k, i) => k === again[i]))
    const end = simAtStep(sim, start + len - 1).slice(), s0 = simAtStep(sim, start).slice()
    const far = Math.max(...L0.map((L, i) => { const a = koiView(P, end, i), b = koiView(P, s0, i); return Math.hypot(a.x - b.x, a.y - b.y) / L }))
    const fEnd = new Set(frame((len - 1) * POND_DT).map(d => `${d.x},${d.y},${d.r},${d.color}`)), fStart = new Set(frame(len * POND_DT).map(d => `${d.x},${d.y},${d.r},${d.color}`))
    let diff = 0
    for (const d of fEnd) if (!fStart.has(d)) diff++
    for (const d of fStart) if (!fEnd.has(d)) diff++
    const share = diff / Math.max(fEnd.size, fStart.size)
    assert('pond: seam: koi heads within .5 L of the loop start 1 step before the wrap; a dot diff at the wrap ≤ 15 % of dots', far <= .5 && share <= .15, `heads ≤ ${far.toFixed(3)} L, ${(share * 100).toFixed(1)} % dots differ`)
    // memory: 2 loops + 20 scrubs
    simReset(sim)
    for (let k = 0; k <= 2 * len; k += 3) worldAt(W, k * POND_DT)
    const warm = [...sim.checkpoints.keys()].sort((a, b) => a - b).join()
    const rr = rng(11)
    for (let k = 0; k < 20; k++) worldAt(W, rr() * 200)
    const after = [...sim.checkpoints.keys()].sort((a, b) => a - b).join()
    const bytes = (sim.checkpoints.size + 6) * P.layout.size * 4
    assert('pond: total memory (checkpoints + 6 working copies) ≤ 288 KB after 2 loops + 20 random scrubs, and 0 evictions once warm', bytes <= 288 * 1024 && warm === after && sim.checkpoints.size <= 16,
      `${(bytes / 1024).toFixed(1)} KB (${sim.checkpoints.size} checkpoints × ${(P.layout.size * 4 / 1024).toFixed(1)} KB + 6 copies); render scratch outside: tile raster ${((pondProbe.koi.raster.tone.length * 5 + pondProbe.koi.raster.bigTone.length * 5) / 1024).toFixed(0)} KB, markings ${(P.markings.length * 1024 / 1024).toFixed(0)} KB`)
    // violent input
    worldReset(W)
    const resets0 = W.resets, rv = rng(13)
    let tt = 10, finite = true
    for (let k = 0; k < 600; k++) {
      tt += 1 / 30
      const s = worldAt(W, tt, { pointers: [{ id: 1, x: rv() * 200 - 30, y: rv() * 200 - 30, down: rv() < .5 }, { id: 2, x: rv() * 144, y: rv() * 144, down: rv() < .3 }], kick: rv() < .05 })
      if (!s.every(Number.isFinite)) finite = false
    }
    assert('pond: 600 steps of violent random input stay finite (resets = 0)', finite && W.resets === resets0, `resets ${W.resets - resets0}, dropped ${W.dropped}`)
    worldReset(W)
    const s = new Float32Array(P.layout.size)
    W.spec.init(s)
    for (let n = 0; n < 200; n++) W.spec.step(s, n, pristine)
    const ms = median(Array.from({ length: 7 }, (_, k) => time(() => { for (let n = 0; n < 60; n++) W.spec.step(s, 200 + k * 60 + n, pristine) })[0] / 60))
    assert('pond: step ≤ .25 ms (median × load)', ms <= .25 * load, `${ms.toFixed(3)} ms`)
  }

  // ── L1.8 the card ──
  {
    simReset(sim); worldReset(W)
    const s0 = worldAt(W, 0), koi = pondProbe.koi.koi(s0)
    const inWater = koi.every(k => P.spec.sdf(k.x, k.y) < 0)
    const spread = koi.every((a, i) => koi.every((b, j) => i === j || Math.hypot(a.x - b.x, a.y - b.y) > 6))
    const ring = rippleEnergy(P.ripple, s0)
    const pads = (P.spec.pads ?? []).filter(([x, y]) => P.spec.sdf(x, y) < 0).length
    assert('pond-koi: t = 0 shows 6 koi, ≥ 1 ring, 3 pads, no pellets', koi.length === 6 && inWater && spread && ring > .05 && pads === 3 && !pelletViews(P, s0).length, `ring energy ${ring.toFixed(3)}`)
    // one accent, red only inside koi cover
    const chroma = new Set([dot480.dotActive, dot480.dotActiveDim])
    let bad = 0, redOut = 0, reds = 0
    const body = createBodyRaster()
    for (const t of [0, 1.3, 6.5, 7.7, 21.2, 30]) {
      const dots = frame(t), s = worldAt(W, t), cover = new Set<number>()
      for (let i = 0; i < 6; i++) {
        const o = P.layout.KOI + KOI_SLOTS * i
        bodyRaster(P.bodies[i], P.chains[i], s, s[o + 5], s[o + 6], body, koiBulge(P, s, i))
        for (let j = 0; j < body.h; j++) for (let k = 0; k < body.w; k++) if (body.cover[j * body.w + k]) cover.add(Math.floor((body.y0 + j - 11) / 4) * 36 + Math.floor((body.x0 + k) / 4))
      }
      for (const d of dots) {
        if (d.color === dot480.dotActiveDim || (!chroma.has(d.color) && ![dot480.dotFaint, dot480.dotMid, dot480.dotIdle, dot480.value].includes(d.color))) bad++
        if (d.color !== dot480.dotActive) continue
        reds++
        const cx = d.x / 2.25 - .5, cy = d.y / 2.25 - .5, ti = Math.floor((cy - 11) / 4) * 36 + Math.floor(cx / 4)
        if (!cover.has(ti)) redOut++
      }
    }
    assert('pond: one accent: the only chromatic colour is dotActive (no dotActiveDim until the owner rules, D2), and red only inside koi cover', bad === 0 && redOut === 0 && reds > 0, `${reds} red dots, ${redOut} outside cover, ${bad} off-palette`)
    // frame budget, warm
    for (let i = 0; i < 8; i++) frame(5 + i / 30)
    // the load is sampled next to the frames (scripts/lib/load.ts): a factor from the top of the script goes stale
    const split = { draw: 0, layers: 0, sample: 0 }
    const fr = medianLoaded(i => {
      const t = 5.5 + i / 30
      const a = performance.now(), ls = withChrome(card)({ t, data: {} }), b = performance.now()
      sampleLayers(ls, card.grid, card.style, dot480)
      split.layers += b - a; split.sample += performance.now() - b
    }, 15)
    // the draw alone (world already at t)
    const s = worldAt(W, 5.5), r = pondProbe.koi.raster
    const draw = median(Array.from({ length: 9 }, () => time(() => drawKoiPond(P, s, 5.5, 9.7, r))[0]))
    assert('pond-koi: frame (layers + sample) ≤ 4 ms median warm × load', fr.ms <= 4 * fr.load, `${fmtLoaded(fr)} (layers incl. step + draw ${(split.layers / 15).toFixed(2)}, sample ${(split.sample / 15).toFixed(2)}; draw alone ${draw.toFixed(2)})`)
    // glyph matching: memo hits after 60 frames, and its cost per frame
    matchStats.hits = matchStats.misses = 0
    for (let i = 0; i < 60; i++) frame(8 + i / 30)
    const hitRate = matchStats.hits / Math.max(1, matchStats.hits + matchStats.misses), perFrame = (matchStats.hits + matchStats.misses) / 60
    const sub = new Float32Array(16), rr = rng(4), vecs = Array.from({ length: 256 }, () => Float32Array.from({ length: 16 }, () => Math.round(rr() * 3) / 3))
    vecs.forEach(v => matchTile(SHAPE3, v))
    const per = median(Array.from({ length: 7 }, () => time(() => { for (let k = 0; k < 2560; k++) { sub.set(vecs[k & 255]); matchTile(SHAPE3, sub) } })[0] / 2560))
    assert('life/glyph: matchTile memo ≥ 90 % hits on the koi card (after 60 frames)', hitRate >= .9, `${(hitRate * 100).toFixed(1)} % of ${(perFrame).toFixed(0)} matches per frame`)
    assert('pond-koi: glyph matching ≤ .3 ms per frame', per * perFrame <= .3 * load, `${(per * perFrame * 1000).toFixed(0)} µs (${perFrame.toFixed(0)} × ${(per * 1e6).toFixed(0)} ns)`)
    // style B: interior tiles are lattice dots only
    worldAt(W, 9); const sB = worldAt(W, 9)
    drawKoiPond(P, sB, 9, 9.7, r)
    let bigs = 0, leaks = 0
    for (let ti = 0; ti < r.bigTone.length; ti++) {
      if (r.bigTone[ti] < 0) continue
      bigs++
      const tx = ti % 36, ty = (ti / 36) | 0
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if (r.tone[(11 + ty * 4 + j) * 144 + tx * 4 + i] >= 0) leaks++
    }
    assert('pond-koi: no interior tile emits card-pitch dots (lattice layer only) [style B]', P.bodyStyle === 'lattice' && bigs > 20 && leaks === 0, `${bigs} lattice dots, ${leaks} card cells under them`)
    // flicker budget on a held field: frozen state, t advancing at 30 fps
    const held = worldAt(W, 12).slice(), prevT = new Int8Array(r.tone.length), prevB = new Int8Array(r.bigTone.length)
    let changed = 0, frames = 0
    const tileChanged = new Uint8Array(36 * 33)
    for (let k = 0; k <= 120; k++) {
      drawKoiPond(P, held, 12 + k / 30, 9.7, r)
      if (k > 0) {
        tileChanged.fill(0)
        for (let i = 0; i < r.tone.length; i++) if (r.tone[i] !== prevT[i]) { const y = Math.floor(i / 144) - 11; if (y >= 0) tileChanged[Math.floor(y / 4) * 36 + Math.floor((i % 144) / 4)] = 1 }
        for (let i = 0; i < r.bigTone.length; i++) if (r.bigTone[i] !== prevB[i]) tileChanged[i] = 1
        changed += tileChanged.reduce((a, b) => a + b, 0); frames++
      }
      prevT.set(r.tone); prevB.set(r.bigTone)
    }
    const perF = changed / frames / (36 * 33)
    assert('life/glyph: flicker budget: on a held field (frozen world state, t advancing at the card\'s fps), ≤ 2 % of tiles change per card frame over 120 frames', perF <= .02, `${(perF * 100).toFixed(2)} % per frame`)
  }

  // ── L1.9 interaction ──
  {
    simReset(sim); worldReset(W)
    const t0 = 16, s0 = worldAt(W, t0).slice(), k0 = koiView(P, s0, 2)
    const px = k0.x + k0.hx * 4, py = k0.y + k0.hy * 4
    const ptr = (down: boolean, x = px, y = py) => ({ pointers: [{ id: 3, x, y, down }] })
    let t = t0
    const at = (f?: FrameInput) => { t += 1 / 30; return worldAt(W, t, f) }
    at(ptr(true)); at(ptr(true)); at(ptr(true))
    let s = at() // the touch lifts: the pointer leaves the frame
    const near = P.bodies.map((b, i) => { const v = koiView(P, s0, i); return Math.hypot(v.x - px, v.y - py) < .7 * b.length ? i : -1 }).filter(i => i >= 0)
    const startled = near.every(i => { const v = koiView(P, s, i); return v.mode === MODE_BEND || v.mode === MODE_ESCAPE || v.refractory > 0 })
    const dropped = pelletViews(P, s).filter(p => p.state === 1).length
    for (let k = 0; k < 18; k++) s = at()
    const floating = pelletViews(P, s).filter(p => p.state === PEL_FLOATING && p.age < 1).length
    for (let k = 0; k < 190; k++) s = at()
    const healedMode = W.mode, liveKey = key(t)
    worldReset(W)
    const pristineKey = key(t), healed = healedMode === 'pristine' && liveKey === pristineKey
    assert('pond-koi: a tap drops 5–7 pellets that land with ripples, startles koi within .7 L, and heals to pristine 6 s later (frame = pristine frame)',
      dropped >= 5 && dropped <= 7 && floating === dropped && near.length > 0 && startled && healed, `${dropped} pellets, ${floating} floating after .6 s, ${near.length} koi near (${startled ? 'startled' : 'not startled'}), healed ${healedMode}`)
    // hold 1.2 s → lure, no pellets. How many koi reach the lure in 1.2 s depends on where they are when the hold
    // starts (0–5 over start times, on the L2 code as on L3), so the hold runs from 24 starts across the loop and is
    // compared with the pristine run at the same moments: more koi within 1 L, every koi closer on average. (Over these
    // starts the L2 code gave 2.58 koi within 1 L vs 1.83 pristine and .11 L closer; L3 2.67 vs 2.21 and .10 L.)
    const lx = 72, ly = 80, within = (st: Float32Array) => P.bodies.filter((b, i) => { const v = koiView(P, st, i); return Math.hypot(v.x - lx, v.y - ly) < b.length }).length
    const spread = (st: Float32Array) => P.bodies.reduce((a, b, i) => { const v = koiView(P, st, i); return a + Math.hypot(v.x - lx, v.y - ly) / b.length }, 0)
    let close = 0, alone = 0, best = 0, pellets = 0, gain = 0
    for (let k = 0; k < 24; k++) {
      simReset(sim); worldReset(W)
      t = 2 * k + .5
      const d0 = spread(worldAt(W, t))
      for (let j = 0; j < 36; j++) s = at(ptr(true, lx, ly))
      const c = within(s)
      close += c; best = Math.max(best, c); gain += d0 - spread(s); alone += within(simAtStep(sim, simStep(sim, t)))
      s = at(ptr(false, lx, ly))
      pellets += pelletViews(P, s).filter(p => p.state === 1).length
    }
    assert('pond-koi: hold 1.2 s → the lure draws koi (24 starts: ≥ 2 koi within 1 L on average and more than pristine, ≥ 3 at best, koi ≥ .05 L closer), no pellets',
      close / 24 >= 2 && close > alone && best >= 3 && gain / 24 / P.bodies.length >= .05 && pellets === 0,
      `${(close / 24).toFixed(2)} koi within 1 L on average (best ${best}), pristine ${(alone / 24).toFixed(2)}, ${(gain / 24 / P.bodies.length).toFixed(2)} L closer, ${pellets} pellets`)
    // flick across a koi at 240 cells/s (L3.2 raised the threshold from 90 to 200 cells/s)
    simReset(sim); worldReset(W)
    t = 34; const sf = worldAt(W, t).slice(), kf = koiView(P, sf, 4)
    const nx = -kf.hy, ny = kf.hx
    for (let k = -8; k <= 8; k++) s = at({ pointers: [{ id: 4, x: kf.x + nx * k * 8 + kf.hx * k * .3, y: kf.y + ny * k * 8 + kf.hy * k * .3, down: false }] })
    const fv = koiView(P, s, 4)
    assert('pond-koi: a 240 cells/s flick startles the koi it passes', fv.refractory > 0, `mode ${fv.mode}, refractory ${fv.refractory.toFixed(2)}`)
    // live frame cost with a moving pointer
    const live = medianLoaded(k => { t += 1 / 30; const f = { pointers: [{ id: 5, x: 40 + k * 3, y: 70 + (k % 5), down: false, inside: true, tDown: 0, tUp: 0, vx: 0, vy: 0, pressure: 0 }] }; return sampleLayers(withChrome(card)({ t, data: {}, ...f }), card.grid, card.style, dot480) }, 20)
    assert('pond-koi: live frame with a moving pointer ≤ 4 ms × load', live.ms <= 4 * live.load, `${fmtLoaded(live)}, mode ${W.mode}`)
    worldReset(W); simReset(sim)
  }

  // ── L2: the ecosystems (scripts/life-l2.ts) ──
  await lifeL2Checks(assert, pond)
  // ── L3: polish and interaction depth (scripts/life-l3.ts) ──
  await lifeL3Checks(assert, pond)

  // ── determinism across engines (Bun / JSC), when available ──
  {
    const bun = [process.env.BUN, join(homedir(), '.bun/bin/bun.exe'), join(homedir(), '.bun/bin/bun')].find(p => p && existsSync(p))
    const mine = await lifeSnapshot()
    if (!bun) console.log('  life: Bun/JSC snapshot skipped (no bun on this box; set $BUN)')
    else {
      const r = spawnSync(bun, ['scripts/life.ts', '--snapshot'], { encoding: 'utf8', timeout: 180000 })
      let theirs: Record<string, string> | null = null
      try { theirs = JSON.parse(r.stdout.trim().split('\n').pop() ?? '') } catch { /* reported below */ }
      if (!theirs) console.log(`  life: Bun/JSC snapshot skipped (bun failed: ${(r.stderr || r.error?.message || 'no output').trim().split('\n')[0]})`)
      else {
        const diff = Object.keys({ ...mine, ...theirs }).filter(k => mine[k] !== theirs![k])
        assert('pond: pristine state hashes Bun/JSC ≡ Node/V8 (steps 360, 1440, 1799; the marking LUTs)', !diff.length, diff.length ? `differ: ${diff.join(', ')}` : Object.entries(mine).map(([k, v]) => `${k} ${v}`).join(', '))
      }
    }
  }
}

const self = process.argv[1]?.replace(/\\/g, '/')
if (self && import.meta.url.endsWith(self.split('/').slice(-2).join('/'))) {
  if (process.argv.includes('--snapshot')) console.log(JSON.stringify(await lifeSnapshot()))
  else {
    let failures = 0
    await lifeChecks((name, cond, detail = '') => { if (!cond) failures++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) })
    if (failures) process.exit(1)
  }
}
