/**
 * Chart marks to layers (#132): sites become site layers (one field value per mark, quantized by the sampler), labels
 * go through `textAt`: on the card grid for 5×7 text, on their own lattice for bigger type (`bigText`, the `T.big`
 * rule: `lattice` card cells per font pixel; `smooth` below a lattice of 1.5 draws the plain glyph at twice the lattice).
 */
import type { GridConfig, Layer } from '../types'
import { bigText, textAt } from '../layout'
import type { Chart, Label, Mark } from './marks'

export function labelLayer(l: Label, grid: GridConfig): Layer {
  const k = l.lattice ?? 1
  if (k === 1 && !l.smooth) return { field: textAt(grid, l.text, l.col, l.row, { align: l.align }), tone: l.tone }
  return { ...bigText(grid, l.text, l.col, l.row, { lattice: k, smooth: l.smooth, align: l.align }), tone: l.tone }
}

export function markLayer(m: Mark): Layer {
  const v = m.value ?? 1
  return { field: () => v, sites: m.sites, size: m.size, tone: m.tone }
}

/** Every mark (in order, empty ones skipped), then every label. */
export function chartLayers(c: Pick<Chart, 'marks' | 'labels'>, grid: GridConfig): Layer[] {
  return [...c.marks.filter(m => m.sites.length).map(markLayer), ...c.labels.filter(l => l.text).map(l => labelLayer(l, grid))]
}
