/**
 * Squares board, XQ (docs/living-matter/X-advanced.md #7): the hat floor.
 *
 *   HAT  Smith, Myers, Kaplan & Goodman-Strauss 2023: a level-3 H supertile of 1,156 hats, cropped to the card. The
 *        mirrored hats (about 1 in φ⁴ + 1) are the red; the rest take a grey by the metatile they sit in.
 *
 * The floor is baked once: every cell finds its kite on the hex grid, then its hat from the tiling's kite map
 * (`engine/algo/hat`). Each hat is one joined piece (join group = a greedy colouring of touching hats) ringed by one
 * cell of grout. One substitution level plays over 6 s: a front runs out from the centre and every level-0 metatile
 * (H, T, P, F, its hats fused into one piece) splits into its hats; later the pieces fuse back from the rim in.
 */
import { bakeHats, hatAt, type MetaKind } from '../../engine/algo/hat'
import type { Tone } from '../../engine/types'
import type { WidgetPreset } from '../types'
import { cardCells, cite, footer, mod, pad, tile, type Pt } from './squaresKit'

const ORIGIN: Pt = [0, 12], W = 144, H = 116, LEVEL = 3
/** Cells per kite short side (a hat is 6 sides across, so about 15 cells). */
const SCALE = 2.6
const LOOP = 12, SPLIT = 6, FUSE = 3, OFF = 7
const KIND_TONE: Record<MetaKind, Tone> = { H: 'mid', T: 'idle', P: 'faint', F: 'mid' }
const KIND_LEVEL: Record<MetaKind, number> = { H: .75, T: .5, P: .75, F: .5 }

export interface HatFloor {
  /** Hat index per cell (−1 = none); per hat its join group, mirror flag, metatile kind and cluster. */
  hat: Int32Array
  hatGroup: Uint8Array
  mirrored: Uint8Array
  kind: MetaKind[]
  cluster: Int32Array
  /** Per cluster its join group and the distance of its centre from the card's (cells). */
  clusterGroup: Uint8Array
  clusterDist: Float32Array
  /** Hats and mirrored hats on the card, and the farthest cluster centre (cells). */
  shown: number
  shownMirrored: number
  reach: number
}
let floor: HatFloor | undefined
/** Greedy colouring of a touch graph (8-neighbour cells of different ids): the lowest colour no neighbour has. */
function colour(ids: Int32Array, n: number): Uint8Array {
  // a hat touches about 8 others, so short arrays beat sets
  const nb: number[][] = Array.from({ length: n }, () => [])
  const touch = (a: number, b: number) => { if (b >= 0 && b !== a && !nb[a].includes(b)) { nb[a].push(b); nb[b].push(a) } }
  for (let r = 0; r < H; r++) for (let c = 0, j = r * W; c < W; c++, j++) {
    const a = ids[j]
    if (a < 0) continue
    // right, and the three cells below (each pair once)
    if (c + 1 < W) touch(a, ids[j + 1])
    if (r + 1 < H) { touch(a, ids[j + W]); if (c + 1 < W) touch(a, ids[j + W + 1]); if (c > 0) touch(a, ids[j + W - 1]) }
  }
  const seen = new Uint8Array(n).fill(255)
  for (let i = 0; i < n; i++) {
    let used = 0, g = 0
    for (const j of nb[i]) if (seen[j] < 31) used |= 1 << seen[j]
    while (used & (1 << g)) g++
    seen[i] = g
  }
  return seen
}
/** The baked floor (cached): kite lookup per cell, groups, and the cluster centres for the split front. */
export const hatFloor = (): HatFloor => (floor ??= bakeHatFloor())
/** `hatFloor` without the cache: the level-3 tiling, then every cell's kite and hat. */
export function bakeHatFloor(level = LEVEL): HatFloor {
  const t = bakeHats(level), hat = new Int32Array(W * H)
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) hat[r * W + c] = hatAt(t, (c + .5 - W / 2) / SCALE, (H / 2 - r - .5) / SCALE)
  const cluster = Int32Array.from(t.hats, h => h.cluster), byCluster = hat.map(i => (i < 0 ? -1 : cluster[i]))
  const nc = t.clusters.length, sx = new Float64Array(nc), sy = new Float64Array(nc), sn = new Float64Array(nc), seen = new Set<number>()
  let shownMirrored = 0
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const i = hat[r * W + c]
    if (i < 0) continue
    const k = cluster[i]
    sx[k] += c; sy[k] += r; sn[k]++
    // a hat counts as shown once it has a cell off the grout (right and lower neighbours in the same hat or off the floor)
    const j = r * W + c, right = c + 1 < W ? hat[j + 1] : i, down = r + 1 < H ? hat[j + W] : i
    if ((right === i || right < 0) && (down === i || down < 0) && !seen.has(i)) { seen.add(i); if (t.hats[i].mirrored) shownMirrored++ }
  }
  const clusterDist = new Float32Array(nc)
  let reach = 0
  for (let k = 0; k < nc; k++) if (sn[k]) { clusterDist[k] = Math.sqrt((sx[k] / sn[k] - (W - 1) / 2) ** 2 + (sy[k] / sn[k] - (H - 1) / 2) ** 2); reach = Math.max(reach, clusterDist[k]) }
  return {
    hat, hatGroup: colour(hat, t.hats.length), mirrored: Uint8Array.from(t.hats, h => (h.mirrored ? 1 : 0)), kind: t.hats.map(h => h.kind), cluster,
    clusterGroup: colour(byCluster, nc), clusterDist, shown: seen.size, shownMirrored, reach,
  }
}

