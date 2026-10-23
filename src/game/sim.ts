/**
 * HIVE, the game: a deterministic fixed-step simulation (60 Hz). `step(game, input)` is the only way
 * state changes; it reads nothing but the state and that step's buttons (no clock, no Math.random),
 * so a recorded input list replays to the same frame bit for bit. Rendering lives in `render.ts`;
 * sound is a list of event names per step (`game.events`) that the host may play.
 *
 * Stages: title → corridor (first-person) → maze (top-down, 3 keys) → surface (side-scroller) →
 * void (warp) → queen (boss) → win → entry (initials) → scores → title. Losing every life goes to
 * `over` (continue countdown) and from there to entry or the title.
 */
import { castGrid } from '../engine/scene'
import { EYE, QK, QUEEN, QW } from '../widgets/boards/levels'
import { BTN, type StepInput } from './buttons'
import { nextRandom } from './rng'
import { CORRIDOR, GAME, MAZE, SURFACE, SURF_GROUND, SURF_PIT, bfs } from './world'

export const HZ = 60
export type Stage = 'title' | 'corridor' | 'maze' | 'surface' | 'void' | 'queen' | 'over' | 'win' | 'entry' | 'scores'
export const PLAY_STAGES: Stage[] = ['corridor', 'maze', 'surface', 'void', 'queen']
export interface ScoreRow { name: string; score: number }
export const DEFAULT_TABLE: ScoreRow[] = [
  { name: 'ACE', score: 12800 }, { name: 'ZAP', score: 10450 }, { name: 'KAI', score: 8420 },
  { name: 'HEX', score: 6100 }, { name: 'BIT', score: 4730 }, { name: 'ION', score: 2200 },
]
/** A hit flash: a dither burst at (x, y) screen cells, radius `r`, `age` of `life` steps. */
export interface Flash { x: number; y: number; r: number; age: number; life: number }

export interface Drone { x: number; y: number; hp: number; hit: number; dead: number }
export interface CorridorState { x: number; y: number; a: number; drones: Drone[]; cool: number; muzzle: number; walk: number }
export interface Grub { x: number; y: number; hx: number; hy: number; cool: number; dir: number }
export interface MazeState { x: number; y: number; cool: number; dir: number; keys: boolean[]; grubs: Grub[]; seen: number[]; locked: number }
export interface Bee { x: number; y: number; alive: boolean; phase: number }
export interface SurfaceState { x: number; y: number; vx: number; vy: number; ground: boolean; coyote: number; buf: number; cp: number; bees: Bee[]; motes: boolean[]; run: number; cam: number }
export interface Shot { x: number; y: number; vx: number; vy: number }
export interface QueenState { ox: number; oy: number; hp: number; phase: number; eye: boolean; shipX: number; shipY: number; shots: Shot[]; bullets: Shot[]; cool: number; dying: number; spin: number; hit: number }
export interface EntryState { letters: number[]; pos: number; rank: number }

export interface Game {
  frame: number
  stage: Stage
  /** Steps since the stage was entered. */
  sf: number
  rng: number
  score: number
  lives: number
  /** Buttons held on the previous step (edge detection). */
  prev: number
  /** Steps of invulnerability left after a hit. */
  invuln: number
  /** Screen shake: steps left and amplitude in whole cells. */
  shake: number; shakeAmp: number
  flashes: Flash[]
  /** Sound / haptic event names emitted this step. */
  events: string[]
  table: ScoreRow[]
  /** Row of your entry in `table` on the scores screen (−1 = none). */
  mine: number
  /** Stage a continue resumes at. */
  resume: Stage
  /** A scheduled stage change (clear banners, death pause): stage and the frame it happens on. */
  pending: { stage: Stage; at: number } | null
  /** Continue countdown (steps) on the game-over screen. */
  count: number
  c: CorridorState; m: MazeState; s: SurfaceState; q: QueenState; e: EntryState
}

export const QUEEN_HP = 240
const SHIP_HALF = 5.85
export const QUEEN_W = QW * QK, QUEEN_H = QUEEN.length * QK

