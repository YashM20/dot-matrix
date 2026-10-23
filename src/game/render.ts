/**
 * HIVE renderer: game state → `Layer[]` on the 192 × 144 game grid, then the usual Grid Sampler →
 * Renderer. Scenes (raycast hall, sky, floors) are one field over a per-frame value buffer at card
 * pitch (continuous dot size = luminance, the level-03 precedent); sprites sit on coarser lattices,
 * bullets and lights are dot sites, text goes through `T.big`. One red element per frame: the eyes,
 * the player, the queen's eye, the countdown or your entry.
 */
import { castGrid, castHall, fog, lampAt, seam, HALL_FLOOR, type GridHit, type Hall } from '../engine/scene'
import { clamp, hash01 } from '../engine/math'
import { masks } from '../engine/motion'
import type { DotStyle, Field, Layer } from '../engine/types'
import { layer, layoutFor, tileStyle, type LatticeField } from '../widgets/types'
import { CURSOR, EYE, QK, QUEEN, RUN_A, RUN_B, SKY_STARS, lift, surfaceSky } from '../widgets/boards/levels'
import { SHIP } from '../widgets/sprites'
import {
  FOCAL, FOV_PLANE, HORIZON, LETTERS, MAZE_K, MAZE_O, PH, QUEEN_HP, SHIP_ORIGIN, mazeScreen, queenEyeAt, toCamera,
  type Game,
} from './sim'
import { CORRIDOR, GAME, MAZE, SURFACE, SURF_GROUND, SURF_K, SURF_PIT } from './world'

const W = GAME.cols, H = GAME.rows
const T = layoutFor(GAME)
type Pt = [number, number]
type V3 = [number, number, number]
/** Scene style at the game's own pitch: continuous size (unquantized, like the HIVE cards), radii scaled from the 2.25 px tile pitch. */
export function gameStyle(pitch: number): DotStyle {
  const k = pitch / 2.25
  return { ...tileStyle, sizeMin: 0, sizeMax: 1 * k, quantizeSteps: 0 }
}
export interface RenderOptions { reduced?: boolean; paused?: boolean }

// ── shared pieces ──────────────────────────────────────────────────────────────────────────────
const fb = new Float32Array(W * H)
/** The scene buffer as a field (read at cell centres). */
const scene: Field = (u, v) => fb[Math.round(v * (H - 1)) * W + Math.round(u * (W - 1))]
const keyOf = (x: number, y: number) => Math.round(x * 100) * 1e5 + Math.round(y * 100)
/** Dot sites that each carry their own value (flames, stars, motes). */
function valued(pts: V3[], size: number): LatticeField {
  const m = new Map<number, number>()
  for (const [x, y, v] of pts) { const k = keyOf(x, y); if (!((m.get(k) ?? -1) >= v)) m.set(k, v) }
  return { field: (u, v) => m.get(keyOf(u * (W - 1), v * (H - 1))) ?? 0, sites: pts.map(([x, y]) => [x, y] as Pt), size }
}
const sprite = (rows: string[], k: number, x: number, y: number): LatticeField => { const g = T.lattice(k, x, y); return g.at(g.sprite(rows, 0, 0)) }
const LABEL = .92, CAP = .72
const title = (s: string) => layer(T.big(s, 5, 5, { lattice: LABEL }), 'idle')
const scoreText = (n: number) => String(Math.max(0, Math.min(99999, Math.round(n)))).padStart(5, '0')
const score = (g: Game) => layer(T.big(scoreText(g.score), W - 5, 5, { lattice: LABEL, align: 'right' }), 'idle')
const lives = (g: Game) => layer(T.dots(Array.from({ length: Math.max(0, g.lives) }, (_, i) => [W / 2 - 4 - (g.lives - 1) * 2.5 + i * 5 + 4, 8.5] as Pt), 1.7), 'value')
const caption = (s: string, x: number, y: number, tone: Layer['tone'] = 'mid') => layer(T.big(s, x, y, { lattice: CAP, align: 'center' }), tone)
const blink = (g: Game, period: number, on: number) => g.frame % period < on

