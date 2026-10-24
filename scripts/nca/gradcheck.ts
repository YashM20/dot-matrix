/** Finite-difference check of the hand-written BPTT in core.ts on a tiny model.  npx tsx scripts/nca/gradcheck.ts */
import { makeTrainer, paramCount, rng, type Dims } from './core'

export function gradCheck(): { worst: number; checked: number } {
  const d: Dims = { W: 7, H: 6, C: 4, HID: 10, VIS: 2 }, R = rng(7)
  const target = new Float32Array(d.W * d.H * d.VIS).map(() => R() < .5 ? 1 : 0)
  const tr = makeTrainer(d, target, 4, .7)
  const params = new Float32Array(paramCount(d)).map(() => (R() - .5) * .6)
  const x0 = new Float32Array(tr.NP * d.C)
  for (let k = 0; k < tr.interior.length; k++) if (R() < .5) for (let c = 0; c < d.C; c++) x0[tr.interior[k] * d.C + c] = c === 0 ? .3 + R() * .6 : (R() - .5) * 2.4
  const total = (p: Float32Array) => { const r = tr.run(x0, 3, 11, p, null); return r.loss + r.over / (tr.interior.length * d.C) }
  const grad = new Float32Array(params.length)
  tr.run(x0, 3, 11, params, grad)
  let worst = 0, checked = 0
  for (let n = 0; n < 40; n++) {
    const i = (R() * params.length) | 0, eps = 2e-3, keep = params[i]
    params[i] = keep + eps; const a = total(params)
    params[i] = keep - eps; const b = total(params)
    params[i] = keep
    const fd = (a - b) / (2 * eps), an = grad[i], err = Math.abs(fd - an) / Math.max(1e-4, Math.abs(fd) + Math.abs(an))
    if (Math.abs(fd) + Math.abs(an) < 1e-6) continue
    checked++; worst = Math.max(worst, err)
  }
  return { worst, checked }
}
if (process.argv[1]?.endsWith('gradcheck.ts')) { const r = gradCheck(); console.log(`checked ${r.checked}, worst relative error ${r.worst.toExponential(2)}`) }
