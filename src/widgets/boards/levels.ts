/**
 * Board — Levels: the P3 flagship. Nine dot-native worlds from one arcade game, HIVE, descended
 * from `level-03` (audio board): title, the levels (corridor, vault, surface, warren, void, queen),
 * game over and the high-score table. One fiction, one score running through it (01250 → 08420).
 * Depth is tone and size falling with distance (fog), light is a few point / window lights with
 * Lambert on flat planes, parallax layers step in whole cells at their own pitch. Every card has at
 * most one red element, the thing the moment is about (eyes, gem, runner, player, hive, eye,
 * countdown, cursor, your entry). Everything is a pure function of `t`.
 * The ray-plane hall caster lives in the engine (`src/engine/scene`, shared with the playable game in
 * `src/game/`); the isometric box tracer is local.
 */
import { clamp, hash01, smoothstep } from '../../engine/math'
import { latticeGrid } from '../../engine/sampler/gridSampler'
import { HALL_CEIL, HALL_FLOOR, castHall, fog, lamp, project, seam, type Hall } from '../../engine/scene'
import type { Field } from '../../engine/types'
import { TILE, baked, layer, layoutFor, tileStyle, type LatticeField, type WidgetPreset } from '../types'
import { SHIP } from '../sprites'

const T = layoutFor(TILE)
type Pt = [number, number]
type V3 = [number, number, number]
const N = TILE.cols - 1
const frac = (x: number) => x - Math.floor(x)
/**
 * Scene value → dot value. A scene dot's size *and* opacity follow its value, so mid greys read far
 * darker than their number; lift the mids and keep the voids (seams, mortar) void.
 */
export const lift = (v: number) => (v < .1 ? v * .4 : v ** .6)
/** Procedural scenes: continuous dot size is the luminance (the level-03 precedent, MASTER-PLAN §11.2). */
const sceneStyle = { ...tileStyle, sizeMin: 0, sizeMax: 1, quantizeSteps: 0 }
const scene = { group: 'scatter', chrome: 'dots', bleed: true, label: '', grid: TILE, style: sceneStyle } as const

/** A field written in card cells (x,y ∈ 0..143). */
const cells = (f: (x: number, y: number) => number): Field => (u, v) => f(u * N, v * N)
/** A field on a coarser lattice written in lattice cells (c,r), anchored at card cell (ox,oy). */
const onLattice = (k: number, ox: number, oy: number, f: (c: number, r: number) => number): LatticeField => {
  const g = latticeGrid(TILE, k, [ox, oy])
  return { field: (u, v) => f(Math.round(u * (g.cols - 1)), Math.round(v * (g.rows - 1))), lattice: k, origin: [ox, oy] }
}
const keyOf = (x: number, y: number) => Math.round(x * 100) * 1e5 + Math.round(y * 100)
/** Dot sites that each carry their own value (stars, flames, motes): `[x, y, value]` in card cells. */
const valued = (pts: V3[], size: number): LatticeField => {
  const m = new Map<number, number>()
  for (const [x, y, v] of pts) { const k = keyOf(x, y); if (!((m.get(k) ?? -1) >= v)) m.set(k, v) }
  const field: Field = (u, v) => {
    const x = u * N, y = v * N, hit = m.get(keyOf(x, y))
    if (hit !== undefined) return hit
    // off-site reads (thumbnails): the brightest site within a cell
    let best = 0
    for (const [sx, sy, sv] of pts) if (Math.abs(sx - x) <= 1 && Math.abs(sy - y) <= 1 && sv > best) best = sv
    return best
  }
  return { field, sites: pts.map(([x, y]) => [x, y] as Pt), size }
}
const sprite = (rows: string[], k: number, x: number, y: number): LatticeField => { const g = T.lattice(k, x, y); return g.at(g.sprite(rows, 0, 0)) }

// ── shared chrome: level name top-left, the running score top-right (both 1-tier, in-scene) ────
const LABEL = .92
const title = (s: string) => layer(T.big(s, 5, 5, { lattice: LABEL }), 'idle')
const score = (s: string) => layer(T.big(s, 139, 5, { lattice: LABEL, align: 'right' }), 'idle')
const CAP = .72

// ── ray-plane hall: the engine's scene3d (`src/engine/scene`) ─────────────────────────────────
const FLOOR = HALL_FLOOR, CEIL = HALL_CEIL
const cast = castHall