/** Hit flashes as ordered-dither bursts: Bayer thresholds open then close around the hit. */
function flashLayer(list: { x: number; y: number; r: number; age: number; life: number }[]): Layer | null {
  if (!list.length) return null
  const f: Field = (u, v) => {
    const c = Math.round(u * (W - 1)), r = Math.round(v * (H - 1)), b = masks.bayer(c, r, W, H)
    let best = 0
    for (const fl of list) {
      const k = fl.age / fl.life, R = fl.r * (.45 + .55 * k), d = Math.hypot(c - fl.x, r - fl.y)
      if (d >= R) continue
      const keep = (1 - k) * (1 - .6 * (d / R))
      if (b < keep) best = Math.max(best, .95 - .3 * k)
    }
    return best
  }
  let c0 = W, r0 = H, c1 = 0, r1 = 0
  for (const fl of list) { c0 = Math.min(c0, fl.x - fl.r); r0 = Math.min(r0, fl.y - fl.r); c1 = Math.max(c1, fl.x + fl.r); r1 = Math.max(r1, fl.y + fl.r) }
  f.bounds = [Math.max(0, Math.floor(c0)), Math.max(0, Math.floor(r0)), Math.min(W - 1, Math.ceil(c1)), Math.min(H - 1, Math.ceil(r1))]
  return layer(f, 'value')
}
/** Screen shake: whole-cell offset for this frame (none under reduced motion). */
export function shakeOffset(g: Game, reduced = false): Pt {
  if (reduced || g.shake <= 0) return [0, 0]
  const a = g.shakeAmp * Math.min(1, g.shake / 6)
  return [Math.round(a * Math.sin(g.frame * 2.7)), Math.round(a * Math.cos(g.frame * 3.9))]
}

// ── title ──────────────────────────────────────────────────────────────────────────────────────
const TITLE_FLOOR: Hall = { vx: W / 2, vy: 98, f: 40, floor: 1, far: 16 }
function floorGrid(h: Hall, scroll: number, peak: number) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const hit = castHall(h, x, y)
    let v = 0
    if (hit && hit.s === HALL_FLOOR && (seam(hit.x + 50, .7, .03, hit.fp) || seam(hit.z + scroll, .8, .03, hit.fz))) v = peak * fog(hit.z, h.far, 1.1)
    fb[y * W + x] = v
  }
}
function hiveMoon(cx: number, cy: number, R: number) {
  for (let y = Math.max(0, cy - R); y < cy; y++) for (let x = cx - R; x <= cx + R; x++) {
    if (Math.hypot(x - cx, y - cy) > R) continue
    const band = (y - (cy - R)) / R, gap = band * 6 - Math.floor(band * 6) < band * .55
    if (!gap) fb[y * W + x] = Math.max(fb[y * W + x], .5 - .25 * band)
  }
}
function titleLayers(g: Game): Layer[] {
  floorGrid(TITLE_FLOOR, g.frame / 60 * 1.2, .7); hiveMoon(W / 2, 98, 24)
  return [
    layer(scene, 'value'),
    layer(T.big('HIVE', W / 2, 22, { lattice: 2.5, smooth: true, align: 'center' })),
    ...(blink(g, 72, 48) ? [layer(T.big('PRESS START', W / 2 + 4, 62, { lattice: 1, align: 'center' }))] : []),
    layer(sprite(CURSOR, 1, W / 2 - 40, 62), 'active'),
    caption('ARROWS OR WASD  SPACE FIRE  ESC QUIT', W / 2, 136),
    title('1UP'), layer(T.big(`HI ${scoreText(g.table[0]?.score ?? 0)}`, W - 5, 5, { lattice: LABEL, align: 'right' }), 'idle'),
  ]
}

