/**
 * C2 checks: physics engine (`src/engine/physics`) and the `physics` board.
 * Called from verify.ts (`physicsChecks(assert)`); also runnable alone: `npx tsx scripts/physics.ts`.
 * Covers: pristine determinism in any call order (and after a cold replay), seamless loops, solver invariants
 * (divergence, no new ink extrema, disc overlap, cloth strain, jelly area), a NaN / high-dt stress run with
 * violent input, the interactions (swipe → splash → migrate home, grab → throw, stir, grab cloth, poke + heal)
 * and per-card frame time at 144².
 */
import { sampleLayers } from '../src/engine/sampler/gridSampler'
import { dot480 } from '../src/engine/theme/tokens'
import { simAtStep, simLoop, simReset } from '../src/engine/sim'
import {
  clothInit, clothMaxStrain, clothSize, clothStep, createCloth, createFluid, createParticles, createSoft, fluidInk, fluidMaxDivergence, fluidSize, fluidSplat, fluidStep,
  particlesEnergy, particlesMaxOverlap, particlesSize, particlesStep, P_DYNAMIC, setParticle, softArea, softInit, softSize, softStep, worldAt, worldReset,
} from '../src/engine/physics'
import type { Pointer } from '../src/engine/context'
import type { DotInstance } from '../src/engine/types'
import { withChrome, type WidgetPreset } from '../src/widgets'
import { physicsBoard, physicsProbe, physicsWorlds } from '../src/widgets/boards/physics'

type Assert = (name: string, cond: boolean, detail?: string) => void
const fnv1a = (str: string, h = 0x811c9dc5) => { for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h >>> 0 }
const q = (d: DotInstance) => `${d.x.toFixed(2)},${d.y.toFixed(2)},${d.r.toFixed(3)},${d.opacity.toFixed(3)},${d.color}`
const hashDots = (ds: DotInstance[]) => { let h = 0x811c9dc5; for (const k of ds.map(q).sort()) h = fnv1a(k + ';', h); return h }
const ptr = (x: number, y: number, down: boolean, id = 1): Pointer => ({ id, x, y, inside: x >= 0 && y >= 0 && x < 144 && y < 144, down, tDown: 0, tUp: 0, vx: 0, vy: 0, pressure: down ? .5 : 0 })
const frame = (p: WidgetPreset, t: number, pointers?: Pointer[], data: Record<string, number> = {}) =>
  sampleLayers(withChrome(p)({ t, data, pointers }), p.grid, p.style, dot480)
const worldOf = (p: WidgetPreset) => physicsWorlds[physicsBoard.indexOf(p)]
const maxAbs = (a: Float32Array, b: Float32Array, n = a.length) => { let m = 0; for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m }
const finite = (a: Float32Array) => a.every(Number.isFinite)
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1] }
const resetAll = () => { for (const w of physicsWorlds) worldReset(w) }

