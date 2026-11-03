/**
 * Squares board, Q3.10 (docs/living-matter/Q-squares.md, #36): glyph tiles in square dots.
 *
 *   ASCII  a slow plasma typed as ASCII art on a 24 × 14 screen. Each tile is a 5 × 7 font glyph built from square
 *          dots, picked from a ramp of ten ordered by ink (` .:-+=%*#@`), over the tile's unlit pixels in faint, so
 *          the tiles read as the cells of a character display. A one-cell gutter keeps neighbouring glyphs apart.
 *
 * The cursor writes 24 tiles a second in reading order, and a tile only changes when the cursor passes it, so the
 * newest picture is always being typed over the last one. The red is the cursor: one joined block on the tile it
 * writes next. Four redraws make the 56 s loop (engine/squares/ascii.ts), and t = 0 is a full screen.
 */
import { ASCII57, ASCII_SCREEN, asciiCount, asciiFrame, asciiTiles, type AsciiFrame } from '../../engine/squares/ascii'
import { clearTile, createTileRaster, putGlyph, T_FAINT, T_VALUE, tileLayers, type TileGrid, type TileRaster } from '../../engine/life/glyphTiles'
import { TILE, type WidgetPreset } from '../types'
import { cardCells, cite, footer, pad, tile, type Pt } from './squaresKit'

const S = ASCII_SCREEN, ORIGIN: Pt = [0, 14]
const GRID: TileGrid = { cols: S.cols, rows: S.rows, pitch: S.pitch, pitchY: S.pitchY, ox: ORIGIN[0], oy: ORIGIN[1] }
/** t = 0 finds the cursor 40% down the screen, in the first redraw. */
const OFF = .4 * asciiTiles(S) / S.rate
/** Glyph pixels at full value; the unlit pixels of every glyph box faint and half size. */
const INK = 1, PAPER = .5

let raster: TileRaster | undefined, drawn = Number.NaN
const glyphs = new Uint8Array(asciiTiles(S))
let frame: AsciiFrame | undefined

/** The screen at write count `count` drawn into the shared raster (redrawn only when the count moves). */
function screen(count: number): { r: TileRaster; f: AsciiFrame } {
  const r = (raster ??= createTileRaster(TILE, GRID))
  if (count !== drawn || !frame) {
    const f = (frame = asciiFrame(S, count, glyphs))
    for (let i = 0; i < f.glyph.length; i++) {
      const tx = i % S.cols, ty = (i - tx) / S.cols
      if (i === f.cursor) clearTile(r, tx, ty)
      else putGlyph(r, tx, ty, ASCII57.ramp[f.glyph[i]], T_VALUE, INK, T_FAINT, PAPER)
    }
    drawn = count
  }
  return { r, f: frame }
}

export const sqAscii: WidgetPreset = {
  id: 'sq-ascii', name: 'Squares ASCII', label: 'ASCII', ...tile,
  layers: ctx => {
    const { r, f } = screen(asciiCount(S, ctx.t, OFF)), cx = f.cursor % S.cols, cy = (f.cursor - cx) / S.cols
    const at: Pt = [ORIGIN[0] + cx * S.pitch, ORIGIN[1] + cy * S.pitchY]
    return [
      cite('ASCII 1963'),
      ...tileLayers(r),
      // the cursor: a solid block over the glyph box, joined into one piece
      { ...cardCells(at, ASCII57.w, ASCII57.h, () => INK, { join: { accent: true } }), tone: 'active' },
      ...footer(f.cursor / (asciiTiles(S) - 1), `ROW ${pad(cy + 1, 2)} COL ${pad(cx + 1, 2)}`, `REDRAW ${f.redraw + 1}/${S.redraws}`),
    ]
  },
}
/** Sizes for the checks (`scripts/ascii.ts`). */
export const ASCII_CARD = { screen: S, origin: ORIGIN, offset: OFF, ink: INK, paper: PAPER }
