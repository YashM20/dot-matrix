/**
 * Chart marks to layers (#132): sites become site layers (one field value per mark, quantized by the sampler), labels
 * go through `textAt`: on the card grid for 5×7 text, on their own lattice for bigger type (the `T.big` rule:
 * `lattice` card cells per font pixel, anchored at the text's left edge).
 */
import type { GridConfig, Layer } from '../types'
import { textAt, textSize } from '../layout'
import { latticeGrid } from '../sampler/gridSampler'
import type { Chart, Label, Mark } from './marks'

export function labelLayer(l: Label, grid: GridConfig): Layer {
  const k = l.lattice ?? 1
  if (k === 1 && !l.smooth) return { field: textAt(grid, l.text, l.col, l.row, { align: l.align }), tone: l.tone }
  const w = textSize(l.text, { smooth: l.smooth })[0] * k
  const left = l.align === 'center' ? l.col - w / 2 : l.align === 'right' ? l.col - w : l.col
  return { field: textAt(latticeGrid(grid, k, [left, l.row]), l.text, 0, 0, { smooth: l.smooth }), lattice: k, origin: [left, l.row], tone: l.tone }
}

export function markLayer(m: Mark): Layer {
  const v = m.value ?? 1
  return { field: () => v, sites: m.sites, size: m.size, tone: m.tone }
}

/** Every mark (in order, empty ones skipped), then every label. */
export function chartLayers(c: Pick<Chart, 'marks' | 'labels'>, grid: GridConfig): Layer[] {
  return [...c.marks.filter(m => m.sites.length).map(markLayer), ...c.labels.filter(l => l.text).map(l => labelLayer(l, grid))]
}