// ── corridor: per-column DDA, floor / ceiling casting, torch light, billboards ─────────────────
const rowRd = new Float64Array(H), rowFog = new Float64Array(H), zbuf = new Float32Array(W), rdx = new Float32Array(W), rdy = new Float32Array(W)
const hits: (GridHit | null)[] = Array.from({ length: W }, () => null), hitStore: GridHit[] = Array.from({ length: W }, () => ({ dist: 0, tile: 0, side: 0, mx: 0, my: 0, u: 0 }))
const DRONE = ['..3...3..', '...6.6...', '.6699966.', '669999966', '.6666666.', '..63636..', '.3.....3.']
const N_FLOOR: V3 = [0, -1, 0], N_CEIL: V3 = [0, 1, 0]
function corridorLayers(g: Game): Layer[] {
  const c = g.c, dx = Math.cos(c.a), dy = Math.sin(c.a), px = -dy * FOV_PLANE, py = dx * FOV_PLANE, t = g.frame / 60
  const bob = Math.sin(c.walk * .18) * 1.2
  const hz = HORIZON + Math.round(bob)
  const lights = CORRIDOR.torches.filter(([x, y]) => Math.hypot(x - c.x, y - c.y) < 7)
    .map(([x, y], k): { p: V3; i: number } => ({ p: [x, -.15, y], i: 1.7 * (.88 + .08 * Math.sin(t * 11 + k * 1.7) + .04 * Math.sin(t * 23 + k * 3.1)) }))
  const lantern: V3 = [c.x, .05, c.y]
  // the same Lambert × soft inverse-square as `lampAt`, unrolled over flat arrays (27k cells × ~6 lights a frame)
  const nl = lights.length + 1, LX = new Float64Array(nl), LH = new Float64Array(nl), LY = new Float64Array(nl), LI = new Float64Array(nl), LR = new Float64Array(nl)
  LX[0] = lantern[0]; LH[0] = lantern[1]; LY[0] = lantern[2]; LI[0] = .55; LR[0] = 1 / (1.6 * 1.6)
  lights.forEach((L, k) => { LX[k + 1] = L.p[0]; LH[k + 1] = L.p[1]; LY[k + 1] = L.p[2]; LI[k + 1] = L.i; LR[k + 1] = 1 / (1.5 * 1.5) })
  const light = (x: number, h: number, y: number, n: V3) => {
    let l = .05
    const nx = n[0], nh = n[1], ny = n[2]
    for (let k = 0; k < nl; k++) {
      const ax = LX[k] - x, ah = LH[k] - h, ay = LY[k] - y, d2 = ax * ax + ah * ah + ay * ay, dot = ax * nx + ah * nh + ay * ny
      if (dot > 0) l += (LI[k] * dot) / Math.sqrt(d2 || 1e-12) / (1 + d2 * LR[k])
    }
    return l
  }
  for (let x = 0; x < W; x++) {
    const cam = (2 * (x + .5)) / W - 1
    rdx[x] = dx + px * cam; rdy[x] = dy + py * cam
    const hit = castGrid(CORRIDOR.map, c.x, c.y, rdx[x], rdy[x], 48, hitStore[x])
    hits[x] = hit; zbuf[x] = hit ? hit.dist : 1e9
  }
  for (let y = 0; y < H; y++) { const yc = y + .5; rowRd[y] = (FOCAL * .5) / Math.abs(yc - hz); rowFog[y] = fog(rowRd[y], 9, 1.2) }
  for (let x = 0; x < W; x++) {
    const hit = hits[x], d = hit ? hit.dist : 1e9, lineH = FOCAL / d, top = hz - lineH / 2, bot = hz + lineH / 2
    const hx = c.x + rdx[x] * d, hy = c.y + rdy[x] * d, fp = d / FOCAL
    const wallFog = fog(d, 10, 1.1)
    const n: V3 = hit ? (hit.side === 0 ? [-Math.sign(rdx[x]), 0, 0] : [0, 0, -Math.sign(rdy[x])]) : N_FLOOR
    for (let y = 0; y < H; y++) {
      const yc = y + .5
      let v: number
      if (hit && yc >= top && yc < bot) {
        const h = (yc - hz) / lineH // −.5 top … +.5 bottom
        const course = Math.floor((h + .5) / .25), along = hit.u * 2 + (course % 2) * .5
        if (seam(h + .5, .25, .025, fp) || seam(along, 1, .04, fp * 2)) v = .03
        else {
          const alb = .5 + .32 * hash01(hit.mx * 7 + hit.my * 131 + Math.floor(along), course)
          v = Math.min(.95, alb * light(hx, h, hy, n) * wallFog)
        }
      } else if (yc >= hz) {
        const rd = rowRd[y], wx = c.x + rdx[x] * rd, wy = c.y + rdy[x] * rd, cf = rd / FOCAL
        v = seam(wx, .5, .02, cf) || seam(wy, .5, .02, cf * 2) ? .02 : Math.min(.9, (.42 + .2 * hash01(Math.floor(wx * 2), Math.floor(wy * 2), 5)) * light(wx, .5, wy, N_FLOOR) * rowFog[y])
      } else {
        const rd = rowRd[y], wx = c.x + rdx[x] * rd, wy = c.y + rdy[x] * rd, cf = rd / FOCAL
        v = seam(wx, 1, .1, cf) || seam(wy, 1, .1, cf * 2) ? Math.min(.8, .6 * light(wx, -.5, wy, N_CEIL) * rowFog[y]) : .02
      }
      fb[y * W + x] = y < 13 ? v * .35 : v
    }
  }
  // drones, far to near, depth-tested against the walls
  const drones = c.drones.filter(d => d.hp > 0 || d.dead < 30).map(d => ({ d, cam: toCamera(c, d.x, d.y) })).filter(o => o.cam[1] > .2).sort((a, b) => b.cam[1] - a.cam[1])
  for (const { d, cam: [tx, ty] } of drones) {
    const sx = (W / 2) * (1 + tx / ty), size = (FOCAL * .42) / ty, w = size * 9 / 7
    const hover = -.08 + .05 * Math.sin(t * 3 + d.x * 5), sy = hz + (FOCAL * hover) / ty
    const fz = fog(ty, 10, 1.1), lit = clamp(.35 + lampAt(d.x, hover, d.y, [-dx, 0, -dy], lantern, 1.6, .9) + .25), dying = d.hp <= 0 ? d.dead / 30 : 0
    for (let y = Math.max(13, Math.floor(sy - size / 2)); y < Math.min(H, Math.ceil(sy + size / 2)); y++) {
      for (let x = Math.max(0, Math.floor(sx - w / 2)); x < Math.min(W, Math.ceil(sx + w / 2)); x++) {
        if (ty >= zbuf[x]) continue
        const ch = DRONE[Math.floor(((y + .5 - (sy - size / 2)) / size) * 7)]?.[Math.floor(((x + .5 - (sx - w / 2)) / w) * 9)]
        if (!ch || ch === '.') continue
        if (dying && masks.bayer(x, y, W, H) < dying) continue
        fb[y * W + x] = d.hit > 0 && d.hit % 4 < 2 ? .95 : Math.min(.95, lift(+ch / 9) * lit * fz + .04)
      }
    }
  }
  // torch flames and the waiting eyes, as sites
  const flames: V3[] = []
  for (const L of lights) {
    const [tx, ty] = toCamera(c, L.p[0], L.p[2])
    if (ty < .3 || ty > 8) continue
    const sx = Math.round((W / 2) * (1 + tx / ty)), sy = Math.round(hz + (FOCAL * -.15) / ty)
    if (sx < 1 || sx > W - 2 || sy < 14 || ty >= zbuf[sx] + .05) continue
    const f = fog(ty, 9, .6) * (L.i / 1.7)
    flames.push([sx, sy, Math.min(1, f)], [sx, Math.round(sy + 2.5 / ty + 1.5), .5 * f])
  }
  const out: Layer[] = [layer(scene, 'value'), layer(valued(flames, 2.2), 'value')]
  const [etx, ety] = toCamera(c, CORRIDOR.exit[0], CORRIDOR.exit[1])
  if (ety > .2) {
    const sx = (W / 2) * (1 + etx / ety), col = Math.round(sx)
    if (col >= 0 && col < W && ety < zbuf[col] + .4 && !(g.frame % 300 > 186 && g.frame % 300 < 198)) {
      const gap = Math.max(2.5, (FOCAL * .07) / ety), y = hz - (FOCAL * .06) / ety
      out.push(layer(T.dots([[sx - gap, y], [sx + gap, y]], clamp((FOCAL * .05) / ety, 1.4, 6)), 'active'))
    }
  }
  out.push(layer(T.dots([[W / 2 - 5, hz], [W / 2 + 5, hz], [W / 2, hz - 5], [W / 2, hz + 5]], .9), 'mid'))
  out.push(title('LEVEL 01'), score(g), lives(g))
  if (g.sf < 240) out.push(caption('FIND THE EYES  SPACE FIRES', W / 2, 136, 'idle'))
  if (g.pending) out.push(layer(T.big('CLEAR', W / 2, 60, { lattice: 2, smooth: true, align: 'center' })))
  return out
}

