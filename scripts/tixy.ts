/**
 * Checks for the tixy adapter (`src/widgets/tixy.ts`, issue #53): coercion, clamping, sign → tone, index order,
 * quantized sizes, determinism and per-card state. Run alone: `npx tsx scripts/tixy.ts`.
 * Every test program here is written for these checks; none is taken from tixy.land (#52).
 */
import { sampleLayers } from '../src/engine/sampler/gridSampler'
import { dot480 } from '../src/engine/theme/tokens'
import type { Layer } from '../src/engine/types'
import { TIXY_N, tixy, tixyFrame, tixyValue, type TixyProgram } from '../src/widgets/tixy'
import { TILE, tileStyle } from '../src/widgets/types'

const { assert, done } = (await import('./lib/check')).checker('tixy')
const ctx = (t: number) => ({ t, data: {} })
const N2 = TIXY_N * TIXY_N

// ── coercion and clamping
assert('true → 1, false → 0', tixyValue(true) === 1 && tixyValue(false) === 0)
assert('NaN → 0', tixyValue(NaN) === 0)
assert('clamp to [-1, 1]', tixyValue(7) === 1 && tixyValue(-3.5) === -1 && tixyValue(Infinity) === 1 && tixyValue(-Infinity) === -1)
assert('values inside the range pass through', tixyValue(.25) === .25 && tixyValue(-.5) === -.5 && tixyValue(0) === 0)
assert('a non-number (bad cast) → 0', tixyValue(undefined as unknown as number) === 0 && tixyValue('1' as unknown as number) === 0)

// ── index order: i = y * 16 + x, x and y in 0..15
const seen: [number, number, number][] = []
tixyFrame((_t, i, x, y) => (seen.push([i, x, y]), 0), 0)
assert('256 calls per frame', seen.length === N2, `${seen.length}`)
assert('i = y * 16 + x on every call', seen.every(([i, x, y]) => i === y * 16 + x))
assert('row-major order, i counts up from 0', seen.every(([i], k) => i === k))
assert('x and y in 0..15', seen.every(([, x, y]) => x >= 0 && x < 16 && y >= 0 && y < 16) && seen[N2 - 1][1] === 15 && seen[N2 - 1][2] === 15)
const ramp = tixyFrame((_t, _i, x) => x / 15, 0)
assert('frame stores out[i] at i = y * 16 + x', Math.abs(ramp[16 + 5] - 5 / 15) < 1e-6 && Math.abs(ramp[3] - 3 / 15) < 1e-6)

// ── t from the card clock, in seconds
const tSeen: number[] = []
tixyFrame(t => (tSeen.push(t), 0), 2.5)
assert('t is passed through unchanged', tSeen.every(t => t === 2.5))

// ── layers: sign → tone, through the sampler
const split: TixyProgram = (_t, _i, x) => (x < 8 ? -1 : 1) // left half negative, right half positive
const layersOf = (p: TixyProgram, t = 0, opts = {}) => tixy(p, opts)(ctx(t))
const ls = layersOf(split)
assert('two layers: default tone, then accent', ls.length === 2 && ls[0].tone === 'value' && ls[1].tone === 'active')
assert('both on the same 8-cell lattice', ls.every(l => l.lattice === 8) && ls[0].origin?.join() === ls[1].origin?.join(), `${ls[0].origin}`)
const dots = sampleLayers(ls, TILE, tileStyle, dot480)
const accent = dots.filter(d => d.color === dot480.dotActive), plain = dots.filter(d => d.color === dot480.value)
assert('one dot per lattice cell (16 × 16)', dots.length === N2, `${dots.length}`)
assert('negative values draw in the accent', accent.length === N2 / 2, `${accent.length}`)
assert('positive values draw in the default tone', plain.length === N2 / 2, `${plain.length}`)
const midX = Math.max(...accent.map(d => d.x))
assert('accent on the left half, default on the right', plain.every(d => d.x > midX))
const zero = sampleLayers(layersOf(() => 0), TILE, tileStyle, dot480)
assert('0 draws nothing', zero.length === 0, `${zero.length}`)
const nan = sampleLayers(layersOf(() => NaN), TILE, tileStyle, dot480)
assert('NaN draws nothing', nan.length === 0)
const big = sampleLayers(layersOf(() => -40), TILE, tileStyle, dot480), unit = sampleLayers(layersOf(() => -1), TILE, tileStyle, dot480)
assert('clamped: -40 draws like -1', big.length === unit.length && big.every((d, k) => d.r === unit[k].r && d.color === unit[k].color))