export function newGame(table: ScoreRow[] = DEFAULT_TABLE, seed = 0x48495645): Game {
  const g: Game = {
    frame: 0, stage: 'title', sf: 0, rng: seed >>> 0, score: 0, lives: 3, prev: 0, invuln: 0, shake: 0, shakeAmp: 0,
    flashes: [], events: [], table: table.map(r => ({ ...r })), mine: -1, resume: 'corridor', pending: null, count: 0,
    c: corridorStart(), m: mazeStart(), s: surfaceStart(), q: queenStart(), e: { letters: [0, 0, 0], pos: 0, rank: -1 },
  }
  return g
}
const corridorStart = (): CorridorState => ({ x: CORRIDOR.start[0], y: CORRIDOR.start[1], a: 0, drones: CORRIDOR.drones.map(([x, y]) => ({ x, y, hp: 2, hit: 0, dead: 0 })), cool: 0, muzzle: 0, walk: 0 })
const mazeStart = (): MazeState => ({ x: MAZE.start[0], y: MAZE.start[1], cool: 0, dir: 3, keys: MAZE.keys.map(() => false), grubs: MAZE.grubs.map(([x, y]) => ({ x, y, hx: x, hy: y, cool: 90, dir: 0 })), seen: [], locked: 0 })
const surfaceStart = (): SurfaceState => ({ x: 4, y: SURF_GROUND, vx: 0, vy: 0, ground: true, coyote: 0, buf: 0, cp: 4, bees: SURFACE.bees.map(([x, y], i) => ({ x, y, alive: true, phase: i * 37 })), motes: SURFACE.motes.map(() => false), run: 0, cam: 0 })
const queenStart = (): QueenState => ({ ox: 54, oy: 16, hp: QUEEN_HP, phase: 0, eye: true, shipX: 96, shipY: 126, shots: [], bullets: [], cool: 0, dying: 0, spin: 0, hit: 0 })

function enter(g: Game, stage: Stage): void {
  g.stage = stage; g.sf = 0; g.pending = null; g.flashes = []; g.invuln = 0
  if (stage === 'corridor') g.c = corridorStart()
  if (stage === 'maze') g.m = mazeStart()
  if (stage === 'surface') g.s = surfaceStart()
  if (stage === 'queen') g.q = queenStart()
  if (PLAY_STAGES.includes(stage)) g.resume = stage
  if (stage === 'over') g.count = 10 * HZ - 1
  if (stage === 'entry') {
    const rank = g.table.findIndex(r => g.score > r.score)
    g.e = { letters: [0, 0, 0], pos: 0, rank }
  }
  g.events.push(`stage:${stage}`)
}
const schedule = (g: Game, stage: Stage, wait: number) => { if (!g.pending) g.pending = { stage, at: g.frame + wait } }
/** Does the score make the table? */
export const qualifies = (g: Game) => g.score > 0 && g.table.some(r => g.score > r.score)

const flash = (g: Game, x: number, y: number, r: number, life = 12) => { g.flashes.push({ x, y, r, age: 0, life }) }
const shake = (g: Game, steps: number, amp: number) => { if (steps >= g.shake) { g.shake = steps; g.shakeAmp = amp } }
/** Lose a life (unless still blinking from the last hit); `force` ignores invulnerability (falling in a pit). */
function hurt(g: Game, x: number, y: number, force = false): boolean {
  if ((g.invuln > 0 && !force) || g.pending) return false
  g.lives--; g.invuln = 120
  shake(g, 14, 2); flash(g, x, y, 22, 16)
  g.events.push('hurt')
  if (g.lives <= 0) schedule(g, 'over', 50)
  return true
}

