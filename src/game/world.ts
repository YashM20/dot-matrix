/**
 * HIVE static content: the first-person corridor map, the warren maze (seeded) and the surface run.
 * Built once from constants, so every run (and the headless verify run) plays the same worlds.
 */
import type { TileMap } from '../engine/scene'
import { rngFrom } from './rng'

/** The playfield: a 4:3 dot grid, 192 × 144 cells (the 144-cell card grid widened). */
export const GAME: { readonly cols: number; readonly rows: number } = { cols: 192, rows: 144 }

// ── 01 corridor: a stone labyrinth seen in first person; the red eyes wait at E ────────────────
const CORRIDOR_ROWS = [
  '################',
  '#S......#......#',
  '#######.#.####.#',
  '#.......#.#....#',
  '#.#######.#.####',
  '#.#.......#....#',
  '#.#.#########..#',
  '#...#..........#',
  '#####.#####.#..#',
  '#E....#.....#..#',
  '################',
]
export interface Corridor { map: TileMap; start: [number, number]; exit: [number, number]; torches: [number, number][]; drones: [number, number][] }
export const CORRIDOR: Corridor = (() => {
  const h = CORRIDOR_ROWS.length, w = CORRIDOR_ROWS[0].length, cells = new Uint8Array(w * h)
  let start: [number, number] = [1.5, 1.5], exit: [number, number] = [1.5, 1.5]
  CORRIDOR_ROWS.forEach((row, y) => {
    if (row.length !== w) throw new Error(`corridor row ${y} is ${row.length} wide`)
    for (let x = 0; x < w; x++) {
      const ch = row[x]
      cells[y * w + x] = ch === '#' ? 1 : 0
      if (ch === 'S') start = [x + .5, y + .5]
      if (ch === 'E') exit = [x + .5, y + .5]
    }
  })
  // torches hang a hand's width off a wall, at eye height − .15
  const torches: [number, number][] = [[4.5, 1.12], [11.5, 1.12], [4.5, 3.12], [14.6, 3.5], [6.5, 5.12], [13.5, 6.4], [8.5, 7.12], [3.5, 9.12], [9.5, 9.88]]
  const drones: [number, number][] = [[12.5, 1.5], [3.5, 3.5], [7.5, 5.5], [13.5, 5.5], [9.5, 7.5], [9.5, 9.5], [3.5, 9.5]]
  return { map: { w, h, cells }, start, exit, torches, drones }
})()

