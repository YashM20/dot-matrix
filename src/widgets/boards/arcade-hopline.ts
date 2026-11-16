/**
 * HOPLINE on a card: the track on a 4× lattice under the label (36 × 32 lattice cells), two rails of small dots,
 * posts and sparks above them, the runner as one 2 × 2 block in the accent. The ground under the lower rail
 * scrolls at half speed. Tap, click, Space or Enter hops rails.
 */
import { latticeGrid } from '../../engine/sampler/gridSampler'
import type { Layer } from '../../engine/types'
import { BREAK, HOP_FRAMES, HOP_RW, HOP_RX, HOP_VIEW, POST, SPARK, hopline, type Hopline } from '../../game/mini/hopline'
import { TILE, layer, tileStyle, type LatticeField, type WidgetPreset } from '../types'
import { PLAY_BOX, frame, overlay, session, type View } from './arcade-kit'

const K = 4, OY = 16, G = latticeGrid(TILE, K, [0, OY])
/** Lattice rows of the two rails; the runner stands on the two rows above its rail. */
export const RAILS = [13, 23]
const top = (rail: number) => RAILS[rail] - HOP_RW

/** A field on the track lattice written as (col, row) → value. */
const onTrack = (f: (c: number, r: number) => number): LatticeField =>
  ({ field: (u, v) => f(Math.round(u * (G.cols - 1)), Math.round(v * (G.rows - 1))), lattice: K, origin: [0, OY] })

/** Runner's top row: on its rail, part way through a hop, or fallen into a break. */
function runnerRow(s: Hopline): number {
  if (s.crash === BREAK) return top(s.rail) + 3
  if (s.hop <= 0) return top(s.rail)
  const p = 1 - s.hop / HOP_FRAMES
  return Math.round(top(1 - s.rail) + (top(s.rail) - top(1 - s.rail)) * p)
}

export function hoplineLayers(s: Hopline): Layer[] {
  const scroll = Math.floor(s.x), runRow = runnerRow(s)
  // what sits in each view column: breaks cut the rail, posts and sparks stand on it
  const rail = [new Uint8Array(HOP_VIEW).fill(1), new Uint8Array(HOP_VIEW).fill(1)]
  const posts: [number, number][] = [], sparks: [number, number][] = []
  for (const p of s.pieces) for (let i = 0; i < p.w; i++) {
    const c = p.x + i - scroll
    if (c < 0 || c >= HOP_VIEW) continue
    if (p.kind === BREAK) rail[p.rail][c] = 0
    else if (p.kind === POST) posts.push([c, p.rail])
    else if (p.kind === SPARK && !p.got) sparks.push([c, p.rail])
  }
  /** The rail whose standing rows (`rows` above it) include lattice row r, or -1. */
  const standing = (r: number, rows: number) => RAILS.findIndex(y => r < y && r >= y - rows)
  const has = (list: [number, number][], c: number, rl: number) => rl >= 0 && list.some(([x, y]) => x === c && y === rl)
  return [
    // ground: sparse dots under the lower rail, scrolling at half speed
    layer(onTrack((c, r) => (r === 29 && (c + Math.floor(s.x / 2)) % 3 === 0 ? .2 : 0)), 'faint'),
    layer(onTrack((c, r) => (r === RAILS[0] ? rail[0][c] * .4 : r === RAILS[1] ? rail[1][c] * .4 : 0)), 'mid'),
    layer(onTrack((c, r) => (has(posts, c, standing(r, 2)) ? 1 : 0)), 'idle'),
    layer(onTrack((c, r) => (has(sparks, c, standing(r, 2)) && RAILS.includes(r + 2) ? .8 : 0)), 'value'),
    layer(onTrack((c, r) => (c >= HOP_RX && c < HOP_RX + HOP_RW && r >= runRow && r < runRow + HOP_RW ? 1 : 0)), 'active'),
  ]
}

const KEY = 'hop'
export const hoplineSession = session(hopline, { key: KEY, kind: 'press', loop: 16, seed: 31 })
export const HOPLINE_HOWTO = ['TAP TO HOP RAILS', 'MISS GAPS AND POSTS']
export function hoplineFrame(ctx: Parameters<WidgetPreset['layers']>[0], v: View<Hopline>): Layer[] {
  const lines = overlay(v, HOPLINE_HOWTO, v.s.crash === POST ? 'STOPPED' : 'DROPPED')
  return frame(ctx, KEY, v, hoplineLayers(v.s), lines, v.mode === 'attract' ? [16, 58] : [24, 104])
}

export const hoplineCard: WidgetPreset = {
  id: 'arc-hopline', name: 'Hopline', label: 'HOPLINE', group: 'composite', chrome: 'dots', grid: TILE, style: tileStyle, animated: true, fps: 30,
  defaults: { [KEY]: 0 },
  controls: [{ key: KEY, kind: 'button', box: PLAY_BOX, label: 'Hopline: press to hop to the other rail' }],
  layers: ctx => hoplineFrame(ctx, hoplineSession.frame(ctx)),
}