/** Advance one fixed step. Mutates and returns `g`. */
export function step(g: Game, input: StepInput): Game {
  const held = input.b, pressed = held & ~g.prev
  g.events = []
  g.frame++; g.sf++
  if (g.invuln > 0) g.invuln--
  if (g.shake > 0) g.shake--
  for (const f of g.flashes) f.age++
  g.flashes = g.flashes.filter(f => f.age < f.life)
  // while a stage change is pending the world keeps moving but ignores the player
  const live = g.pending ? 0 : held, hit = g.pending ? 0 : pressed
  switch (g.stage) {
    case 'title': if (hit & (BTN.a | BTN.start)) { g.score = 0; g.lives = 3; g.events.push('start'); enter(g, 'corridor') } break
    case 'corridor': corridor(g, live, hit, input.look ?? 0); break
    case 'maze': maze(g, live, hit); break
    case 'surface': surface(g, live, hit); break
    case 'void': if (g.sf > 170 || (g.sf > 30 && hit & (BTN.a | BTN.start))) enter(g, 'queen'); break
    case 'queen': queen(g, live, hit); break
    case 'win': if (g.sf > 60 && hit & (BTN.a | BTN.start) || g.sf > 360) enter(g, qualifies(g) ? 'entry' : 'scores'); break
    case 'over':
      g.count--
      if (hit & (BTN.a | BTN.start)) { g.lives = 3; g.score = 0; g.events.push('continue'); enter(g, g.resume) }
      else if (g.count <= 0) enter(g, qualifies(g) ? 'entry' : 'title')
      break
    case 'entry': entry(g, hit); break
    case 'scores': if (g.sf > 60 && hit & (BTN.a | BTN.start) || g.sf > 600) { g.mine = -1; enter(g, 'title') } break
  }
  if (g.pending && g.frame >= g.pending.at) enter(g, g.pending.stage)
  g.prev = held
  return g
}

// ── corridor ───────────────────────────────────────────────────────────────────────────────────
export const FOV_PLANE = .66, HORIZON = 76
/** Focal length in cells (horizontal and vertical: the cells are square). */
export const FOCAL = GAME.cols / 2 / FOV_PLANE
const solid = (x: number, y: number) => { const m = CORRIDOR.map, cx = Math.floor(x), cy = Math.floor(y); return cx < 0 || cy < 0 || cx >= m.w || cy >= m.h || m.cells[cy * m.w + cx] > 0 }
/** Move a body of radius `r` by (dx, dy) with wall sliding (axes resolved separately). */
function slide(p: { x: number; y: number }, dx: number, dy: number, r: number) {
  const nx = p.x + dx
  if (!solid(nx + Math.sign(dx) * r, p.y - r * .7) && !solid(nx + Math.sign(dx) * r, p.y + r * .7)) p.x = nx
  const ny = p.y + dy
  if (!solid(p.x - r * .7, ny + Math.sign(dy) * r) && !solid(p.x + r * .7, ny + Math.sign(dy) * r)) p.y = ny
}
/** Camera-space position of a world point: `tx` across (plane units), `ty` depth. */
export function toCamera(c: { x: number; y: number; a: number }, wx: number, wy: number): [number, number] {
  const dx = Math.cos(c.a), dy = Math.sin(c.a), px = -dy * FOV_PLANE, py = dx * FOV_PLANE
  const sx = wx - c.x, sy = wy - c.y, inv = 1 / (px * dy - dx * py)
  return [inv * (dy * sx - dx * sy), inv * (-py * sx + px * sy)]
}
/** Distance to the wall straight ahead. */
const wallAhead = (x: number, y: number, a: number) => castGrid(CORRIDOR.map, x, y, Math.cos(a), Math.sin(a), 64)?.dist ?? 99
export const lineOfSight = (ax: number, ay: number, bx: number, by: number) => {
  const d = Math.hypot(bx - ax, by - ay)
  return (castGrid(CORRIDOR.map, ax, ay, (bx - ax) / d, (by - ay) / d, 32)?.dist ?? 99) >= d
}
function corridor(g: Game, held: number, pressed: number, look: number) {
  const c = g.c, turn = .045
  const strafe = held & BTN.b ? (held & BTN.left ? -1 : held & BTN.right ? 1 : 0) : 0
  if (!(held & BTN.b)) { if (held & BTN.left) c.a -= turn; if (held & BTN.right) c.a += turn }
  c.a += look / 1000
  const fwd = (held & BTN.up ? 1 : 0) - (held & BTN.down ? .7 : 0)
  const side = strafe + (held & BTN.strafeR ? 1 : 0) - (held & BTN.strafeL ? 1 : 0)
  const dx = Math.cos(c.a), dy = Math.sin(c.a), sp = .055
  if (fwd || side) {
    slide(c, (dx * fwd - dy * side) * sp, (dy * fwd + dx * side) * sp, .22)
    c.walk++
  }
  if (c.cool > 0) c.cool--
  if (c.muzzle > 0) c.muzzle--
  if (pressed & BTN.a || (held & BTN.a && c.cool === 0)) {
    if (c.cool === 0) {
      c.cool = 14; c.muzzle = 6; g.events.push('shoot')
      const wall = wallAhead(c.x, c.y, c.a)
      let best: Drone | null = null, bestZ = wall
      for (const d of c.drones) {
        if (d.hp <= 0) continue
        const [tx, ty] = toCamera(c, d.x, d.y)
        if (ty < .15 || ty >= bestZ) continue
        if (Math.abs((tx / ty) * (GAME.cols / 2)) < (FOCAL * .3) / ty + 1) { best = d; bestZ = ty }
      }
      if (best) {
        best.hp--; best.hit = 8
        const [tx, ty] = toCamera(c, best.x, best.y)
        flash(g, GAME.cols / 2 * (1 + tx / ty), HORIZON, Math.min(40, 6 + FOCAL * .35 / ty), 10)
        shake(g, 4, 1)
        if (best.hp <= 0) { best.dead = 1; g.score += 150; g.events.push('kill') } else { g.score += 10; g.events.push('hit') }
      }
    }
  }
  for (const d of c.drones) {
    if (d.hit > 0) d.hit--
    if (d.hp <= 0) { if (d.dead > 0 && d.dead < 30) d.dead++; continue }
    const ax = c.x - d.x, ay = c.y - d.y, dist = Math.hypot(ax, ay)
    if (dist < 6 && dist > .4 && lineOfSight(d.x, d.y, c.x, c.y)) slide(d, (ax / dist) * .016, (ay / dist) * .016, .2)
    if (dist < .5) {
      if (hurt(g, GAME.cols / 2, HORIZON)) slide(d, (-ax / dist) * .7, (-ay / dist) * .7, .2)
    }
  }
  if (Math.hypot(c.x - CORRIDOR.exit[0], c.y - CORRIDOR.exit[1]) < .8 && !g.pending) {
    g.score += 1000; g.events.push('clear'); schedule(g, 'maze', 45)
  }
}