// ── 01 corridor: torchlit stone hall, walking forward; two red eyes wait past the light ─────────
const HALL1: Hall = { vx: 72, vy: 66, f: 62, floor: 1, ceil: 1.15, wall: 1.1, far: 13 }
const TORCH_GAP = 3.2
const torches = (s: number, t: number) => {
  const out: { p: V3; i: number }[] = []
  for (let k = Math.floor(s / TORCH_GAP); out.length < 5; k++) {
    const z = k * TORCH_GAP + 1.4 - s
    if (z < -.8) continue
    out.push({ p: [k % 2 ? .8 : -.8, -.2, z], i: 2.1 * (.88 + .08 * Math.sin(t * 11 + k * 1.7) + .04 * Math.sin(t * 23 + k * 3.1)) })
  }
  return out
}
const hall1 = (t: number): Field => {
  const s = t * .8, lights = torches(s, t)
  return cells((px, py) => {
    const h = cast(HALL1, px, py)
    if (!h) return 0
    const zw = h.z + s
    let alb: number
    if (h.s === FLOOR) {
      const row = Math.floor(zw / .7), col = h.x / .55 + (row % 2) * .5
      if (seam(zw, .7, .05, h.fz) || seam(col, 1, .08, h.fp / .55)) return .03
      alb = .5 + .25 * hash01(Math.floor(col) * 7 + 3, row)
    } else if (h.s === CEIL) {
      if (!seam(zw, 1.6, .3, h.fz)) return .025
      alb = .7
    } else {
      const course = Math.floor((h.y + 1.15) / .43), along = zw / .9 + (course % 2) * .5
      if (seam(h.y + 1.15, .43, .05, h.fp) || seam(along, 1, .06, h.fz / .9)) return .03
      alb = .55 + .35 * hash01(course * 31 + Math.floor(along), h.s)
    }
    let light = .06
    for (const l of lights) light += lamp(h, l.p, 1.7, l.i)
    // the HUD strip stays dim so the label and score read over the ceiling
    return Math.min(.95, alb * light * fog(h.z, HALL1.far, 1.2)) * (py < 13 ? .35 : 1)
  })
}
const flames = (t: number) => torches(t * .8, t).flatMap(({ p }): V3[] => {
  // the flame sits on the wall; its light (above) hangs a little in front of it
  if (p[2] < .35 || p[2] > 7) return []
  const [x, y] = project(HALL1, [Math.sign(p[0]) * 1.06, p[1], p[2]]), f = fog(p[2], 9, .6)
  return x < 1 || x > 142 || y < 14 ? [] : [[Math.round(x), Math.round(y), f], [Math.round(x), Math.round(y + 2.5 / p[2] + 1.5), .5 * f]]
})
export const lvCorridor: WidgetPreset = {
  id: 'lv-corridor', name: 'Level 01', ...scene, animated: true,
  layers: ({ t }) => {
    const blink = t % 5 > 3.1 && t % 5 < 3.3
    return [
      layer(hall1(t), 'value'),
      layer(valued(flames(t), 2.2), 'value'),
      ...(blink ? [] : [layer(T.dots([[69, 67], [75, 67]], 2.4), 'active')]),
      title('LEVEL 01'), score('01250'),
    ]
  },
}

