/**
 * Checks for the Turing skin (docs/living-matter/X-advanced.md #15, `pond-turing`): Gray-Scott on a growing body
 * (turingSkin.ts, turing.ts) and its card. The solver: u and v stay finite and in [0, 1] on every body cell over a
 * life, a run is bit-equal from its seed (and differs for another seed), the module is inside the determinism lint.
 * The growth: the spot count at the end of growth is ≥ 3× the hatchling's, it never falls by more than one between
 * seconds while the fish grows, and spots are seen splitting. The loop: one step past the loop's last is bit-equal to
 * its start (the wrap needs no blend), and the card's frame change across the wrap is no bigger than a normal step's.
 * The card: t = 0 content, one accent, pure in t; a tap scratches a spot off, the pattern regrows into the gap and the world heals back; violent
 * input stays finite; frame budget (a warning unless DOT_TIMING=strict).
 * Called from scripts/life.ts (`lifeChecks`); also runnable alone: `npx tsx scripts/life-turing.ts`.
 */
import { createTuring, growth, lifeOf, turingPose, SKIN_NX, SKIN_NY, type Turing } from '../src/engine/life/turing'
import { spotCount, turingSpots } from '../src/engine/life/turingView'
import { simAtStep, simLoop, simReset } from '../src/engine/sim'
import { worldAt, worldReset, type FrameInput, type StepInput } from '../src/engine/physics/world'
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
const pristine: StepInput = { pointers: [], gx: 0, gy: 0, kick: false, live: -1, quiet: Infinity }
/** Body cells with u or v outside [0, 1] or not finite. */
const outOfRange = (T: Turing, s: Float32Array) => {
  let bad = 0
  for (const c of T.skin.cells) { const u = s[T.layout.U + c], v = s[T.layout.V + c]; if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) bad++ }
  return bad
}
const spotsAt = (T: Turing, s: Float32Array, n: number) => { const [lx, ly] = growth(T.spec, lifeOf(T, n)); return turingSpots(T, s, lx, ly) }

/** The pristine Turing state hashes at fixed steps (the cross-engine snapshot in scripts/life.ts reads them). */
export async function turingSnapshot(pond: () => Promise<PondModule>): Promise<Record<string, string>> {
  const { pondProbe } = await pond(), W = pondProbe.turing.world
  simReset(W.sim)
  const out: Record<string, string> = {}
  for (const n of [300, 1200, 1700]) out[`turing@${n}`] = fnv(simAtStep(W.sim, n))
  simReset(W.sim)
  return out
}

