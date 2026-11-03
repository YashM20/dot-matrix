/**
 * Checks for the plankton (docs/living-matter/X-advanced.md #4, `pond-plankton`): Particle Lenia (lenia.ts) and its
 * card. The solver: mean energy goes down over the first steps from a loose clump, the gradient matches finite
 * differences of the energy, a run is bit-equal from its seed (and differs for another seed). The world: the particle
 * count holds (every particle finite and in the dish over a loop and under violent input), the matched blend only
 * renumbers at k = 0, the loop's clumps become ≥ 3 creatures. The card: t = 0 content, one accent, pure in t, the
 * seam, a tap bursts a creature that re-forms and the world heals back; frame budget (a warning unless DOT_TIMING=strict).
 * Called from scripts/life.ts (`lifeChecks`); also runnable alone: `npx tsx scripts/life-plankton.ts`.
 */
import { createLenia, leniaEnergy, leniaFields, leniaStep, LENIA_ROTOR } from '../src/engine/life/lenia'
import { matchBlend } from '../src/engine/life/match'
import { createPlankton, PLANKTON_PARAMS, PLANKTON_SCALE, type PlanktonSpec } from '../src/engine/life/plankton'
import { planktonCreatures } from '../src/engine/life/planktonView'
import { rngFor } from '../src/engine/noise/dmath'
import { simAtStep, simLoop, simReset } from '../src/engine/sim'
import { worldAt, worldReset, type FrameInput } from '../src/engine/physics/world'
import { sampleLayers } from '../src/engine/sampler/gridSampler'
import { dot480 } from '../src/engine/theme/tokens'
import { withChrome, type WidgetPreset } from '../src/widgets/types'
import { detLint } from './lib/detLint'
import { fmtLoaded, medianLoaded } from './lib/load'

type Assert = (name: string, cond: boolean, detail?: string) => void
type PondModule = typeof import('../src/widgets/boards/pond/index')
const fnv = (a: ArrayLike<number>) => {
  let h = 0x811c9dc5
  const f = new Float32Array(1), u = new Uint32Array(f.buffer)
  for (let i = 0; i < a.length; i++) { f[0] = a[i]; const w = u[0]; for (let b = 0; b < 4; b++) { h ^= (w >>> (8 * b)) & 0xff; h = Math.imul(h, 0x01000193) >>> 0 } }
  return h.toString(16).padStart(8, '0')
}
/** A loose seeded clump of `n` particles, radius `r`, at (20, 20). */
function clump(n: number, r: number, seed: number): Float32Array {
  const s = new Float32Array(2 * n), rng = rngFor(seed, 1)
  for (let i = 0; i < n; i++) { const a = 6.283185307179586 * rng(), d = r * Math.sqrt(rng()); s[i] = 20 + d * Math.cos(a); s[n + i] = 20 + d * Math.sin(a) }
  return s
}

/** The pristine plankton state hashes at fixed steps (the cross-engine snapshot in scripts/life.ts reads them). */
export async function planktonSnapshot(pond: () => Promise<PondModule>): Promise<Record<string, string>> {
  const { pondProbe } = await pond(), W = pondProbe.plankton.world
  simReset(W.sim)
  const out: Record<string, string> = {}
  for (const n of [450, 2000, 4319]) out[`plankton@${n}`] = fnv(simAtStep(W.sim, n))
  simReset(W.sim)
  return out
}

