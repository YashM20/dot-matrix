/**
 * WORKSHOP, the frost window (docs/living-matter/X-advanced.md #13, phase XM): one snowflake a day, grown on the glass by
 * Reiter's automaton (`engine/matter/reiter.ts`). The day picks a (β, γ) pair from a vetted table, so every visitor
 * sees the same flake that day and a new one tomorrow. The flake's cells are dots on a hex lattice (`hexSites`): the
 * rim turned to the board light catches it, the rim turned away and the spines a step under, the plates quieter
 * still; the cells freezing now are the card's red.
 * It grows over 9 s, holds, and sublimes back in 1.5 s; t = 0 is the flake all but finished.
 */
import { reiter, type Reiter } from '../../engine/matter/reiter'
import { hexSites } from '../../engine/algo/hex'
import { hash32 } from '../../engine/math'
import { fbm2 } from '../../engine/noise/gradient'
import { layer, type WidgetPreset } from '../types'
import type { Light, Vec3 } from '../../engine/light/shade'
import { cite, fnvBytes, LIGHT_DEFAULTS, lightKey, lru, matLight, mod, once, pad2, snapTorch, T, tile, type Pt } from './materials-shared'

/** Hex pitch (cells), the lattice (columns × rows, origin), the flake's centre site, its radius (cells of the lattice). */
export const FROST = { pitch: 1.85, cols: 74, rows: 82, origin: [72 - 36 * 1.85, 16] as Pt, cc: 36, rc: 40, radius: 34, grow: 9, hold: 4.5, melt: 1.5, offset: 8.7, front: 6 }
/**
 * The vetted (β, γ) pairs: each grows a flake that reaches the rim with arms, not a blob (under 48% of the disc frozen,
 * checked in scripts/materials/growth.ts). Plates and sectored plates at low γ, stellar dendrites higher up.
 */