export async function lifeTuringChecks(assert: Assert, pond: () => Promise<PondModule>): Promise<void> {
  const { pondBoard, pondProbe } = await pond(), P = pondProbe.turing, W = P.world, sim = W.sim
  // ── the solver ──
  {
    const spec = { ...P.spec, period: 8, units: 3000 }
    const run = (seed: number) => { const t = createTuring({ ...spec, seed }); return fnv(simAtStep(t.world.sim, 200)) }
    const a = run(11), b = run(11), c = run(12)
    assert('turing: a run is reproducible from its seed (fresh worlds bit-equal after 200 steps; another seed differs)', a === b && a !== c, `${a} ${b} ${c}`)
    const det = detLint(['src/engine/life/turing'])
    assert('det: no engine-specific Math in the Turing skin (turing, turingSkin, turingView)', !det.violations.length && det.scanned.length === 3, det.violations.map(v => `${v.file}:${v.line} ${v.rule}`).join('; ') || `${det.scanned.length} files`)
  }

  // ── the life: range, growth, splitting, the loop ──
  {
    simReset(sim); worldReset(W)
    const [, len] = simLoop(sim), sec = Math.round(1 / W.spec.dt)
    let bad = 0, fell = 0, split = 0
    const counts: [number, number][] = []
    for (let n = 0; n < len; n += sec) {
      const s = simAtStep(sim, n), lam = lifeOf(P, n), m = spotsAt(P, s, n)
      bad += outOfRange(P, s)
      if (m.splitting >= 0) split++
      counts.push([lam, spotCount(m)])
    }
    assert(`turing: u and v stay finite and in [0, 1] on all ${P.skin.cells.length} body cells over a life (every second)`, bad === 0, `${bad} out`)
    const young = counts.find(([l]) => l >= P.spec.lifeAt - 1e-9)![1], grown = Math.max(...counts.filter(([l]) => l > .8 && l < .86).map(c => c[1]))
    const growing = counts.filter(([l]) => l >= .12 && l < .86).sort((a, b) => a[0] - b[0])
    for (let i = 1; i < growing.length; i++) if (growing[i][1] < growing[i - 1][1] - 1) fell++
    assert('turing: the spots multiply as the body grows (≥ 3× the young fish\'s count by the end of growth, never falling by more than one a second)', grown >= 3 * young && fell === 0, `${young} → ${grown} spots, ${fell} drops`)
    assert('turing: spots are seen splitting (a spot stretched past the split ratio) in ≥ 8 of the life\'s seconds', split >= 8, `${split} s`)
    // one step past the last: the egg plus the same steps as the init, bit-equal to the loop's start
    const end = simAtStep(sim, len - 1).slice()
    W.spec.step(end, len - 1, pristine)
    assert('turing: the loop closes exactly (one step past the last is bit-equal to the loop\'s start, no seam blend)', fnv(end) === fnv(simAtStep(sim, 0)), `${fnv(end)} vs ${fnv(simAtStep(sim, 0))}`)
  }

  // ── the card ──
  const card = pondBoard.find(p => p.id === 'pond-turing') as WidgetPreset
  const frame = (t: number, extra: object = {}) => sampleLayers(withChrome(card)({ t, data: {}, ...extra }), card.grid, card.style, dot480)
  const key = (t: number) => JSON.stringify(frame(t))
  {
    simReset(sim); worldReset(W)
    const f0 = frame(0), white = f0.filter(d => d.color === dot480.value).length
    const off = frame(1.3).filter(d => ![dot480.dotFaint, dot480.dotMid, dot480.dotIdle, dot480.value, dot480.dotActive].includes(d.color)).length
    assert('pond-turing: t = 0 draws a spotted fish (≥ 400 dots, ≥ 40 spot dots), in the palette (dotActive the only accent, no dotActiveDim)', f0.length >= 400 && white >= 40 && off === 0, `${f0.length} dots, ${white} spot dots, ${off} off-palette`)
    let reds = 0
    for (let t = 0; t < 48; t += 2) if (frame(t).some(d => d.color === dot480.dotActive)) reds++
    assert('pond-turing: the accent (the splitting spot) shows in some frames but not all (every 2 s over the loop)', reds >= 3 && reds < 24, `${reds} of 24`)
    const ts = [0, 1.3, 7.7, 3600.2, 20], first = ts.map(key), again = [...ts].reverse().map(key).reverse()
    simReset(sim)
    const cold = key(7.7)
    assert('pond-turing: pristine is pure in t (0, 1.3, 7.7, 3600.2, 20, any order, after a cold replay)', first.every((k, i) => k === again[i]) && cold === first[2])
    const [, len] = simLoop(sim), dt = W.spec.dt
    const set = (t: number) => new Set(frame(t).map(d => `${d.x},${d.y},${d.r},${d.color}`))
    const change = (a: Set<string>, b: Set<string>) => { let d = 0; for (const x of a) if (!b.has(x)) d++; for (const x of b) if (!a.has(x)) d++; return d / Math.max(a.size, b.size) }
    const wrap = change(set((len - 1) * dt), set(len * dt)), normal = change(set(20), set(20 + dt))
    assert('pond-turing: seam: the frame change across the loop wrap ≤ 1.5 × an ordinary step\'s change (+ 5 %)', wrap <= 1.5 * normal + .05, `${(wrap * 100).toFixed(1)} % at the wrap, ${(normal * 100).toFixed(1)} % normally`)

    // a tap on the biggest spot scratches it off; the pattern regrows into the gap; the world heals back to pristine
    simReset(sim); worldReset(W)
    let t = 10
    const n0 = Math.round(t / dt), p = turingPose(P, lifeOf(P, n0)), big = spotsAt(P, simAtStep(sim, n0).slice(), n0).spots.sort((a, b) => b.cells - a.cells)[0]
    const tx = p.headX - (big.x + .5) * p.px, ty = p.midY + ((big.y + .5) / SKIN_NY * 2 - 1) * (SKIN_NY / 2) * p.py
    const disc = (st: Float32Array) => { let a = 0; for (const c of P.skin.cells) if (Math.hypot((c % SKIN_NX) - big.x, ((c / SKIN_NX) | 0) - big.y) < 7) a += st[P.layout.V + c]; return a }
    worldAt(W, t)
    const at = (f?: FrameInput) => { t += 1 / 18; return worldAt(W, t, f) }
    for (let k = 0; k < 3; k++) at({ pointers: [{ id: 7, x: tx, y: ty, down: true }] })
    let s = at({ pointers: [{ id: 7, x: tx, y: ty, down: false }] })
    const now = () => simAtStep(sim, W.liveN)
    const gone = disc(s) / disc(now())
    let back = 0
    for (let k = 0; k < 18 * 5; k++) { s = at(); back = Math.max(back, disc(s) / disc(now())) }
    assert('pond-turing: a tap on a spot forks the world and scratches it off (v in the patch < 15 % of pristine); within 5 s the pattern regrows into it (≥ 70 %)', W.mode !== 'pristine' && gone < .15 && back >= .7, `${W.mode}, ${(gone * 100).toFixed(0)} % → ${(back * 100).toFixed(0)} %`)
    let healed = false, inRange = true
    for (let k = 0; k < 18 * 12 && !healed; k++) { s = at(); if (outOfRange(P, s)) inRange = false; healed = W.mode === 'pristine' }
    assert('pond-turing: idle after the tap, the world heals back to pristine within 12 s, u and v in range throughout', healed && inRange, `${W.mode}`)
    worldReset(W)
    let r = 3, bad = 0
    const rnd = () => { r = (Math.imul(r ^ (r >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) | 0; return ((r ^ (r >>> 13)) >>> 0) / 4294967296 }
    const resets = W.resets
    for (let k = 0; k < 300; k++) { t += 1 / 18; bad += outOfRange(P, worldAt(W, t, { pointers: [{ id: 1, x: rnd() * 160 - 8, y: rnd() * 160 - 8, down: rnd() < .5 }], kick: rnd() < .05 })) }
    assert('pond-turing: 300 frames of violent random input keep u and v finite and in range (resets = 0)', bad === 0 && W.resets === resets, `${bad} out, resets ${W.resets - resets}`)
    worldReset(W)
    // frame budget, warm, pristine (the hatchling's young body needs the most substeps)
    for (let i = 0; i < 6; i++) frame(2 + i / 18)
    const fr = medianLoaded(i => frame(3 + i / 18), 15)
    assert('pond-turing: frame (2 steps + layers + sample) ≤ 4 ms median warm × load', fr.ms <= 4 * fr.load, fmtLoaded(fr))
    console.log(`  life: turing frame ${fmtLoaded(fr)}`)
    simReset(sim); worldReset(W)
  }
}

const self = process.argv[1]?.replace(/\\/g, '/')
if (self && import.meta.url.endsWith(self.split('/').slice(-2).join('/'))) {
  const { assert, done } = (await import('./lib/check')).checker('life-turing')
  const { freezeWallClock } = await import('./lib/freeze')
  await lifeTuringChecks(assert, async () => { freezeWallClock(); return import('../src/widgets/boards/pond/index') })
  done()
}
