/**
 * The bar sheet and scorecard in the browser (ports of `pnpm snap --bar` and `scripts/lib/fidelity.ts`).
 * Bar sheet: the candidate beside the reference standard (level-03, afterlight, thermal-monitor,
 * ui-toggle) at the same scale, in 1×, 3× (crop around the lit centroid), blur and silhouette rows.
 * Cards are sampled through the engine and drawn with the engine's canvas renderer.
 */
import { renderCanvas } from '../../engine/renderer/canvasRenderer'
import { sampleLayers } from '../../engine/sampler/gridSampler'
import { dot480 } from '../../engine/theme/tokens'
import type { DotInstance, DotStyle } from '../../engine/types'
import { widgetById, withChrome, type WidgetPreset } from '../../widgets'
import { scoreFidelity, type FidelityCard } from '../../../scripts/lib/fidelity'
import { litCentroid } from '../../../scripts/lib/stats'

export const BAR_REFS = ['level-03', 'afterlight', 'thermal-monitor', 'ui-toggle']
export const BAR_ROWS = ['1×', '3×', 'BLUR', 'SIL']
const PAD = 14, theme = dot480

interface CardFrame { p: WidgetPreset; dots: DotInstance[]; sil: DotInstance[]; w: number; h: number; pitch: number }
const refCache = new Map<string, CardFrame>()
function frameOf(p: WidgetPreset, t: number): CardFrame {
  const pitch = p.grid.pitch ?? theme.gridPx, grid = { ...p.grid, pitch }
  const ls = withChrome(p)({ t, data: { ...p.defaults } })
  const sil: DotStyle = { ...p.style, sizeMin: p.style.sizeMax, sizeCurve: undefined, opacityMode: 'fromValue' }
  return { p, pitch, w: p.grid.cols * pitch, h: p.grid.rows * pitch, dots: sampleLayers(ls, grid, p.style, theme), sil: sampleLayers(ls, grid, sil, theme).map(d => ({ ...d, color: '#ffffff', opacity: d.opacity > 0 ? 1 : 0 })) }
}
const refFrame = (id: string) => {
  let f = refCache.get(id)
  if (!f) { const p = widgetById(id); if (!p) return undefined; refCache.set(id, (f = frameOf(p, 0))) }
  return f
}

type Ctx = CanvasRenderingContext2D
function cardBg(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string) {
  ctx.save(); ctx.fillStyle = fill; ctx.strokeStyle = '#26292d'; ctx.beginPath(); ctx.roundRect(x + .5, y + .5, w - 1, h - 1, 14); ctx.fill(); ctx.stroke(); ctx.restore()
}
function drawDots(ctx: Ctx, f: CardFrame, dots: DotInstance[], x: number, y: number, k: number, clip?: [number, number, number, number]) {
  ctx.save()
  if (clip) { ctx.beginPath(); ctx.rect(...clip); ctx.clip() }
  ctx.translate(x, y); ctx.scale(k, k); renderCanvas(ctx, dots); ctx.restore()
}

/** Draws the bar sheet for `candidate` into `canvas` (sized here). Returns the drawing time, ms. */
export function drawBarSheet(canvas: HTMLCanvasElement, candidate: WidgetPreset, t = 0): number {
  const t0 = performance.now()
  const cards = [frameOf(candidate, t), ...BAR_REFS.filter(id => id !== candidate.id).map(refFrame).filter((f): f is CardFrame => !!f)]
  const cw = Math.max(...cards.map(c => c.w)) + PAD * 2, ch = Math.max(...cards.map(c => c.h)) + PAD * 2
  const LEFT = 52, TOP = 24, gap = 12
  canvas.width = LEFT + cards.length * (cw + gap) + gap; canvas.height = TOP + BAR_ROWS.length * (ch + gap) + gap
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.font = '500 11px ui-monospace, monospace'; ctx.textBaseline = 'top'
  BAR_ROWS.forEach((name, r) => { ctx.fillStyle = theme.dotIdle; ctx.fillText(name, 10, TOP + gap + r * (ch + gap) + ch / 2 - 6) })
  cards.forEach((c, i) => {
    const x0 = LEFT + gap + i * (cw + gap), w = c.w + PAD * 2, h = c.h + PAD * 2, ox = x0 + (cw - w) / 2
    ctx.fillStyle = i === 0 ? theme.dotActive : theme.dotIdle; ctx.fillText(c.p.id.toUpperCase().slice(0, 28), x0, 6)
    const rowY = (r: number) => TOP + gap + r * (ch + gap) + (ch - h) / 2
    // 1×
    cardBg(ctx, ox, rowY(0), w, h, theme.surface); drawDots(ctx, c, c.dots, ox + PAD, rowY(0) + PAD, 1)
    // 3×: the same dots at 3× scale, a card-sized window around the lit centroid
    const [cx, cy] = litCentroid(c.dots), mx = Number.isFinite(cx) ? cx * 3 + PAD * 3 : (w * 3) / 2, my = Number.isFinite(cy) ? cy * 3 + PAD * 3 : (h * 3) / 2
    const sx = Math.max(0, Math.min(w * 3 - w, mx - w / 2)), sy = Math.max(0, Math.min(h * 3 - h, my - h / 2))
    ctx.fillStyle = theme.surface; ctx.fillRect(ox, rowY(1), w, h)
    drawDots(ctx, c, c.dots, ox - sx + PAD * 3, rowY(1) - sy + PAD * 3, 3, [ox, rowY(1), w, h])
    // blur: the 1× view through a 6 px blur
    ctx.save(); ctx.filter = 'blur(6px)'
    ctx.drawImage(canvas, ox, rowY(0), w, h, ox, rowY(2), w, h)
    ctx.restore()
    // silhouette: every lit dot solid white at full size, on black
    cardBg(ctx, ox, rowY(3), w, h, '#000000'); drawDots(ctx, c, c.sil, ox + PAD, rowY(3) + PAD, 1)
  })
  return performance.now() - t0
}

export type Score = FidelityCard
/** The fidelity gates (G1–G3, G5) and metrics on any preset, same code as `pnpm fidelity`. */
export const scoreCard = (p: WidgetPreset): Score => scoreFidelity(p)
