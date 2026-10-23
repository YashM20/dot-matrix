/**
 * Plotter SVG: sampled dots → single-colour pen paths in millimetres.
 * Each dot becomes one stroke: an Archimedean spiral out from its centre (circles) or a
 * boustrophedon hatch clipped to the dot's superellipse (squares / squircles), plus its outline.
 * Strokes are built once per size step (radius × fill density) and translated. Opacity can't be
 * inked, so it sets the fill density: a dim dot keeps its footprint with a sparser spiral/hatch.
 * Pen order: nearest neighbour from the origin, then 2-opt on the open path. Deterministic.
 */
import type { DotInstance } from '../engine/types'
import { squircleExponent } from '../engine/renderer/shapePath'

export interface PlotterOptions {
  /** Millimetres per card px (default 0.5: a 240 px card plots 120 mm wide). */
  mmPerPx?: number
  /** Pen width, mm (default 0.35). */
  penMm?: number
  /** Fill per dot; `auto` = spiral for circles, hatch otherwise. */
  fill?: 'auto' | 'spiral' | 'hatch'
  /** Dots dimmer than this are not plotted (default 0.12). */
  minOpacity?: number
  /** Page margin, mm (default 10). */
  marginMm?: number
  stroke?: string
  /** Skip the travel optimisation (paths in sampler order). */
  raw?: boolean
}
export interface PlotStroke { dot: number; cx: number; cy: number; points: [number, number][] }
export interface PlotResult {
  svg: string
  /** Strokes in pen order, mm page coordinates. */
  strokes: PlotStroke[]
  widthMm: number; heightMm: number
  drawMm: number; travelMm: number
  /** Pen-up travel in sampler order, for comparison. */
  naiveTravelMm: number
}

type Pt = [number, number]
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])

function spiral(R: number, pitch: number): Pt[] {
  const pts: Pt[] = [[0, 0]]
  if (R <= 0) return [[0, 0], [0.01, 0]]
  const turns = R / pitch, maxA = turns * Math.PI * 2
  for (let a = 0; a < maxA;) {
    const r = (a / maxA) * R
    a += Math.min(0.5, 0.25 / Math.max(r, 0.05))
    const rr = (Math.min(a, maxA) / maxA) * R
    pts.push([rr * Math.cos(a), rr * Math.sin(a)])
  }
  // closing lap on the rim for a clean edge
  const a0 = maxA, steps = Math.max(12, Math.ceil((2 * Math.PI * R) / 0.25))
  for (let i = 1; i <= steps; i++) { const a = a0 + (i / steps) * Math.PI * 2; pts.push([R * Math.cos(a), R * Math.sin(a)]) }
  return pts
}
/** Superellipse half-width at height y (|x/R|^n + |y/R|^n = 1). */
const halfWidth = (R: number, n: number, y: number) => R * Math.max(0, 1 - Math.abs(y / R) ** n) ** (1 / n)
function hatch(R: number, pitch: number, n: number): Pt[] {
  if (R <= 0) return [[0, 0], [0.01, 0]]
  const pts: Pt[] = []
  const rows = Math.max(1, Math.round((2 * R) / pitch))
  for (let i = 0; i <= rows; i++) {
    const y = -R + (i * 2 * R) / rows, w = halfWidth(R, n, y)
    if (i % 2) pts.push([w, y], [-w, y]); else pts.push([-w, y], [w, y])
  }
  // outline, starting where the hatch ended
  const steps = 48
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI / 2 + (i / steps) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a)
    pts.push([Math.sign(c) * R * Math.abs(c) ** (2 / n), Math.sign(s) * R * Math.abs(s) ** (2 / n)])
  }
  return pts
}

