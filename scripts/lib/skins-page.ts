/**
 * Browser side of `scripts/skins-browser.ts --fidelity` (bundled by esbuild, no dev server): every display stage
 * (CRT, VFD, Nixie) on a synthetic card, measured in pixels. Exposed as `window.SK`.
 */
import { createDisplayStage } from '../../src/engine/display/stage'
import { SKIN_NAMES, type SkinName } from '../../src/engine/display/names'
import { dot480 } from '../../src/engine/theme/tokens'

const COLS = 12, ROWS = 8, CELL = 12, W = COLS * CELL, H = ROWS * CELL
/** A card frame: a 3 × 3 white block around cell (2, 2), one in the accent around (6, 2), the rest unlit (transparent, as a card canvas is). */
function card(): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const x = c.getContext('2d')!
  x.fillStyle = '#ffffff'; x.fillRect(1 * CELL, 1 * CELL, 3 * CELL, 3 * CELL); x.fillStyle = dot480.dotActive; x.fillRect(5 * CELL, 1 * CELL, 3 * CELL, 3 * CELL)
  return c
}
const px = (c: HTMLCanvasElement, x: number, y: number) => Array.from(c.getContext('2d')!.getImageData(Math.floor(x), Math.floor(y), 1, 1).data.slice(0, 3))
const hue = ([r, g, b]: number[]) => { const M = Math.max(r, g, b), m = Math.min(r, g, b), d = M - m; if (!d) return 0; const h = M === r ? ((g - b) / d) % 6 : M === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360 }
const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))

/** One stage, settled: a white cell, an accent cell, an unlit cell far from both; `settled` = it stops asking for frames. */
function stage(skin: SkinName) {
  const o = document.createElement('canvas'); o.width = W; o.height = H
  const ctx = o.getContext('2d')!, st = createDisplayStage(skin, { cols: COLS, rows: ROWS, w: W, h: H, instant: true })
  if (!st) return null
  st.frame(card(), 0); st.render(ctx, 0); const settled = !st.render(ctx, 5)
  const white = px(o, 2.5 * CELL, 2.5 * CELL), red = px(o, 6.5 * CELL, 2.5 * CELL), unlit = px(o, 10.5 * CELL, 6.5 * CELL)
  return { white, red, unlit, settled, redHue: hue(red), accentHue: hue(rgb(dot480.dotActive)), png: o.toDataURL('image/png') }
}
;(window as unknown as { SK: unknown }).SK = { names: SKIN_NAMES, stage }
