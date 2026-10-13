/**
 * Minimal SVG path rasterizer (no canvas): parse `d`, flatten curves/arcs to polylines,
 * then stroke by distance-to-segment (round caps/joins) and/or fill by non-zero winding.
 * Deterministic in every browser and in Node, so icons can be sampled headlessly.
 */
type Pt = [number, number]

/** Flatten an SVG path into subpaths of points (curves sampled every ~0.5 units). */
export function flattenPath(d: string): { points: Pt[]; closed: boolean }[] {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? []
  const subpaths: { points: Pt[]; closed: boolean }[] = []
  let i = 0, cmd = '', cur: Pt = [0, 0], start: Pt = [0, 0], lastCtrl: Pt | null = null, lastCmd = ''
  let path: Pt[] = []
  const num = () => +tokens[i++]
  const flag = () => {
    // arc flags may be packed without separators ("0 1 0" or "010")
    const t = tokens[i]
    if (t.length > 1 && /^[01]/.test(t)) { tokens[i] = t.slice(1); return +t[0] }
    i++; return +t
  }
  const begin = (p: Pt) => { if (path.length > 1) subpaths.push({ points: path, closed: false }); path = [p] }
  const line = (p: Pt) => { path.push(p); cur = p }
  const cubic = (c1: Pt, c2: Pt, p: Pt) => {
    const n = Math.max(4, Math.ceil(Math.hypot(p[0] - cur[0], p[1] - cur[1]) + Math.hypot(c1[0] - cur[0], c1[1] - cur[1]) + Math.hypot(c2[0] - p[0], c2[1] - p[1])))
    const p0 = cur
    for (let k = 1; k <= n; k++) { const t = k / n, s = 1 - t; path.push([s ** 3 * p0[0] + 3 * s * s * t * c1[0] + 3 * s * t * t * c2[0] + t ** 3 * p[0], s ** 3 * p0[1] + 3 * s * s * t * c1[1] + 3 * s * t * t * c2[1] + t ** 3 * p[1]]) }
    cur = p
  }
  const quad = (c: Pt, p: Pt) => cubic([cur[0] + (2 / 3) * (c[0] - cur[0]), cur[1] + (2 / 3) * (c[1] - cur[1])], [p[0] + (2 / 3) * (c[0] - p[0]), p[1] + (2 / 3) * (c[1] - p[1])], p)
  const arc = (rx: number, ry: number, rot: number, large: number, sweep: number, p: Pt) => {
    // SVG spec F.6.5: endpoint → centre parameterisation
    const [x1, y1] = cur, [x2, y2] = p
    if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) { line(p); return }
    rx = Math.abs(rx); ry = Math.abs(ry)
    const phi = (rot * Math.PI) / 180, cos = Math.cos(phi), sin = Math.sin(phi)
    const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, xp = cos * dx + sin * dy, yp = -sin * dx + cos * dy
    const lambda = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry)
    if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda) }
    const sign = large === sweep ? -1 : 1
    const sq = Math.max(0, (rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp) / (rx * rx * yp * yp + ry * ry * xp * xp))
    const coef = sign * Math.sqrt(sq), cxp = (coef * rx * yp) / ry, cyp = (-coef * ry * xp) / rx
    const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2
    const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
    const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry)
    let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry)
    if (!sweep && dt > 0) dt -= Math.PI * 2
    if (sweep && dt < 0) dt += Math.PI * 2
    const n = Math.max(4, Math.ceil((Math.abs(dt) * Math.max(rx, ry)) / 0.5))
    for (let k = 1; k <= n; k++) { const t = t1 + (dt * k) / n; path.push([cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos]) }
    cur = p
  }
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++]
    const rel = cmd === cmd.toLowerCase(), o: Pt = rel ? cur : [0, 0], C = cmd.toUpperCase()
    const at = (x: number, y: number): Pt => [o[0] + x, o[1] + y]
    let ctrl: Pt | null = null
    switch (C) {
      case 'M': { const p = at(num(), num()); begin(p); cur = start = p; cmd = rel ? 'l' : 'L'; break }
      case 'L': line(at(num(), num())); break
      case 'H': line([rel ? cur[0] + num() : num(), cur[1]]); break
      case 'V': line([cur[0], rel ? cur[1] + num() : num()]); break
      case 'C': { const c1 = at(num(), num()), c2 = at(num(), num()), p = at(num(), num()); cubic(c1, c2, p); ctrl = c2; break }
      case 'S': { const c1: Pt = lastCtrl && /[CS]/.test(lastCmd) ? [2 * cur[0] - lastCtrl[0], 2 * cur[1] - lastCtrl[1]] : cur; const c2 = at(num(), num()), p = at(num(), num()); cubic(c1, c2, p); ctrl = c2; break }
      case 'Q': { const c = at(num(), num()), p = at(num(), num()); quad(c, p); ctrl = c; break }
      case 'T': { const c: Pt = lastCtrl && /[QT]/.test(lastCmd) ? [2 * cur[0] - lastCtrl[0], 2 * cur[1] - lastCtrl[1]] : cur; quad(c, at(num(), num())); ctrl = c; break }
      case 'A': { const rx = num(), ry = num(), rot = num(), large = flag(), sweep = flag(); arc(rx, ry, rot, large, sweep, at(num(), num())); break }
      case 'Z': { path.push(start); subpaths.push({ points: path, closed: true }); path = [start]; cur = start; break }
      default: i++
    }
    lastCtrl = ctrl; lastCmd = C
  }
  if (path.length > 1) subpaths.push({ points: path, closed: false })
  return subpaths
}

function segDist(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = dx * dx + dy * dy
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / len))
  return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy)
}

/**
 * Rasterize a path drawn in a `box`-unit square to a `resolution²` mask.
 * `stroke` = line width in box units (0 = none), `fill` = non-zero fill.
 */
export function rasterizePath(d: string, resolution: number, opts: { stroke?: number; fill?: boolean; box?: number } = {}): Uint8ClampedArray {
  const { stroke = 2.2, fill = false, box = 32 } = opts
  const subpaths = flattenPath(d), scale = resolution / box, half = stroke / 2
  const segs: [Pt, Pt][] = []
  for (const { points } of subpaths) for (let k = 1; k < points.length; k++) segs.push([points[k - 1], points[k]])
  // a lone "M x y h.01" style dot still gets a (zero-length) segment
  for (const { points } of subpaths) if (points.length === 1) segs.push([points[0], points[0]])
  const mask = new Uint8ClampedArray(resolution * resolution)
  for (let y = 0; y < resolution; y++) for (let x = 0; x < resolution; x++) {
    const px = (x + .5) / scale, py = (y + .5) / scale
    let on = false
    if (stroke > 0) for (const [a, b] of segs) if (segDist(px, py, a, b) <= half) { on = true; break }
    if (!on && fill) {
      let winding = 0
      for (const { points } of subpaths) {
        const n = points.length
        for (let k = 0; k < n; k++) {
          const a = points[k], b = points[(k + 1) % n]
          if (a[1] <= py ? b[1] > py && (b[0] - a[0]) * (py - a[1]) - (px - a[0]) * (b[1] - a[1]) > 0 : b[1] <= py && (b[0] - a[0]) * (py - a[1]) - (px - a[0]) * (b[1] - a[1]) < 0) winding += a[1] <= py ? 1 : -1
        }
      }
      on = winding !== 0
    }
    mask[y * resolution + x] = on ? 1 : 0
  }
  return mask
}