// ── maze ───────────────────────────────────────────────────────────────────────────────────────
const DIRS: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]] // up down left right
const DIR_BTN = [BTN.up, BTN.down, BTN.left, BTN.right]
const mazeOpen = (x: number, y: number) => x >= 0 && y >= 0 && x < MAZE.w && y < MAZE.h && !MAZE.wall[y * MAZE.w + x]
function maze(g: Game, held: number, pressed: number) {
  const m = g.m
  if (m.cool > 0) m.cool--
  if (m.locked > 0) m.locked--
  // a fresh press turns at once; holding keeps stepping, turning at the first junction that allows it
  const want = DIR_BTN.map((b, i) => (held & b ? i : -1)).filter(i => i >= 0)
  if (want.length && (m.cool === 0 || DIR_BTN.some(b => pressed & b) && m.cool < 3)) {
    const order = [...want.filter(i => i !== m.dir), ...want.filter(i => i === m.dir)]
    for (const i of order) {
      const [ax, ay] = DIRS[i]
      if (!mazeOpen(m.x + ax, m.y + ay)) continue
      m.x += ax; m.y += ay; m.dir = i; m.cool = 6
      const k = m.y * MAZE.w + m.x
      if (!m.seen.includes(k)) m.seen.push(k)
      g.events.push('step')
      break
    }
  }
  MAZE.keys.forEach(([kx, ky], i) => {
    if (!m.keys[i] && m.x === kx && m.y === ky) {
      m.keys[i] = true; g.score += 500; g.events.push('key')
      const [sx, sy] = mazeScreen(kx, ky)
      flash(g, sx, sy, 14, 14); shake(g, 3, 1)
    }
  })
  const all = m.keys.every(Boolean)
  if (m.x === MAZE.exit[0] && m.y === MAZE.exit[1]) {
    if (all && !g.pending) { g.score += 1000; g.events.push('clear'); schedule(g, 'surface', 45) }
    else if (!all && m.locked === 0) { m.locked = 60; g.events.push('locked') }
  }
  // grubs: chase by BFS when near, wander otherwise; faster with every key taken
  const keys = m.keys.filter(Boolean).length, dist = bfs(MAZE.wall, MAZE.w, MAZE.h, [m.x, m.y])
  for (const u of g.m.grubs) {
    if (u.cool > 0) { u.cool--; continue }
    u.cool = 11 - keys * 1.5
    const here = dist[u.y * MAZE.w + u.x]
    let moves = DIRS.map(([ax, ay], i) => ({ i, x: u.x + ax, y: u.y + ay })).filter(p => mazeOpen(p.x, p.y))
    if (here >= 0 && here < 14) moves = moves.filter(p => dist[p.y * MAZE.w + p.x] < here)
    else if (moves.length > 1) moves = moves.filter(p => p.i !== (u.dir ^ 1))
    if (!moves.length) continue
    const pick = moves[Math.floor(nextRandom(g) * moves.length)]
    u.x = pick.x; u.y = pick.y; u.dir = pick.i
  }
  for (const u of m.grubs) if (u.x === m.x && u.y === m.y) {
    const [sx, sy] = mazeScreen(m.x, m.y)
    if (hurt(g, sx, sy)) { u.x = u.hx; u.y = u.hy; u.cool = 120 }
  }
}
/** Maze lattice (4 cells per maze cell) anchored so the 43 × 27 maze sits centred under the HUD. */
export const MAZE_K = 4, MAZE_O: [number, number] = [Math.round((GAME.cols - MAZE.w * MAZE_K) / 2), 26]
export const mazeScreen = (x: number, y: number): [number, number] => [MAZE_O[0] + (x + .5) * MAZE_K - .5, MAZE_O[1] + (y + .5) * MAZE_K - .5]

