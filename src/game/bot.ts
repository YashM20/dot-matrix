/**
 * Autopilot: a pure function of the game state that returns the buttons a decent player would hold.
 * Used by the headless play-through (`scripts/game.ts`) and the browser screenshots: its inputs are
 * recorded and replayed, which is what proves the sim deterministic.
 */
import { BTN, type StepInput } from './buttons'
import { PW, lineOfSight, toCamera, type Game } from './sim'
import { CORRIDOR, MAZE, SURFACE, SURF_PIT, bfs } from './world'

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const tap = (g: Game, b: number) => (g.frame % 2 ? b : 0)

/** Next tile on the shortest path from (x, y) to (tx, ty) over a 0 = open grid. */
function nextTile(wall: ArrayLike<number>, w: number, h: number, x: number, y: number, tx: number, ty: number): [number, number] | null {
  const d = bfs(wall as Uint8Array, w, h, [tx, ty]), here = d[y * w + x]
  if (here <= 0) return here === 0 ? [tx, ty] : null
  for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + a, ny = y + b
    if (nx >= 0 && ny >= 0 && nx < w && ny < h && d[ny * w + nx] === here - 1) return [nx, ny]
  }
  return null
}
const corridorWall = CORRIDOR.map.cells as Uint8Array

export function autopilot(g: Game): StepInput {
  switch (g.stage) {
    case 'title': case 'win': case 'scores': case 'over': return { b: g.sf > 70 ? tap(g, BTN.a) : 0 }
    case 'entry': return { b: g.frame % 6 === 0 ? BTN.right : 0 }
    case 'void': return { b: 0 }
    case 'corridor': {
      const c = g.c
      // a drone in sight: face it and fire
      for (const d of c.drones) {
        if (d.hp <= 0 || Math.hypot(d.x - c.x, d.y - c.y) > 4.5 || !lineOfSight(c.x, c.y, d.x, d.y)) continue
        const [, ty] = toCamera(c, d.x, d.y)
        const want = Math.atan2(d.y - c.y, d.x - c.x), diff = wrap(want - c.a)
        if (ty <= 0 && Math.abs(diff) > 1.2) continue
        let b = BTN.a * (g.frame % 2)
        if (diff > .03) b |= BTN.right; else if (diff < -.03) b |= BTN.left
        if (Math.hypot(d.x - c.x, d.y - c.y) > 2.2 && Math.abs(diff) < .3) b |= BTN.up
        return { b }
      }
      const step = nextTile(corridorWall, CORRIDOR.map.w, CORRIDOR.map.h, Math.floor(c.x), Math.floor(c.y), Math.floor(CORRIDOR.exit[0]), Math.floor(CORRIDOR.exit[1]))
      if (!step) return { b: 0 }
      const want = Math.atan2(step[1] + .5 - c.y, step[0] + .5 - c.x), diff = wrap(want - c.a)
      let b = 0
      if (diff > .05) b |= BTN.right; else if (diff < -.05) b |= BTN.left
      if (Math.abs(diff) < .45) b |= BTN.up
      return { b }
    }
    case 'maze': {
      const m = g.m, i = m.keys.findIndex(k => !k)
      let target: [number, number] = MAZE.exit
      if (i >= 0) {
        // nearest key by walking distance
        const d = bfs(MAZE.wall, MAZE.w, MAZE.h, [m.x, m.y])
        target = MAZE.keys.filter((_, k) => !m.keys[k]).sort((p, q) => d[p[1] * MAZE.w + p[0]] - d[q[1] * MAZE.w + q[0]])[0]
      }
      const step = nextTile(MAZE.wall, MAZE.w, MAZE.h, m.x, m.y, target[0], target[1])
      if (!step) return { b: 0 }
      const ax = step[0] - m.x, ay = step[1] - m.y
      return { b: ax > 0 ? BTN.right : ax < 0 ? BTN.left : ay > 0 ? BTN.down : BTN.up }
    }
    case 'surface': {
      const s = g.s
      let b = BTN.right
      if (!s.ground && s.vy < 0) b |= BTN.a
      if (s.ground) {
        const front = s.x + PW
        let need = false
        for (let c = Math.floor(front); c < front + 3; c++) {
          const top = SURFACE.top[c] ?? 58
          if (top === SURF_PIT || top < s.y - 1) need = true
        }
        for (const bee of s.bees) if (bee.alive && bee.y > 50 && bee.x - front > 4 && bee.x - front < 8) need = true
        if (need && g.frame % 2) b |= BTN.a
      }
      return { b }
    }
    case 'queen': {
      const q = g.q
      // dodge the nearest threat sideways, otherwise sit under the eye and fire
      const ex = q.ox + 42
      let b = g.frame % 2 ? BTN.a : 0, dx = ex - q.shipX
      for (const bl of q.bullets) {
        const ry = q.shipY - bl.y
        if (ry < -4 || ry > 22) continue
        const rx = bl.x + bl.vx * (ry / Math.max(.3, bl.vy)) - q.shipX
        if (Math.abs(rx) < 7) { dx = rx > 0 ? -20 : 20; break }
      }
      if (dx > 1.5) b |= BTN.right; else if (dx < -1.5) b |= BTN.left
      if (q.shipY < 128) b |= BTN.down
      return { b }
    }
  }
}