/** The front at time t (cells; Infinity = every cluster split): out from the centre over 6 s, hold, back in over 3 s. */
export function hatFront(t: number, reach: number): number {
  const p = mod(t + OFF, LOOP), edge = reach + 1
  return p < SPLIT ? edge * (p / SPLIT) : p < LOOP - FUSE ? Infinity : edge * (1 - (p - (LOOP - FUSE)) / FUSE)
}

/** One frame's cells: value, tone (index into TONES) and join group per cell. */
export interface HatCells { value: Float32Array; tone: Uint8Array; group: Uint8Array; split: number }
const TONES: Tone[] = ['faint', 'mid', 'idle', 'active']
let byDist: Float32Array | undefined, lastCells: HatCells | undefined
/**
 * The cells with every cluster nearer than `front` split into its hats, the rest fused. Cached by how many clusters
 * have split, so the hold and most frames of a sweep reuse the last arrays.
 */
export function hatCells(front: number): HatCells {
  const f = hatFloor(), d = (byDist ??= Float32Array.from(f.clusterDist).sort())
  let lo = 0, hi = d.length
  while (lo < hi) { const m = (lo + hi) >> 1; if (d[m] <= front) lo = m + 1; else hi = m }
  if (lastCells?.split === lo) return lastCells
  const split = (i: number) => f.clusterDist[f.cluster[i]] <= front
  /** The piece a hat shows as now: itself once split, else its cluster (a mirrored hat always stands alone). */
  const piece = (i: number) => (f.mirrored[i] || split(i) ? i : -2 - f.cluster[i])
  const value = new Float32Array(W * H), tone = new Uint8Array(W * H), group = new Uint8Array(W * H)
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const j = r * W + c, i = f.hat[j]
    if (i < 0) continue
    // grout: a cell whose right or lower neighbour is another piece stays empty, so every piece is ringed by one cell
    const p = piece(i), right = c + 1 < W ? f.hat[j + 1] : i, down = r + 1 < H ? f.hat[j + W] : i
    if ((right >= 0 && right !== i && piece(right) !== p) || (down >= 0 && down !== i && piece(down) !== p)) continue
    const m = f.mirrored[i] === 1
    value[j] = m ? 1 : KIND_LEVEL[f.kind[i]]
    tone[j] = m ? 3 : TONES.indexOf(KIND_TONE[f.kind[i]])
    group[j] = split(i) ? f.hatGroup[i] : 128 + f.clusterGroup[f.cluster[i]]
  }
  return (lastCells = { value, tone, group, split: lo })
}

export const sqHat: WidgetPreset = {
  id: 'sq-hat', name: 'Squares Hat', label: 'HAT', ...tile,
  credit: { by: ['David Smith', 'Joseph Samuel Myers', 'Craig S. Kaplan', 'Chaim Goodman-Strauss'], title: 'An aperiodic monotile', source: 'https://arxiv.org/abs/2303.10798', note: 'technique' },
  layers: ctx => {
    const f = hatFloor(), front = hatFront(ctx.t, f.reach), h = hatCells(front)
    return [
      cite('SMITH 2023'),
      cardCells(ORIGIN, W, H, (c, r) => h.value[r * W + c], { toneOf: (c, r) => TONES[h.tone[r * W + c]], group: (c, r) => h.group[r * W + c], join: { accent: true } }),
      ...footer(Math.min(1, front / (f.reach + 1)), `HATS ${pad(f.shown, 3)}`, `MIRRORED ${pad(f.shownMirrored, 2)}`),
    ]
  },
}
/** Sizes for the checks (`scripts/aperiodic.ts`). */
export const HAT_CARD = { origin: ORIGIN, w: W, h: H, scale: SCALE, level: LEVEL, loop: LOOP, split: SPLIT }