// ── 02 vault: an isometric room lit by one window; the red gem floats on its plinth ────────────
interface Box { i0: number; i1: number; j0: number; j1: number; k0: number; k1: number; m: number }
const box = (i0: number, i1: number, j0: number, j1: number, k0: number, k1: number, m: number): Box => ({ i0, i1, j0, j1, k0, k1, m })
const ISO = { cx: 72, cy: 54, A: 8, B: 4, C: 8 }
const RK = ISO.C / (2 * ISO.B)
const M_FLOOR = 0, M_WALL_L = 1, M_WALL_R = 2, M_CRATE = 3, M_STONE = 4
const PLINTH = box(4.1, 5.1, 2.6, 3.6, 0, .8, M_STONE)
const OCCLUDERS = [box(1, 2.3, 1, 2.3, 0, 1.3, M_CRATE), box(1.2, 2.1, 1.2, 2.1, 1.3, 2.2, M_CRATE), box(2.5, 3.5, .8, 1.8, 0, 1, M_CRATE), PLINTH, box(6.5, 7.3, 6, 6.8, 0, 3, M_STONE)]
const ROOM = [box(-.5, 8, -.5, 8, -.6, 0, M_FLOOR), box(-.5, 0, -.5, 8, 0, 4, M_WALL_L), box(0, 8, -.5, 0, 0, 4, M_WALL_R), ...OCCLUDERS]
/** Window on the right wall (j = 0): i, k extent; sunlight travels along D. */
const WIN = { i0: 4.4, i1: 6.4, k0: 1.6, k1: 3.3 }
const SUN: V3 = [-.3, 1, -.75]
/** Is a world point inside the light shaft (and not shadowed by an object)? */
function sunlit(i: number, j: number, k: number) {
  const s = j / SUN[1], wi = i - SUN[0] * s, wk = k - SUN[2] * s
  if (wi < WIN.i0 || wi > WIN.i1 || wk < WIN.k0 || wk > WIN.k1) return false
  // march the segment back to the window against the objects (slab test)
  for (const b of OCCLUDERS) {
    let lo = 1e-3, hi = s
    for (const [p, d, a0, a1] of [[i, -SUN[0], b.i0, b.i1], [j, -SUN[1], b.j0, b.j1], [k, -SUN[2], b.k0, b.k1]] as const) {
      if (Math.abs(d) < 1e-9) { if (p < a0 || p > a1) { hi = -1; break } continue }
      const u0 = (a0 - p) / d, u1 = (a1 - p) / d
      lo = Math.max(lo, Math.min(u0, u1)); hi = Math.min(hi, Math.max(u0, u1))
    }
    if (lo < hi) return false
  }
  return true
}
const vaultAt = (x: number, y: number) => {
  const p = (x - ISO.cx) / ISO.A, q = (y - ISO.cy) / ISO.B, ib = (q + p) / 2, jb = (q - p) / 2
  let best = -Infinity, hit: Box | undefined, face = 0
  for (const b of ROOM) {
    const uk = b.k1, ui = (b.i1 - ib) / RK, uj = (b.j1 - jb) / RK, ku = Math.min(uk, ui, uj)
    const kl = Math.max(b.k0, (b.i0 - ib) / RK, (b.j0 - jb) / RK)
    if (ku < kl || ku <= best) continue
    best = ku; hit = b; face = ku === uk ? 0 : ku === ui ? 1 : 2
  }
  if (!hit) return 0
  const k = best, i = ib + RK * k, j = jb + RK * k, b = hit
  // seams are one card cell wide: a cell spans ~1/8 unit along the floor diagonals and in height
  const cw = .13
  const sun = face === 0 && sunlit(i, j, k)
  if (b.m === M_FLOOR) {
    if (face !== 0) return face === 1 ? .32 : .16 // the slab's cut edge
    if (frac(i) < cw || frac(j) < cw) return sun ? .3 : .05
    const ao = Math.min(1, .45 + Math.min(i, j) * .9) // darker where the floor meets a wall
    return (sun ? .78 : .2 * ao) * (.95 + .1 * hash01(Math.floor(i), Math.floor(j)))
  }
  if (b.m === M_WALL_L || b.m === M_WALL_R) {
    if (face === 0) return .92 // wall caps: the room's lit top edge
    const u = b.m === M_WALL_L ? j : i
    if (face !== (b.m === M_WALL_L ? 1 : 2)) return .3 // the walls' outer ends
    if (b.m === M_WALL_L && u > 4.8 && u < 6.4 && k < 2.6) return u < 4.8 + cw || u > 6.4 - cw || k > 2.6 - cw ? .75 : 0 // doorway
    if (b.m === M_WALL_R && u > WIN.i0 && u < WIN.i1 && k > WIN.k0 && k < WIN.k1) {
      const mull = Math.abs(u - (WIN.i0 + WIN.i1) / 2) < cw * .6 || Math.abs(k - (WIN.k0 + WIN.k1) / 2) < cw * .6
      return mull ? .2 : .95 // sky through the window, the brightest thing in the room
    }
    const course = Math.floor(k * 2), along = u * 1.2 + (course % 2) * .5
    if (frac(k * 2) < cw * 2 || frac(along) < cw * 1.2) return .07
    const ao = Math.min(1, .55 + k * .5)
    return (b.m === M_WALL_L ? .34 : .22) * ao * (.94 + .12 * hash01(course, Math.floor(along) + b.m * 40))
  }
  // objects: three-tone faces (top lit, +i mid, +j shadow), bevel highlights on the front edges
  const fi = b.i1 - i, fj = b.j1 - j
  if (face === 0 && (fi < cw || fj < cw)) return .95
  if (face !== 0 && b.k1 - k < cw * .8) return .95
  if (face !== 0 && (face === 1 ? fj : fi) < cw * .7) return .8 // the vertical front corner
  let v = face === 0 ? (sun ? 1 : .8) : face === 1 ? .7 : .48
  if (b.m === M_CRATE) {
    const u = face === 0 ? i : face === 1 ? j : i, lo = face === 1 ? b.j0 : b.i0, hi = face === 1 ? b.j1 : b.i1
    const w = face === 0 ? j : k
    if (u - lo < cw || hi - u < cw * 2 || (face === 0 ? b.j1 - w : b.k1 - w) < cw * 1.5) v *= .4
  }
  return v
}
const vault = baked(TILE, cells((x, y) => lift(vaultAt(x, y))))
const GEM = ['.#####.', '#######', '.#####.', '..###..', '...#...']
/** Dust motes drifting down the light shaft, projected and snapped to whole cells. */
const motes = (t: number): V3[] => Array.from({ length: 9 }, (_, n) => {
  const wi = WIN.i0 + hash01(n, 3) * (WIN.i1 - WIN.i0), wk = WIN.k0 + hash01(n, 4) * (WIN.k1 - WIN.k0)
  const s = frac(hash01(n, 5) + t * .05) * (wk / -SUN[2]), i = wi + SUN[0] * s, j = SUN[1] * s, k = wk + SUN[2] * s
  return [Math.round(ISO.cx + (i - j) * ISO.A), Math.round(ISO.cy + (i + j) * ISO.B - k * ISO.C), .55] as V3
})
export const lvVault: WidgetPreset = {
  id: 'lv-vault', name: 'Level 02', ...scene, animated: true,
  layers: ({ t }) => {
    const bob = Math.floor(t * 1.6) % 2
    return [
      layer(vault, 'value'),
      layer(valued(motes(t), .9), 'value'),
      layer(sprite(GEM, 1.3, 79, 63 + bob), 'active'),
      title('LEVEL 02'), score('02480'),
    ]
  },
}

