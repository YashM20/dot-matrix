/**
 * Squares board, XQ (docs/living-matter/X-advanced.md #7): the Ammann–Beenker floor.
 *
 *   AMMANN  de Bruijn's multigrid with 4 line families at kπ/4: squares and 45° rhombi that never repeat. The axis
 *           squares are joined blocks, the turned squares are cells at Q3.1's π/4 rotation (small diamonds), and the
 *           rhombi are round dot sites, one per cell centre inside them, never squares.
 *
 * One substitution level plays over 6 s: the floor zooms by the silver ratio δ = 1 + √2 about the tiling's centre
 * while a front runs out, and each big tile it reaches splits into the small tiles under it (the same tiling at 1/δ
 * of the zoom, whose vertices include every big vertex). When every tile has split the picture is the first frame
 * again. The red is the next tile to split. Grout: the cells within .6 of a tile edge stay empty.
 */
import { SILVER, abRaster, ammannBeenker, type AbTile } from '../../engine/algo/ammann'
import { dexp } from '../../engine/noise/dmath'
import type { Layer, Tone } from '../../engine/types'
import type { WidgetPreset } from '../types'
import { cardCells, cite, footer, mod, pad, tile, type Pt } from './squaresKit'

const ORIGIN: Pt = [0, 12], W = 144, H = 116, CX = W / 2, CY = H / 2
/** Tile edge (cells) at the start of the zoom, the loop (s), grout (cells) and ln δ (= asinh 1). */
const EDGE = 13, LOOP = 6, GROUT = .6, LN_SILVER = .881373587019543
/** The front's last radius: past every big tile that touches the card at the end of the zoom. */
const REACH = Math.sqrt(CX * CX + CY * CY) + EDGE * SILVER * .75
let tiles: AbTile[] | undefined
/** The tiles, once (enough to cover the card at the smallest scale, EDGE / δ). */
export const abTiles = () => (tiles ??= ammannBeenker(REACH * SILVER / EDGE + 2))

/** Cell codes: 0 empty, 1 axis square, 2 turned square, 3 / 4 the two rhombus greys; + 8 = the red tile. */
export interface AbFrame {
  code: Uint8Array
  /** The tile per cell (index; small tiles + the tile count; −1 grout or none). */
  tile: Int32Array
  /** Join group per cell (axis squares only), the zoom, the front (cells), the pieces shown and whether a red is left. */
  group: Uint8Array
  zoom: number
  front: number
  shown: number
  red: boolean
  /** Rhombus cells by grey and the red ones (card cells), as sites. */
  mid: Pt[]
  faint: Pt[]
  redSites: Pt[]
}
const big = new Int32Array(W * H), bigDepth = new Float32Array(W * H), fine = new Int32Array(W * H), fineDepth = new Float32Array(W * H), keep = new Uint8Array(W * H)
const CODE = [1, 2, 3, 4, 3, 4]
/** Each frame cell's card cell as a site, built once and shared by every frame (the sampler only reads sites). */
const CELLS: Pt[] = Array.from({ length: W * H }, (_, i) => [ORIGIN[0] + i % W, ORIGIN[1] + Math.floor(i / W)])
let last: { p: number; f: AbFrame } | undefined
/** The frame at phase p ∈ [0, 1): big tiles at zoom δ^p, split where the front (p · REACH) has passed their centre. */
export function abFrame(p: number): AbFrame {
  if (last?.p === p) return last.f
  const ts = abTiles(), zoom = dexp(p * LN_SILVER), front = p * REACH, sBig = EDGE * zoom
  big.fill(-1); fine.fill(-1)
  abRaster(ts, { w: W, h: H, s: sBig, cx: CX, cy: CY }, big, bigDepth)
  const split = new Uint8Array(ts.length)
  let next = -1, nextD = Infinity
  ts.forEach((t, i) => {
    const d = Math.sqrt(t.centre[0] * t.centre[0] + t.centre[1] * t.centre[1]) * sBig
    if (d <= front) { split[i] = 1; return }
    const x = CX + t.centre[0] * sBig, y = CY - t.centre[1] * sBig
    if (x >= 0 && x < W && y >= 0 && y < H && d < nextD) { nextD = d; next = i }
  })
  for (let i = 0; i < W * H; i++) keep[i] = big[i] >= 0 && split[big[i]] === 1 ? 1 : 0
  abRaster(ts, { w: W, h: H, s: sBig / SILVER, cx: CX, cy: CY }, fine, fineDepth, keep)
  const code = new Uint8Array(W * H), owner = new Int32Array(W * H).fill(-1), group = new Uint8Array(W * H), mid: Pt[] = [], faint: Pt[] = [], redSites: Pt[] = []
  // pieces shown: bit 1 the big tile, bit 2 the small one
  const seen = new Uint8Array(ts.length)
  let shown = 0
  for (let i = 0; i < W * H; i++) {
    const s = keep[i] === 1, t = s ? fine[i] : big[i]
    if (t < 0 || (s ? fineDepth[i] : bigDepth[i]) < GROUT) continue
    const T = ts[t], k = CODE[T.kind], red = !s && t === next, bit = s ? 2 : 1
    code[i] = k + (red ? 8 : 0); owner[i] = s ? ts.length + t : t
    // edge neighbours among axis squares differ by one line number, so parity splits them; small tiles + 2
    group[i] = ((T.nj + T.nk) & 1) + (s ? 2 : 0)
    if (!(seen[t] & bit)) { seen[t] |= bit; shown++ }
    if (k >= 3) (red ? redSites : k === 3 ? mid : faint).push(CELLS[i])
  }
  const f: AbFrame = { code, tile: owner, group, zoom, front, shown, red: next >= 0, mid, faint, redSites }
  last = { p, f }
  return f
}

const dots = (sites: Pt[], tone: Tone, value: number): Layer => ({ field: () => value, sites, size: 1, tone, shapeOf: () => 0 })
export const sqAmmann: WidgetPreset = {
  id: 'sq-ammann', name: 'Squares Ammann', label: 'AMMANN', ...tile,
  credit: { by: ['Robert Ammann', 'Frans Beenker', 'Nicolaas Govert de Bruijn'], title: 'Ammann–Beenker tiling, by de Bruijn’s multigrid', source: 'https://en.wikipedia.org/wiki/Ammann%E2%80%93Beenker_tiling', note: 'technique' },
  layers: ctx => {
    const p = mod(ctx.t, LOOP) / LOOP, f = abFrame(p), at = (c: number, r: number) => f.code[r * W + c]
    // the squares, one layer: axis squares join, turned squares are π/4 cells, which never join
    const squares = cardCells(ORIGIN, W, H, (c, r) => { const k = at(c, r) & 7; return k === 1 || k === 2 ? .75 : 0 }, {
      toneOf: (c, r) => (at(c, r) & 8 ? 'active' : at(c, r) === 1 ? 'idle' : 'mid'), group: (c, r) => f.group[r * W + c], join: { accent: true },
      rotation: (c, r) => ((at(c, r) & 7) === 2 ? Math.PI / 4 : 0),
    })
    return [
      cite('DE BRUIJN 1981'),
      squares,
      dots(f.mid, 'mid', .5), dots(f.faint, 'faint', .75), dots(f.redSites, 'active', .75),
      ...footer(p, `TILES ${pad(f.shown, 3)}`, `ZOOM ${f.zoom.toFixed(2)}`),
    ]
  },
}