// ── maze: the lantern falls off around the red player dot ──────────────────────────────────────
const KEY_DOTS = (g: Game) => g.m.keys.map((k, i) => ({ k, at: [W / 2 + 30 + i * 6, 8.5] as Pt }))
function mazeLayers(g: Game, o: RenderOptions): Layer[] {
  const m = g.m, all = m.keys.every(Boolean), pulse = .5 + .5 * Math.sin(g.frame * .12)
  const seen = new Set(m.seen), lat = T.lattice(MAZE_K, MAZE_O[0], MAZE_O[1]), cols = Math.floor((W - MAZE_O[0]) / MAZE_K), rows = Math.floor((H - MAZE_O[1]) / MAZE_K)
  const keyAt = new Map(MAZE.keys.map(([x, y], i) => [y * MAZE.w + x, i]))
  const field: Field = (u, v) => {
    const cx = Math.round(u * (cols - 1)), cy = Math.round(v * (rows - 1))
    if (cx >= MAZE.w || cy >= MAZE.h) return 0
    const i = cy * MAZE.w + cx, d = Math.hypot(cx - m.x, cy - m.y), lit = clamp(1 - d / 9) ** 1.3
    if (MAZE.wall[i]) return lift(.1 + .85 * lit)
    if (cx === MAZE.exit[0] && cy === MAZE.exit[1]) return all ? .95 : .3 + .2 * pulse
    const k = keyAt.get(i)
    if (k !== undefined && !m.keys[k]) return .7 + .25 * pulse
    if (cx === m.x && cy === m.y) return 0
    const crumb = seen.has(i) && (cx + cy) % 2 === 0 ? .22 : 0
    return Math.max(crumb, lit > 0 ? .05 + .14 * lit : 0)
  }
  const grubs = m.grubs.filter(u => Math.hypot(u.x - m.x, u.y - m.y) < 9.5)
  const showMe = o.reduced || g.invuln === 0 || g.frame % 8 < 5
  return [
    layer(lat.at(field), 'value'),
    ...grubs.map(u => layer({ ...T.dots([mazeScreen(u.x, u.y)], MAZE_K * (1.05 + .15 * Math.sin(g.frame * .3 + u.hx))), field: () => .4 + .5 * clamp(1 - Math.hypot(u.x - m.x, u.y - m.y) / 9.5) }, 'idle')),
    ...(showMe ? [layer(T.dots([mazeScreen(m.x, m.y)], MAZE_K * 1.45), 'active')] : []),
    title('LEVEL 02'), score(g), lives(g),
    layer(T.dots(KEY_DOTS(g).filter(k => k.k).map(k => k.at), 1.7), 'value'),
    layer(T.dots(KEY_DOTS(g).filter(k => !k.k).map(k => k.at), 1.7), 'faint'),
    ...(g.sf < 240 ? [caption('TAKE THREE KEYS  THEN THE GATE', W / 2, 136, 'idle')] : []),
    ...(m.locked > 0 ? [caption('LOCKED', W / 2, 136, 'value')] : []),
    ...(g.pending ? [layer(T.big('CLEAR', W / 2, 60, { lattice: 2, smooth: true, align: 'center' }))] : []),
  ]
}

