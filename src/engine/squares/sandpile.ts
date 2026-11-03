/**
 * The Abelian sandpile (Bak, Tang & Wiesenfeld 1987; abelian property: Dhar 1990), the `sq-sandpile` card
 * (docs/living-matter/X-advanced.md #8). A w × h grid of heights with sinks past the border: a cell holding 4 or
 * more grains topples, one grain to each neighbour (grains that fall off the edge are lost). The stable result
 * does not depend on the order cells topple in, and neither does how often each cell topples (the odometer).
 *
 * The recurrent configurations form a group under "add, then stabilise"; its identity is
 * e = (6 − (6)°)°, with 6 the all-sixes grid and ° stabilisation (Levine & Propp 2010). The card drops one grain
 * per border edge on e: every cell topples once (Dhar's burning test) and the grid settles back to e.
 *
 * Deterministic (inside the determinism lint): integers only.
 */

/** Heights (any non-negative integers), row-major. */
export type Heights = Int32Array

/**
 * Stabilise `z` in place by parallel sweeps: every cell takes q = ⌊z / 4⌋ at once, gives q to each neighbour. Returns
 * the sweeps run and the odometer (topples per cell). `onSweep(q)` sees each sweep's topple counts before they apply.
 * `fold`: the grid is the top-left quarter of a grid twice the size that is symmetric about both centre lines.
 */
export function relax(z: Heights, w: number, h: number, onSweep?: (q: Int32Array) => void, fold = false): { sweeps: number; odometer: Int32Array } {
  const q = new Int32Array(w * h), odometer = new Int32Array(w * h)
  let sweeps = 0
  for (;;) {
    let any = false
    for (let i = 0; i < z.length; i++) { const k = z[i] >> 2; q[i] = k; if (k) any = true }
    if (!any) return { sweeps, odometer }
    onSweep?.(q)
    for (let r = 0, i = 0; r < h; r++) for (let c = 0; c < w; c++, i++) {
      const k = q[i]
      if (!k) continue
      z[i] -= 4 * k; odometer[i] += k
      if (c > 0) z[i - 1] += k
      // folded: the right and lower edges are mirror lines, so the grain sent across comes back from the twin
      if (c + 1 < w) z[i + 1] += k; else if (fold) z[i] += k
      if (r > 0) z[i - w] += k
      if (r + 1 < h) z[i + w] += k; else if (fold) z[i] += k
    }
    sweeps++
  }
}

/**
 * Stabilise `z` in place one topple at a time from a stack (last in, first out, scanned from the end of the grid):
 * a different order from `relax`, for the abelian checks. Returns the odometer.
 */
export function relaxSerial(z: Heights, w: number, h: number): Int32Array {
  const odometer = new Int32Array(w * h), stack: number[] = []
  for (let i = z.length - 1; i >= 0; i--) if (z[i] >= 4) stack.push(i)
  while (stack.length) {
    const i = stack.pop()!
    if (z[i] < 4) continue
    z[i] -= 4; odometer[i]++
    if (z[i] >= 4) stack.push(i)
    const c = i % w, r = (i - c) / w
    for (const j of [c > 0 ? i - 1 : -1, c + 1 < w ? i + 1 : -1, r > 0 ? i - w : -1, r + 1 < h ? i + w : -1]) {
      if (j < 0) continue
      z[j]++
      if (z[j] === 4) stack.push(j)
    }
  }
  return odometer
}

/**
 * Stabilise `z` in place by scans that topple each cell as they reach it (⌊z / 4⌋ at once), so grains run ahead along
 * the scan; scans alternate forward and back. A third order for the checks, and the fast one for the bakes. Returns
 * the odometer. `fold` as in `relax`.
 */
export function relaxScan(z: Heights, w: number, h: number, fold = false): Int32Array {
  const odometer = new Int32Array(w * h), n = w * h
  for (let pass = 0, any = true; any; pass++) {
    any = false
    const back = pass & 1
    for (let s = 0; s < n; s++) {
      const i = back ? n - 1 - s : s, k = z[i] >> 2
      if (!k) continue
      any = true
      const r = Math.floor(i / w), c = i - r * w
      z[i] -= 4 * k; odometer[i] += k
      if (c > 0) z[i - 1] += k
      if (c + 1 < w) z[i + 1] += k; else if (fold) z[i] += k
      if (r > 0) z[i - w] += k
      if (r + 1 < h) z[i + w] += k; else if (fold) z[i] += k
    }
  }
  return odometer
}

/**
 * The identity of the w × h sandpile group: (6 − (6)°)°. Both grids are symmetric about the centre lines, and so is
 * the stable result, so with even sides only a quarter is relaxed (`fold`) and then mirrored out; `full` skips the fold.
 */
export function sandpileIdentity(w: number, h: number, full = false): Heights {
  const fold = !full && w % 2 === 0 && h % 2 === 0, qw = fold ? w / 2 : w, qh = fold ? h / 2 : h
  const six = new Int32Array(qw * qh).fill(6)
  relaxScan(six, qw, qh, fold)
  const q = new Int32Array(qw * qh)
  for (let i = 0; i < q.length; i++) q[i] = 6 - six[i]
  relaxScan(q, qw, qh, fold)
  if (!fold) return q
  const e = new Int32Array(w * h)
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) e[r * w + c] = q[Math.min(r, h - 1 - r) * qw + Math.min(c, w - 1 - c)]
  return e
}

/** The border vector: one grain per edge a cell has on the sink (corners 2). */
export function borderGrains(w: number, h: number): Heights {
  const b = new Int32Array(w * h)
  for (let c = 0; c < w; c++) { b[c]++; b[(h - 1) * w + c]++ }
  for (let r = 0; r < h; r++) { b[r * w]++; b[r * w + w - 1]++ }
  return b
}

/**
 * The burn: every sweep's heights (before it topples), the toppled-so-far count before each sweep, the sweep each cell
 * first toppled in (−1 never), the odometer, and e.
 */
export interface Burn { w: number; h: number; sweeps: number; z: Uint8Array[]; done: Int32Array; at: Int16Array; odometer: Int32Array; e: Heights }
/**
 * Dhar's burning test on the identity: drop the border grains on e and let it settle. e is recurrent, so every cell
 * topples exactly once, the front runs in from the edges, and the grid ends on e again. `z[s]` is the grid before
 * sweep s (cells ≥ 4 topple in it); `z[sweeps]` is the stable end.
 */
export function sandpileBurn(w: number, h: number, e = sandpileIdentity(w, h)): Burn {
  const z = Int32Array.from(e), b = borderGrains(w, h), frames: Uint8Array[] = [], done: number[] = []
  for (let i = 0; i < z.length; i++) z[i] += b[i]
  const at = new Int16Array(w * h).fill(-1)
  let toppled = 0
  const { sweeps, odometer } = relax(z, w, h, q => {
    frames.push(Uint8Array.from(z)); done.push(toppled)
    for (let i = 0; i < q.length; i++) if (q[i]) { toppled++; if (at[i] < 0) at[i] = frames.length - 1 }
  })
  frames.push(Uint8Array.from(z)); done.push(toppled)
  return { w, h, sweeps, z: frames, done: Int32Array.from(done), at, odometer, e }
}
