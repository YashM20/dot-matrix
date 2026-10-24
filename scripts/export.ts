/**
 * P5-D export checks (in `pnpm verify`; standalone: npx tsx scripts/export.ts):
 * APNG / GIF encoders round-trip tiny frames and real card clips; WebM / MP4 muxers produce
 * readable containers with the right duration; the plotter path covers every dot and is deterministic.
 * The in-browser WebCodecs run is `scripts/export-chrome.ts`.
 */
import { APNGWriter, encodePNG } from '../src/export/apng'
import { GIFWriter, lzwEncode, paletteFromTones } from '../src/export/gif'
import { frameDelays, zlibStored, type RGBAFrame } from '../src/export/bytes'
import { muxWebM, type VideoChunk } from '../src/export/webm'
import { muxMP4 } from '../src/export/mp4'
import { plotterSVG } from '../src/export/plotter'
import { widgetById } from '../src/widgets'
import { inflateSync } from 'node:zlib'
import { lzwDecode, readAPNG, readGIF, readMP4, readWebM } from './lib/decode'
import { renderCard, sampleCard, theme } from './lib/cards'
import type { Raster } from './lib/raster'

type Assert = (name: string, cond: boolean, detail?: string) => void

/** Headless card raster → RGBA frame (the browser gets this from getImageData). */
export function rgba(r: Raster): RGBAFrame {
  const data = new Uint8ClampedArray(r.w * r.h * 4)
  for (let i = 0; i < r.w * r.h; i++) { data[i * 4] = r.data[i * 3]; data[i * 4 + 1] = r.data[i * 3 + 1]; data[i * 4 + 2] = r.data[i * 3 + 2]; data[i * 4 + 3] = 255 }
  return { width: r.w, height: r.h, data }
}
const tiny = (w: number, h: number, f: (x: number, y: number) => number[]): RGBAFrame => {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set([...f(x, y), 255], (y * w + x) * 4)
  return { width: w, height: h, data }
}
const sameRGB = (rgb: Uint8Array, f: RGBAFrame) => { for (let i = 0; i < f.width * f.height; i++) for (let c = 0; c < 3; c++) if (rgb[i * 3 + c] !== f.data[i * 4 + c]) return false; return true }

