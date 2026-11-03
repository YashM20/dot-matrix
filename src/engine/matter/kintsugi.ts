/**
 * Impact fracture for a kintsugi plate (docs/living-matter/X-advanced.md #3). A break is seeded at the impact, after the
 * impact-aligned patterns of Müller, Chentanez & Kim (SIGGRAPH 2013): shard seeds on a few jittered spokes round the
 * impact, on two or three rings, and each cell takes the nearest seed under a metric stretched along the seed's radius
 * (so shards run long from the impact, as a struck plate breaks), the cell's position warped by fBm so the edges read
 * as ceramic rather than a Voronoi diagram. A crack is the edge between two shards.
 *
 * Old seams stop a new break: the break only reaches the piece of plate the impact is in (the cells joined to it
 * without crossing a seam or the rim), so every new crack ends at the rim or at a crack that was there. Islands and
 * slivers are merged into a neighbour, so every shard is one 4-connected piece and the shards tile the piece.
 * Cracks open and fill in their order along the network from the impact (`reach`, a Dijkstra walk over crack cells).
 *
 * Deterministic (F0.9 lint): `dsin` / `dcos`, `fbm2`, `rngFor`, `Math.sqrt`; no other Math.
 */
import { dcos, dsin, rngFor } from '../noise/dmath'
import { fbm2 } from '../noise/gradient'

export interface FractureOptions {
  cols: number
  rows: number
  /** 1 where the plate is. */
  plate: Uint8Array
  /** 1 on seams already in the plate: a new break stops at them. */
  seams?: Uint8Array
  /** Where it was struck (cells). Nudged off a seam onto the nearest free cell. */
  impact: readonly [number, number]
  seed: number
  /** Spokes round the impact (drawn in [lo, hi], default [4, 6]) and rings of seeds along them (default 2). */
  spokes?: readonly [number, number]
  rings?: number
  /** The metric's radial axis is scaled by this (< 1: shards long along the radius; default .5). */
  stretch?: number
  /** fBm warp of the edges, cells (default 2.4), and its feature size (default 11 cells). */
  warp?: number
  warpScale?: number
  /** Shards smaller than this (cells) merge into a neighbour (default: a fourteenth of the piece, at least 30). */
  minArea?: number
}

export interface Fracture {
  readonly cols: number
  readonly rows: number
  readonly impact: readonly [number, number]
  /** Per cell: −1 off the plate or on an old seam, 0 the plate outside the broken piece, 1 … `count` a shard. */
  readonly shard: Int16Array
  /** Shards (ids 1 … count). */
  readonly count: number
  /** Per cell: 1 on a new crack (the edge cells of the lower-id shard of each pair). */
  readonly crack: Uint8Array
  /** Per crack cell: its distance from the impact along the cracks (cells); −1 elsewhere. */
  readonly reach: Float32Array
  readonly maxReach: number
  /** Crack cells in reach order. */
  readonly order: Int32Array
  /** Per shard id: centroid, area, and the unit direction from the impact to the centroid (index 0 unused). */
  readonly cx: Float32Array
  readonly cy: Float32Array
  readonly area: Int32Array
  readonly ux: Float32Array
  readonly uy: Float32Array
  /** Per crack cell: the crack's unit tangent (a local fit over 5 × 5 cells); 0 elsewhere. */
  readonly tx: Float32Array
  readonly ty: Float32Array
}

const N4 = [1, 0, -1, 0, 0, 1, 0, -1]

/** The piece of plate joined to `start` without crossing a seam (4-connected flood). */
function pieceOf(o: FractureOptions, start: number): Uint8Array {
  const { cols, rows, plate, seams } = o, n = cols * rows, inPiece = new Uint8Array(n), stack = [start]
  const free = (i: number) => plate[i] === 1 && !(seams && seams[i])
  if (!free(start)) return inPiece
  inPiece[start] = 1
  while (stack.length) {
    const c = stack.pop()!, x = c % cols, y = (c / cols) | 0
    for (let k = 0; k < 8; k += 2) {
      const nx = x + N4[k], ny = y + N4[k + 1]
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
      const q = ny * cols + nx
      if (!inPiece[q] && free(q)) { inPiece[q] = 1; stack.push(q) }
    }
  }
  return inPiece
}