// ── surface ────────────────────────────────────────────────────────────────────────────────────
export const PW = 6, PH = 7
const topAt = (x: number) => { const c = Math.floor(x); return c < 0 ? SURF_GROUND : c >= SURFACE.len ? SURF_GROUND : SURFACE.top[c] }
/** Highest ground (smallest row) under the player's columns. */
const floorUnder = (x: number) => { let t = SURF_PIT; for (let c = Math.floor(x + .01); c <= Math.floor(x + PW - .01); c++) t = Math.min(t, topAt(c)); return t }
function surface(g: Game, held: number, pressed: number) {
  const s = g.s
  // run: right accelerates, left brakes / backs off, nothing coasts
  if (held & BTN.right) s.vx = Math.min(.3, s.vx + .02)
  else if (held & BTN.left) s.vx = Math.max(-.15, s.vx - .03)
  else s.vx *= .88
  if (pressed & (BTN.a | BTN.up)) s.buf = 7
  else if (s.buf > 0) s.buf--
  if (s.ground) s.coyote = 6; else if (s.coyote > 0) s.coyote--
  if (s.buf > 0 && s.coyote > 0) { s.vy = -.82; s.ground = false; s.coyote = 0; s.buf = 0; g.events.push('jump') }
  // variable jump height: letting go early falls sooner
  s.vy = Math.min(1.1, s.vy + (s.vy < 0 && held & (BTN.a | BTN.up) ? .036 : .06))
  // horizontal: blocked by anything more than one row above the feet
  const nx = Math.max(0, s.x + s.vx), lead = s.vx > 0 ? nx + PW - .01 : nx
  if (s.vx !== 0 && topAt(lead) < s.y - 1.01) s.vx = 0
  else s.x = nx
  const fl = floorUnder(s.x), ny = s.y + s.vy
  if (s.vy >= 0 && s.y <= fl + .001 && ny >= fl) { if (!s.ground && s.vy > .5) g.events.push('land'); s.y = fl; s.vy = 0; s.ground = true }
  else { s.y = ny; s.ground = false }
  if (s.ground && fl < s.y) s.y = fl
  if (Math.abs(s.vx) > .02 && s.ground) s.run += Math.abs(s.vx)
  for (const cp of SURFACE.checkpoints) if (s.x >= cp && cp > s.cp) s.cp = cp
  s.cam = Math.max(0, Math.min(SURFACE.len - GAME.cols / 2, Math.floor(s.x - 28)))
  const scr = (x: number, y: number): [number, number] => [(x - s.cam) * 2, y * 2]
  // bees: drift toward you on a bob; stomp from above, touch from the side hurts
  for (const b of s.bees) {
    if (!b.alive) continue
    if (b.x - s.x < 70) b.x -= .05
    const by = b.y + 2 * Math.sin((g.sf + b.phase) * .08)
    const overlap = s.x < b.x + 4 && s.x + PW > b.x && s.y - PH < by + 1 && s.y > by - 2
    if (!overlap) continue
    if (s.vy > 0 && s.y - s.vy <= by - 1) {
      b.alive = false; s.vy = -.6; s.ground = false; g.score += 200; g.events.push('stomp')
      flash(g, ...scr(b.x + 2, by), 12, 12); shake(g, 4, 1)
    } else if (hurt(g, ...scr(s.x + 3, s.y - 3))) { s.vx = -.25; s.vy = -.45; s.ground = false }
  }
  SURFACE.motes.forEach(([mx, my], i) => {
    if (s.motes[i]) return
    if (mx >= s.x - .5 && mx <= s.x + PW + .5 && my >= s.y - PH - 1 && my <= s.y + 1) { s.motes[i] = true; g.score += 50; g.events.push('mote') }
  })
  if (s.y > 76 && !g.pending) {
    hurt(g, ...scr(s.x + 3, 70), true)
    if (g.lives > 0) { s.x = s.cp; s.y = SURF_GROUND; s.vx = 0; s.vy = 0; s.ground = true; g.invuln = 90 }
  }
  if (s.x >= SURFACE.gate && !g.pending) { g.score += 1000; g.events.push('clear'); schedule(g, 'void', 40) }
}

