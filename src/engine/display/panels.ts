/**
 * Event-driven panel state for the reflective skins (e-ink, flip-disc). The device simulators in
 * `src/engine/device/` are pure in t over a known frame sequence; a skin instead receives frames when a
 * card happens to redraw, so these keep per-cell state and are driven by `push(frame, t)` / `at(t)`.
 * Same physics constants (device profiles) and the same disc dynamics (`flipAngle`). Pure TypeScript.
 */
import { stbn } from '../halftone/mask'
import { flipAngle, settleTime } from '../device/flipdisc'
import type { EinkPhysics, FlipPhysics } from '../device/profile'

/** One card frame reduced to its cells: light 0..1 (normalised by a full dot's coverage) and the colour of chromatic cells. */
export interface CellFrame {
  cols: number
  rows: number
  level: Float32Array
  /** 1 where the cell's light is chromatic (the board's accent), else 0. */
  chroma: Uint8Array
  /** Per cell r, g, b (0..255) of the light, scaled so its brightest channel is 255. */
  rgb: Uint8Array
}

/** RGBA cell averages (a `cols × rows` downsample of the frame on black) → `CellFrame`. `gain` = 1 / a full dot's coverage. */
export function cellFrame(rgba: Uint8ClampedArray | Uint8Array, cols: number, rows: number, gain = 1): CellFrame {
  const n = cols * rows, level = new Float32Array(n), chroma = new Uint8Array(n), rgb = new Uint8Array(n * 3)
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2], hi = Math.max(r, g, b), lo = Math.min(r, g, b)
    level[i] = Math.min(1, (hi / 255) * gain)
    chroma[i] = hi > 24 && (hi - lo) / hi > .45 ? 1 : 0
    const k = hi > 0 ? 255 / hi : 0
    rgb[i * 3] = r * k; rgb[i * 3 + 1] = g * k; rgb[i * 3 + 2] = b * k
  }
  return { cols, rows, level, chroma, rgb }
}

const smooth = (x: number) => { const s = Math.max(0, Math.min(1, x)); return s * s * (3 - 2 * s) }

// ── e-ink ────────────────────────────────────────────────────────────────────
export interface EinkPanel {
  /** True when the controller can start a new refresh at t (none running, idle gap passed). */
  ready(t: number): boolean
  /** Start a refresh at t towards `frame` (1-bit blue-noise dither of its light). Returns 'full' | 'partial'. */
  push(frame: CellFrame, t: number): 'full' | 'partial'
  /** Ink 0..1 per cell at t into `ink`; `colored` marks cells whose ink is the accent pigment. True while refreshing. */
  at(t: number, ink: Float32Array): boolean
  /** Pigment colour per cell (rgb, for `colored` cells) and which cells are pigment. */
  rgb: Uint8Array
  colored: Uint8Array
  count: number
}

