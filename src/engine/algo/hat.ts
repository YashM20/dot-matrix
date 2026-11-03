/**
 * The hat tiling (phase XQ, docs/living-matter/X-advanced.md #7), after Smith, Myers, Kaplan & Goodman-Strauss,
 * "An aperiodic monotile" (2023), §6: the four metatiles H, T, P and F hold 4, 1, 2 and 2 hats (one hat of each H is
 * mirrored). One substitution step glues 29 metatiles edge to edge into a patch, then reads the next level's H, T, P
 * and F off it (H → 3H 1T 3P 3F, T → 1H, P → 2H 1P 2F, F → 2H 1P 3F). The supertiles only approach a fixed shape, so
 * each level's outlines are rebuilt from points of the patch rather than scaled.
 *
 * A level-n H is flattened to its hats: an affine map of the unit hat (kite sides 1 and √3, `hex.ts`), the metatile
 * kind it came from and its level-0 cluster. Every hat is 8 kites of one kite grid, so `hatTiling` bakes a map from
 * kite to hat and `hatAt` answers any point in O(1). Pure and deterministic (sqrt only; inside the lint).
 */
import { KITE_AREA, R3, kiteAt, kiteCentroid, kiteKey, type Pt } from './hex'

/** x' = a·x + b·y + c, y' = d·x + e·y + f. */
export type Affine = [number, number, number, number, number, number]
export type MetaKind = 'H' | 'T' | 'P' | 'F'
const H3 = R3 / 2
const ID: Affine = [1, 0, 0, 0, 1, 0]
const mul = (A: Affine, B: Affine): Affine => [
  A[0] * B[0] + A[1] * B[3], A[0] * B[1] + A[1] * B[4], A[0] * B[2] + A[1] * B[5] + A[2],
  A[3] * B[0] + A[4] * B[3], A[3] * B[1] + A[4] * B[4], A[3] * B[2] + A[4] * B[5] + A[5],
]
export const apply = (M: Affine, [x, y]: Pt): Pt => [M[0] * x + M[1] * y + M[2], M[3] * x + M[4] * y + M[5]]
const shift = (x: number, y: number): Affine => [1, 0, x, 0, 1, y]
/** Rotation about p by an angle given as its cosine and sine (multiples of 60° only, so no trig). */
const turn = (p: Pt, c: number, s: number): Affine => mul(shift(p[0], p[1]), mul([c, -s, 0, s, c, 0], shift(-p[0], -p[1])))
/** The direct similarity (no mirror) taking p1 → p2 and q1 → q2: z ↦ αz + β over the complex numbers. */
function match(p1: Pt, q1: Pt, p2: Pt, q2: Pt): Affine {
  const ux = q1[0] - p1[0], uy = q1[1] - p1[1], vx = q2[0] - p2[0], vy = q2[1] - p2[1], n = ux * ux + uy * uy
  const ar = (vx * ux + vy * uy) / n, ai = (vy * ux - vx * uy) / n
  return [ar, -ai, p2[0] - (ar * p1[0] - ai * p1[1]), ai, ar, p2[1] - (ai * p1[0] + ar * p1[1])]
}
/** Where line p1q1 meets line p2q2. */
function meet(p1: Pt, q1: Pt, p2: Pt, q2: Pt): Pt {
  const d = (q2[1] - p2[1]) * (q1[0] - p1[0]) - (q2[0] - p2[0]) * (q1[1] - p1[1])
  const u = ((q2[0] - p2[0]) * (p1[1] - p2[1]) - (q2[1] - p2[1]) * (p1[0] - p2[0])) / d
  return [p1[0] + u * (q1[0] - p1[0]), p1[1] + u * (q1[1] - p1[1])]
}
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]], sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]]

/** A point of the triangular grid: x + y/2 across, y·√3/2 up. */
const tri = (x: number, y: number): Pt => [x + y / 2, y * H3]
/** The unit hat: 13 corners on the kite grid, its origin a hex centre. Area 8√3 (8 kites). */
export const HAT: Pt[] = [[0, 0], [-1, -1], [0, -2], [2, -2], [2, -1], [4, -2], [5, -1], [4, 0], [3, 0], [2, 2], [0, 3], [0, 2], [-1, 2]].map(([x, y]) => tri(x, y))
export const HAT_AREA = 8 * KITE_AREA

interface Child { m: Affine; tile: Meta | { mirrored: boolean } }
interface Meta { kind: MetaKind; level: number; outline: Pt[]; children: Child[] }
const at = (m: Meta, i: number, j: number): Pt => { const c = m.children[i]; return apply(c.m, (c.tile as Meta).outline[j]) }