// ── 05 warren: a braided maze, one-cell corridors, three keys in the far dead ends ───────────────
export interface Maze { w: number; h: number; wall: Uint8Array; start: [number, number]; exit: [number, number]; keys: [number, number][]; grubs: [number, number][] }
export const MAZE_RW = 21, MAZE_RH = 13
export function makeMaze(seed = 0x4849): Maze {
  const rnd = rngFrom(seed), w = MAZE_RW * 2 + 1, h = MAZE_RH * 2 + 1, wall = new Uint8Array(w * h).fill(1)
  const seen = new Uint8Array(MAZE_RW * MAZE_RH), stack: [number, number][] = [[0, 0]]
  const open = (x: number, y: number) => { wall[y * w + x] = 0 }
  seen[0] = 1; open(1, 1)
  while (stack.length) {
    const [i, j] = stack[stack.length - 1]
    const next = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).map(([a, b]) => [i + a, j + b] as [number, number])
      .filter(([a, b]) => a >= 0 && b >= 0 && a < MAZE_RW && b < MAZE_RH && !seen[b * MAZE_RW + a])
    if (!next.length) { stack.pop(); continue }
    const [a, b] = next[Math.floor(rnd() * next.length)]
    seen[b * MAZE_RW + a] = 1
    open(a * 2 + 1, b * 2 + 1); open(i + a + 1, j + b + 1)
    stack.push([a, b])
  }
  // braid: knock through some inner walls so there are loops to dodge the grubs around
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (!wall[y * w + x] || (x + y) % 2 === 0) continue
    const horiz = !wall[y * w + x - 1] && !wall[y * w + x + 1], vert = !wall[(y - 1) * w + x] && !wall[(y + 1) * w + x]
    if ((horiz || vert) && rnd() < .1) open(x, y)
  }
  const start: [number, number] = [1, 1], exit: [number, number] = [w - 2, h - 2]
  const dist = bfs(wall, w, h, start)
  // keys: the three far dead ends that sit far apart from each other (and from the exit)
  const ends: [number, number, number][] = []
  for (let y = 1; y < h - 1; y += 2) for (let x = 1; x < w - 1; x += 2) {
    const exits = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => !wall[(y + b) * w + x + a]).length
    if (exits === 1 && !(x === start[0] && y === start[1])) ends.push([x, y, dist[y * w + x]])
  }
  ends.sort((p, q) => q[2] - p[2])
  const keys: [number, number][] = []
  for (const [x, y] of ends) {
    if (keys.length === 3) break
    const far = (p: [number, number]) => Math.abs(p[0] - x) + Math.abs(p[1] - y) > 16
    if (keys.every(far) && far(exit)) keys.push([x, y])
  }
  const grubs: [number, number][] = [[w - 2, 1], [1, h - 2], [MAZE_RW | 1, MAZE_RH | 1]]
  return { w, h, wall, start, exit, keys, grubs }
}
/** BFS step distances from `from` over open cells (−1 = unreachable). */
export function bfs(wall: Uint8Array, w: number, h: number, from: [number, number]): Int32Array {
  const d = new Int32Array(w * h).fill(-1), q = new Int32Array(w * h)
  let head = 0, tail = 0
  d[from[1] * w + from[0]] = 0; q[tail++] = from[1] * w + from[0]
  while (head < tail) {
    const n = q[head++], x = n % w, y = (n - x) / w
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const m = (y + b) * w + x + a
      if (x + a < 0 || y + b < 0 || x + a >= w || y + b >= h || wall[m] || d[m] >= 0) continue
      d[m] = d[n] + 1; q[tail++] = m
    }
  }
  return d
}
export const MAZE = makeMaze()

// ── 04 surface: a run over the moonlit crust to the hive gate (lattice-2 cells, 96 × 72 on screen) ─
export const SURF_K = 2, SURF_GROUND = 58, SURF_PIT = 999
export interface Surface { len: number; top: Int16Array; crates: [number, number, number][]; bees: [number, number][]; motes: [number, number][]; checkpoints: number[]; gate: number }
export const SURFACE: Surface = (() => {
  const rnd = rngFrom(0x5355), len = 560, top = new Int16Array(len).fill(SURF_GROUND)
  const crates: [number, number, number][] = [], bees: [number, number][] = [], motes: [number, number][] = [], checkpoints = [4]
  let x = 40
  // a hand-ordered beat sheet, spaced by the seeded rhythm: teach crate → pit → stack → bee → mixes
  const beats = ['crate', 'pit', 'crate', 'bee', 'pit', 'stack', 'motes', 'bee', 'pit', 'crate', 'bee', 'stack', 'pit', 'bee', 'motes', 'pit', 'crate', 'bee', 'pit', 'stack', 'bee']
  for (const beat of beats) {
    if (x > len - 70) break
    if (beat === 'crate' || beat === 'stack') {
      const tall = beat === 'stack' ? 6 : 3, w = beat === 'stack' ? 4 : 3
      crates.push([x, w, tall])
      for (let c = x; c < x + w; c++) top[c] = SURF_GROUND - tall
      motes.push([x + 1, SURF_GROUND - tall - 6])
      x += w
    } else if (beat === 'pit') {
      const w = 4 + Math.floor(rnd() * 3)
      for (let c = x; c < x + w; c++) top[c] = SURF_PIT
      motes.push([x + w / 2, SURF_GROUND - 9])
      x += w
      checkpoints.push(x + 3)
    } else if (beat === 'bee') {
      // bees fly high (run under them) or low (jump over or stomp them), alternating
      bees.push([x + 8, bees.length % 2 ? SURF_GROUND - 11 : SURF_GROUND - 5])
      x += 4
    } else {
      for (let k = 0; k < 5; k++) motes.push([x + k * 3, SURF_GROUND - 4 - Math.round(3 * Math.sin(k))])
      x += 14
    }
    x += 14 + Math.floor(rnd() * 10)
  }
  return { len, top, crates, bees, motes, checkpoints, gate: len - 40 }
})()
