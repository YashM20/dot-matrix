/**
 * Editor exports for one frame, on the same code as the old TUNE / COMPOSE export panels: the frame's
 * timeline source (`studio/playback`) drives stills, clips (`recordClip`: APNG / GIF / WebM / MP4) and
 * the plotter SVG; the card itself goes out as Studio JSON or card spec v1 / v0.
 */
import { saveAs } from 'file-saver'
import { renderSVG } from '../../engine/renderer/svgRenderer'
import { plotterSVG, recordClip, type ClipFormat } from '../../export'
import { stillPNG } from '../../export/still'
import { specV0, specV1 } from '../studio/adapter'
import { cardToJSON } from '../studio/doc'
import { timelineSource } from '../studio/playback'
import { docToJSON, frameSize, themeOf, type EditorDoc, type EditorFrame } from './doc'
import { compiledOf, frameDots } from './render'

export const slug = (s: string) => (s || 'card').toLowerCase().replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'card'
const sourceOf = (f: EditorFrame) => timelineSource(f.card, compiledOf(f.card), themeOf(f))
export function frameSVG(f: EditorFrame, t: number): string {
  const { w, h } = frameSize(f)
  return renderSVG(frameDots(f, { timeline: true, t }), w, h)
}
const json = (x: unknown, name: string) => saveAs(new Blob([typeof x === 'string' ? x : JSON.stringify(x, null, 2)], { type: 'application/json' }), name)

export const exporters = {
  png: async (f: EditorFrame, t: number) => saveAs(await stillPNG(sourceOf(f), t, 3, 0), `${slug(f.card.name)}.png`),
  svg: (f: EditorFrame, t: number) => saveAs(new Blob([frameSVG(f, t)], { type: 'image/svg+xml' }), `${slug(f.card.name)}.svg`),
  html: (f: EditorFrame, t: number) => saveAs(new Blob([`<!doctype html><html><body style="background:${themeOf(f).bg};display:grid;place-items:center;height:100vh;margin:0">${frameSVG(f, t)}</body></html>`], { type: 'text/html' }), `${slug(f.card.name)}.html`),
  plotter: (f: EditorFrame, t: number) => {
    const { w, h } = frameSize(f), r = plotterSVG(frameDots(f, { timeline: true, t }), w, h)
    saveAs(new Blob([r.svg], { type: 'image/svg+xml' }), `${slug(f.card.name)}-plot.svg`)
    return `plotter: ${r.strokes.length} strokes · travel ${(r.travelMm / 1000).toFixed(2)} m`
  },
  studio: (f: EditorFrame) => json(cardToJSON(f.card), `${slug(f.card.name)}.studio.json`),
  specV1: (f: EditorFrame) => { const { spec, dropped } = specV1.toSpec(f.card); json(spec, `${slug(f.card.name)}.card.json`); return dropped.length ? `card spec v1: ${dropped.length} layer(s) baked to rasters` : 'card spec v1 written' },
  specV0: (f: EditorFrame) => { const { spec, dropped } = specV0.toSpec(f.card); json(spec, `${slug(f.card.name)}.spec.json`); return dropped.length ? `spec v0 dropped ${dropped.length} non-code layer(s): ${dropped.join(', ')}` : 'spec v0 written' },
  doc: (d: EditorDoc) => json(docToJSON(d), `${slug(d.name)}.dot480.json`),
}

export interface ClipJob { format: ClipFormat; fps: number; scale: number; signal: AbortSignal; onProgress: (p: number) => void }
/** Record the frame's timeline (enter → change → exit) as a clip and download it. */
export async function recordFrame(f: EditorFrame, o: ClipJob) {
  const clip = await recordClip(sourceOf(f), { format: o.format, seconds: f.card.timeline.length, fps: o.fps, scale: o.scale, signal: o.signal, onProgress: (d, n) => o.onProgress(d / n) })
  saveAs(clip.blob, `${slug(f.card.name)}.${clip.ext}`)
  ;(window as { __editorClip?: unknown }).__editorClip = { format: o.format, size: clip.blob.size, frames: clip.frames, durationMs: clip.durationMs, width: clip.width, height: clip.height, via: clip.via }
  return `${clip.ext.toUpperCase()} ${clip.width}×${clip.height} · ${clip.frames} frames · ${(clip.durationMs / 1000).toFixed(2)} s · ${(clip.blob.size / 1024).toFixed(1)} KB · ${clip.via}`
}