// ── 04 surface: side-scroller; moon, far range, pines, ground each step at their own pitch ─────
export const SKY_STARS: V3[] = Array.from({ length: 30 }, (_, n): V3 => [Math.round(hash01(n, 41) * 140) + 2, 16 + Math.round(hash01(n, 42) * 50), .25 + .4 * hash01(n, 43)])
  .filter(([x, y]) => Math.hypot(x - 110, y - 34) > 16)
export const ridge = (x: number) => 27 + 10 * Math.sin(x * .043) + 6 * Math.sin(x * .11 + 1) + 2.5 * Math.sin(x * .29 + 2)
export const MOON = { x: 110, y: 34, r: 12 }
/** The surface sky at card cell (x, y) with the far range shifted `far` cells and the pines `mid` cells (shared with the game). */
export const surfaceSky = (x: number, y: number, far: number, mid: number) => {
  x = Math.round(x); y = Math.round(y)
  if (y >= 116) return 0
  // pines (mid layer, 6 cells/s): lit on the moon side
  const xm = x + mid, n = Math.floor(xm / 19), c = n * 19 + 5 + Math.floor(hash01(n, 7) * 9), th = 12 + Math.floor(hash01(n, 8) * 14)
  const top = 116 - th - 4
  if (y > top && y < 112 && Math.abs(xm - c) <= (y - top) * .42) return xm >= c ? .5 : .28
  if (y >= 112 && Math.abs(xm - c) <= 1) return .2
  if (y >= 108 + Math.round(2 * Math.sin(xm * .05))) return y === 108 + Math.round(2 * Math.sin(xm * .05)) ? .2 : .12
  // far range (2 cells/s): snow on the high peaks, lit flank facing the moon
  const xf = x + far, h = ridge(xf), ry = 104 - Math.round(h)
  if (y >= ry) {
    const lit = ridge(xf + 1) < ridge(xf - 1) ? 0 : 1
    if (y - ry < 3 && h > 36) return .5
    return (.11 + .07 * lit) * (1 - .45 * (y - ry) / (104 - ry + 6))
  }
  // the moon: a lit sphere with soft limb and two craters
  const mx = (x - MOON.x) / MOON.r, my = (y - MOON.y) / MOON.r, rr = mx * mx + my * my
  if (rr < 1.1) {
    const nz = Math.sqrt(Math.max(0, 1 - rr)), lam = Math.max(0, -.55 * mx - .45 * my + .7 * nz)
    const crater = Math.hypot(mx + .3, my - .25) < .22 || Math.hypot(mx - .35, my + .35) < .15 ? .7 : 1
    return clamp((.04 + .9 * lam) * crater) * smoothstep(0, 1, (1 - Math.sqrt(rr)) * MOON.r + .5)
  }
  return 0
}
const backdrop = (t: number): Field => {
  const far = Math.floor(t * 2), mid = Math.floor(t * 6)
  return cells((x, y) => lift(surfaceSky(x, y, far, mid)))
}
export const RUN_A = ['..##..', '..##..', '.####.', '#.##.#', '..##..', '.#..#.', '#....#']
export const RUN_B = ['..##..', '..##..', '.####.', '.###.#', '..##..', '..##..', '..#.#.']
const SPEED = 6 // ground lattice cells per second (12 card cells/s)
const PLAYER_C = 16, GROUND_R = 58, CRATE_GAP = 24
/** Runner height above the ground (lattice cells): a jump over each crate, from the continuous scroll. */
const jumpAt = (s: number) => { const d = (((PLAYER_C + 3 + s - 7.5 + 12) % CRATE_GAP) + CRATE_GAP) % CRATE_GAP - 12; return Math.abs(d) < 5 ? Math.round(7 * (1 - (d / 5) ** 2)) : 0 }
const ground = (t: number): LatticeField => {
  const S = Math.floor(t * SPEED)
  return onLattice(2, 0, 0, (c, r) => {
    const w = c + S
    if (r === GROUND_R) return .95
    if (r > GROUND_R) {
      const rr = r - GROUND_R - 1, course = Math.floor(rr / 4)
      if (rr % 4 === 3 || (w + (course % 2) * 3) % 6 === 5) return 0
      return lift(clamp(.62 - .045 * rr))
    }
    const ox = ((w - 6) % CRATE_GAP + CRATE_GAP) % CRATE_GAP
    if (r >= GROUND_R - 3 && ox < 3) return ox === 1 && r === GROUND_R - 2 ? .3 : .75
    return 0
  })
}
const runner = (t: number): LatticeField => {
  const s = t * SPEED, h = jumpAt(s), art = h ? RUN_A : Math.floor(s / 1.5) % 2 ? RUN_A : RUN_B
  return onLattice(2, 0, 0, (c, r) => { const rr = r - (GROUND_R - 7 - h), cc = c - PLAYER_C; return rr >= 0 && rr < 7 && cc >= 0 && cc < 6 && art[rr][cc] === '#' ? 1 : 0 })
}
export const lvSurface: WidgetPreset = {
  id: 'lv-surface', name: 'Level 04', ...scene, animated: true,
  layers: ({ t }) => [
    layer(valued(SKY_STARS, .9), 'value'),
    layer(backdrop(t), 'value'),
    layer(ground(t), 'value'), layer(runner(t), 'active'),
    title('LEVEL 04'), score('03920'),
  ],
}

