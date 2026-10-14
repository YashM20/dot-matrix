/**
 * Headless card snapshots: preset → sampleLayers → PNG, no browser needed.
 *
 *   pnpm snap good-morning timer          # single cards
 *   pnpm snap --board henry3              # whole board as one sheet
 *   pnpm snap --all                       # every board
 *   pnpm snap --film timer --t 0:2:0.25   # contact sheet across time → <out>/film/timer.png (+ timer.apng)
 *   pnpm snap --bar silhouette            # bar sheet vs the reference cards → <out>/bar/silhouette.png
 *   options: --out <dir> (default .snapshots)  --px <pixels per CSS px> (default 2; film/bar default 1)
 *            --t <seconds> (default 1.3; with --film a:b:step, default 0:2:0.25)  --cols <n> (film frames per row)
 *
 * Icons and CJK need a browser canvas, so they render empty here — everything else is exact.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { boardById, boards, widgetById, widgetPresets, type WidgetPreset } from '../src/widgets'
import { apng, Raster } from './lib/raster'
import { litCentroid, renderCard, renderCardFull, sheet, theme, timeRange } from './lib/cards'

const args = process.argv.slice(2)
const opt = (name: string, fallback: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args.splice(i, 2)[1] : fallback }
const film = opt('film', ''), bar = opt('bar', '')
const out = opt('out', '.snapshots'), px = +opt('px', film || bar ? '1' : '2'), tArg = opt('t', ''), board = opt('board', ''), filmCols = +opt('cols', '0')
const t = tArg && !tArg.includes(':') ? +tArg : 1.3
const all = args.includes('--all'), ids = args.filter(a => !a.startsWith('--'))

const save = (name: string, r: Raster | Buffer, ext = 'png') => {
  const file = join(out, `${name}.${ext}`)
  mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, r instanceof Raster ? r.png() : r); console.log(file)
}
const need = (id: string): WidgetPreset => { const p = widgetById(id); if (!p) { console.error(`unknown card ${id}`); process.exit(1) } return p }

// ── film: one card across deterministic t values ────────────────────────────
function filmSheet(p: WidgetPreset, ts: number[]) {
  const LABEL = 22, gap = 12
  const frames = ts.map(tt => renderCard(p, { px, t: tt }))
  const fw = Math.max(...frames.map(f => f.w)), fh = Math.max(...frames.map(f => f.h))
  const cols = filmCols > 0 ? filmCols : frames.length, rows = Math.ceil(frames.length / cols)
  const s = new Raster(cols * fw + (cols + 1) * gap, rows * (fh + LABEL) + (rows + 1) * gap, theme.bg)
  frames.forEach((f, i) => {
    const x = gap + (i % cols) * (fw + gap), y = gap + Math.floor(i / cols) * (fh + LABEL + gap)
    s.text(`T=${ts[i].toFixed(3).replace(/\.?0+$/, '') || '0'}`, x, y + 2)
    s.paste(f, x, y + LABEL)
  })
  save(`film/${p.id}`, s)
  // APNG at the sheet's own step (frames share one size)
  const step = ts.length > 1 ? ts[1] - ts[0] : 1
  save(`film/${p.id}`, apng(frames.map(f => { const r = new Raster(fw, fh, theme.bg); r.paste(f, 0, 0); return r }), step * 1000), 'apng')
}

// ── bar sheet: candidate beside the reference standard at the same scale ───
const BAR_REFS = ['level-03', 'afterlight', 'thermal-monitor', 'ui-toggle']
function resolveRef(id: string): WidgetPreset | undefined {
  const exact = widgetById(id); if (exact) return exact
  const stem = id.split('-')[0], near = widgetPresets.find(p => p.id.startsWith(stem)) ?? widgetPresets.find(p => p.id.includes(stem))
  if (near) console.warn(`bar: reference ${id} not found, using ${near.id}`); else console.warn(`bar: reference ${id} not found, skipped`)
  return near
}
function barSheet(p: WidgetPreset) {
  const cards = [p, ...BAR_REFS.map(resolveRef).filter((r): r is WidgetPreset => !!r && r.id !== p.id)]
  const views = cards.map(c => {
    const one = renderCardFull(c, { px, t })
    // 3×: render at 3× scale and crop a 1×-sized window around the lit-mass centroid
    const three = renderCardFull(c, { px: px * 3, t }), [cx, cy] = litCentroid(three.dots)
    const [mx, my] = Number.isFinite(cx) ? three.map(cx, cy) : [three.raster.w / 2, three.raster.h / 2]
    const ox = Math.round(Math.max(0, Math.min(three.raster.w - one.raster.w, mx - one.raster.w / 2)))
    const oy = Math.round(Math.max(0, Math.min(three.raster.h - one.raster.h, my - one.raster.h / 2)))
    return [one.raster, three.raster.crop(ox, oy, one.raster.w, one.raster.h), one.raster.blur(6 * px), renderCard(c, { px, t, silhouette: true })]
  })
  const ROWS = ['1X', '3X', 'BLUR', 'SIL'], LEFT = 64, TOP = 26, gap = 12
  const cw = Math.max(...views.map(v => v[0].w)), ch = Math.max(...views.map(v => v[0].h))
  const s = new Raster(LEFT + cards.length * (cw + gap) + gap, TOP + ROWS.length * (ch + gap) + gap, theme.bg)
  cards.forEach((c, i) => s.text(c.id.toUpperCase(), LEFT + gap + i * (cw + gap), 8, i === 0 ? theme.dotActive : theme.dotIdle))
  ROWS.forEach((name, r) => {
    const y = TOP + gap + r * (ch + gap)
    s.text(name, 8, y + ch / 2 - 7)
    views.forEach((v, i) => s.paste(v[r], LEFT + gap + i * (cw + gap) + Math.round((cw - v[r].w) / 2), y + Math.round((ch - v[r].h) / 2)))
  })
  save(`bar/${p.id}`, s)
}

mkdirSync(out, { recursive: true })
if (film) filmSheet(need(film), tArg.includes(':') ? timeRange(tArg) : tArg ? [t] : timeRange('0:2:0.25'))
if (bar) barSheet(need(bar))
for (const b of all ? boards : board ? [boardById(board)!] : []) save(`board-${b.id}`, sheet(b.items.map(p => renderCard(p, { px, t })), b.columns))
for (const id of ids) { const p = widgetById(id); if (!p) { console.error(`unknown card ${id}`); continue } save(id, renderCard(p, { px, t })) }
