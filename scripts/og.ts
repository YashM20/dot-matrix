/**
 * OG / email image: one card + its board title → PNG 1200×630, headless (the snap raster path).
 *
 *   npx tsx scripts/og.ts timer                          → .snapshots/og/timer.png
 *   npx tsx scripts/og.ts timer --data '{"progress":0.8}' --t 2 --out og.png
 *
 * The title and card name are dots too: `textAt` fields sampled on their own grid, so the 5×7
 * glyph pixels stay dot-aligned. Rasterised by scripts/lib/raster.ts (no resvg: it isn't a dependency,
 * and the SVG → PNG step is not needed when the raster path renders the same dots directly).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { boards, widgetById } from '../src/widgets'
import { textAt, textSize } from '../src/engine/layout'
import { sampleLayers } from '../src/engine/sampler/gridSampler'
import type { DotStyle, Layer, Tone } from '../src/engine/types'
import { Raster } from './lib/raster'
import { pitchOf, renderCard, theme, visible, PAD } from './lib/cards'

export const OG_W = 1200, OG_H = 630
const M = 48, TP = 4 // margin; title dot pitch (px)

/** Greedy word wrap to `max` characters. */
const wrap = (s: string, max: number) => s.split(/\s+/).reduce<string[]>((lines, w) => {
  const last = lines[lines.length - 1]
  if (last !== undefined && (last + ' ' + w).length <= max) lines[lines.length - 1] = `${last} ${w}`; else lines.push(w)
  return lines
}, [])

export function ogImage(cardId: string, { t = 1.3, data = {} as Record<string, number> } = {}): Raster {
  const p = widgetById(cardId)
  if (!p) throw new Error(`unknown card ${cardId}`)
  const board = boards.find(b => b.items.some(i => i.id === p.id))
  const cw1 = p.grid.cols * pitchOf(p), ch1 = p.grid.rows * pitchOf(p)
  // card on the right, as tall as the frame allows, at most ~55% of the width
  const pad = p.bleed ? 0 : PAD * 2
  const px = Math.min((OG_H - 2 * M - pad) / ch1, (OG_W * 0.55 - pad) / cw1)
  const card = renderCard(p, { px, t, ctx: { data } })
  const out = new Raster(OG_W, OG_H, theme.bg)
  const cx = OG_W - M - card.w, cy = Math.round((OG_H - card.h) / 2)
  out.paste(card, cx, cy)

  // text column: board title (2× glyphs), card name, wordmark, all on one TP dot grid
  const cols = Math.floor((cx - 2 * M) / TP), rows = Math.floor((OG_H - 2 * M) / TP)
  const grid = { cols, rows, pitch: TP }
  const layers: Layer[] = []
  let row = 0
  const put = (s: string, scale: number, tone: Tone, gap: number) => {
    const charW = textSize('M', { scale })[0] + scale
    for (const line of wrap(s.toUpperCase(), Math.max(4, Math.floor(cols / charW)))) {
      if (row + textSize(line, { scale })[1] > rows) return
      layers.push({ field: textAt(grid, line, 0, row, { scale }), tone })
      row += textSize(line, { scale })[1] + 3 * scale
    }
    row += gap
  }
  put(board?.title ?? 'DOT / 480', 2, 'value', 10)
  put(p.name, 1, 'mid', 0)
  const style: DotStyle = { shape: 'circle', sizeMin: 0, sizeMax: TP * 0.42, opacityMode: 'fromValue' }
  const wordmark: Layer = { field: textAt(grid, 'DOT/480', 0, rows - 7), tone: 'idle' }
  for (const d of sampleLayers([...layers, wordmark], grid, style, theme)) if (visible(d)) out.dot(M + d.x, M + d.y, d.r, 2, d.color, d.opacity)
  return out
}

if (/[\\/]scripts[\\/]og\.ts$/.test(process.argv[1] ?? '')) {
  const args = process.argv.slice(2)
  const opt = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args.splice(i, 2)[1] : undefined }
  const dataArg = opt('data'), tArg = opt('t'), outArg = opt('out')
  const id = args.find(a => !a.startsWith('--'))
  if (!id) { console.error('usage: og.ts <cardId> [--data json] [--t seconds] [--out file.png]'); process.exit(1) }
  let data: Record<string, number> = {}
  try { data = dataArg ? JSON.parse(dataArg) : {} } catch { console.error(`bad --data JSON: ${dataArg}`); process.exit(1) }
  const file = outArg ?? join('.snapshots', 'og', `${id}.png`)
  const img = ogImage(id, { t: tArg ? +tArg : 1.3, data })
  mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, img.png())
  console.log(`${file} ${img.w}×${img.h}`)
}
