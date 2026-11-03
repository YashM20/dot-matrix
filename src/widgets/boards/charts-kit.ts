/**
 * Charts board kit (#132): what every chart card shares. A card draws one chart from the engine's chart module
 * (src/engine/charts: data in, marks out, painted to layers) and gets the rest from here:
 * - the demo loop: grow in, hold, morph to the second data set, hold, fall away, grow back (`loopPhase`, pure in t;
 *   t = 0 and reduced motion are the settled first set). The first touch hands over (`handover: 'demo'`);
 * - the data-set switch in the label row (`set`, a two-stop segmented control on a data spring);
 * - the readout (`pick`, a slider over the plot whose `map` snaps a tap to the nearest point; arrows step points).
 *   Hovering the plot moves the readout without a tap. The picked point is the card's one red thing.
 */
import type { Control } from '../../engine/context'
import type { Layer, Tone } from '../../engine/types'
import { LOOP, settle, loopPhase } from '../../engine/charts/motion'
import { chartLayers } from '../../engine/charts/paint'
import type { Chart, Label } from '../../engine/charts/marks'
import { TILE, layoutFor, tileStyle, type WidgetContext, type WidgetPreset } from '../types'
import { marching, rr, ui } from './components'

export const T = layoutFor(TILE)
/** Big sites and readout dots are true circles (n = 2), like the components board. */
export const style = { ...tileStyle, cornerRoundness: 0 }
type Box = [number, number, number, number]

/** What a card draws from: the data set (0 = A, 1 = B, between while it morphs), the intro (0 → 1) and the picked index. */
export interface View { set: number; intro: number; pick: number; hover: boolean }
export interface ChartCardSpec {
  id: string; name: string; label: string
  /** The two data sets' names, drawn as the switch. */
  sets: [string, string]
  /** Data points the readout steps through. */
  n: number
  /** The plot's hit box [col, row, width, height] and its pointer → nearest index. */
  box: Box; map: (x: number, y: number) => number
  /** Seconds this card's loop runs ahead, so the board doesn't morph in lockstep (keep t = 0 in the first hold). */
  offset: number
  /** The readout's resting point (default: the latest, `n - 1`). */
  pick0?: number
  style?: WidgetPreset['style']
  draw: (v: View) => Pick<Chart, 'marks' | 'labels'>
}

const width = (s: string) => T.size(s)[0]
/** The switch: both names right-aligned in the label row, 6 cells apart. */
function switchOf(sets: [string, string]) {
  const xb = TILE.cols - width(sets[1]), xa = xb - 6 - width(sets[0]), x = xa - 2
  return { xs: [xa, xb], box: [x, 0, TILE.cols - x, 8] as Box }
}

export function view(c: ChartCardSpec, ctx: WidgetContext): View {
  const t = ctx.reducedMotion ? 0 : ctx.t, demo = (ctx.data.demo ?? 1) >= .5
  const { intro, set } = demo ? loopPhase((t % LOOP.period) + c.offset) : { intro: 1, set: settle(ctx.data.set ?? 0) }
  const [bx, by, bw, bh] = c.box, p = ctx.pointers?.find(q => !q.up && q.inside)
  const hover = !!p && p.x >= bx && p.x <= bx + bw && p.y >= by && p.y <= by + bh
  const rest = c.pick0 ?? c.n - 1, raw = hover && p ? c.map(p.x, p.y) : Math.round(ctx.data.pick ?? rest)
  return { set, intro, pick: Math.max(0, Math.min(c.n - 1, Number.isFinite(raw) && raw >= 0 ? raw : rest)), hover }
}

export function chartCard(c: ChartCardSpec): WidgetPreset {
  const sw = switchOf(c.sets)
  const controls: Control[] = [
    { key: 'set', kind: 'segmented', options: 2, optionLabels: c.sets, box: sw.box, label: 'Data set' },
    { key: 'pick', kind: 'slider', min: 0, max: Math.max(0, c.n - 1), step: 1, box: c.box, map: c.map, label: 'Readout' },
  ]
  return {
    id: c.id, name: c.name, label: c.label, group: 'chart', chrome: 'dots', grid: TILE, style: c.style ?? style, animated: true,
    defaults: { demo: 1, set: 0, pick: c.pick0 ?? c.n - 1 }, springKeys: ['set'], handover: 'demo', controls,
    layers: ctx => {
      const v = view(c, ctx), s = ui(ctx, 'set'), on = v.set >= .5 ? 1 : 0
      const names: Label[] = c.sets.map((text, i) => ({ text, col: sw.xs[i], row: 0, tone: (i === on ? 'value' : s.hover ? 'idle' : 'mid') as Tone }))
      const [bx, by, bw, bh] = c.box
      const out: Layer[] = [...chartLayers(c.draw(v), TILE), ...chartLayers({ marks: [], labels: names }, TILE)]
      if (s.focus) out.push(marching(rr(sw.box[0], 10, sw.box[2] - 1, 0, 0), ctx.t, 0))
      if (ui(ctx, 'pick').focus) out.push(marching(rr(bx, by, bw - 1, bh - 1, 4), ctx.t, 0))
      return out
    },
  }
}

/** A readout's second line: the change from the point before, signed (blank for the first point). */
export const change = (vs: readonly number[], i: number, f: (v: number) => string) => (i > 0 ? f(vs[i] - vs[i - 1]) : '')
