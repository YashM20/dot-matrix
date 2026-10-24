/**
 * Hilbert-curve index of an integer point on a 2^order × 2^order grid (order ≤ 16, so the index
 * stays an exact integer below 2^32). Neighbouring indices are neighbouring cells, which is what
 * makes rank-matching two point sets along the curve a cheap, local, deterministic pairing.
 */
export function hilbertIndex(x: number, y: number, order = 16): number {
  const n = 1 << order
  let d = 0, s = n >>> 1
  x |= 0; y |= 0
  while (s > 0) {
    const rx = (x & s) ? 1 : 0, ry = (y & s) ? 1 : 0
    d += s * s * ((3 * rx) ^ ry)
    if (ry === 0) {
      if (rx === 1) { x = n - 1 - x; y = n - 1 - y }
      const t = x; x = y; y = t
    }
    s >>>= 1
  }
  return d
}

/**
 * Indices of `n` points (read through `xy(i)` into a shared frame `[x0, y0, size]`) in Hilbert order.
 * Ties (same curve cell) break by x, then y, then index, so the order does not depend on input order
 * except between identical points.
 */
export function hilbertOrder(n: number, xs: ArrayLike<number>, ys: ArrayLike<number>, frame: [number, number, number], order = 12): Uint32Array {
  const [x0, y0, size] = frame, cells = (1 << order) - 1, k = size > 0 ? cells / size : 0
  const keys = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const gx = Math.max(0, Math.min(cells, Math.round((xs[i] - x0) * k))), gy = Math.max(0, Math.min(cells, Math.round((ys[i] - y0) * k)))
    keys[i] = hilbertIndex(gx, gy, order)
  }
  const idx = new Uint32Array(n)
  for (let i = 0; i < n; i++) idx[i] = i
  // numeric typed-array sort on a packed key when it fits 2^53 exactly (key < 2^32, index < 2^21), else a comparator
  const SHIFT = 2097152 // 2^21
  if (n < SHIFT) {
    const packed = new Float64Array(n)
    for (let i = 0; i < n; i++) packed[i] = keys[i] * SHIFT + i
    packed.sort()
    for (let i = 0; i < n; i++) { const v = packed[i]; idx[i] = v - Math.floor(v / SHIFT) * SHIFT }
    // equal curve cells: re-sort the run by position so input order does not leak in
    for (let a = 0; a < n;) {
      let b = a + 1
      while (b < n && keys[idx[b]] === keys[idx[a]]) b++
      if (b - a > 1) {
        const run = Array.from(idx.subarray(a, b)).sort((p, q) => xs[p] - xs[q] || ys[p] - ys[q] || p - q)
        idx.set(run, a)
      }
      a = b
    }
    return idx
  }
  return Uint32Array.from(Array.from(idx).sort((p, q) => keys[p] - keys[q] || xs[p] - xs[q] || ys[p] - ys[q] || p - q))
}