// ── surface: parallax backdrop at card pitch, ground and actors on lattice 2 ───────────────────
const BEE_A = ['#.#.#', '.###.', '..#..'], BEE_B = ['.....', '#####', '.#.#.']
const STARS_WIDE: V3[] = [...SKY_STARS, ...SKY_STARS.map(([x, y, v]): V3 => [x + 96 > W - 2 ? x - 40 : x + 96, y + 3, v]).filter(([x]) => x > 144)]
function surfaceLayers(g: Game, o: RenderOptions): Layer[] {
  const s = g.s, cam = s.cam, far = Math.floor(cam * 2 * .12), mid = Math.floor(cam * 2 * .45)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) fb[y * W + x] = lift(surfaceSky(x, y, far, mid))
  const lw = W / SURF_K, lh = H / SURF_K, gate = SURFACE.gate
  const ground: Field = (u, v) => {
    const c = Math.round(u * (lw - 1)), r = Math.round(v * (lh - 1)), w = c + cam
    if (w < 0 || w >= SURFACE.len) return 0
    const top = SURFACE.top[w]
    // the hive gate: a striped dome over the ground at the end of the run
    const gd = Math.hypot(w - (gate + 10), r - SURF_GROUND)
    if (r < SURF_GROUND && gd < 14) { const band = (r - (SURF_GROUND - 14)) / 14; return band * 6 - Math.floor(band * 6) < band * .55 ? 0 : .55 - .2 * band }
    if (top === SURF_PIT) return 0
    if (r === SURF_GROUND && top === SURF_GROUND) return .95
    if (r > SURF_GROUND) {
      const rr = r - SURF_GROUND - 1, course = Math.floor(rr / 4)
      if (rr % 4 === 3 || (w + (course % 2) * 3) % 6 === 5) return 0
      return lift(clamp(.62 - .045 * rr))
    }
    if (r >= top && r <= SURF_GROUND) {
      // crates: lit top edge, plank seam
      return r === top ? .9 : (r - top) % 3 === 2 && r < SURF_GROUND ? .25 : .7
    }
    return 0
  }
  const motes: V3[] = SURFACE.motes.flatMap(([mx, my], i): V3[] => s.motes[i] || mx < cam || mx > cam + lw ? [] : [[(mx - cam) * 2, my * 2, .6 + .35 * Math.sin(g.frame * .2 + i)]])
  const bees = s.bees.filter(b => b.alive && b.x > cam - 6 && b.x < cam + lw).map(b => layer(sprite(g.frame % 10 < 5 ? BEE_A : BEE_B, SURF_K, (Math.round(b.x) - cam) * 2, Math.round(b.y + 2 * Math.sin((g.sf + b.phase) * .08) - 2) * 2), 'value'))
  const art = !s.ground ? RUN_A : Math.abs(s.vx) < .03 ? RUN_B : Math.floor(s.run / 1.6) % 2 ? RUN_A : RUN_B
  const showMe = o.reduced || g.invuln === 0 || g.frame % 8 < 5
  return [
    layer(valued(STARS_WIDE, .9), 'value'), layer(scene, 'value'),
    layer({ field: ground, lattice: SURF_K, origin: [0, 0] }, 'value'),
    layer(valued(motes, 1.3), 'value'),
    ...bees,
    ...(showMe ? [layer(sprite(art, SURF_K, (Math.round(s.x) - cam) * 2, Math.round(s.y - PH) * 2), 'active')] : []),
    title('LEVEL 03'), score(g), lives(g),
    ...(g.sf < 240 ? [caption('RUN  JUMP  STOMP THE BEES', W / 2, 20, 'idle')] : []),
    ...(g.pending ? [layer(T.big('CLEAR', W / 2, 40, { lattice: 2, smooth: true, align: 'center' }))] : []),
  ]
}