// ── queen ──────────────────────────────────────────────────────────────────────────────────────
const shipShot = (x: number, y: number): Shot => ({ x, y, vx: 0, vy: -3.2 })
function fire(q: QueenState, x: number, y: number, a: number, v: number) { q.bullets.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v }) }
/** Queen lattice cell under a screen cell, or '' off the sprite. */
export const queenCellAt = (q: QueenState, x: number, y: number) => QUEEN[Math.floor((y - q.oy) / QK)]?.[Math.floor((x - q.ox) / QK)] ?? ''
export const queenEyeAt = (q: QueenState): [number, number] => [q.ox + (EYE[0] + .5) * QK, q.oy + (EYE[1] + .5) * QK]
function queen(g: Game, held: number, pressed: number) {
  const q = g.q, t = g.sf
  if (q.hit > 0) q.hit--
  if (q.dying > 0) {
    q.dying++
    if (q.dying % 9 === 0) { const r = nextRandom(g), r2 = nextRandom(g); flash(g, q.ox + r * QUEEN_W, q.oy + r2 * QUEEN_H, 10 + r * 14, 14); shake(g, 6, 1 + (q.dying > 90 ? 1 : 0)); g.events.push('boom') }
    if (q.dying === 150) { g.score += 5000 + g.lives * 1000; schedule(g, 'win', 30) }
    q.bullets = []
    return
  }
  // the queen sways; faster as she weakens. Her eye opens and shuts (shut = armoured)
  q.phase = q.hp > QUEEN_HP * 2 / 3 ? 0 : q.hp > QUEEN_HP / 3 ? 1 : 2
  q.ox = Math.round(54 + 46 * Math.sin(t * (.009 + q.phase * .004)))
  q.oy = Math.round(16 + 3 * Math.sin(t * .021))
  q.eye = t % 240 < 180
  // ship: free movement in the lower band, B = slow focus
  const sp = held & BTN.b ? .8 : 1.6
  if (held & BTN.left) q.shipX -= sp
  if (held & BTN.right) q.shipX += sp
  if (held & BTN.up) q.shipY -= sp
  if (held & BTN.down) q.shipY += sp
  q.shipX = Math.max(8, Math.min(GAME.cols - 8, q.shipX)); q.shipY = Math.max(90, Math.min(134, q.shipY))
  if (q.cool > 0) q.cool--
  if ((held | pressed) & BTN.a && q.cool === 0) { q.cool = 9; q.shots.push(shipShot(q.shipX - 3, q.shipY - 6), shipShot(q.shipX + 3, q.shipY - 6)); g.events.push('shoot') }
  // patterns, by phase
  const [ex, ey] = queenEyeAt(q), mx = q.ox + QUEEN_W / 2, my = q.oy + QUEEN_H - 4
  const aim = Math.atan2(q.shipY - ey, q.shipX - ex)
  if (t > 60) {
    if (q.phase === 0 && t % 12 === 0) for (const dx of [-16, 16]) fire(q, mx + dx, my, Math.PI / 2, 1.25)
    if (t % (q.phase === 2 ? 55 : 80) === 0) for (let k = -2; k <= 2; k++) fire(q, ex, ey, aim + k * .22, 1.05)
    if (q.phase >= 1 && t % 6 === 0) { q.spin += .41; fire(q, ex, ey, q.spin, .75); if (q.phase === 2) fire(q, ex, ey, q.spin + Math.PI, .75) }
    if (q.phase === 2 && t % 70 === 35) for (let k = 0; k < 16; k++) fire(q, mx, my, (k / 16) * Math.PI * 2 + t * .01, .9)
  }
  for (const b of q.bullets) { b.x += b.vx; b.y += b.vy }
  q.bullets = q.bullets.filter(b => b.x > -4 && b.x < GAME.cols + 4 && b.y > -4 && b.y < GAME.rows + 4)
  for (const s of q.shots) s.y += s.vy
  q.shots = q.shots.filter(s => {
    if (s.y < -2) return false
    const cell = queenCellAt(q, s.x, s.y)
    if (!cell || cell === '.') return true
    // the shell is armour while the eye is shut; an open eye leaves her soft (a hit on the eye itself counts triple)
    if (!q.eye) { g.score += 1; flash(g, s.x, s.y, 3, 5); g.events.push('ping') }
    else if (cell === 'E') { q.hp -= 3; q.hit = 6; g.score += 60; flash(g, s.x, s.y, 9, 9); shake(g, 3, 1); g.events.push('eye') }
    else { q.hp -= 1; q.hit = 4; g.score += 20; flash(g, s.x, s.y, 5, 7); g.events.push('hit') }
    return false
  })
  if (q.hp <= 0 && !q.dying) { q.hp = 0; q.dying = 1; q.bullets = []; g.events.push('queen-down'); shake(g, 30, 2) }
  // the ship's hit box is a 3 × 3 core around its centre
  for (const b of q.bullets) if (Math.abs(b.x - q.shipX) < 2.2 && Math.abs(b.y - (q.shipY - 1)) < 2.2) {
    if (hurt(g, q.shipX, q.shipY)) q.bullets = q.bullets.filter(o => Math.hypot(o.x - q.shipX, o.y - q.shipY) > 36)
    break
  }
}
export const SHIP_ORIGIN = (q: QueenState): [number, number] => [q.shipX - SHIP_HALF, q.shipY - 5]