export async function exportChecks(assert: Assert) {
  // ── encoders on tiny frames ──
  const a = tiny(5, 3, (x, y) => [x * 50, y * 100, 7]), b = tiny(5, 3, (x, y) => x === 2 && y === 1 ? [255, 0, 0] : [x * 50, y * 100, 7])
  const png = readAPNG(await encodePNG(a))
  assert('export: PNG round-trips a 5×3 frame bit-exactly', png.crcOk && png.width === 5 && sameRGB(png.first, a))
  const aw = new APNGWriter(5, 3)
  await aw.add(a, 100); await aw.add(a, 100); await aw.add(b, 50)
  const ap = readAPNG(aw.finish())
  assert('export: APNG merges identical frames and keeps the clock', ap.crcOk && ap.frames === 2 && ap.durationMs === 250 && ap.numPlays === 0 && sameRGB(ap.first, a), `${ap.frames} frames, ${ap.durationMs} ms`)
  const stored = zlibStored(Uint8Array.from({ length: 70000 }, (_, i) => i * 7))
  assert('export: stored-block zlib fallback inflates', inflateSync(stored).length === 70000 && inflateSync(stored)[69999] === (69999 * 7) % 256)

  // LZW: random indices incl. long runs and > 4096 codes (forces a dictionary reset)
  let seed = 1; const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32
  const idx = Uint8Array.from({ length: 40000 }, (_, i) => i < 10000 ? 3 : Math.floor(rnd() * 16))
  const blocks = lzwEncode(idx, 4), raw: number[] = []
  for (let o = 0; blocks[o]; o += blocks[o] + 1) raw.push(...blocks.subarray(o + 1, o + 1 + blocks[o]))
  const dec = lzwDecode(Uint8Array.from(raw), 4, idx.length)
  assert('export: GIF LZW round-trips 40k indices (runs, resets)', dec.every((v, i) => v === idx[i]), `${blocks.length} bytes`)

  const pal = paletteFromTones(['#ff0000', '#00ff00', '#0000ff', '#ffffff', '#646464', '#c8c8c8', '#070707', '#323232'], ['#000000'])
  const pa = tiny(5, 3, (x, y) => [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255], [0, 0, 0]][(x + y) % 5]), pb = tiny(5, 3, (x, y) => x === 4 && y === 2 ? [255, 255, 255] : pa.data.slice((y * 5 + x) * 4, (y * 5 + x) * 4 + 3) as unknown as number[])
  const gw = new GIFWriter(5, 3, pal), d = frameDelays(3, 30, 100)
  gw.add(pa, d[0]); gw.add(pa, d[1]); gw.add(pb, d[2])
  const g = readGIF(gw.finish())
  assert('export: GIF round-trips palette frames, merges repeats, delays sum to 1/10 s', g.frames === 2 && g.durationMs === 100 && g.loops && sameRGB(g.pixels[0], pa) && sameRGB(g.pixels[1], pb), `${g.frames} frames, ${g.durationMs} ms, delays ${d.join('/')}`)
  assert('export: frame delays stay on the clock (30 fps in cs / ms)', frameDelays(60, 30, 100).reduce((s, v) => s + v, 0) === 200 && frameDelays(60, 30, 1000).reduce((s, v) => s + v, 0) === 2000)

  // ── real card clips, headless: timer 2 s @ 15 fps, progress swept 0 → 1 (the card is otherwise static) ──
  const timer = widgetById('timer')!
  const frames = Array.from({ length: 30 }, (_, i) => rgba(renderCard(timer, { px: 1, t: i / 15, ctx: { data: { progress: i / 29 } } })))
  const w0 = frames[0].width, h0 = frames[0].height
  const cw = new APNGWriter(w0, h0)
  const md = frameDelays(30, 15, 1000)
  for (const [i, f] of frames.entries()) await cw.add(f, md[i])
  const capng = cw.finish(), ca = readAPNG(capng)
  assert('export: timer APNG 2 s @ 15 fps', ca.crcOk && Math.abs(ca.durationMs - 2000) < 1 && ca.frames >= 20 && sameRGB(ca.first, frames[0]), `${ca.frames} stored frames, ${ca.durationMs.toFixed(0)} ms, ${(capng.length / 1024).toFixed(1)} KB`)
  const tones = new Set([theme.dotIdle, theme.dotActive, theme.dotMid ?? '', theme.dotFaint ?? '', theme.value ?? '', '#26292d'].filter(Boolean))
  for (let k = 0; k < 8; k++) for (const dd of sampleCard(timer, k / 4)) tones.add(dd.color)
  const gcard = new GIFWriter(w0, h0, paletteFromTones([...tones], [theme.surface, theme.bg])), gd = frameDelays(30, 15, 100)
  frames.forEach((f, i) => gcard.add(f, gd[i]))
  const cgif = gcard.finish(), cg = readGIF(cgif)
  const err = (() => { const p = cg.pixels[0], f = frames[0]; let s = 0; for (let i = 0; i < w0 * h0; i++) for (let c = 0; c < 3; c++) s += Math.abs(p[i * 3 + c] - f.data[i * 4 + c]); return s / (w0 * h0 * 3) })()
  assert('export: timer GIF 2 s, tone palette error < 2/255', cg.durationMs === 2000 && cg.frames >= 20 && err < 2, `${cg.frames} frames, ${cg.palette.length} colours, mean |Δ| ${err.toFixed(2)}, ${(cgif.length / 1024).toFixed(1)} KB`)

  // ── muxers on synthetic chunks (keyframe each second) ──
  const chunks: VideoChunk[] = Array.from({ length: 60 }, (_, i) => ({ data: Uint8Array.from({ length: 20 + (i % 7) }, (_, j) => (i + j) & 0xff), timestampUs: Math.round((i * 1e6) / 30), durationUs: Math.round(1e6 / 30), key: i % 30 === 0 }))
  const wm = readWebM(muxWebM(chunks, { width: 320, height: 240, codec: 'V_VP9', durationMs: 2000 }))
  assert('export: WebM muxer — Duration, 60 blocks, 2 keyframes', wm.durationMs === 2000 && wm.blocks === 60 && wm.keys === 2 && wm.codec === 'V_VP9' && wm.width === 320, JSON.stringify(wm))
  const mp = readMP4(muxMP4(chunks, { width: 320, height: 240, avcC: Uint8Array.of(1, 66, 0, 31, 255, 225, 0, 0, 1, 0, 0), durationMs: 2000 }))
  assert('export: MP4 muxer — mvhd 2 s, 60 samples, 2 sync, avc1 320×240', mp.durationMs === 2000 && mp.samples === 60 && mp.keys === 2 && mp.width === 320 && mp.height === 240 && mp.boxes.includes('avc1'), `${mp.boxes.length} boxes`)

  // ── plotter ──
  const dots = sampleCard(timer, 1.3), pitch = timer.grid.pitch ?? theme.gridPx
  const W = timer.grid.cols * pitch, H = timer.grid.rows * pitch
  const t0 = performance.now(), plot = plotterSVG(dots, W, H), ms = performance.now() - t0
  const lit = dots.map((dd, i) => [dd, i] as const).filter(([dd]) => dd.r > 0 && dd.opacity >= 0.12)
  const byDot = new Map(plot.strokes.map(s => [s.dot, s]))
  const covered = lit.every(([dd, i]) => {
    const s = byDot.get(i); if (!s) return false
    const cx = 10 + dd.x * 0.5, cy = 10 + dd.y * 0.5, R = dd.r * 0.5
    return Math.abs(s.cx - cx) < 1e-9 && Math.abs(s.cy - cy) < 1e-9 && s.points.every(([x, y]) => Math.hypot(x - cx, y - cy) <= R + 1e-6)
  })
  assert('export: plotter — one stroke per plotted dot, inside its footprint', covered && plot.strokes.length === lit.length && new Set(plot.strokes.map(s => s.dot)).size === lit.length, `${lit.length} dots, ${ms.toFixed(0)} ms`)
  assert('export: plotter — deterministic SVG in mm', plotterSVG(dots, W, H).svg === plot.svg && plot.svg.includes(`width="${+plot.widthMm.toFixed(2)}mm"`) && (plot.svg.match(/stroke="/g) ?? []).length === 1)
  assert('export: plotter — nearest-neighbour + 2-opt cuts pen-up travel', plot.travelMm < plot.naiveTravelMm, `${(plot.travelMm / 1000).toFixed(2)} m vs ${(plot.naiveTravelMm / 1000).toFixed(2)} m unsorted, pen down ${(plot.drawMm / 1000).toFixed(1)} m`)
  const hatch = plotterSVG(dots, W, H, { fill: 'hatch' })
  assert('export: plotter — hatch fill covers the same dots', hatch.strokes.length === lit.length)
}

if (/[\\/]scripts[\\/]export\.ts$/.test(process.argv[1] ?? '')) {
  let failures = 0
  await exportChecks((name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++ })
  if (failures) process.exit(1)
}