/** The free cell nearest (x, y) (itself when free). */
function nearestFree(o: FractureOptions, x: number, y: number): number {
  const { cols, rows, plate, seams } = o
  let best = -1, bd = Infinity
  for (let r = 0; r < 6 && best < 0; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const nx = x + dx, ny = y + dy
    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
    const q = ny * cols + nx, d = dx * dx + dy * dy
    if (plate[q] === 1 && !(seams && seams[q]) && d < bd) { bd = d; best = q }
  }
  return best
}

/**
 * Merge every shard component that is not its label's largest, or is under `minArea`, into the neighbouring label it
 * shares the longest border with (ties to the lower label). Typed arrays only: this runs once a break.
 */
function cleanShards(shard: Int16Array, cols: number, rows: number, minArea: number, labels: number): void {
  const n = cols * rows, comp = new Int32Array(n), list = new Int32Array(n), votes = new Int32Array(labels + 2)
  for (let pass = 0; pass < 4; pass++) {
    comp.fill(-1)
    // components, flood-filled into `list` back to back: component k is list[start[k] … start[k + 1])
    const start: number[] = [], label: number[] = []
    let top = 0
    for (let s = 0; s < n; s++) {
      if (shard[s] < 1 || comp[s] >= 0) continue
      const id = start.length, l = shard[s]
      start.push(top); label.push(l)
      comp[s] = id; list[top++] = s
      for (let h = start[id]; h < top; h++) {
        const c = list[h], x = c % cols
        if (x > 0 && comp[c - 1] < 0 && shard[c - 1] === l) { comp[c - 1] = id; list[top++] = c - 1 }
        if (x < cols - 1 && comp[c + 1] < 0 && shard[c + 1] === l) { comp[c + 1] = id; list[top++] = c + 1 }
        if (c >= cols && comp[c - cols] < 0 && shard[c - cols] === l) { comp[c - cols] = id; list[top++] = c - cols }
        if (c < n - cols && comp[c + cols] < 0 && shard[c + cols] === l) { comp[c + cols] = id; list[top++] = c + cols }
      }
    }
    start.push(top)
    const K = label.length, biggest = new Int32Array(labels + 2).fill(-1)
    for (let k = 0; k < K; k++) { const b = biggest[label[k]]; if (b < 0 || start[k + 1] - start[k] > start[b + 1] - start[b]) biggest[label[k]] = k }
    let changed = false
    for (let k = 0; k < K; k++) {
      if (biggest[label[k]] === k && start[k + 1] - start[k] >= minArea) continue
      votes.fill(0)
      for (let h = start[k]; h < start[k + 1]; h++) {
        const c = list[h], x = c % cols
        const nb = [x > 0 ? c - 1 : -1, x < cols - 1 ? c + 1 : -1, c >= cols ? c - cols : -1, c < n - cols ? c + cols : -1]
        for (const q of nb) { if (q < 0) continue; const l = shard[q]; if (l >= 1 && l !== label[k]) votes[l]++ }
      }
      let to = -1, most = 0
      for (let l = 1; l < votes.length; l++) if (votes[l] > most) { most = votes[l]; to = l }
      if (to < 0) continue
      for (let h = start[k]; h < start[k + 1]; h++) shard[list[h]] = to
      changed = true
    }
    if (!changed) break
  }
}