// ── void: the warp to the hive ────────────────────────────────────────────────────────────────
const WARP = { cx: W / 2, cy: 78, f: 26, depth: 4, trail: .45 }
const WARP_STARS = Array.from({ length: 160 }, (_, n) => {
  const a = hash01(n, 51) * Math.PI * 2, r = .12 + 1.5 * Math.sqrt(hash01(n, 52))
  return { x: Math.cos(a) * r * 1.3, y: Math.sin(a) * r, z: hash01(n, 53) * WARP.depth }
})
function voidLayers(g: Game): Layer[] {
  const t = g.sf / 60, speed = 1.5 + t * 1.2, bands: V3[][] = [[], [], []]
  for (const s of WARP_STARS) {
    const z = ((((s.z - t * speed) % WARP.depth) + WARP.depth) % WARP.depth) + .15
    const b = clamp(1.15 - z / WARP.depth) ** 1.2, band = z < 1.2 ? 0 : z < 2.6 ? 1 : 2, tr = WARP.trail * (1 + t * .5)
    const hx = WARP.cx + (WARP.f * s.x) / z, hy = WARP.cy + (WARP.f * s.y) / z, tx = WARP.cx + (WARP.f * s.x) / (z + tr), ty = WARP.cy + (WARP.f * s.y) / (z + tr)
    const n = Math.max(1, Math.round(Math.hypot(hx - tx, hy - ty) / 1.6))
    for (let q = 0; q <= n; q++) {
      const x = Math.round(hx + ((tx - hx) * q) / n), y = Math.round(hy + ((ty - hy) * q) / n)
      if (x < 1 || x > W - 2 || y < 15 || y > H - 2 || (y > 128 && Math.abs(x - W / 2) < 40)) continue
      bands[band].push([x, y, b * (1 - (.75 * q) / (n + 1))])
    }
  }
  const ly = Math.max(0, .4 - t * .14)
  return [
    layer(valued(bands[2], .8), 'value'), layer(valued(bands[1], 1.1), 'value'), layer(valued(bands[0], 1.5), 'value'),
    layer({ ...T.dotRing(WARP.cx, WARP.cy, 7 + t * 3, { spacing: 2.3, size: .9 }), field: () => .35 }, 'value'),
    layer(T.dots([[WARP.cx, WARP.cy]], 4.5 + t * 2), 'active'),
    layer(T.big(`HIVE ${ly.toFixed(1)} LY`, W / 2, 134, { lattice: CAP, align: 'center' }), 'idle'),
    title('WARP'), score(g), lives(g),
  ]
}