// ── 05 warren: top-down maze; the lantern light falls off around the red player dot ────────────
const MZ = 9, MD = MZ * 4 + 1, MK = 3, MO: Pt = [16.5, 20]
/** Maze dots (lattice cells): 1 = wall. Rooms are 3 dots wide, walls one dot; a seeded backtracker carves it. */
const MAZE = (() => {
  const wall = new Uint8Array(MD * MD).fill(1), seen = new Uint8Array(MZ * MZ), stack: Pt[] = [[0, 0]]
  const open = (c: number, r: number) => { wall[r * MD + c] = 0 }
  const room = (i: number, j: number) => { for (let a = 1; a <= 3; a++) for (let b = 1; b <= 3; b++) open(i * 4 + a, j * 4 + b) }
  seen[0] = 1; room(0, 0)
  let step = 0
  while (stack.length) {
    const [i, j] = stack[stack.length - 1]
    const next = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as Pt[]).map(([di, dj]) => [i + di, j + dj] as Pt).filter(([a, b]) => a >= 0 && b >= 0 && a < MZ && b < MZ && !seen[b * MZ + a])
    if (!next.length) { stack.pop(); continue }
    const [a, b] = next[Math.floor(hash01(step++, 77) * next.length)]
    seen[b * MZ + a] = 1; room(a, b)
    // knock through the wall between the rooms
    if (a !== i) { const c = Math.max(a, i) * 4; for (let q = 1; q <= 3; q++) open(c, j * 4 + q) } else { const r = Math.max(b, j) * 4; for (let q = 1; q <= 3; q++) open(i * 4 + q, r) }
    stack.push([a, b])
  }
  // walk from the entry room to the exit room (BFS over room centres), one dot per step
  const prev = new Int32Array(MZ * MZ).fill(-1), queue = [0]
  prev[0] = 0
  while (queue.length) {
    const n = queue.shift()!, i = n % MZ, j = Math.floor(n / MZ)
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj, m = b * MZ + a
      if (a < 0 || b < 0 || a >= MZ || b >= MZ || prev[m] >= 0 || wall[(j * 4 + 2 + dj * 2) * MD + i * 4 + 2 + di * 2]) continue
      prev[m] = n; queue.push(m)
    }
  }
  const rooms: number[] = []
  for (let n = MZ * MZ - 1; n !== 0; n = prev[n]) rooms.unshift(n)
  rooms.unshift(0)
  const path: Pt[] = [[2, 2]]
  for (let q = 1; q < rooms.length; q++) {
    const [x0, y0] = path[path.length - 1], x1 = (rooms[q] % MZ) * 4 + 2, y1 = Math.floor(rooms[q] / MZ) * 4 + 2
    for (let s = 1; s <= 4; s++) path.push([x0 + ((x1 - x0) * s) / 4, y0 + ((y1 - y0) * s) / 4])
  }
  return { wall, path }
})()
const EXIT: Pt = [MD - 3, MD - 3]
const mazePos = (t: number) => {
  const n = MAZE.path.length, idx = (Math.floor(t * 5) + 60) % (n + 12)
  return { idx: Math.min(idx, n - 1), at: MAZE.path[Math.min(idx, n - 1)] }
}
const warren = (t: number): LatticeField => {
  const { idx, at: [px, py] } = mazePos(t), trail = new Set(MAZE.path.slice(0, idx).map(([c, r]) => r * MD + c))
  return onLattice(MK, MO[0], MO[1], (c, r) => {
    if (c >= MD || r >= MD) return 0
    const d = Math.hypot(c - px, r - py), lit = clamp(1 - d / 11) ** 1.3
    if (MAZE.wall[r * MD + c]) return lift(.12 + .83 * lit)
    if (c === EXIT[0] && r === EXIT[1]) return .95
    if (c === px && r === py) return 0 // the player's own site sits here
    const crumb = trail.has(r * MD + c) && (c + r) % 2 === 0 ? .3 : 0
    return Math.max(crumb, lit > 0 ? .06 + .16 * lit : 0)
  })
}
export const lvWarren: WidgetPreset = {
  id: 'lv-warren', name: 'Level 05', ...scene, animated: true,
  layers: ({ t }) => {
    const [px, py] = mazePos(t).at
    // one site a size up from the wall dots, centred on the player's lattice cell
    const at: Pt = [MO[0] + (px + .5) * MK - .5, MO[1] + (py + .5) * MK - .5]
    return [layer(warren(t), 'value'), layer(T.dots([at], MK * 1.45), 'active'), title('LEVEL 05'), score('05160')]
  },
}

