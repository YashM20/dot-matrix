/**
 * Binary-mask helpers for the hand tracker: a 3×3 majority clean-up, 4-connected component labelling
 * (iterative flood fill, no recursion) with per-blob stats, and a hole count inside a window (a pinch
 * closes thumb and index into a ring, which shows up as a background island inside the hand).
 */
export interface Blob {
  /** Label written into the label map (1-based). */
  id: number
  area: number
  /** Centroid, pixels. */
  cx: number; cy: number
  /** Inclusive bounding box, pixels. */
  x0: number; y0: number; x1: number; y1: number
}

let rowSums = new Uint8Array(0)
/** 3×3 majority (≥ `k` of 9 set, outside counts as 0): removes speckle, fills pinholes. Writes into `out`. */
export function majority(mask: Uint8Array, w: number, h: number, out: Uint8Array, k = 5): Uint8Array {
  // separable: horizontal 3-sums, then vertical sums of those
  if (rowSums.length < w * h) rowSums = new Uint8Array(w * h)
  const row = rowSums
  for (let y = 0; y < h; y++) {
    const o = y * w
    row[o] = mask[o] + (w > 1 ? mask[o + 1] : 0)
    for (let x = 1; x < w - 1; x++) row[o + x] = mask[o + x - 1] + mask[o + x] + mask[o + x + 1]
    if (w > 1) row[o + w - 1] = mask[o + w - 2] + mask[o + w - 1]
  }
  for (let y = 0; y < h; y++) {
    const o = y * w, up = y > 0 ? o - w : -1, dn = y < h - 1 ? o + w : -1
    for (let x = 0; x < w; x++) out[o + x] = row[o + x] + (up >= 0 ? row[up + x] : 0) + (dn >= 0 ? row[dn + x] : 0) >= k ? 1 : 0
  }
  return out
}

/**
 * Label the 4-connected components of `mask` into `labels` (0 = background) and return the blobs with
 * at least `minArea` pixels (smaller ones are labelled too, just not returned). `stack` is scratch space
 * of at least w·h entries.
 */
export function components(mask: Uint8Array, w: number, h: number, labels: Int32Array, stack: Int32Array, minArea = 1): Blob[] {
  labels.fill(0)
  const out: Blob[] = []
  let next = 0
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || labels[s]) continue
    const id = ++next
    let top = 0, area = 0, sx = 0, sy = 0, x0 = w, y0 = h, x1 = 0, y1 = 0
    stack[top++] = s; labels[s] = id
    while (top) {
      const i = stack[--top], x = i % w, y = (i - x) / w
      area++; sx += x; sy += y
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
      if (x > 0 && mask[i - 1] && !labels[i - 1]) { labels[i - 1] = id; stack[top++] = i - 1 }
      if (x < w - 1 && mask[i + 1] && !labels[i + 1]) { labels[i + 1] = id; stack[top++] = i + 1 }
      if (y > 0 && mask[i - w] && !labels[i - w]) { labels[i - w] = id; stack[top++] = i - w }
      if (y < h - 1 && mask[i + w] && !labels[i + w]) { labels[i + w] = id; stack[top++] = i + w }
    }
    if (area >= minArea) out.push({ id, area, cx: sx / area, cy: sy / area, x0, y0, x1, y1 })
  }
  return out
}

/**
 * Background islands of blob `id` inside the window [x0..x1]×[y0..y1]: 4-connected runs of non-`id`
 * pixels that never touch the window edge, with at least `minArea` pixels. Returns the largest island's
 * area (0 = no hole). `seen` / `stack` are scratch (≥ w·h).
 */
export function largestHole(labels: Int32Array, id: number, w: number, x0: number, y0: number, x1: number, y1: number, seen: Uint8Array, stack: Int32Array, minArea = 2): number {
  for (let y = y0; y <= y1; y++) seen.fill(0, y * w + x0, y * w + x1 + 1)
  let best = 0
  for (let y = y0 + 1; y < y1; y++) for (let x = x0 + 1; x < x1; x++) {
    const s = y * w + x
    if (labels[s] === id || seen[s]) continue
    let top = 0, area = 0, edge = false
    stack[top++] = s; seen[s] = 1
    while (top) {
      const i = stack[--top], px = i % w, py = (i - px) / w
      area++
      if (px === x0 || px === x1 || py === y0 || py === y1) { edge = true }
      if (px > x0 && labels[i - 1] !== id && !seen[i - 1]) { seen[i - 1] = 1; stack[top++] = i - 1 }
      if (px < x1 && labels[i + 1] !== id && !seen[i + 1]) { seen[i + 1] = 1; stack[top++] = i + 1 }
      if (py > y0 && labels[i - w] !== id && !seen[i - w]) { seen[i - w] = 1; stack[top++] = i - w }
      if (py < y1 && labels[i + w] !== id && !seen[i + w]) { seen[i + w] = 1; stack[top++] = i + w }
    }
    if (!edge && area >= minArea && area > best) best = area
  }
  return best
}

/**
 * Palm centre of blob `id` inside [x0..x1]×[y0..y1]: the centre of its largest inscribed disc (chamfer 3-4
 * distance transform). Fingers are thin and the wrist narrower than the palm, so this barely moves when the
 * fingers curl or pinch — unlike a centroid. Averages every pixel within `slack` (chamfer units) of the
 * maximum for sub-pixel steadiness. `dt` is scratch (≥ w·h). Returns [x, y, radius in pixels].
 */
export function palmCentre(labels: Int32Array, id: number, w: number, x0: number, y0: number, x1: number, y1: number, dt: Uint16Array, slack = 2): [number, number, number] {
  const inside = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1
  const at = (x: number, y: number) => (inside(x, y) ? dt[y * w + x] : 0)
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * w + x
    dt[i] = labels[i] !== id ? 0 : Math.min(at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4)
  }
  let m = 0
  for (let y = y1; y >= y0; y--) for (let x = x1; x >= x0; x--) {
    const i = y * w + x
    if (!dt[i]) continue
    const d = Math.min(dt[i], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4)
    dt[i] = d; if (d > m) m = d
  }
  let n = 0, sx = 0, sy = 0
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (dt[y * w + x] >= m - slack && m) { n++; sx += x; sy += y }
  return n ? [sx / n, sy / n, m / 3] : [(x0 + x1) / 2, (y0 + y1) / 2, 0]
}