// ── queen: lattice-4 boss, red eye, bullet patterns, health bar ────────────────────────────────
function queenLayers(g: Game, o: RenderOptions): Layer[] {
  const q = g.q, lat = T.lattice(QK, q.ox, q.oy), cols = Math.floor((W - q.ox) / QK), rows = Math.floor((H - q.oy) / QK)
  const dying = q.dying / 150, hot = q.hit > 0 ? .2 : 0
  const [ex] = queenEyeAt(q), look = q.shipX < ex - 14 ? -1 : q.shipX > ex + 14 ? 1 : 0
  const at = (u: number, v: number) => [Math.round(u * (cols - 1)), Math.round(v * (rows - 1))]
  const body: Field = (u, v) => {
    const [c, r] = at(u, v), ch = QUEEN[r]?.[c]
    if (!ch || ch === '.') return 0
    if (dying && masks.bayer(c * 3, r * 3, W, H) < dying) return 0
    if (ch === 'E') return q.eye ? 0 : r === EYE[1] ? .5 : 0
    const glow = q.eye ? .45 * Math.exp(-Math.hypot(c - EYE[0], r - EYE[1]) / 2.4) : 0
    return Math.min(.95, lift(+ch / 9) + glow + hot)
  }
  const eye: Field = (u, v) => {
    const [c, r] = at(u, v)
    if (dying && masks.bayer(c * 3, r * 3, W, H) < dying) return 0
    return QUEEN[r]?.[c] === 'E' && !(r === EYE[1] && c === EYE[0] + look) ? 1 : 0
  }
  const HP = 30, hp = Math.ceil((q.hp / QUEEN_HP) * HP), bx = 40
  const [sx, sy] = SHIP_ORIGIN(q), showMe = o.reduced || g.invuln === 0 || g.frame % 8 < 5
  return [
    layer(lat.at(body), 'value'),
    ...(q.eye ? [layer(lat.at(eye), 'active')] : []),
    layer(T.dots(q.bullets.map(b => [Math.round(b.x), Math.round(b.y)] as Pt), 1.5), 'value'),
    layer(T.dots(q.shots.flatMap(s => [[Math.round(s.x), Math.round(s.y)], [Math.round(s.x), Math.round(s.y) + 2]] as Pt[]), 1), 'idle'),
    ...(showMe && g.lives > 0 ? [layer(sprite(SHIP, 1.3, sx, sy), 'value')] : []),
    layer(T.big('QUEEN', 5, 134, { lattice: CAP }), 'idle'),
    layer(T.dots(Array.from({ length: hp }, (_, n) => [bx + n * 5, 136.5] as Pt), 2), 'value'),
    layer(T.dots(Array.from({ length: HP - hp }, (_, n) => [bx + (n + hp) * 5, 136.5] as Pt), 2), 'faint'),
    title('LEVEL 04'), score(g), lives(g),
    ...(g.sf < 150 ? [caption('SHOOT WHILE HER EYE IS OPEN', W / 2, 84, 'idle')] : []),
  ]
}