// ── 06 void: warp starfield; streaks grow and brighten as they near, the hive waits at the centre ─
const WARP = { cx: 72, cy: 78, f: 24, depth: 4, speed: 1.5, trail: .45 }
const WARP_STARS = Array.from({ length: 120 }, (_, n) => {
  const a = hash01(n, 51) * Math.PI * 2, r = .12 + 1.3 * Math.sqrt(hash01(n, 52))
  return { x: Math.cos(a) * r, y: Math.sin(a) * r, z: hash01(n, 53) * WARP.depth }
})
const warpSites = (t: number) => {
  const bands: V3[][] = [[], [], []]
  for (const s of WARP_STARS) {
    const z = ((((s.z - t * WARP.speed) % WARP.depth) + WARP.depth) % WARP.depth) + .15
    const b = clamp(1.15 - z / WARP.depth) ** 1.2, band = z < 1.2 ? 0 : z < 2.6 ? 1 : 2
    const [hx, hy] = [WARP.cx + (WARP.f * s.x) / z, WARP.cy + (WARP.f * s.y) / z], [tx, ty] = [WARP.cx + (WARP.f * s.x) / (z + WARP.trail), WARP.cy + (WARP.f * s.y) / (z + WARP.trail)]
    const L = Math.hypot(hx - tx, hy - ty), n = Math.max(1, Math.round(L / 1.6))
    for (let q = 0; q <= n; q++) {
      const x = Math.round(hx + ((tx - hx) * q) / n), y = Math.round(hy + ((ty - hy) * q) / n)
      if (x < 1 || x > 142 || y < 15 || y > 142 || (y > 128 && Math.abs(x - 72) < 30)) continue
      bands[band].push([x, y, b * (1 - (.75 * q) / (n + 1))])
    }
  }
  return bands
}
export const lvVoid: WidgetPreset = {
  id: 'lv-void', name: 'Level 06', ...scene, animated: true,
  layers: ({ t }) => {
    const [near, mid, far] = warpSites(t)
    return [
      layer(valued(far, .8), 'value'), layer(valued(mid, 1.1), 'value'), layer(valued(near, 1.5), 'value'),
      layer({ ...T.dotRing(WARP.cx, WARP.cy, 7, { spacing: 2.3, size: .9 }), field: () => .35 }, 'value'),
      layer(T.dots([[WARP.cx, WARP.cy]], 4.5), 'active'),
      layer(T.big('HIVE 0.4 LY', 72, 134, { lattice: CAP, align: 'center' }), 'idle'),
      title('LEVEL 06'), score('06600'),
    ]
  },
}

