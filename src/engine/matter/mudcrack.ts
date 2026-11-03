/**
 * Drying mud: cracks laid down one after another, each one starting from a crack already there and running off at
 * about a right angle until it meets another crack or the edge, so the cracks join in T-junctions and close the
 * mud into polygons (the sequential cracking of a drying layer: Bohn, Pauchard and Couder, "Hierarchical crack
 * pattern as formed by successive domain divisions", Phys. Rev. E 2005). The first cracks run edge to edge and are
 * wider; later ones are shorter and finer. A crack's walk drifts a little each step, so the polygons read as mud,
 * not a grid.
 *
 * Deterministic (F0.9 lint): `dsin` / `dcos` / `datan2`, `rngFor`, no other Math beyond floor / round / abs.
 */
import { dcos, dsin, rngFor } from '../noise/dmath'

export interface MudOptions {
  cols: number
  rows: number
  /** 1 where the mud is. */
  mask: Uint8Array
  seed: number
  /** Cracks to lay (default 36), and how many of the first are 2 cells wide (default 3). */
  cracks?: number
  wide?: number
  /** Turn per half-cell step, radians at most (default .05), and the spread round a right angle at a start (default .2). */
  wander?: number
  spread?: number
}
export interface Mud {
  readonly cols: number
  readonly rows: number
  /** Crack cells in the order they open. */
  readonly order: Int32Array
  /** Crack k is order[start[k] … start[k + 1]). */
  readonly start: Int32Array
  readonly count: number
  /** Per cell: the crack it belongs to (−1: mud). */
  readonly crackOf: Int16Array
  /** Per cell: the crack's heading there (radians), for the next crack to start square to it. */
  readonly heading: Float32Array
}

export function mudCracks(o: MudOptions): Mud {
  const { cols, rows, mask } = o, n = cols * rows, rand = rngFor(o.seed, 53), want = o.cracks ?? 36, wide = o.wide ?? 3
  const wander = o.wander ?? .05, spread = o.spread ?? .2
  const crackOf = new Int16Array(n).fill(-1), heading = new Float32Array(n), order: number[] = [], start: number[] = []
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows && mask[y * cols + x] === 1
  // the mud's cells, for the first crack's start
  const cells: number[] = []
  for (let i = 0; i < n; i++) if (mask[i]) cells.push(i)
  let k = 0
  for (let tries = 0; k < want && tries < want * 12; tries++) {
    let x: number, y: number, a: number, parent = -1
    if (k === 0) {
      // the first crack: straight across, through a cell near the middle, both ways from it
      const c = cells[Math.floor(cells.length * (.4 + .2 * rand()))]
      x = c % cols; y = (c / cols) | 0; a = rand() * 3.141592653589793
    } else {
      const c = order[Math.floor(rand() * order.length)]
      parent = crackOf[c]
      a = heading[c] + (rand() < .5 ? -1 : 1) * (1.5707963267948966 + (rand() - .5) * 2 * spread)
      x = c % cols + dcos(a) * 1.2; y = ((c / cols) | 0) + dsin(a) * 1.2
    }
    const mine: number[] = [], w = k < wide
    const walk = (x0: number, y0: number, a0: number) => {
      let px = x0, py = y0, ang = a0, last = -1, steps = 0
      for (;;) {
        const cx = Math.round(px), cy = Math.round(py)
        if (!inside(cx, cy)) return
        const q = cy * cols + cx
        if (q !== last) {
          const lx = last % cols, ly = (last / cols) | 0
          // another crack (or our own, older than the last few cells), or a diagonal slipping between two crack cells
          const hit = (c: number) => crackOf[c] >= 0 && !(crackOf[c] === k && mine.indexOf(c) >= mine.length - 4) && !(steps < 4 && crackOf[c] === parent)
          if (hit(q) || (last >= 0 && lx !== cx && ly !== cy && hit(ly * cols + cx) && hit(cy * cols + lx))) return
          if (crackOf[q] < 0) { crackOf[q] = k; heading[q] = ang; mine.push(q) }
          if (w) {
            // the wide cracks: the cell to their left too
            const sx = Math.round(px - dsin(ang)), sy = Math.round(py + dcos(ang)), s = sy * cols + sx
            if (inside(sx, sy) && crackOf[s] < 0) { crackOf[s] = k; heading[s] = ang; mine.push(s) }
          }
          last = q
        }
        ang += (rand() - .5) * 2 * wander
        px += .5 * dcos(ang); py += .5 * dsin(ang); steps++
      }
    }
    walk(x, y, a)
    const split = mine.length
    if (k === 0) walk(x + dcos(a + 3.141592653589793), y + dsin(a + 3.141592653589793), a + 3.141592653589793)
    if (mine.length < 5) { for (const c of mine) crackOf[c] = -1; continue }
    start.push(order.length)
    // the first crack opens from one end to the other (its second walk ran the other way from the middle)
    if (k === 0) order.push(...mine.slice(0, split).reverse(), ...mine.slice(split))
    else order.push(...mine)
    k++
  }
  start.push(order.length)
  return { cols, rows, order: Int32Array.from(order), start: Int32Array.from(start), count: k, crackOf, heading }
}