export const FLAKES: readonly (readonly [number, number])[] = [
  [.35, .001], [.4, .001], [.4, .0001], [.45, .0005], [.5, .001], [.55, .003], [.6, .001], [.65, .0001],
  [.7, .0003], [.4, .005], [.5, .01], [.3, .0001], [.8, .002],
]
/** Today's table row: the local date's yyyymmdd, hashed. */
export const flakeOf = (d: Date) => hash32(d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(), 1301) % FLAKES.length
const flakes = lru<Reiter>(2)
export const flake = (k: number) => flakes(`${k}`, () => reiter({ radius: FROST.radius, beta: FLAKES[k][0], gamma: FLAKES[k][1], maxSteps: 6000 }))
/** The lattice: every site of the pane (hexSites, odd rows shifted), and the site of each flake cell. */
const lattice = once(() => hexSites(FROST.cols, FROST.rows, { pitch: FROST.pitch, origin: FROST.origin }))
const siteOf = (q: number, r: number): Pt => {
  // axial (q, r) round the centre site → odd-r offset (the centre row is even)
  const row = FROST.rc + r, col = FROST.cc + q + Math.floor(r / 2)
  return lattice()[row * FROST.cols + col]
}
/** The step shown at t (pristine: grow over 9 s, hold, sublime newest first), and whether it is still growing. */
export function frostStep(t: number, steps: number): { n: number; growing: boolean } {
  const P = FROST.grow + FROST.hold + FROST.melt, p = mod(t + FROST.offset, P)
  if (p < FROST.grow) return { n: Math.round(steps * p / FROST.grow), growing: true }
  if (p < FROST.grow + FROST.hold) return { n: steps, growing: false }
  return { n: Math.round(steps * (1 - (p - FROST.grow - FROST.hold) / FROST.melt)), growing: false }
}
/** Hoar on the glass: sparse faint sites where the corners' noise is high, away from the flake's disc. */
const hoar = once(() => {
  const out: Pt[] = [], [cx, cy] = siteOf(0, 0), reach = (FROST.radius + 2) * FROST.pitch
  for (let j = 0; j < FROST.rows; j++) for (let i = 0; i < FROST.cols; i++) {
    const [x, y] = lattice()[j * FROST.cols + i], d = Math.hypot(x - cx, y - cy)
    if (d < reach || x < 3 || x > 141 || y > 128) continue
    if (fbm2(x / 9, y / 9, 3, 83) + Math.min(1, (d - reach) / 40) * .6 > .55) out.push([x, y])
  }
  return out
})
const groups = lru<Record<'mid' | 'idle' | 'value' | 'active', Pt[]>>(4)
export const matFrost: WidgetPreset = {
  ...tile, id: 'mat-frost', name: 'Frost', clock: true,
  credit: { by: ['Clifford A. Reiter'], title: 'A local cellular model for snow crystal growth', source: 'https://webbox.lafayette.edu/~reiterc/mvp/sfn/sfn_pp.pdf', note: 'the automaton' },
  defaults: { ...LIGHT_DEFAULTS },
  layers: ctx => {
    const now = new Date(), k = flakeOf(now), f = flake(k), { n, growing } = frostStep(ctx.reducedMotion ? 0 : ctx.t, f.steps)
    const L: Light = snapTorch(matLight(ctx, { torch: { height: 30, falloff: 160 } }), 6), dir = Array.isArray(L) ? L as Vec3 : null, torch = dir ? null : (L as { at: Vec3 }).at
    const g = groups(`${k}|${n}|${growing}|${lightKey(L)}`, () => {
      const out: Record<'mid' | 'idle' | 'value' | 'active', Pt[]> = { mid: [], idle: [], value: [], active: [] }, F = f.frozeAt, N = F.length
      const on = (i: number) => i >= 0 && F[i] >= 0 && F[i] <= n
      // neighbours by axial offset: the disc is indexed row by row, so find them through a small map
      const at = new Map<number, number>()
      for (let i = 0; i < N; i++) at.set((f.r[i] + 64) * 128 + f.q[i] + 64, i)
      const nb = (i: number, dq: number, dr: number) => at.get((f.r[i] + dr + 64) * 128 + f.q[i] + dq + 64) ?? -1
      for (let i = 0; i < N; i++) {
        if (!on(i)) continue
        const p = siteOf(f.q[i], f.r[i])
        if (growing && F[i] > n - FROST.front * f.steps / 200) { out.active.push(p); continue }
        // the rim's outward normal: the sum of the directions to its open neighbours (card space)
        let ox = 0, oy = 0, rim = false
        for (const [dq, dr] of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]) if (!on(nb(i, dq, dr))) { rim = true; ox += dq + dr / 2; oy += dr * .866 }
        if (rim) {
          // turned to the light: value; turned away: idle (a torch lights from where it hangs)
          const lx = dir ? dir[0] : torch![0] - p[0], ly = dir ? dir[1] : torch![1] - p[1]
          out[ox * lx + oy * ly > 0 ? 'value' : 'idle'].push(p)
          continue
        }
        // inside: the spines (the water the cell kept growing, s well over 1) a step over the plates
        out[f.s[i] > 1.25 ? 'idle' : 'mid'].push(p)
      }
      return out
    })
    const date = now.toLocaleString('en-US', { month: 'short' }).toUpperCase()
    return [
      cite('REITER 2005'),
      layer(T.dots(hoar(), .9), 'faint'),
      ...(['mid', 'idle', 'value'] as const).filter(t => g[t].length).map(t => layer(T.dots(g[t], t === 'mid' ? 1.3 : 1.5), t)),
      ...(g.active.length ? [layer(T.dots(g.active, 1.5), 'active')] : []),
      layer(T.text(`${date} ${pad2(now.getDate())}`, 6, 135), 'mid'),
      layer(T.text(`FLAKE ${pad2(k + 1)}/${FLAKES.length}`, 138, 135, { align: 'right' }), 'mid'),
    ]
  },
}

/** Table row k's flake as one hash of the steps its cells froze at (Node and Chrome must agree, bit for bit). */
export const flakeHash = (k: number) => fnvBytes(flake(k).frozeAt)
if (typeof location !== 'undefined' && /[?&]probe=1(&|$)/.test(location.search)) (globalThis as { __frost?: unknown }).__frost = { hash: flakeHash }

export const frostHooks = { FROST, FLAKES, flakeOf, flake, frostStep, siteOf, flakeHash }