// ── quantized sizes
const valuesOf = (l: Layer) => { const out = new Set<number>(); for (let r = 0; r < 16; r++) for (let c = 0; c < 17; c++) out.add(l.field(c / 16, r / 15)); return out }
const smooth: TixyProgram = (_t, i) => i / 255 * 2 - 1
const qs = layersOf(smooth).flatMap(l => [...valuesOf(l)])
assert('field values sit on the 5 quantize steps', qs.every(v => Math.abs(v * 4 - Math.round(v * 4)) < 1e-9), [...new Set(qs)].sort().join(' '))
const radii = new Set(sampleLayers(layersOf(smooth), TILE, tileStyle, dot480).map(d => d.r.toFixed(4)))
assert('a smooth ramp draws at most 4 lit sizes', radii.size <= 4, `${radii.size}`)

// ── determinism
const wave: TixyProgram = (t, i, x, y) => Math.sin(x * .7 - t * 3) * Math.cos(y * .45 + i * .01)
const a = tixyFrame(wave, 1.25), b = tixyFrame(wave, 1.25)
assert('same t → same frame', a.every((v, k) => v === b[k]))
const card = tixy(wave), d1 = sampleLayers(card(ctx(.5)), TILE, tileStyle, dot480)
card(ctx(3)) // an unrelated frame in between
const d2 = sampleLayers(card(ctx(.5)), TILE, tileStyle, dot480)
assert('same t → same dots, in any call order', d1.length === d2.length && d1.every((d, k) => d.x === d2[k].x && d.r === d2[k].r && d.color === d2[k].color))
const early = card(ctx(1)), late = card(ctx(2))
assert('layers kept from an earlier call keep their own t', early[0].field(.5, .5) !== late[0].field(.5, .5) || early[1].field(.5, .5) !== late[1].field(.5, .5))

// ── per-card state, stepped at a fixed dt from a known state
// A counter per cell: starts at the cell's column, adds one each step, wraps at 16.
const counter = { dt: .25, init: (s: Float32Array) => { for (let i = 0; i < N2; i++) s[i] = i % 16 }, step: (src: Float32Array, dst: Float32Array) => { for (let i = 0; i < N2; i++) dst[i] = (src[i] + 1) % 16 } }
const fromState: TixyProgram = (_t, i, _x, _y, s) => s[i] / 15
const stateful = tixy(fromState, { state: counter })
const at = (t: number) => { const ls = stateful(ctx(t)); return Array.from({ length: 16 }, (_, x) => ls[0].field(x / 16, 0)) }
assert('t = 0 shows the known initial state', at(0).every((v, x) => Math.abs(v - Math.round(x / 15 * 4) / 4) < 1e-9), at(0).join(' '))
const s1 = at(1) // 4 steps
assert('state steps at dt (t = 1 s → 4 steps)', s1.every((v, x) => Math.abs(v - Math.round(((x + 4) % 16) / 15 * 4) / 4) < 1e-9), s1.join(' '))
at(3)
assert('state replays: back to t = 1 gives the same row', at(1).every((v, x) => v === s1[x]))
const twin = tixy(fromState, { state: counter })
assert('each card owns its state (a second card starts fresh)', twin(ctx(0))[0].field(1 / 16, 0) === at(0)[1])

done('tixy checks passed')