// ── initials ───────────────────────────────────────────────────────────────────────────────────
export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
function entry(g: Game, pressed: number) {
  const e = g.e
  if (e.rank < 0) { enter(g, 'scores'); return }
  if (pressed & BTN.up) { e.letters[e.pos] = (e.letters[e.pos] + 1) % LETTERS.length; g.events.push('tick') }
  if (pressed & BTN.down) { e.letters[e.pos] = (e.letters[e.pos] + LETTERS.length - 1) % LETTERS.length; g.events.push('tick') }
  if (pressed & BTN.left && e.pos > 0) e.pos--
  if (pressed & (BTN.right | BTN.a | BTN.start)) {
    g.events.push('confirm')
    if (e.pos < 2 && !(pressed & BTN.start)) e.pos++
    else {
      const name = e.letters.map(i => LETTERS[i]).join('')
      g.table.splice(e.rank, 0, { name, score: g.score }); g.table.length = DEFAULT_TABLE.length
      g.mine = e.rank; g.events.push('save')
      enter(g, 'scores')
    }
  }
  if (pressed & BTN.b && e.pos > 0) e.pos--
}

/** A stable hash of the whole state (determinism checks). */
export function stateHash(g: Game): string {
  const s = JSON.stringify({ ...g, events: undefined }, (_k, v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v))
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return (h >>> 0).toString(16).padStart(8, '0')
}