/** Level 0: the metatiles at twice the hat's size, each hat placed by matching its corners to the outline's. */
function level0(): Record<MetaKind, Meta> {
  const hat = (mirrored: boolean) => ({ mirrored })
  const h: Pt[] = [[0, 0], [4, 0], [4.5, H3], [2.5, 5 * H3], [1.5, 5 * H3], [-.5, H3]]
  const H: Meta = { kind: 'H', level: 0, outline: h, children: [
    { m: match(HAT[5], HAT[7], h[5], h[0]), tile: hat(false) },
    { m: match(HAT[9], HAT[11], h[1], h[2]), tile: hat(false) },
    { m: match(HAT[5], HAT[7], h[3], h[4]), tile: hat(false) },
    // the mirrored hat: flip in y at half scale, turn by 120°, move to the H's middle
    { m: mul(shift(2.5, H3), mul([-.5, -H3, 0, H3, -.5, 0], [.5, 0, 0, 0, -.5, 0])), tile: hat(true) },
  ] }
  const T: Meta = { kind: 'T', level: 0, outline: [[0, 0], [3, 0], [1.5, 3 * H3]], children: [{ m: [.5, 0, .5, 0, .5, H3], tile: hat(false) }] }
  const pair = (): Child[] => [
    { m: [.5, 0, 1.5, 0, .5, H3], tile: hat(false) },
    { m: mul(shift(0, 2 * H3), mul([.5, H3, 0, -H3, .5, 0], [.5, 0, 0, 0, .5, 0])), tile: hat(false) },
  ]
  const P: Meta = { kind: 'P', level: 0, outline: [[0, 0], [4, 0], [3, 2 * H3], [-1, 2 * H3]], children: pair() }
  const F: Meta = { kind: 'F', level: 0, outline: [[0, 0], [3, 0], [3.5, H3], [3, 2 * H3], [-1, 2 * H3]], children: pair() }
  return { H, T, P, F }
}

/**
 * The patch: 29 metatiles, each glued edge to edge onto ones already placed. [i, e, kind, f]: edge f of the new tile
 * onto edge e of tile i (run backwards); [i, e, j, g, kind, f]: edge f onto the segment from corner g of tile j to
 * corner e of tile i.
 */
const PATCH: (readonly [MetaKind] | readonly [number, number, MetaKind, number] | readonly [number, number, number, number, MetaKind, number])[] = [
  ['H'], [0, 0, 'P', 2], [1, 0, 'H', 2], [2, 0, 'P', 2], [3, 0, 'H', 2], [4, 4, 'P', 2], [0, 4, 'F', 3], [2, 4, 'F', 3],
  [4, 1, 3, 2, 'F', 0], [8, 3, 'H', 0], [9, 2, 'P', 0], [10, 2, 'H', 0], [11, 4, 'P', 2], [12, 0, 'H', 2], [13, 0, 'F', 3],
  [14, 2, 'F', 1], [15, 3, 'H', 4], [8, 2, 'F', 1], [17, 3, 'H', 0], [18, 2, 'P', 0], [19, 2, 'H', 2], [20, 4, 'F', 3],
  [20, 0, 'P', 2], [22, 0, 'H', 2], [23, 4, 'F', 3], [23, 0, 'F', 3], [16, 0, 'P', 2], [9, 4, 0, 2, 'T', 2], [4, 0, 'F', 3],
]
/** Which patch tiles make each next-level metatile. */
const KEEP: Record<MetaKind, number[]> = { H: [0, 9, 16, 27, 26, 6, 1, 8, 10, 15], T: [11], P: [7, 2, 3, 4, 28], F: [21, 20, 22, 23, 24, 25] }

function patch(tiles: Record<MetaKind, Meta>): Meta {
  const out: Meta = { kind: 'H', level: tiles.H.level + 1, outline: [], children: [] }
  for (const r of PATCH) {
    if (r.length === 1) { out.children.push({ m: ID, tile: tiles[r[0]] }); continue }
    const [p, q, kind, f] = r.length === 4 ? [at(out, r[0], (r[1] + 1) % (out.children[r[0]].tile as Meta).outline.length), at(out, r[0], r[1]), r[2], r[3]] as const
      : [at(out, r[2], r[3]), at(out, r[0], r[1]), r[4], r[5]] as const
    const o = tiles[kind].outline
    out.children.push({ m: match(o[f], o[(f + 1) % o.length], p, q), tile: tiles[kind] })
  }
  return out
}
/** The next level's metatiles, their outlines read off the patch (then each centred on its outline's mean corner). */
function inflate(tiles: Record<MetaKind, Meta>): Record<MetaKind, Meta> {
  const pa = patch(tiles), level = pa.level, e = (i: number, j: number) => at(pa, i, j)
  const bps1 = e(8, 2), bps2 = e(21, 2), rbps = apply(turn(bps1, -.5, -H3), bps2)
  const p72 = e(7, 2), p252 = e(25, 2), llc = meet(bps1, rbps, e(6, 2), p72)
  const r60 = (v: Pt): Pt => apply([.5, H3, 0, -H3, .5, 0], v)
  let w = sub(e(6, 2), llc)
  const h: Pt[] = [llc, bps1]
  w = r60(w); h.push(add(h[1], w)); h.push(e(14, 2))
  w = r60(w); h.push(sub(h[3], w)); h.push(e(6, 2))
  const p: Pt[] = [p72, add(p72, sub(bps1, llc)), bps1, llc]
  const f: Pt[] = [bps2, e(24, 2), e(25, 0), p252, add(p252, sub(llc, bps1))]
  const A = h[2], B = add(h[1], sub(h[4], h[5])), t: Pt[] = [B, apply(turn(B, .5, -H3), A), A]
  const make = (kind: MetaKind, outline: Pt[]): Meta => {
    const cx = outline.reduce((s, q) => s + q[0], 0) / outline.length, cy = outline.reduce((s, q) => s + q[1], 0) / outline.length, back = shift(-cx, -cy)
    return { kind, level, outline: outline.map(q => [q[0] - cx, q[1] - cy]), children: KEEP[kind].map(i => ({ m: mul(back, pa.children[i].m), tile: pa.children[i].tile })) }
  }
  return { H: make('H', h), T: make('T', t), P: make('P', p), F: make('F', f) }
}