export async function lifePlanktonChecks(assert: Assert, pond: () => Promise<PondModule>): Promise<void> {
  // ── the solver ──
  {
    const n = 120, L = createLenia(PLANKTON_PARAMS, n, [0, 0, 40, 40]), s = clump(n, 5, 7), e: number[] = [leniaEnergy(L, s, 0, n)]
    for (let k = 1; k <= 60; k++) { leniaStep(L, s, 0, n, .2); if (k % 5 === 0) e.push(leniaEnergy(L, s, 0, n)) }
    const down = e.every((v, i) => i === 0 || v < e[i - 1])
    assert('plankton/lenia: mean energy goes down over the first 60 steps from a loose clump (every 5 steps)', down && e[e.length - 1] < e[0] - .3, e.map(v => v.toFixed(3)).join(' → '))
    // ∇E against central differences of E_i(p_i) (moving one particle, the others fixed)
    const L2 = createLenia(LENIA_ROTOR, n, [0, 0, 40, 40]), t = clump(n, 6, 9)
    let worst = 0
    for (const i of [3, 40, 99]) {
      leniaFields(L2, t, 0, n)
      const z = (L2.U[i] - .6) / .15, g = Math.exp(-z * z), dg = (-2 * z / .15) * g
      const gx = L2.RX[i] - dg * L2.UX[i]
      const Ei = () => { leniaFields(L2, t, 0, n); const zz = (L2.U[i] - .6) / .15; return L2.R[i] - Math.exp(-zz * zz) }
      const x0 = t[i], h = 1e-3
      t[i] = x0 + h; const ep = Ei(); t[i] = x0 - h; const em = Ei(); t[i] = x0
      worst = Math.max(worst, Math.abs((ep - em) / (2 * h) - gx))
    }
    assert('plankton/lenia: ∇E matches central differences of the energy (3 particles, |err| < 2e-3)', worst < 2e-3, `worst ${worst.toExponential(2)}`)
    const spec: PlanktonSpec = { seed: 11, dish: { x: 72, y: 78, r: 62 }, clumps: [{ n: 60, x: 60, y: 70, r: 9 }, { n: 50, x: 96, y: 90, r: 8 }], period: 8, seam: 1, stir: 2 }
    const run = (seed: number) => { const p = createPlankton({ ...spec, seed }); return fnv(simAtStep(p.world.sim, 500)) }
    const a = run(11), b = run(11), c = run(12)
    assert('plankton: a run is reproducible from its seed (fresh worlds bit-equal after 500 steps; another seed differs)', a === b && a !== c, `${a} ${b} ${c}`)
    const det = detLint(['src/engine/life/lenia', 'src/engine/life/match', 'src/engine/life/plankton'])
    assert('det: no engine-specific Math in the plankton (lenia, match, plankton, planktonView)', !det.violations.length && det.scanned.length === 4, det.violations.map(v => `${v.file}:${v.line} ${v.rule}`).join('; ') || `${det.scanned.length} files`)
  }

  // ── the world ──
  const { pondBoard, pondProbe } = await pond(), P = pondProbe.plankton, W = P.world, sim = W.sim, { n, X, Y } = P.layout
  const card = pondBoard.find(p => p.id === 'pond-plankton') as WidgetPreset
  const frame = (t: number, extra: object = {}) => sampleLayers(withChrome(card)({ t, data: {}, ...extra }), card.grid, card.style, dot480)
  const key = (t: number) => JSON.stringify(frame(t))
  const R = P.spec.dish.r / PLANKTON_SCALE, cx = P.spec.dish.x / PLANKTON_SCALE, cy = P.spec.dish.y / PLANKTON_SCALE
  const inDish = (s: Float32Array) => { let bad = 0; for (let i = 0; i < n; i++) { const x = s[X + i], y = s[Y + i]; if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x - cx, y - cy) > R + 1.5) bad++ } return bad }
  {
    simReset(sim); worldReset(W)
    const [start, len] = simLoop(sim)
    let bad = 0, few = Infinity
    for (let k = 0; k <= start + len; k += 90) { const s = simAtStep(sim, k); bad += inDish(s); if (k >= 900 && k <= len - 900) few = Math.min(few, planktonCreatures(P, s).length) }
    assert(`plankton: the particle count holds over a loop (all ${n} finite and in the dish, every second)`, bad === 0, `${bad} out`)
    assert('plankton: the loop\'s clumps become ≥ 3 creatures and stay so until the stir', few >= 3, `fewest ${few}`)
    // the matched blend at k = 0 only renumbers: the same multiset of positions
    // (the seam's case: the stirred dish onto the loop's start; and two calm states 10 s apart)
    const blend = matchBlend({ n, X, Y, bounds: [0, 0, 80, 80], cell: 2 }), pts = (s: Float32Array) => Array.from({ length: n }, (_, i) => `${s[X + i]},${s[Y + i]}`).sort().join()
    const way = (a: Float32Array, b: Float32Array) => { let m = 0; for (let i = 0; i < n; i++) m += (a[X + i] - b[X + i]) ** 2 + (a[Y + i] - b[Y + i]) ** 2; return m / n }
    const rows: string[] = []
    let ok = true
    for (const [na, nb, gain] of [[len - 300, 0, .7], [2700, 1800, 1]] as const) {
      const a = simAtStep(sim, na).slice(), b = simAtStep(sim, nb).slice(), a0 = a.slice()
      blend(a, b, 0)
      const m = way(a, b), ix = way(a0, b)
      ok &&= pts(a) === pts(a0) && m <= gain * ix
      rows.push(`${na}→${nb}: ${m.toFixed(2)} vs ${ix.toFixed(2)} units²`)
    }
    assert('plankton: the matched blend renumbers only (k = 0 keeps the positions); its mean squared way home ≤ .7 × lerping by index across the seam, never more when calm', ok, rows.join(', '))
  }

  // ── the card ──
  {
    simReset(sim); worldReset(W)
    const f0 = frame(0), red = f0.filter(d => d.color === dot480.dotActive).length
    const off = frame(1.3).filter(d => ![dot480.dotFaint, dot480.dotMid, dot480.dotIdle, dot480.value, dot480.dotActive].includes(d.color)).length
    assert('pond-plankton: t = 0 draws the clumps (≥ 300 dots) with one accent (dotActive only, no dotActiveDim)', f0.length >= 300 && red >= 1 && off === 0, `${f0.length} dots, ${red} red, ${off} off-palette`)
    const ts = [0, 1.3, 7.7, 3600.2, 20], first = ts.map(key), again = [...ts].reverse().map(key).reverse()
    simReset(sim)
    const cold = key(7.7)
    assert('pond-plankton: pristine is pure in t (0, 1.3, 7.7, 3600.2, 20, any order, after a cold replay)', first.every((k, i) => k === again[i]) && cold === first[2])
    const [, len] = simLoop(sim), dt = W.spec.dt
    const set = (t: number) => new Set(frame(t).map(d => `${d.x},${d.y},${d.r},${d.color}`))
    const change = (a: Set<string>, b: Set<string>) => { let d = 0; for (const x of a) if (!b.has(x)) d++; for (const x of b) if (!a.has(x)) d++; return d / Math.max(a.size, b.size) }
    const wrap = change(set((len - 1) * dt), set(len * dt)), normal = change(set(20), set(20 + dt))
    assert('pond-plankton: seam: the frame change across the loop wrap ≤ 1.5 × an ordinary step\'s change (+ 5 %)', wrap <= 1.5 * normal + .05, `${(wrap * 100).toFixed(1)} % at the wrap, ${(normal * 100).toFixed(1)} % normally`)

    // a tap on the biggest creature bursts it; it re-forms; the world heals back to pristine
    simReset(sim); worldReset(W)
    let t = 12
    const s0 = worldAt(W, t), big = planktonCreatures(P, s0)[0], tx = big.x / PLANKTON_SCALE, ty = big.y / PLANKTON_SCALE
    const at = (f?: FrameInput) => { t += 1 / 18; return worldAt(W, t, f) }
    for (let k = 0; k < 3; k++) at({ pointers: [{ id: 7, x: tx, y: ty, down: true }] })
    at(); at()
    let s = at()
    for (let k = 0; k < 4; k++) s = at()
    const spread = (st: Float32Array) => { let m = 0; for (let i = 0; i < n; i++) { const d = Math.hypot(st[X + i] - tx, st[Y + i] - ty); if (d < 14) m += d } return m }
    const burst = planktonCreatures(P, s.slice()).length, sp0 = spread(s0.slice()), sp1 = spread(s.slice())
    for (let k = 0; k < 18 * 3; k++) s = at()
    const back = planktonCreatures(P, s.slice()).length
    assert('pond-plankton: a tap forks the world and bursts the creature under it (its particles spread); within 3 s it re-forms (≥ 3 creatures)', W.mode !== 'pristine' && sp1 > 1.1 * sp0 && back >= 3, `${W.mode}, spread ${sp0.toFixed(0)} → ${sp1.toFixed(0)}, creatures ${burst} → ${back}`)
    let healed = false, finite = true
    for (let k = 0; k < 18 * 12 && !healed; k++) { s = at(); if (inDish(s)) finite = false; healed = W.mode === 'pristine' }
    assert('pond-plankton: idle after the tap, the world heals back to pristine within 12 s, every particle in the dish', healed && finite, `${W.mode}`)
    // violent input stays finite
    worldReset(W)
    let r = 3, bad = 0
    const rnd = () => { r = (Math.imul(r ^ (r >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) | 0; return ((r ^ (r >>> 13)) >>> 0) / 4294967296 }
    const resets = W.resets
    for (let k = 0; k < 300; k++) { t += 1 / 18; const st = worldAt(W, t, { pointers: [{ id: 1, x: rnd() * 90 - 10, y: rnd() * 90 - 10, down: rnd() < .5 }], kick: rnd() < .05 }); bad += inDish(st) }
    assert('pond-plankton: 300 frames of violent random input keep every particle finite and in the dish (resets = 0)', bad === 0 && W.resets === resets, `${bad} out, resets ${W.resets - resets}`)
    worldReset(W)
    // frame budget, warm, pristine
    for (let i = 0; i < 6; i++) frame(40 + i / 18)
    const fr = medianLoaded(i => frame(41 + i / 18), 15)
    assert('pond-plankton: frame (5 steps + layers + sample) ≤ 4 ms median warm × load', fr.ms <= 4 * fr.load, fmtLoaded(fr))
    console.log(`  life: plankton frame ${fmtLoaded(fr)}`)
    simReset(sim); worldReset(W)
  }
}

const self = process.argv[1]?.replace(/\\/g, '/')
if (self && import.meta.url.endsWith(self.split('/').slice(-2).join('/'))) {
  const { assert, done } = (await import('./lib/check')).checker('life-plankton')
  const { freezeWallClock } = await import('./lib/freeze')
  await lifePlanktonChecks(assert, async () => { freezeWallClock(); return import('../src/widgets/boards/pond/index') })
  done()
}
