/**
 * Pen-plotter output: device frame → pen paths. A lit pixel at tone level k (of 2^bits − 1) is drawn
 * as k concentric pen loops, so darker tones carry more ink. Pixels are visited in greedy
 * nearest-neighbour order from the home corner (short pen-up travel), and `plotAt` replays the plan
 * in time at the profile's draw / travel speeds. `plotterSVG` is the file you would send to the machine.
 */
import type { PlotterPhysics } from './profile'
import type { DeviceFrame } from './toDevice'

export type PenPt = [number, number]
export interface Stroke {
  /** Pixel the stroke draws (device cells; centre at col + .5, row + .5). */
  col: number
  row: number
  /** Loop polylines, inner first; each closed. */
  loops: PenPt[][]
  /** Pen-down length (cells) and the pen-up travel before it. */
  draw: number
  travel: number
}
export interface PlotPlan { cols: number; rows: number; strokes: Stroke[]; drawLen: number; travelLen: number; duration: number; physics: PlotterPhysics }

const LOOP_PTS = 14
const loop = (x: number, y: number, r: number): PenPt[] => Array.from({ length: LOOP_PTS + 1 }, (_, i) => {
  const a = (i / LOOP_PTS) * Math.PI * 2
  return [x + r * Math.cos(a), y + r * Math.sin(a)] as PenPt
})

export function plotPaths(f: DeviceFrame, physics: PlotterPhysics): PlotPlan {
  const L = 2 ** Math.max(1, f.profile.bits) - 1, todo: { c: number; r: number; k: number }[] = []
  for (let r = 0; r < f.rows; r++) for (let c = 0; c < f.cols; c++) {
    const i = r * f.cols + c, k = Math.round(f.out[i] * L)
    if (f.mask[i] && k > 0) todo.push({ c, r, k })
  }
  // greedy nearest neighbour (ties → first in row-major order, deterministic)
  const done = new Uint8Array(todo.length), strokes: Stroke[] = []
  let x = 0, y = 0, drawLen = 0, travelLen = 0
  for (let n = 0; n < todo.length; n++) {
    let best = -1, bd = Infinity
    for (let j = 0; j < todo.length; j++) {
      if (done[j]) continue
      const d = (todo[j].c + .5 - x) ** 2 + (todo[j].r + .5 - y) ** 2
      if (d < bd) { bd = d; best = j }
    }
    done[best] = 1
    const { c, r, k } = todo[best], cx = c + .5, cy = r + .5
    const loops = Array.from({ length: k }, (_, j) => loop(cx, cy, (physics.loop * (j + 1)) / L))
    // enter each loop at its rightmost point: travel lands on the first loop's start
    const travel = Math.hypot(loops[0][0][0] - x, loops[0][0][1] - y)
    const draw = loops.reduce((s, lp) => s + Math.PI * 2 * Math.hypot(lp[0][0] - cx, lp[0][1] - cy), 0) + (k - 1) * (physics.loop / L)
    strokes.push({ col: c, row: r, loops, draw, travel })
    drawLen += draw; travelLen += travel
    const last = loops[k - 1][0]; x = last[0]; y = last[1]
  }
  const duration = drawLen / physics.drawSpeed + travelLen / physics.travelSpeed
  return { cols: f.cols, rows: f.rows, strokes, drawLen, travelLen, duration, physics }
}

export interface PlotState {
  /** Strokes fully drawn. */
  done: number
  /** 0..1 of the stroke being drawn now (0 while travelling to it). */
  partial: number
  /** Pen position (cells) and whether it touches the paper. */
  head: PenPt
  down: boolean
}
/** Where the plot is `tau` seconds after it started (pure; clamps to the finished plot). */
export function plotAt(plan: PlotPlan, tau: number): PlotState {
  const { drawSpeed, travelSpeed } = plan.physics
  let t = Math.max(0, tau), x = 0, y = 0
  for (let i = 0; i < plan.strokes.length; i++) {
    const s = plan.strokes[i], tt = s.travel / travelSpeed, td = s.draw / drawSpeed, start = s.loops[0][0]
    if (t < tt) { const k = tt ? t / tt : 1; return { done: i, partial: 0, head: [x + (start[0] - x) * k, y + (start[1] - y) * k], down: false } }
    t -= tt
    if (t < td) {
      const k = t / td, lp = s.loops[Math.min(s.loops.length - 1, Math.floor(k * s.loops.length))], a = ((k * s.loops.length) % 1) * Math.PI * 2
      const cx = s.col + .5, cy = s.row + .5, rr = Math.hypot(lp[0][0] - cx, lp[0][1] - cy)
      return { done: i, partial: k, head: [cx + rr * Math.cos(a), cy + rr * Math.sin(a)], down: true }
    }
    t -= td
    const last = s.loops[s.loops.length - 1][0]; x = last[0]; y = last[1]
  }
  return { done: plan.strokes.length, partial: 0, head: [x, y], down: false }
}

/** Plotter SVG: one `<path>` per stroke (pen-down polylines), `mm` per cell from the profile pitch. */
export function plotterSVG(plan: PlotPlan, mm = 2): string {
  const W = plan.cols * mm, H = plan.rows * mm, f = (n: number) => +(n * mm).toFixed(3)
  const paths = plan.strokes.map(s => `<path d="${s.loops.map(lp => `M${lp.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}`).join('')}"/>`)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}"><g fill="none" stroke="#000" stroke-width="${(plan.physics.pen * mm).toFixed(3)}" stroke-linecap="round">${paths.join('')}</g></svg>`
}