export interface HatTile {
  /** Maps the unit hat (`HAT`) into the plane; det < 0 is a mirrored hat. */
  m: Affine
  mirrored: boolean
  /** The level-0 metatile the hat sits in, and that metatile's index (its cluster). */
  kind: MetaKind
  cluster: number
}
export interface HatTiling {
  level: number
  hats: HatTile[]
  /** The kind of each level-0 cluster. */
  clusters: MetaKind[]
  /** A hex centre of the kite grid every hat sits on. */
  origin: Pt
  /** Kite key (`hex.ts`) → hat index. */
  kites: Map<number, number>
  /** Kites claimed twice (0 in a correct tiling) and hat kites off the grid (0). */
  overlaps: number
  offGrid: number
}

let canon: Pt[] | undefined
/** The centroids of the unit hat's 8 kites. */
export function hatKites(): Pt[] {
  if (canon) return canon
  const out: Pt[] = []
  for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) for (let k = 0; k < 6; k++) { const c = kiteCentroid(a, b, k); if (inside(HAT, c[0], c[1])) out.push(c) }
  return (canon = out)
}
/** Point in polygon (even-odd). */
export function inside(poly: Pt[], x: number, y: number): boolean {
  let s = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) s = !s
  }
  return s
}

const cache = new Map<number, HatTiling>()
/** A level-n H supertile's hats (level 0: 4 hats, 1: 25, 2: 169, 3: 1,156, 4: 7,921), centred, kite map baked. Cached. */
export function hatTiling(level: number): HatTiling {
  let t = cache.get(level)
  if (!t) cache.set(level, (t = bakeHats(level)))
  return t
}
/** `hatTiling` without the cache (the checks time and compare fresh bakes). */
export function bakeHats(level: number): HatTiling {
  let tiles = level0()
  for (let i = 0; i < level; i++) tiles = inflate(tiles)
  const hats: HatTile[] = [], clusters: MetaKind[] = [], S: Affine = [2, 0, 0, 0, 2, 0]
  const walk = (meta: Meta, M: Affine) => {
    if (meta.level === 0) {
      const cluster = clusters.push(meta.kind) - 1
      for (const c of meta.children) { const m = mul(M, c.m); hats.push({ m, mirrored: m[0] * m[4] - m[1] * m[3] < 0, kind: meta.kind, cluster }) }
      return
    }
    for (const c of meta.children) walk(c.tile as Meta, mul(M, c.m))
  }
  walk(tiles.H, S)
  const origin = apply(hats[0].m, [0, 0]), kites = new Map<number, number>(), cs = hatKites()
  let overlaps = 0, offGrid = 0
  hats.forEach((h, i) => {
    for (const c of cs) {
      const [x, y] = apply(h.m, c), k = kiteAt(x, y, origin), [kx, ky] = kiteCentroid(k.a, k.b, k.k, origin), key = kiteKey(k.a, k.b, k.k)
      if (Math.abs(kx - x) + Math.abs(ky - y) > 1e-6) offGrid++
      if (kites.has(key)) overlaps++
      else kites.set(key, i)
    }
  })
  return { level, hats, clusters, origin, kites, overlaps, offGrid }
}
/** The hat holding point (x, y) (plane units), or −1. */
export function hatAt(t: HatTiling, x: number, y: number): number {
  const k = kiteAt(x, y, t.origin)
  return t.kites.get(kiteKey(k.a, k.b, k.k)) ?? -1
}
/** A hat's outline in the plane. */
export const hatOutline = (h: HatTile): Pt[] => HAT.map(p => apply(h.m, p))
/** Shoelace area (absolute). */
export const polyArea = (p: Pt[]) => { let s = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += p[j][0] * p[i][1] - p[i][0] * p[j][1]; return Math.abs(s) / 2 }