/** Nearest-neighbour tour from `start`, then 2-opt on the open path (`start` fixed). Returns node order. */
export function tour(nodes: Pt[], start: Pt = [0, 0], maxPasses = 12): number[] {
  const n = nodes.length, used = new Uint8Array(n), order: number[] = []
  let cur = start
  for (let k = 0; k < n; k++) {
    let best = -1, bd = Infinity
    for (let i = 0; i < n; i++) if (!used[i]) { const d = dist(cur, nodes[i]); if (d < bd) { bd = d; best = i } }
    used[best] = 1; order.push(best); cur = nodes[best]
  }
  // 2-opt: p[0] = start; reverse p[i+1..j] when it shortens the path. Window keeps big cards bounded.
  const p: Pt[] = [start, ...order.map(i => nodes[i])], idx = [-1, ...order], m = p.length
  const window = m <= 1500 ? m : 250
  for (let pass = 0; pass < maxPasses; pass++) {
    let improved = false
    for (let i = 0; i < m - 2; i++) for (let j = i + 2; j < Math.min(m, i + window); j++) {
      const a = p[i], b = p[i + 1], c = p[j], d = j + 1 < m ? p[j + 1] : null
      const delta = d ? dist(a, b) + dist(c, d) - dist(a, c) - dist(b, d) : dist(a, b) - dist(a, c)
      if (delta > 1e-9) {
        for (let l = i + 1, r = j; l < r; l++, r--) { [p[l], p[r]] = [p[r], p[l]]; [idx[l], idx[r]] = [idx[r], idx[l]] }
        improved = true
      }
    }
    if (!improved) break
  }
  return idx.slice(1)
}

const f2 = (v: number) => { const r = Math.round(v * 100) / 100; return String(r === 0 ? 0 : r) }

export function plotterSVG(dots: DotInstance[], width: number, height: number, o: PlotterOptions = {}): PlotResult {
  const k = o.mmPerPx ?? 0.5, pen = o.penMm ?? 0.35, margin = o.marginMm ?? 10, minOp = o.minOpacity ?? 0.12
  const templates = new Map<string, Pt[]>()
  const strokes: PlotStroke[] = []
  dots.forEach((d, i) => {
    if (!(d.r > 0) || !(d.opacity >= minOp)) return
    const R = Math.max(0, d.r * k - pen / 2), density = Math.max(0.25, Math.min(1, d.opacity))
    const pitch = pen / density
    const kind = o.fill === 'spiral' || (o.fill !== 'hatch' && (d.shape ?? 'circle') === 'circle') ? 'spiral' : 'hatch'
    const n = d.shape === 'square' ? 40 : d.shape === 'squircle' ? squircleExponent(d.roundness ?? 0) : 2
    const key = `${kind}|${R.toFixed(3)}|${pitch.toFixed(3)}|${n.toFixed(2)}`
    let tpl = templates.get(key)
    if (!tpl) templates.set(key, (tpl = kind === 'spiral' ? spiral(R, pitch) : hatch(R, pitch, n)))
    const cx = margin + d.x * k, cy = margin + d.y * k
    strokes.push({ dot: i, cx, cy, points: tpl.map(([x, y]) => [cx + x, cy + y]) })
  })
  const order = o.raw ? strokes.map((_, i) => i) : tour(strokes.map(s => [s.cx, s.cy]))
  const sorted = order.map(i => strokes[i])
  const travel = (list: PlotStroke[]) => { let t = 0, at: Pt = [0, 0]; for (const s of list) { t += dist(at, s.points[0]); at = s.points[s.points.length - 1] } return t }
  let drawMm = 0
  for (const s of sorted) for (let i = 1; i < s.points.length; i++) drawMm += dist(s.points[i - 1], s.points[i])
  const widthMm = width * k + margin * 2, heightMm = height * k + margin * 2
  const paths = sorted.map(s => `<path d="M${s.points.map(p => `${f2(p[0])} ${f2(p[1])}`).join('L')}"/>`).join('\n')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${f2(widthMm)}mm" height="${f2(heightMm)}mm" viewBox="0 0 ${f2(widthMm)} ${f2(heightMm)}">\n`
    + `<g fill="none" stroke="${o.stroke ?? '#000'}" stroke-width="${pen}" stroke-linecap="round" stroke-linejoin="round">\n${paths}\n</g>\n</svg>\n`
  return { svg, strokes: sorted, widthMm, heightMm, drawMm, travelMm: travel(sorted), naiveTravelMm: travel(strokes) }
}
