/**
 * Browser side of `scripts/skins-browser.ts --fidelity` (bundled by esbuild, no dev server): the `lcd` and `grout`
 * stages (squares Q2) on a synthetic card, measured in pixels. Exposed as `window.SK`.
 */
import { createDisplayStage, STAGE_COLORS } from '../../src/engine/display/stage'
import { SKIN_PHYSICS } from '../../src/engine/display/skins'
import { dot480 } from '../../src/engine/theme/tokens'

const COLS = 12, ROWS = 8, CELL = 12, W = COLS * CELL, H = ROWS * CELL
/** A card frame: cell (2, 2) white, cell (5, 2) the accent, the rest unlit (transparent, as a card canvas is). */
function card(lit = true): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const x = c.getContext('2d')!
  if (lit) { x.fillStyle = '#ffffff'; x.fillRect(2 * CELL, 2 * CELL, CELL, CELL); x.fillStyle = dot480.dotActive; x.fillRect(5 * CELL, 2 * CELL, CELL, CELL) }
  return c
}
const px = (c: HTMLCanvasElement, x: number, y: number) => Array.from(c.getContext('2d')!.getImageData(Math.floor(x), Math.floor(y), 1, 1).data.slice(0, 3))
const hue = ([r, g, b]: number[]) => { const M = Math.max(r, g, b), m = Math.min(r, g, b), d = M - m; if (!d) return 0; const h = M === r ? ((g - b) / d) % 6 : M === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360 }
const luma = ([r, g, b]: number[]) => .2126 * r + .7152 * g + .0722 * b
const out = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c }

function lcd() {
  const P = SKIN_PHYSICS.lcd, o = out(), ctx = o.getContext('2d')!
  const st = createDisplayStage('lcd', { cols: COLS, rows: ROWS, w: W, h: H, instant: true })!
  // settled: unlit pixel, gutter, a white pixel, the accent pixel
  st.frame(card(), 0); st.render(ctx, 0); st.render(ctx, 5)
  const paper = P.paper.map(v => v * 255), ink = P.ink.map(v => v * 255)
  const gutter = px(o, 8 * CELL + .5, 6 * CELL + CELL / 2), unlit = px(o, 8.5 * CELL, 5.5 * CELL), white = px(o, 2.5 * CELL, 2.5 * CELL), red = px(o, 5.5 * CELL, 2.5 * CELL)
  // step response: blank panel, a white frame at t = 0, measured after τ (63% from paper to ink, on the luma)
  const step = createDisplayStage('lcd', { cols: COLS, rows: ROWS, w: W, h: H, instant: true })!
  step.frame(card(false), 0); step.render(ctx, 0); step.render(ctx, 2)
  const b0 = px(o, 2.5 * CELL, 2.5 * CELL)
  step.frame(card(), 2); step.render(ctx, 2); step.render(ctx, 2 + P.tau)
  const b1 = px(o, 2.5 * CELL, 2.5 * CELL), busy = step.render(ctx, 2 + P.tau + .01)
  step.render(ctx, 9); const settled = !step.render(ctx, 9.01), b2 = px(o, 2.5 * CELL, 2.5 * CELL)
  const frac = (luma(b0) - luma(b1)) / (luma(b0) - luma(b2) || 1)
  return { gutter, unlit, white, red, paper, ink, frac, busy, settled, redHue: hue(red), accentHue: hue([255, 59, 48]) }
}
function grout() {
  const o = out(), ctx = o.getContext('2d')!
  const st = createDisplayStage('grout', { cols: COLS, rows: ROWS, w: W, h: H, instant: true })!
  st.frame(card(), 0); const busy0 = st.render(ctx, 0)
  const g = px(o, 8 * CELL, 6.5 * CELL), tile = px(o, 8.5 * CELL, 5.5 * CELL), white = px(o, 2.5 * CELL, 2.5 * CELL), red = px(o, 5.5 * CELL, 2.5 * CELL)
  const want = [1, 3, 5].map(i => parseInt(STAGE_COLORS.grout.slice(i, i + 2), 16))
  return { grout: g, want, tile, white, red, busy0, redHue: hue(red), accentHue: hue([255, 59, 48]) }
}
function shot(skin: 'lcd' | 'grout') {
  const o = out(), ctx = o.getContext('2d')!, st = createDisplayStage(skin, { cols: COLS, rows: ROWS, w: W, h: H, instant: true })!
  st.frame(card(), 0); st.render(ctx, 0); st.render(ctx, 5)
  return o.toDataURL('image/png')
}
;(window as unknown as { SK: unknown }).SK = { lcd, grout, shot }
