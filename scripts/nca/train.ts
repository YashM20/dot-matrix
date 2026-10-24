/**
 * Train the Growing-NCA lizard (Mordvintsev et al. 2020, "regenerating" experiment): sample pool, the
 * highest-loss sample of each batch reset to the seed, the lowest-loss ones damaged (discs and half-plane
 * cuts), 24–52 unrolled steps per iteration, BPTT by hand (core.ts), per-tensor gradient normalisation,
 * Adam. Pure CPU, plain TypeScript, no dependencies; the batch is split over worker threads.
 *
 *   npx tsx scripts/nca/train.ts --minutes 15 --smin 24 --smax 36                              # fresh
 *   npx tsx scripts/nca/train.ts --resume --minutes 12 --smin 36 --smax 52 --damage 0 --lr 6e-4  # refine
 *
 * The shipped lizard is one fresh 15-min session plus two resumed 12-min sessions (lr 1e-3 with 28–40 steps,
 * then 6e-4 with 36–52): 2,625 + 1,059 + 690 iterations. A fourth session made it worse and was dropped.
 *
 * Writes src/assets/nca/lizard.ts (Int8 asset) and scripts/nca/lizard.f32.txt (float weights, for --resume).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { Worker } from 'node:worker_threads'
import { ncaModel } from '../../src/engine/nca'
import { makeTrainer, paramCount, rng, seedState, views, type Dims } from './core'
import { lizardTarget, GRID_H, GRID_W, SEED_AT } from './target'
import { toAsset, writeAsset } from './asset'
import { evaluate, pickXray, STEP_DT } from './eval'

const arg = (k: string, d: number) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d }
const MINUTES = arg('minutes', 12), WORKERS = arg('workers', 4), BATCH = arg('batch', 4), POOL = arg('pool', 128)
const S0 = arg('smin', 28), S1 = arg('smax', 40), LR0 = arg('lr', 2e-3), SEED = arg('seed', 1), DAMAGE_FROM = arg('damage', .25)
const dims: Dims = { W: GRID_W, H: GRID_H, C: arg('ch', 12), HID: arg('hid', 48), VIS: 2 }
const FLOAT_FILE = 'scripts/nca/lizard.f32.txt', ASSET_FILE = 'src/assets/nca/lizard.ts'

const target = lizardTarget(), R = rng(SEED * 7919)
const tr = makeTrainer(dims, target, S1)
const NPC = tr.NP * dims.C
const seed = seedState(dims, SEED_AT[0], SEED_AT[1])
const grownCells = (() => { let n = 0; for (let i = 0; i < target.length; i += 2) if (target[i] > .5) n++; return n })()

// params: glorot-uniform w1, zero b1, zero w2 (the paper's "do nothing" start)
let params = new Float32Array(paramCount(dims))
let prior = { iterations: 0, seconds: 0, sessions: 0 }
{
  const { w1 } = views(dims, params), lim = Math.sqrt(6 / (3 * dims.C + dims.HID))
  for (let i = 0; i < w1.length; i++) w1[i] = (R() * 2 - 1) * lim
}
if (process.argv.includes('--resume') && existsSync(FLOAT_FILE)) {
  const saved = Float32Array.from(JSON.parse(readFileSync(FLOAT_FILE, 'utf8')) as number[])
  if (saved.length === params.length) {
    params = saved
    // carry the earlier sessions' totals into the asset's provenance
    const prev = (await import('../../src/assets/nca/lizard')).lizardNca.meta ?? {}
    prior = { iterations: Number(prev.iterations ?? 0), seconds: Number(prev.seconds ?? 0), sessions: Number(prev.sessions ?? 1) }
    console.log('resumed from', FLOAT_FILE, prior)
  }
}
const m1 = new Float32Array(params.length), m2 = new Float32Array(params.length)
const tensors = (() => { const P = 3 * dims.C, a = dims.HID * P, b = a + dims.HID; return [[0, a], [a, b], [b, params.length]] as [number, number][] })()

const pool = Array.from({ length: POOL }, () => seed.slice())
/** Damage: a disc on the body (r 2.5–7 cells) or a half-plane cut through the body (about half of it). */
function damage(x: Float32Array): void {
  const C = dims.C, W = dims.W, H = dims.H, keep = x.slice()
  const body: [number, number][] = []
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) if (target[(y * W + xx) * 2] > .5) body.push([xx, y])
  const [cx, cy] = body[(R() * body.length) | 0]
  const half = R() < .5, r = 2.5 + R() * 4.5, a = R() * Math.PI * 2, nx = Math.cos(a), ny = Math.sin(a)
  const ox = SEED_AT[0] + (R() - .5) * 6, oy = SEED_AT[1] + (R() - .5) * 8
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
    const hit = half ? (xx + .5 - ox) * nx + (y + .5 - oy) * ny > 0 : (xx + .5 - cx) ** 2 + (y + .5 - cy) ** 2 < r * r
    if (hit) x.fill(0, ((y + 1) * (W + 2) + xx + 1) * C, ((y + 1) * (W + 2) + xx + 2) * C)
  }
  let alive = 0
  for (let k = 0; k < tr.interior.length; k++) if (x[tr.interior[k] * C] > .1) alive++
  if (alive < 4) x.set(keep)
}

const workers = Array.from({ length: Math.max(1, Math.min(WORKERS, BATCH)) }, () => new Worker(new URL('./worker.ts', import.meta.url), { workerData: { dims, target, maxSteps: S1 } }))
type Reply = { grad: Float32Array; results: { loss: number; over: number; out: Float32Array }[] }
const ask = (w: Worker, msg: unknown) => new Promise<Reply>(res => { w.once('message', res); w.postMessage(msg) })