/** A min-heap of (cost, cell) for the crack walk. */
function dijkstra(crack: Uint8Array, cols: number, rows: number, start: Float64Array, reach: Float32Array): void {
  const heap: number[] = [], cost: number[] = []
  const push = (c: number, d: number) => {
    let i = heap.length
    heap.push(c); cost.push(d)
    while (i > 0) { const p = (i - 1) >> 1; if (cost[p] <= d) break; heap[i] = heap[p]; cost[i] = cost[p]; i = p }
    heap[i] = c; cost[i] = d
  }
  const pop = (): number => {
    const top = heap[0], c = heap.pop()!, d = cost.pop()!
    if (heap.length) {
      let i = 0
      for (;;) {
        const l = 2 * i + 1, r = l + 1
        let m = i, md = d
        if (l < heap.length && cost[l] < md) { m = l; md = cost[l] }
        if (r < heap.length && cost[r] < md) { m = r; md = cost[r] }
        if (m === i) break
        heap[i] = heap[m]; cost[i] = cost[m]; i = m
      }
      heap[i] = c; cost[i] = d
    }
    return top
  }
  const best = new Float64Array(crack.length).fill(Infinity)
  for (let i = 0; i < crack.length; i++) if (crack[i]) { best[i] = start[i]; push(i, start[i]) }
  while (heap.length) {
    const d0 = cost[0], c = pop()
    if (d0 > best[c]) continue
    reach[c] = d0
    const x = c % cols, y = (c / cols) | 0
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
      const q = ny * cols + nx
      if (!crack[q]) continue
      const d = d0 + (dx && dy ? Math.SQRT2 : 1)
      if (d < best[q]) { best[q] = d; push(q, d) }
    }
  }
}