export function physicsChecks(assert: Assert): void {
  resetAll()
  const [splash, ink, flag, jelly, pit] = physicsBoard

  // ── determinism: pristine frames are a pure function of t, in any order and after a cold replay ──
  const ts = [0, 1.3, 7.7, 3600.2]
  let same = true
  for (const p of physicsBoard) {
    const fwd = ts.map(t => hashDots(frame(p, t))), back = [...ts].reverse().map(t => hashDots(frame(p, t))).reverse()
    simReset(worldOf(p).sim)
    const cold = ts.map(t => hashDots(frame(p, t)))
    if (fwd.some((h, i) => h !== back[i] || h !== cold[i])) { same = false; console.log(`  ${p.id}: ${fwd} / ${back} / ${cold}`) }
  }
  assert('physics: pristine cards are pure in t (forward = reverse = cold replay, t up to 3600 s)', same)

  // ── loops: the wrap is seamless (continuous worlds pulled onto the start; splash / pit are periodic) ──
  const seams = physicsWorlds.map((w, i) => {
    const [start, len] = simLoop(w.sim), s0 = simAtStep(w.sim, start).slice()
    const exact = i === 0 || i === 4, end = simAtStep(w.sim, exact ? start + len : start + len - 1).slice()
    const n = i === 0 ? particlesSize(physicsProbe.sp) : i === 4 ? particlesSize(physicsProbe.pit) : s0.length
    let scale = 0; for (let k = 0; k < n; k++) scale = Math.max(scale, Math.abs(s0[k]))
    return maxAbs(end, s0, n) / (scale || 1)
  })
  assert('physics: loops wrap without a jump (relative state gap at the seam ≤ 4%, splash/pit exact)', seams.every((g, i) => g <= (i === 0 || i === 4 ? 1e-5 : .04)), seams.map(g => g.toExponential(1)).join(' '))

  // ── solver invariants ──
  const fl = createFluid({ w: 32, h: 32 }), fs = new Float32Array(fluidSize(fl))
  fluidSplat(fl, fs, 16, 8, 2, 0, 40, 1); fluidSplat(fl, fs, 8, 20, 2, 30, -10, 1)
  const ink0 = fluidInk(fl, fs)
  let speed = 0
  for (let i = 0; i < 60; i++) fluidStep(fl, fs, 1 / 30)
  for (let c = 0; c < fl.n; c++) speed = Math.max(speed, Math.hypot(fs[fl.U + c], fs[fl.V + c]))
  let dmax = 0; for (let c = 0; c < fl.n; c++) dmax = Math.max(dmax, fs[fl.D + c])
  const div = fluidMaxDivergence(fl, fs)
  assert('physics fluid: projected velocity is near divergence-free, ink never gains mass or new extrema', finite(fs) && div < .08 * Math.max(1, speed) && fluidInk(fl, fs) <= ink0 * 1.001 && dmax <= 1.5,
    `max |div| ${div.toFixed(3)} at speed ${speed.toFixed(1)}, ink ${ink0.toFixed(2)} → ${fluidInk(fl, fs).toFixed(2)}`)

  const N = 60, pr = new Float32Array(N).map((_, i) => 2 + (i % 4)), ps = createParticles({ n: N, radius: pr, bounds: [0, 0, 80, 80] }), pst = new Float32Array(particlesSize(ps))
  for (let i = 0; i < N; i++) setParticle(ps, pst, i, 6 + (i % 10) * 7, 4 + Math.floor(i / 10) * 9, (i % 3 - 1) * 80, 0, 1 / 60, P_DYNAMIC)
  for (let i = 0; i < 900; i++) particlesStep(ps, pst, 1 / 60)
  const overlap = particlesMaxOverlap(ps, pst), energy = particlesEnergy(ps, pst)
  let inside = true; for (let i = 0; i < N; i++) if (pst[ps.X + i] < pr[i] - .01 || pst[ps.X + i] > 80 - pr[i] + .01 || pst[ps.Y + i] > 80 - pr[i] + .01) inside = false
  assert('physics particles: a 60-disc pile settles inside the box with shallow contacts (spatial hash)', inside && overlap < .6 && energy < .5, `overlap ${overlap.toFixed(3)} cells, energy ${energy.toFixed(4)}`)

  const cl = createCloth({ cols: 16, rows: 12, spacing: 5, origin: [0, 0, 0], pin: (_, j) => j === 0, lift: 6 }), cs = new Float32Array(clothSize(cl))
  clothInit(cl, cs)
  for (let i = 0; i < 600; i++) clothStep(cl, cs, 1 / 60, { wind: (_p, x, _y, _z, o) => { o[0] = 10; o[1] = 0; o[2] = 30 + 30 * Math.sin(.1 * x - i * .2) } })
  const strain = clothMaxStrain(cl, cs)
  assert('physics cloth: a pinned sheet in gusting wind stays within 15% strain', finite(cs) && strain < .15, `max strain ${(strain * 100).toFixed(1)}%`)

  const sb = createSoft({ count: 32, cx: 50, cy: 50, rx: 20, ry: 15, bounds: [0, 0, 100, 80] }), ss = new Float32Array(softSize(sb))
  softInit(sb, ss)
  for (let i = 0; i < 120; i++) softStep(sb, ss, 1 / 60, { pokes: [{ x: 50, y: 20 + i * .3, r: 14 }] })
  const squashed = softArea(sb, ss)
  for (let i = 0; i < 300; i++) softStep(sb, ss, 1 / 60)
  const area = softArea(sb, ss)
  assert('physics soft body: jelly keeps its area under a poke and recovers', finite(ss) && Math.abs(squashed / sb.area0 - 1) < .25 && Math.abs(area / sb.area0 - 1) < .08,
    `area ${(squashed / sb.area0 * 100).toFixed(0)}% poked → ${(area / sb.area0 * 100).toFixed(0)}% rest`)

  // ── stress: violent input, huge and tiny frame gaps, extreme tilt → never a NaN, never a bigger step ──
  resetAll()
  let bad = '', resets = 0, dropped = 0
  for (const p of physicsBoard) {
    const w = worldOf(p)
    let t = 20, seed = 1
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let f = 0; f < 300; f++) {
      t += f === 150 ? 30 : rnd() < .1 ? .5 : 1 / (30 + rnd() * 114)
      const pointers = rnd() < .85 ? [ptr(-150 + rnd() * 450, -150 + rnd() * 450, rnd() < .6)] : undefined
      const data = { gx: (rnd() - .5) * 6, gy: (rnd() - .5) * 6, [p.controls![0].key]: rnd() < .05 ? 1 : 0 }
      const dots = frame(p, t, pointers, data)
      if (dots.some(d => !Number.isFinite(d.x) || !Number.isFinite(d.y) || !Number.isFinite(d.r))) { bad = `${p.id} frame ${f}`; break }
      if (w.mode !== 'pristine' && !finite(w.live)) { bad = `${p.id} state ${f}`; break }
    }
    resets += w.resets; dropped += w.dropped
  }
  assert('physics: 300 violent frames per card (pointers off-card, 6 g tilt, 30 s gap) stay finite, time is dropped not stretched', !bad && resets === 0 && dropped > 0, bad || `resets ${resets}, dropped steps ${dropped}`)

  // ── interactions ──
  resetAll()
  const run = (p: WidgetPreset, t0: number, secs: number, at: (k: number) => Pointer[] | undefined, fps = 60) => {
    let t = t0
    for (let i = 0; i <= secs * fps; i++) { t = t0 + i / fps; frame(p, t, at(i / fps)) }
    return t
  }
  // splash: a fast swipe across the word knocks dots loose; untouched for 3.5 s, they are all home again
  let t = run(splash, 19.3, .4, k => [ptr(-5 + k * 400, 64, false)])
  const hit = physicsProbe.splash(worldOf(splash).live)
  t = run(splash, t, 3.5, () => undefined)
  const back = physicsProbe.splash(worldOf(splash).live)
  assert('physics splash: a swipe knocks the word\'s dots loose, they settle and migrate back into text', hit.free > 40 && back.free === 0 && back.flying === 0 && back.home > 100,
    `knocked ${hit.free} (home ${hit.home}), after 3.5 s home ${back.home}, word ${back.word}`)

  // pit: press on a ball, drag up-right fast, let go: it was held, then flies
  resetAll()
  const w4 = worldOf(pit)
  const b0 = physicsProbe.ball(worldAt(w4, 19), 3)
  t = run(pit, 19, .25, k => [ptr(b0.x + k * 240, b0.y - k * 240, true)])
  const held = physicsProbe.ball(w4.live, 3)
  t = run(pit, t, 1 / 60, () => [ptr(b0.x + 60, b0.y - 60, false)])
  const thrown = physicsProbe.ball(w4.live, 3)
  assert('physics pit: grab a dot, it follows the hand; let go, it is thrown', held.grab === 3 && Math.hypot(held.x - (b0.x + 60), held.y - (b0.y - 60)) < 8 && thrown.grab === -1 && Math.hypot(thrown.vx, thrown.vy) > 120,
    `held at ${held.x.toFixed(0)},${held.y.toFixed(0)} (hand ${(b0.x + 60).toFixed(0)},${(b0.y - 60).toFixed(0)}), thrown at ${Math.hypot(thrown.vx, thrown.vy).toFixed(0)} cells/s`)

  // ink: a pressed stir adds ink and moves it; flag: grab and pull a corner; jelly: poke, then it heals back
  resetAll()
  const pristineInk = fluidInk(physicsProbe.fluid, worldAt(worldOf(ink), 50.5))
  resetAll()
  run(ink, 50, .5, k => [ptr(30 + k * 160, 90 + 20 * Math.sin(k * 12), true)])
  const stirred = fluidInk(physicsProbe.fluid, worldOf(ink).live)
  assert('physics ink: a pressed stroke stirs and adds ink', worldOf(ink).mode === 'live' && stirred > pristineInk + .5, `ink ${pristineInk.toFixed(1)} → ${stirred.toFixed(1)}`)

  resetAll()
  const { cloth } = physicsProbe, w3 = worldOf(flag)
  frame(flag, 60)
  const corner = (14) * cloth.cols + 20, cx = worldAt(w3, 60)[cloth.X + corner], cy = worldAt(w3, 60)[cloth.Y + corner]
  run(flag, 60, .5, k => [ptr(cx - k * 40, cy + k * 10, true)])
  const fs3 = w3.live, grabbed = physicsProbe.flagGrab(fs3)
  assert('physics flag: press grabs the nearest cloth dot and drags it', grabbed >= 0 && Math.hypot(fs3[cloth.X + grabbed] - (cx - 20), fs3[cloth.Y + grabbed] - (cy + 5)) < 1, `grabbed ${grabbed}`)

  resetAll()
  const w5 = worldOf(jelly)
  t = run(jelly, 70, .6, k => [ptr(72, 60 + k * 60, false)])
  const poked = w5.mode
  t = run(jelly, t, 5.5, () => undefined, 30)
  const healed = w5.mode, hNow = hashDots(frame(jelly, t))
  resetAll()
  const hPristine = hashDots(frame(jelly, t))
  assert('physics jelly: a hand pokes it live; 3 s idle + 1.5 s later it has healed onto the pristine loop', poked === 'live' && healed === 'pristine' && hNow === hPristine, `${poked} → ${healed}`)

  // ── frame time at 144²: pristine playback (12 fps tier) and live with a moving pointer (60 fps) ──
  resetAll()
  const timing = physicsBoard.map(p => {
    for (let i = 0; i < 6; i++) frame(p, 100 + i / 12)
    const calm = Array.from({ length: 24 }, (_, i) => { const a = performance.now(); frame(p, 100.5 + i / 12); return performance.now() - a })
    const live = Array.from({ length: 60 }, (_, i) => { const a = performance.now(); frame(p, 103 + i / 60, [ptr(20 + i * 2, 70 + 10 * Math.sin(i / 5), i > 20 && i < 40)]); return performance.now() - a })
    return { id: p.id, calm: median(calm), live: median(live) }
  })
  resetAll()
  const worst = Math.max(...timing.map(r => Math.max(r.calm, r.live)))
  assert('physics: every card ≤ 4 ms per frame at 144² (pristine and live)', worst <= 4, timing.map(r => `${r.id} ${r.calm.toFixed(2)}/${r.live.toFixed(2)}`).join(', ') + ' ms')
}

const self = process.argv[1]?.replace(/\\/g, '/')
if (self && import.meta.url.endsWith(self.split('/').slice(-2).join('/'))) {
  let failures = 0
  physicsChecks((name, cond, detail = '') => { if (!cond) failures++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) })
  if (failures) process.exit(1)
}