function save(meta: Record<string, number | string>) {
  writeFileSync(FLOAT_FILE, JSON.stringify(Array.from(params, v => Number(v.toPrecision(7)))))
  if (!existsSync('src/assets/nca')) mkdirSync('src/assets/nca', { recursive: true })
  const asset = toAsset(dims, params, { name: 'lizard', seedAt: SEED_AT, fire: .5, grown: grownCells, meta })
  writeAsset(ASSET_FILE, 'lizardNca', asset)
  return asset
}

const t0 = performance.now(), budget = MINUTES * 60e3
let it = 0, ema = NaN
const log: string[] = []
while (performance.now() - t0 < budget) {
  const frac = (performance.now() - t0) / budget
  const lr = frac < .6 ? LR0 : LR0 * (1 - .85 * Math.min(1, (frac - .6) / .35))
  // batch: unique pool indices, sorted by loss (worst first)
  const idx: number[] = []
  while (idx.length < BATCH) { const i = (R() * POOL) | 0; if (!idx.includes(i)) idx.push(i) }
  const losses = new Map(idx.map(i => [i, tr.lossOf(pool[i])]))
  idx.sort((a, b) => losses.get(b)! - losses.get(a)!)
  const xs = idx.map(i => pool[i].slice())
  xs[0] = seed.slice()
  const nDamage = frac < DAMAGE_FROM ? 0 : Math.max(1, Math.round(BATCH * 3 / 8))
  for (let k = 0; k < nDamage; k++) damage(xs[BATCH - 1 - k])
  const steps = S0 + ((R() * (S1 - S0 + 1)) | 0)
  // split over workers
  const share = workers.map(() => [] as { x: Float32Array; steps: number; seed: number }[])
  xs.forEach((x, k) => share[k % workers.length].push({ x, steps, seed: (R() * 4294967296) >>> 0 }))
  const replies = await Promise.all(workers.map((w, k) => share[k].length ? ask(w, { params, jobs: share[k] }) : Promise.resolve(null)))
  const grad = new Float32Array(params.length)
  let loss = 0, over = 0
  const outs: Float32Array[] = new Array(BATCH)
  replies.forEach((r, k) => {
    if (!r) return
    for (let i = 0; i < grad.length; i++) grad[i] += r.grad[i]
    r.results.forEach((res, j) => { loss += res.loss; over += res.over; outs[k + j * workers.length] = res.out })
  })
  loss /= BATCH
  // per-tensor normalisation, then Adam
  for (const [a, b] of tensors) {
    let n = 0
    for (let i = a; i < b; i++) n += grad[i] * grad[i]
    const k = 1 / (Math.sqrt(n) + 1e-8)
    for (let i = a; i < b; i++) grad[i] *= k
  }
  it++
  const c1 = 1 - .9 ** it, c2 = 1 - .999 ** it
  for (let i = 0; i < params.length; i++) {
    const g = grad[i]
    m1[i] = .9 * m1[i] + .1 * g; m2[i] = .999 * m2[i] + .001 * g * g
    params[i] -= lr * (m1[i] / c1) / (Math.sqrt(m2[i] / c2) + 1e-8)
  }
  idx.forEach((i, k) => { if (outs[k] && outs[k].length === NPC) pool[i] = outs[k] })
  ema = Number.isNaN(ema) ? loss : .9 * ema + .1 * loss
  if (it % 10 === 0) {
    const line = `it ${String(it).padStart(4)}  ${((performance.now() - t0) / 1e3).toFixed(0).padStart(4)} s  steps ${steps}  loss ${loss.toFixed(5)}  ema log10 ${Math.log10(ema).toFixed(3)}  over ${over.toFixed(3)}  lr ${lr.toExponential(1)}`
    console.log(line); log.push(line)
  }
  if (it % 100 === 0) save({ iterations: prior.iterations + it, seconds: prior.seconds + Math.round((performance.now() - t0) / 1e3), sessions: prior.sessions + 1, loss: Number(ema.toPrecision(4)) })
}
const seconds = Math.round((performance.now() - t0) / 1e3)
const meta = { iterations: prior.iterations + it, seconds: prior.seconds + seconds, sessions: prior.sessions + 1, loss: Number(ema.toPrecision(4)), batch: BATCH, pool: POOL, steps: `${S0}-${S1}` }
for (const w of workers) await w.terminate()
const asset = save({ ...meta, xray: pickXray(ncaModel(save(meta))).join(',') })
const ev = evaluate(ncaModel(asset), target)
console.log(`\ntrained ${it} iterations in ${seconds} s, final loss (ema) ${ema.toExponential(3)}`)
console.log(`params ${params.length}, asset Int8 ${params.length - dims.HID} B + ${dims.HID * 3} scales/bias`)
console.log(`grown: IoU .9 at step ${ev.grownStep}, IoU ${ev.grownIou.toFixed(3)} at 200, mse ${ev.grownMse.toFixed(4)}; IoU after +400 steps ${ev.longIou.toFixed(3)}`)
for (const c of ev.cuts) console.log(`  cut ${c.name.padEnd(12)} removed ${(c.removed * 100).toFixed(0)}%  back in ${c.steps} steps (${(c.steps * STEP_DT).toFixed(2)} s at 30 steps/s), IoU ${c.iou.toFixed(3)} vs uncut twin ${c.twin.toFixed(3)}`)
