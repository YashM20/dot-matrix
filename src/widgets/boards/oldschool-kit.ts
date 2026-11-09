/**
 * The oldschool board's shared kit: the TILE card shell, the body plate (a lattice of big dots baked once a frame,
 * value and tone per dot), the footer and the credit lines for the three articles the board is built on.
 */
import { latticeGrid } from '../../engine/sampler/gridSampler'
import type { Layer, Tone } from '../../engine/types'
import { TILE, layoutFor, tileStyle, type WidgetCredit } from '../types'
import { caption, footer as footerText } from '../captions'

export const T = layoutFor(TILE)
export const tile = { group: 'composite', chrome: 'dots', grid: TILE, style: tileStyle, animated: true } as const

/** Body rows: below the label (0–7), above the footer text (136–142). */
export const BODY_TOP = 11, BODY_BOTTOM = 131, FOOT = 136

const iq = (title: string, slug: string): WidgetCredit => ({ by: ['Inigo Quilez'], title, source: `https://iquilezles.org/articles/${slug}/`, note: 'technique' })
export const CREDIT_DEFORM = iq('Plane deformations', 'deform')
export const CREDIT_CLOUDS = iq('2D dynamic clouds', 'dynclouds')
export const CREDIT_FEEDBACK = iq('Feedback effect', 'feedbackfx')

/** Tones a plate dot can take; `paint` sets an index into this list. */
export const TONES: readonly Tone[] = ['faint', 'mid', 'idle', 'value', 'active']
export const FAINT = 0, MID = 1, IDLE = 2, VALUE = 3, ACTIVE = 4
/** What `paint` writes for one dot: its value (dot size, 0 = no dot) and its tone index. */
export interface Ink { v: number; tone: number }

/** A plate's lattice: `cols` × `rows` painted dots (of `all` lattice rows), origin (ox, oy) in card cells. */
export interface PlateGeom { K: number; cols: number; rows: number; all: number; ox: number; oy: number }
export function plateGeom(K: number, top = BODY_TOP, bottom = BODY_BOTTOM): PlateGeom {
  const cols = Math.floor(TILE.cols / K), ox = (TILE.cols - cols * K) / 2, oy = top
  // a dot's centre is origin + (i + .5)·K − .5 card cells: rows up to the last centre at or above `bottom`
  const { rows: all } = latticeGrid(TILE, K, [ox, oy])
  return { K, cols, rows: Math.min(all, Math.floor((bottom + .5 - oy) / K + .5)), all, ox, oy }
}
/** Card-cell centre of plate dot `i` (row-major). */
export const dotCentre = (g: PlateGeom, i: number): [number, number] => [g.ox + (i % g.cols + .5) * g.K - .5, g.oy + (Math.floor(i / g.cols) + .5) * g.K - .5]

/**
 * A body plate: lattice-K dots centred across the card, with centres from card row `top` to `bottom`. `paint(x, y, ink, i)`
 * gets each dot's centre in card cells and its index (row-major), once per dot per frame (the bake runs on first sample).
 */
export function plate(K: number, paint: (x: number, y: number, ink: Ink, i: number) => void, top = BODY_TOP, bottom = BODY_BOTTOM): Layer {
  const { cols, rows, all, ox, oy } = plateGeom(K, top, bottom)
  const n = cols * all
  let val: Float32Array | undefined, tone: Uint8Array | undefined
  const bake = () => {
    if (val) return
    val = new Float32Array(n); tone = new Uint8Array(n)
    const ink: Ink = { v: 0, tone: IDLE }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      ink.v = 0; ink.tone = IDLE
      paint(ox + (c + .5) * K - .5, oy + (r + .5) * K - .5, ink, r * cols + c)
      val[r * cols + c] = ink.v; tone[r * cols + c] = ink.tone
    }
  }
  const at = (u: number, v: number) => Math.round(v * (all - 1)) * cols + Math.round(u * (cols - 1))
  return {
    field: (u, v) => { bake(); return val![at(u, v)] ?? 0 },
    toneOf: (_, u, v) => { bake(); return TONES[tone![at(u, v)] ?? IDLE] },
    lattice: K, origin: [ox, oy],
  }
}

/** Footer: a counter left, an optional stat right in `mid` (card row FOOT). A card that only has a formula to say leaves the right out. */
export const footer = (left: string, right = ''): Layer[] => footerText(left, right, FOOT)
/** Top-right caption (`captions.ts`). Plain words only, never a formula. */
export { caption }

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
export const frac = (x: number) => x - Math.floor(x)
/** n as `w` digits, zero-padded, keeping the last `w` when it overflows. */
export const pad = (n: number, w: number) => String(Math.max(0, Math.floor(n))).padStart(w, '0').slice(-w)