export function fracture(o: FractureOptions): Fracture {
  const { cols, rows } = o, n = cols * rows, rand = rngFor(o.seed, 31)
  const stretch = o.stretch ?? .5, warp = o.warp ?? 2.4, ws = o.warpScale ?? 11, rings = o.rings ?? 2, [lo, hi] = o.spokes ?? [4, 6]
  const start = nearestFree(o, Math.round(o.impact[0]), Math.round(o.impact[1]))
  const ix = start < 0 ? o.impact[0] : start % cols, iy = start < 0 ? o.impact[1] : (start / cols) | 0
  const piece = start < 0 ? new Uint8Array(n) : pieceOf(o, start)
  // the piece's reach from the impact sets the rings' radii
  let far = 0, pieceArea = 0
  for (let i = 0; i < n; i++) if (piece[i]) { pieceArea++; const dx = (i % cols) - ix, dy = ((i / cols) | 0) - iy, d = dx * dx + dy * dy; if (d > far) far = d }
  far = Math.sqrt(far)
  // seeds: spokes × rings, jittered; ring k's spokes turned half a spoke from ring k − 1's
  const spokes = lo + Math.floor(rand() * (hi - lo + 1)), a0 = rand() * 6.283185307179586, sx: number[] = [], sy: number[] = [], sux: number[] = [], suy: number[] = []
  const RING = [.24, .62, .95]
  for (let k = 0; k < rings; k++) for (let j = 0; j < spokes; j++) {
    const a = a0 + (j + (k % 2) * .5 + (rand() - .5) * .5) * 6.283185307179586 / spokes, r = far * RING[Math.min(2, k)] * (.85 + .3 * rand())
    const ux = dcos(a), uy = dsin(a)
    sx.push(ix + r * ux); sy.push(iy + r * uy); sux.push(ux); suy.push(uy)
  }
  const S = sx.length, shard = new Int16Array(n).fill(-1)
  // the warp on a 3-cell grid, read back bilinearly (it is smooth over 11 cells: a ninth of the noise, nothing lost)
  const gw = Math.ceil(cols / 3) + 2, gh = Math.ceil(rows / 3) + 2, WX = new Float64Array(gw * gh), WY = new Float64Array(gw * gh)
  for (let j = 0; j < gh; j++) for (let k = 0; k < gw; k++) { const x = 3 * k / ws, y = 3 * j / ws; WX[j * gw + k] = warp * fbm2(x, y, 3, o.seed); WY[j * gw + k] = warp * fbm2(x + 17.3, y - 4.1, 3, o.seed) }
  for (let i = 0; i < n; i++) {
    if (!o.plate[i] || (o.seams && o.seams[i])) continue
    if (!piece[i]) { shard[i] = 0; continue }
    const x = i % cols, y = (i / cols) | 0, gx = x / 3, gy = y / 3, k = Math.floor(gx), j = Math.floor(gy), u = gx - k, v = gy - j, g = j * gw + k
    const px = x + (WX[g] * (1 - u) + WX[g + 1] * u) * (1 - v) + (WX[g + gw] * (1 - u) + WX[g + gw + 1] * u) * v
    const py = y + (WY[g] * (1 - u) + WY[g + 1] * u) * (1 - v) + (WY[g + gw] * (1 - u) + WY[g + gw + 1] * u) * v
    let best = 0, bd = Infinity
    for (let s = 0; s < S; s++) {
      const dx = px - sx[s], dy = py - sy[s], along = (dx * sux[s] + dy * suy[s]) * stretch, across = dx * suy[s] - dy * sux[s], d = along * along + across * across
      if (d < bd) { bd = d; best = s }
    }
    shard[i] = best + 1
  }
  cleanShards(shard, cols, rows, o.minArea ?? Math.max(30, Math.round(pieceArea / 14)), S)
  // relabel 1 … count in order of first appearance
  const remap = new Map<number, number>()
  for (let i = 0; i < n; i++) if (shard[i] >= 1) { let m = remap.get(shard[i]); if (!m) remap.set(shard[i], (m = remap.size + 1)); shard[i] = m }
  const count = remap.size
  // cracks: the edge cells of the lower-id shard of every touching pair
  const crack = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const s = shard[i]
    if (s < 1) continue
    const x = i % cols, y = (i / cols) | 0
    for (let k = 0; k < 8; k += 2) {
      const nx = x + N4[k], ny = y + N4[k + 1]
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
      if (shard[ny * cols + nx] > s) { crack[i] = 1; break }
    }
  }
  // the walk along the cracks: a crack cell starts at 3 × its straight distance (jumping costs more than following)
  const st = new Float64Array(n), reach = new Float32Array(n).fill(-1)
  for (let i = 0; i < n; i++) if (crack[i]) { const dx = (i % cols) - ix, dy = ((i / cols) | 0) - iy; st[i] = 3 * Math.sqrt(dx * dx + dy * dy) }
  dijkstra(crack, cols, rows, st, reach)
  let maxReach = 0, m = 0
  for (let i = 0; i < n; i++) if (crack[i]) { m++; if (reach[i] > maxReach) maxReach = reach[i] }
  const order = new Int32Array(m)
  for (let i = 0, k = 0; i < n; i++) if (crack[i]) order[k++] = i
  order.sort((a, b) => reach[a] - reach[b] || a - b)
  // shards: centroid, area, drift direction
  const cx = new Float32Array(count + 1), cy = new Float32Array(count + 1), area = new Int32Array(count + 1), ux = new Float32Array(count + 1), uy = new Float32Array(count + 1)
  const sumX = new Float64Array(count + 1), sumY = new Float64Array(count + 1)
  for (let i = 0; i < n; i++) { const s = shard[i]; if (s >= 1) { area[s]++; sumX[s] += i % cols; sumY[s] += (i / cols) | 0 } }
  for (let s = 1; s <= count; s++) {
    cx[s] = sumX[s] / area[s]; cy[s] = sumY[s] / area[s]
    const dx = cx[s] - ix, dy = cy[s] - iy, l = Math.sqrt(dx * dx + dy * dy)
    if (l > 1e-9) { ux[s] = dx / l; uy[s] = dy / l }
  }
  // tangents: the principal axis of the crack cells round each one (5 × 5)
  const tx = new Float32Array(n), ty = new Float32Array(n)
  for (let k = 0; k < m; k++) {
    const i = order[k], x = i % cols, y = (i / cols) | 0
    let sxx = 0, syy = 0, sxy = 0
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || !crack[ny * cols + nx]) continue
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy
    }
    // the major eigenvector of [[sxx, sxy], [sxy, syy]]
    const d = sxx - syy, root = Math.sqrt(d * d + 4 * sxy * sxy), vx = d + root, vy = 2 * sxy
    const l = Math.sqrt(vx * vx + vy * vy)
    if (l > 1e-9) { tx[i] = vx / l; ty[i] = vy / l } else if (root < 1e-9) { tx[i] = 1 } else { tx[i] = 0; ty[i] = 1 }
  }
  return { cols, rows, impact: [ix, iy], shard, count, crack, reach, maxReach, order, cx, cy, area, ux, uy, tx, ty }
}
