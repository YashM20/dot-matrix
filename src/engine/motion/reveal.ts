import type { DotInstance } from '../types'
import type { Mask } from './masks'

export interface RevealOptions {
  /** 0 = nothing shown, 1 = everything shown. */
  p: number
  mask: Mask
  /** Card grid the mask is evaluated on (dots are mapped to their cell by position). */
  cols: number; rows: number; pitch: number
  /** Width of the bright scan front, in mask units (0 = none). */
  edge?: number
  /** `exit` hides dots in mask order instead of showing them. */
  exit?: boolean
}

/**
 * Buffer-level reveal: applies a mask threshold to already-sampled dots, so it costs ~0.1 ms per
 * card and needs no change to any preset — every card can enter and exit. Dots on the scan front
 * flash to full opacity (keeping their colour, so the accent stays the accent).
 */
export function revealDots(dots: DotInstance[], o: RevealOptions): DotInstance[] {
  if (o.p >= 1 && !o.exit) return dots
  if (o.p <= 0 && o.exit) return dots
  const out: DotInstance[] = [], edge = o.edge ?? 0
  for (const d of dots) {
    const col = Math.min(o.cols - 1, Math.max(0, Math.floor(d.x / o.pitch))), row = Math.min(o.rows - 1, Math.max(0, Math.floor(d.y / o.pitch)))
    const m = o.mask(col, row, o.cols, o.rows)
    // enter: shown once the front has passed (m < p). exit: hidden once it has passed.
    const front = o.exit ? m - o.p : o.p - m
    if (o.exit ? m < o.p : m >= o.p) continue
    out.push(edge > 0 && front >= 0 && front < edge ? { ...d, opacity: Math.max(d.opacity, .92) } : d)
  }
  return out
}

/**
 * Buffer-level change transition: the old frame's dots give way to the new frame's dots cell by
 * cell in mask order (each cell flips exactly once). Works across any change — data, minute tick,
 * a different preset — with no knowledge of the layers that produced either frame.
 */
export function transitionDots(prev: DotInstance[], next: DotInstance[], o: Omit<RevealOptions, 'exit'>): DotInstance[] {
  if (o.p >= 1) return next
  if (o.p <= 0) return prev
  return [...revealDots(prev, { ...o, exit: true, edge: 0 }), ...revealDots(next, o)]
}