// ── over / win / entry / scores ────────────────────────────────────────────────────────────────
const OVER_FLOOR: Hall = { vx: W / 2, vy: 92, f: 46, floor: 1, far: 14 }
function overLayers(g: Game): Layer[] {
  floorGrid(OVER_FLOOR, -g.frame / 60 * .35, .6)
  for (let y = 99; y < H; y++) for (let x = 40; x < W - 40; x++) fb[y * W + x] = 0
  const n = Math.max(0, Math.floor(g.count / 60))
  return [
    layer(scene, 'value'),
    layer(T.big('GAME', W / 2, 20, { lattice: 2, smooth: true, align: 'center' })),
    layer(T.big('OVER', W / 2, 54, { lattice: 2, smooth: true, align: 'center' })),
    layer(T.big('CONTINUE?', W / 2 - 44, 108, { lattice: 1 }), 'idle'),
    layer(T.big(String(n), W / 2 + 44, 103, { lattice: 1.3, smooth: true, align: 'right' }), 'active'),
    layer(T.big(`SCORE ${scoreText(g.score)}`, W / 2, 134, { lattice: CAP, align: 'center' }), 'mid'),
    title(g.resume.toUpperCase()),
  ]
}
function winLayers(g: Game): Layer[] {
  floorGrid(TITLE_FLOOR, g.frame / 60 * 2, .6); hiveMoon(W / 2, 98, 24 - Math.min(24, Math.floor(g.sf / 6)))
  return [
    layer(scene, 'value'),
    layer(T.big('HIVE', W / 2, 18, { lattice: 2, smooth: true, align: 'center' })),
    layer(T.big('CLEARED', W / 2, 50, { lattice: 2, smooth: true, align: 'center' })),
    layer(T.big(scoreText(g.score), W / 2, 104, { lattice: 1.6, smooth: true, align: 'center' }), 'value'),
    ...(blink(g, 72, 48) && g.sf > 60 ? [caption('PRESS START', W / 2, 134, 'idle')] : []),
    title('LEVEL 04'), score(g),
  ]
}
function entryLayers(g: Game): Layer[] {
  const e = g.e, L = 2.5, adv = 6 * L, x0 = W / 2 - (3 * adv) / 2
  const out: Layer[] = [
    title('NEW HIGH SCORE'),
    layer(T.big(scoreText(g.score), W / 2, 22, { lattice: 2, smooth: true, align: 'center' })),
    layer(T.hrule(30, 58, W - 60, 2), 'faint'),
  ]
  e.letters.forEach((li, i) => out.push(layer(T.big(LETTERS[li], x0 + i * adv + adv / 2, 70, { lattice: L, align: 'center' }), i === e.pos ? 'active' : i < e.pos ? 'value' : 'mid')))
  if (blink(g, 30, 18)) out.push(layer(T.dotLine(x0 + e.pos * adv + 2, 92, x0 + e.pos * adv + adv - 4, 92, { spacing: 1.5, size: 1 }), 'value'))
  out.push(caption('UP DOWN LETTER  RIGHT OR FIRE NEXT', W / 2, 120), caption(`RANK ${e.rank + 1}`, W / 2, 132, 'idle'))
  return out
}
const RANK = ['1ST', '2ND', '3RD', '4TH', '5TH', '6TH']
const ROW_TONE = ['value', 'idle', 'idle', 'mid', 'mid', 'faint'] as const
function scoresLayers(g: Game): Layer[] {
  const RL = 1.3, row = (i: number) => 56 + i * 14, top = g.table[0]
  const out: Layer[] = [
    title('HIGH SCORES'),
    layer(T.big(`1ST ${top?.name ?? '---'}`, 24, 21, { lattice: CAP }), g.mine === 0 ? 'active' : 'idle'),
    layer(T.big(scoreText(top?.score ?? 0), W / 2, 28, { lattice: 2, smooth: true, align: 'center' })),
    layer(T.hrule(24, 50, W - 48, 2), 'faint'),
  ]
  g.table.slice(1).forEach((r, k) => {
    const i = k + 1, tone = g.mine === i ? 'active' : ROW_TONE[i]
    out.push(layer(T.big(RANK[i], 24, row(k), { lattice: RL }), tone), layer(T.big(r.name, W / 2 - 14, row(k), { lattice: RL }), tone), layer(T.big(scoreText(r.score), W - 24, row(k), { lattice: RL, align: 'right' }), tone))
  })
  if (g.sf > 60 && blink(g, 72, 48)) out.push(caption('PRESS START', W / 2, 134, 'idle'))
  return out
}

/** Everything on screen for this state. */
export function gameLayers(g: Game, o: RenderOptions = {}): Layer[] {
  let out: Layer[]
  switch (g.stage) {
    case 'title': out = titleLayers(g); break
    case 'corridor': out = corridorLayers(g); break
    case 'maze': out = mazeLayers(g, o); break
    case 'surface': out = surfaceLayers(g, o); break
    case 'void': out = voidLayers(g); break
    case 'queen': out = queenLayers(g, o); break
    case 'over': out = overLayers(g); break
    case 'win': out = winLayers(g); break
    case 'entry': out = entryLayers(g); break
    case 'scores': out = scoresLayers(g); break
  }
  if (!o.reduced) {
    const fl = [...g.flashes]
    if (g.stage === 'corridor' && g.c.muzzle > 0) fl.push({ x: W / 2, y: H - 6, r: 18, age: 6 - g.c.muzzle, life: 7 })
    const f = flashLayer(fl)
    if (f) out.push(f)
  }
  if (o.paused) {
    // dim everything that reads the scene buffer and float PAUSED over it
    for (let i = 0; i < fb.length; i++) fb[i] *= .25
    out = out.map(l => ({ ...l, tone: 'faint' as const, toneOf: undefined }))
    out.push(layer(T.big('PAUSED', W / 2, 56, { lattice: 2, smooth: true, align: 'center' })), caption('PRESS START OR CLICK', W / 2, 90, 'idle'))
  }
  return out
}
