/**
 * Minimal programmatic acceptance harness.
 * Run: npx tsx src/engine/verify-acceptance.ts
 *   or: node --experimental-strip-types src/engine/verify-acceptance.ts (Node >=22)
 *   or: npm run verify (if wired)
 * Checks quantize ladder, Poisson-disc distance, ECG vs sine waveform shape.
 */
import { quantize } from './sampler/quantize'
import { poissonDiscPoints, scatterField } from './fields/scatterField'
import { sumOfSinesAmplitudes, ecgAmplitudes, traceField, amplitudeField } from './fields/waveformField'

let failures = 0
function assert(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`)
  else { console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`); failures++ }
}

// 1) quantize
assert('quantize steps<2 returns bounded', quantize(0.33, 1) === 0.33)
assert('quantize 0 stays 0', quantize(0, 5) === 0)
assert('quantize 1 stays 1', quantize(1, 5) === 1)
assert('quantize 5-step ladder', quantize(0.5, 5) === 0.5 && quantize(0.24, 5) === 0.25 && quantize(0.76, 5) === 0.75, `0.5→${quantize(0.5,5)} 0.24→${quantize(0.24,5)} 0.76→${quantize(0.76,5)}`)
assert('quantize clips', quantize(-1, 5) === 0 && quantize(2, 5) === 1)
assert('quantize quantizeSteps=0 off', quantize(0.37, 0) === 0.37)

// 2) Poisson-disc — minDistance respected & deterministic
{
  const pts = poissonDiscPoints(100, 100, 12, 42)
  let minD = Infinity
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) minD = Math.min(minD, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]))
  assert('poisson minDistance respected', pts.length > 10 && minD + 1e-6 >= 12, `n=${pts.length} minD=${minD.toFixed(2)}`)
  const pts2 = poissonDiscPoints(100, 100, 12, 42)
  assert('poisson deterministic seed', JSON.stringify(pts) === JSON.stringify(pts2))
  // scatterField hits near point and misses far
  const f = scatterField([[10, 10], [90, 90]], 4, 100, 100)
  assert('scatterField near point ≈1', f(0.1, 0.1) > 0.9)
  assert('scatterField far ≈0', f(0.5, 0.5) < 0.1)
}

// 3) Waveform: sumOfSines vs ecgAmplitudes shape & motion
{
  const n = 64
  const a0 = sumOfSinesAmplitudes(n, 0)
  const a1 = sumOfSinesAmplitudes(n, 0.7)
  assert('sine amplitudes bounded 0..1', a0.every(v => v >= 0 && v <= 1))
  assert('sine moves with t', a0.some((v, i) => Math.abs(v - a1[i]) > 0.015))
  // sine uses spec f1=2.1 f2=5.7 phi=1.3 — shape should be low-variance vs ECG spikes
  const variance = (arr: number[]) => { const m = arr.reduce((s, v) => s + v, 0) / arr.length; return arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length }
  const vs = variance(a0)
  const ecg = ecgAmplitudes(n, 0)
  const ve = variance(ecg)
  assert('ecg variance ≠ sine variance (spiky)', Math.abs(ve - vs) > 0.002, `var sine=${vs.toFixed(4)} ecg=${ve.toFixed(4)}`)
  assert('ecg bounded ≈0..1.2 (gaussian peak may exceed 1)', ecg.every(v => v >= 0 && v <= 1.2), `min ${Math.min(...ecg).toFixed(3)} max ${Math.max(...ecg).toFixed(3)}`)
  assert('ecg shifts with t', ecgAmplitudes(n, 0).some((v, i) => Math.abs(v - ecgAmplitudes(n, 0.5)[i]) > 0.02))
  // traceField vs amplitudeField district
  assert('traceField renders thin line at amp', traceField([0.5], 0.02)(0.5, 0.5) > 0.9)
  assert('amplitudeField bar below amp is 1', amplitudeField([0.5])(0.5, 0.2) === 1)
}

if (failures) { console.error(`\n${failures} check(s) failed`); (globalThis as unknown as { process?: { exit: (c:number)=>void}}).process?.exit(1); throw new Error(`${failures} check(s) failed`) }
else console.log('\nAll acceptance checks passed')