// ── 07 queen: the boss, a lattice-4 sprite whose one red eye lights the shell around it ─────────
/** Left half + centre column of the queen (mirrored): 9/6/3 = lit top, body, shadow; E = the eye. */
const QUEEN_HALF = [
  '..9........', '...9.......', '....9......', '....9999999', '...66666666', '..666666666', '.6666666EEE', '66666666EEE',
  '666666666EE', '66.66666666', '.3333333333', '33..333.333', '3...3.3..33', '3..3...3...', '..3.....3..',
]
export const QUEEN = QUEEN_HALF.map(s => s + [...s.slice(0, 10)].reverse().join(''))
export const QK = 4, QW = QUEEN[0].length, EYE: Pt = [10, 7]
/** Shell tones 9/6/3 → lit top, body, underside; the open eye is emissive, so shell dots near it brighten. */
const queenBody = (open: boolean, ox: number, oy: number) => onLattice(QK, ox, oy, (c, r) => {
  const ch = QUEEN[r]?.[c]
  if (!ch || ch === '.') return 0
  if (ch === 'E') return open ? 0 : r === EYE[1] ? .5 : 0 // shut: a lid line
  const glow = open ? .45 * Math.exp(-Math.hypot(c - EYE[0], r - EYE[1]) / 2.4) : 0
  return Math.min(.95, lift(+ch / 9) + glow)
})
/** The eye, with a void pupil that follows the player's ship. */
const queenEye = (look: number, ox: number, oy: number) => onLattice(QK, ox, oy, (c, r) => (QUEEN[r]?.[c] === 'E' && !(r === EYE[1] && c === EYE[0] + look) ? 1 : 0))
const SHIP_K = 1.3
export const lvQueen: WidgetPreset = {
  id: 'lv-queen', name: 'Level 07', ...scene, animated: true,
  layers: ({ t }) => {
    const ox = 30 + Math.round(3 * Math.sin(t * .7)), oy = 20 + Math.round(2 * Math.sin(t * 1.4)), mid = ox + (QW * QK) / 2
    const shipX = 72 + Math.round(30 * Math.sin(t * .9)), look = shipX < mid - 12 ? -1 : shipX > mid + 12 ? 1 : 0
    const open = !(t % 4 > 2.6 && t % 4 < 2.85)
    // three bullet columns falling from the mandibles, 20 cells/s
    const shots: Pt[] = [-16, 0, 16].flatMap((dx, n) => [0, 1, 2].map(q => [mid + dx, oy + 62 + ((t * 20 + n * 17 + q * 5) % 48)] as Pt)).filter(([, y]) => y < 112)
    const HP = 20, hp = 13
    return [
      layer(queenBody(open, ox, oy), 'value'), layer(queenEye(look, ox, oy), 'active'),
      layer(T.dots(shots, 1.5), 'value'),
      layer(sprite(SHIP, SHIP_K, shipX - 5.85, 116), 'value'),
      layer(T.big('QUEEN', 5, 134, { lattice: CAP }), 'idle'),
      layer(T.dots(Array.from({ length: hp }, (_, n) => [32 + n * 5.5, 136.5] as Pt), 2), 'value'),
      layer(T.dots(Array.from({ length: HP - hp }, (_, n) => [32 + (n + hp) * 5.5, 136.5] as Pt), 2), 'faint'),
      title('LEVEL 07'), score('08420'),
    ]
  },
}

// ── title / game over floors: a ray-plane floor grid, fogged into the horizon ───────────────────
const gridFloor = (h: Hall, scroll: number, peak: number, mask?: (x: number, y: number) => boolean): Field => cells((px, py) => {
  if (mask?.(px, py)) return 0
  const hit = cast(h, px, py)
  if (!hit || hit.s !== FLOOR) return 0
  const on = seam(hit.x + 50, .7, .03, hit.fp) || seam(hit.z + scroll, .8, .03, hit.fz)
  return on ? peak * fog(hit.z, h.far, 1.1) : 0
})