export function createEinkPanel(cols: number, rows: number, physics: EinkPhysics & { gapS?: number }): EinkPanel {
  const n = cols * rows
  const from = new Float32Array(n), to = new Float32Array(n), ghost = new Float32Array(n), inked = new Uint8Array(n)
  const rgb = new Uint8Array(n * 3), colored = new Uint8Array(n)
  let t0 = -Infinity, dur = 0, full = true
  const panel: EinkPanel = {
    rgb, colored, count: 0,
    ready: t => t >= t0 + dur + (physics.gapS ?? 0),
    push(f, t) {
      // what is on the glass now is where this refresh starts
      panel.at(t, from)
      full = panel.count % physics.fullEvery === 0
      panel.count++
      for (let i = 0, c = 0, r = 0; i < n; i++) {
        // a steep tone curve first: text (idle tone and up) prints solid, the faint grid is a light speckle
        const on = Math.min(1, Math.max(0, (f.level[i] - .12) / .42)) > stbn(c, r, 0) ? 1 : 0
        if (full) ghost[i] = 0
        else ghost[i] = inked[i] && !on ? Math.max(ghost[i] * physics.ghostDecay, physics.ghost) : on ? 0 : ghost[i] * physics.ghostDecay
        inked[i] = on
        // a cleared cell keeps its old pigment in the ghost; a newly inked cell takes the frame's
        if (on) { colored[i] = f.chroma[i]; rgb[i * 3] = f.rgb[i * 3]; rgb[i * 3 + 1] = f.rgb[i * 3 + 1]; rgb[i * 3 + 2] = f.rgb[i * 3 + 2] }
        to[i] = Math.max(on, ghost[i])
        if (++c === cols) { c = 0; r++ }
      }
      t0 = t; dur = full ? physics.fullS : physics.partialS
      return full ? 'full' : 'partial'
    },
    at(t, ink) {
      const p = dur > 0 ? (t - t0) / dur : 1
      if (p >= 1) { ink.set(to); return false }
      if (p < 0) { ink.set(from); return true }
      if (full) {
        // the flash: inverted image → solid ink → blank paper → new image (a quarter each)
        const q = p * 4
        for (let i = 0; i < n; i++) ink[i] = q < 1 ? 1 - to[i] : q < 2 ? 1 : q < 3 ? 0 : to[i] * smooth(q - 3)
      } else {
        const s = smooth(p)
        for (let i = 0; i < n; i++) ink[i] = from[i] + (to[i] - from[i]) * s
      }
      return true
    },
  }
  // the panel powers up white (paper) and its first refresh is a full one
  from.fill(0); to.fill(0)
  return panel
}

// ── flip-disc ────────────────────────────────────────────────────────────────
/** Disc faces: 0 = black, 1 = bright, 2 = accent (pigment colour from the frame). */
export interface FlipPanel {
  push(frame: CellFrame, t: number, threshold?: number): { at: number; col: number; count: number }[]
  /** Face and apparent width (|cos θ|) per disc at t; returns how many discs are mid-flip. */
  at(t: number, face: Uint8Array, tilt: Float32Array): number
  rgb: Uint8Array
}

export function createFlipPanel(cols: number, rows: number, physics: FlipPhysics & { sweepS?: number }): FlipPanel {
  const n = cols * rows, prev = new Uint8Array(n), cur = new Uint8Array(n), start = new Float64Array(n).fill(-Infinity)
  const rgb = new Uint8Array(n * 3), settle = settleTime(physics.omega, physics.zeta)
  const columnS = Math.min(physics.columnS, (physics.sweepS ?? Infinity) / Math.max(1, cols))
  const shown = new Uint8Array(n), tilt0 = new Float32Array(n)
  const panel: FlipPanel = {
    rgb,
    push(f, t, threshold = .5) {
      panel.at(t, shown, tilt0)
      const counts = new Uint16Array(cols)
      for (let i = 0; i < n; i++) {
        const face = f.level[i] >= threshold ? (f.chroma[i] ? 2 : 1) : 0
        if (face === cur[i]) continue
        // a disc caught mid-flip starts its next flip from the face it is showing
        prev[i] = shown[i]; cur[i] = face
        const c = i % cols
        start[i] = t + c * columnS
        counts[c]++
        if (face === 2) { rgb[i * 3] = f.rgb[i * 3]; rgb[i * 3 + 1] = f.rgb[i * 3 + 1]; rgb[i * 3 + 2] = f.rgb[i * 3 + 2] }
      }
      const events: { at: number; col: number; count: number }[] = []
      for (let c = 0; c < cols; c++) if (counts[c]) events.push({ at: c * columnS, col: c, count: counts[c] })
      return events
    },
    at(t, face, tilt) {
      let moving = 0
      for (let i = 0; i < n; i++) {
        const local = t - start[i]
        if (local >= settle || prev[i] === cur[i]) { face[i] = cur[i]; tilt[i] = 1; continue }
        if (local < 0) { face[i] = prev[i]; tilt[i] = 1; moving++; continue }
        const cs = Math.cos(Math.PI * flipAngle(local, physics.omega, physics.zeta))
        face[i] = cs >= 0 ? prev[i] : cur[i]; tilt[i] = Math.abs(cs); moving++
      }
      return moving
    },
  }
  return panel
}