// ── title: HIVE over a scrolling floor and a striped hive moon; the red cursor says press start ─
const TITLE_FLOOR: Hall = { vx: 72, vy: 98, f: 40, floor: 1, far: 16 }
const hiveMoon = cells((x, y) => {
  const d = Math.hypot(x - 72, y - 98), top = 98 - 24
  if (d > 24 || y >= 98) return 0
  const band = (y - top) / 24, gap = frac(band * 6) < band * .55
  return gap ? 0 : .5 - .25 * band
})
export const CURSOR = ['#...', '##..', '###.', '####', '###.', '##..', '#...']
export const lvTitle: WidgetPreset = {
  id: 'lv-title', name: 'Hive', ...scene, animated: true,
  layers: ({ t }) => {
    const on = t % 1.2 < .8
    return [
      layer(gridFloor(TITLE_FLOOR, t * 1.2, .7), 'value'), layer(hiveMoon, 'value'),
      layer(T.big('HIVE', 72, 22, { lattice: 2.5, smooth: true, align: 'center' })),
      ...(on ? [layer(T.big('PUSH START', 76, 62, { lattice: 1, align: 'center' }))] : []),
      layer(sprite(CURSOR, 1, 38, 62), 'active'),
      title('1UP'), score('HI 12800'),
    ]
  },
}

// ── game over: the floor drifts away, the red countdown is the only thing still live ───────────
const OVER_FLOOR: Hall = { vx: 72, vy: 92, f: 46, floor: 1, far: 14 }
const OVER_MOAT = (x: number, y: number) => (x > 22 && x < 122 && y > 99 && y < 129) || (x > 32 && x < 112 && y > 130)
export const lvOver: WidgetPreset = {
  id: 'lv-over', name: 'Game Over', ...scene, animated: true,
  layers: ({ t }) => {
    const n = 9 - (Math.floor(t) % 10)
    return [
      layer(gridFloor(OVER_FLOOR, -t * .35, .6, OVER_MOAT), 'value'),
      layer(T.big('GAME', 72, 20, { lattice: 2, smooth: true, align: 'center' })),
      layer(T.big('OVER', 72, 54, { lattice: 2, smooth: true, align: 'center' })),
      layer(T.big('CONTINUE?', 28, 108, { lattice: 1 }), 'idle'),
      layer(T.big(String(n), 116, 103, { lattice: 1.3, smooth: true, align: 'right' }), 'active'),
      layer(T.big('SCORE 08420', 72, 134, { lattice: CAP, align: 'center' }), 'mid'),
      title('LEVEL 07'),
    ]
  },
}

// ── high scores: the table recedes into fog; your entry is red, initials typing in ──────────────
export const TABLE: [string, string, string][] = [['2ND', 'ZAP', '10450'], ['3RD', 'KAI', '08420'], ['4TH', 'HEX', '06100'], ['5TH', 'BIT', '04730'], ['6TH', 'ION', '02200']]
const ROW_TONE = ['value', 'active', 'idle', 'mid', 'faint'] as const
export const lvScores: WidgetPreset = {
  id: 'lv-scores', name: 'High Scores', group: 'text', chrome: 'dots', label: '', bleed: true, animated: true, grid: TILE, style: tileStyle,
  layers: ({ t }) => {
    const tau = t % 6, typed = tau < 4 ? 3 : Math.floor((tau - 4) / .5), cursorOn = typed < 3 && tau % .5 < .3
    const RL = 1.3, row = (i: number) => 70 + i * 14
    return [
      title('HIGH SCORES'),
      layer(T.big('1ST ACE', 14, 21, { lattice: CAP }), 'idle'),
      layer(T.big('12800', 72, 30, { lattice: 2, smooth: true, align: 'center' })),
      layer(T.hrule(14, 62, 116, 2), 'faint'),
      ...TABLE.flatMap(([rank, name, pts], i) => {
        const shown = i === 1 ? name.slice(0, typed) : name
        return [
          layer(T.big(rank, 14, row(i), { lattice: RL }), ROW_TONE[i]),
          layer(T.big(shown, 58, row(i), { lattice: RL }), ROW_TONE[i]),
          layer(T.big(pts, 130, row(i), { lattice: RL, align: 'right' }), ROW_TONE[i]),
        ]
      }),
      ...(cursorOn ? [layer(T.dotLine(58 + typed * 6 * RL, row(1) + 11, 58 + typed * 6 * RL + 5 * RL - 1, row(1) + 11, { spacing: 1.3, size: 1 }), 'active')] : []),
    ]
  },
}

export const levelsBoard = [lvTitle, lvCorridor, lvVault, lvSurface, lvWarren, lvVoid, lvQueen, lvOver, lvScores]
