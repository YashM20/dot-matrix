/**
 * Offline clip recorder (browser): samples a card at t = i / fps, draws each frame with the
 * engine's canvas renderer, and encodes APNG / GIF (in-repo encoders) or WebM / MP4 (WebCodecs
 * `VideoEncoder` + the in-repo muxers). Frames are rendered faster than real time and timestamps
 * are exact, so a 2 s clip is 2 s whatever the machine. Without WebCodecs, WebM falls back to
 * `MediaRecorder` on a canvas stream (real time).
 */
import type { DotInstance } from '../engine/types'
import { renderCanvas } from '../engine/renderer/canvasRenderer'
import { frameDelays, type RGBAFrame } from './bytes'
import { APNGWriter } from './apng'
import { GIFWriter, paletteFromTones } from './gif'
import { muxWebM, type VideoChunk } from './webm'
import { muxMP4 } from './mp4'

export interface ClipSource {
  /** Card size in card px (grid cols × pitch, rows × pitch). */
  width: number; height: number
  /** Card surface colour (drawn under the dots). */
  background: string
  /** Theme tones that may appear (GIF palette); colours seen in sampled frames are added. */
  tones: string[]
  frame(t: number): DotInstance[]
}
export type ClipFormat = 'apng' | 'gif' | 'webm' | 'mp4'
export interface ClipOptions {
  format: ClipFormat
  seconds: number
  fps: number
  /** Output px per card px (default 2). */
  scale?: number
  /** Padding around the card, card px (default 14, like the CSS card). */
  pad?: number
  /** Start time, s (default 0). */
  t0?: number
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
}
export interface Clip { blob: Blob; ext: string; mime: string; frames: number; stored: number; durationMs: number; width: number; height: number; via: string }

const MIME: Record<ClipFormat, string> = { apng: 'image/apng', gif: 'image/gif', webm: 'video/webm', mp4: 'video/mp4' }
const tick = () => new Promise<void>(r => setTimeout(r, 0))
const abortIf = (s?: AbortSignal) => { if (s?.aborted) throw new DOMException('Export cancelled', 'AbortError') }
const copyBytes = (d: AllowSharedBufferSource) => ArrayBuffer.isView(d) ? new Uint8Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength)) : new Uint8Array((d as ArrayBuffer).slice(0))

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas
function makeCanvas(w: number, h: number, needDom: boolean): AnyCanvas {
  if (!needDom && typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c
}

export async function recordClip(src: ClipSource, o: ClipOptions): Promise<Clip> {
  const scale = o.scale ?? 2, pad = o.pad ?? 14, t0 = o.t0 ?? 0
  const n = Math.max(1, Math.round(o.seconds * o.fps)), durationMs = (n / o.fps) * 1000
  // even sizes: H.264 4:2:0 needs them, and every format then shares one frame size
  const W = Math.ceil(((src.width + pad * 2) * scale) / 2) * 2, H = Math.ceil(((src.height + pad * 2) * scale) / 2) * 2
  const useRecorder = (o.format === 'webm' || o.format === 'mp4') && typeof VideoEncoder === 'undefined'
  if (useRecorder && o.format === 'mp4') throw new Error('MP4 needs WebCodecs (VideoEncoder); this browser has none: try WebM')
  const canvas = makeCanvas(W, H, useRecorder)
  const ctx = canvas.getContext('2d', { willReadFrequently: o.format === 'gif' || o.format === 'apng' }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  const draw = (i: number) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = src.background; ctx.fillRect(0, 0, W, H)
    ctx.setTransform(scale, 0, 0, scale, pad * scale, pad * scale)
    renderCanvas(ctx as CanvasRenderingContext2D, src.frame(t0 + i / o.fps))
  }
  const grab = (): RGBAFrame => ctx.getImageData(0, 0, W, H)
  const done = (data: Uint8Array<ArrayBuffer>, stored: number, via: string): Clip =>
    ({ blob: new Blob([data], { type: MIME[o.format] }), ext: o.format === 'apng' ? 'png' : o.format, mime: MIME[o.format], frames: n, stored, durationMs, width: W, height: H, via })

  if (o.format === 'apng') {
    const w = new APNGWriter(W, H), delays = frameDelays(n, o.fps, 1000)
    for (let i = 0; i < n; i++) { abortIf(o.signal); draw(i); await w.add(grab(), delays[i]); o.onProgress?.(i + 1, n); await tick() }
    return done(w.finish(), w.count, 'APNGWriter')
  }
  if (o.format === 'gif') {
    const seen = new Set(src.tones)
    for (let k = 0; k < 8; k++) for (const d of src.frame(t0 + (k / 8) * o.seconds)) seen.add(d.color)
    const w = new GIFWriter(W, H, paletteFromTones([...seen], [src.background])), delays = frameDelays(n, o.fps, 100)
    for (let i = 0; i < n; i++) { abortIf(o.signal); draw(i); w.add(grab(), delays[i]); o.onProgress?.(i + 1, n); await tick() }
    return done(w.finish(), w.count, 'GIFWriter')
  }
  if (useRecorder) return done(await viaRecorder(canvas as HTMLCanvasElement, draw, n, o), n, 'MediaRecorder (real time)')
  return done(...(await viaWebCodecs(canvas, draw, n, W, H, o)))
}

async function viaWebCodecs(canvas: AnyCanvas, draw: (i: number) => void, n: number, W: number, H: number, o: ClipOptions): Promise<[Uint8Array<ArrayBuffer>, number, string]> {
  const mp4 = o.format === 'mp4'
  const candidates = mp4 ? ['avc1.42E01F', 'avc1.4D4028', 'avc1.640028', 'avc1.640033'] : ['vp09.00.10.08', 'vp8']
  let config: VideoEncoderConfig | undefined
  for (const codec of candidates) {
    const c: VideoEncoderConfig = { codec, width: W, height: H, bitrate: Math.min(8e6, W * H * o.fps * 0.15), framerate: o.fps, ...(mp4 && { avc: { format: 'avc' } }) }
    if ((await VideoEncoder.isConfigSupported(c)).supported) { config = c; break }
  }
  if (!config) throw new Error(`no ${mp4 ? 'H.264' : 'VP9/VP8'} encoder for ${W}×${H} in this browser`)
  const chunks: VideoChunk[] = []
  let description: Uint8Array | undefined, failure: unknown
  const enc = new VideoEncoder({
    output: (chunk, meta) => {
      const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data)
      chunks.push({ data, timestampUs: chunk.timestamp, durationUs: chunk.duration ?? 1e6 / o.fps, key: chunk.type === 'key' })
      if (meta?.decoderConfig?.description) description = copyBytes(meta.decoderConfig.description)
    },
    error: e => { failure = e },
  })
  enc.configure(config)
  try {
    for (let i = 0; i < n; i++) {
      abortIf(o.signal); if (failure) throw failure
      draw(i)
      const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / o.fps), duration: Math.round(1e6 / o.fps) })
      enc.encode(frame, { keyFrame: i % Math.max(1, Math.round(o.fps)) === 0 }); frame.close()
      o.onProgress?.(i + 1, n)
      while (enc.encodeQueueSize > 4) await new Promise(r => setTimeout(r, 2))
      await tick()
    }
    await enc.flush()
  } finally { if (enc.state !== 'closed') enc.close() }
  if (failure) throw failure
  const durationMs = (n / o.fps) * 1000
  if (mp4) {
    if (!description) throw new Error('H.264 encoder gave no avcC description')
    return [muxMP4(chunks, { width: W, height: H, avcC: description, durationMs }), chunks.length, `VideoEncoder ${config.codec} + muxMP4`]
  }
  return [muxWebM(chunks, { width: W, height: H, codec: config.codec.startsWith('vp8') ? 'V_VP8' : 'V_VP9', durationMs }), chunks.length, `VideoEncoder ${config.codec} + muxWebM`]
}

/** Fallback: real-time `MediaRecorder` on the canvas stream (WebM; duration as recorded). */
async function viaRecorder(canvas: HTMLCanvasElement, draw: (i: number) => void, n: number, o: ClipOptions): Promise<Uint8Array<ArrayBuffer>> {
  const stream = canvas.captureStream(o.fps), rec = new MediaRecorder(stream, { mimeType: 'video/webm' }), parts: Blob[] = []
  rec.ondataavailable = e => { if (e.data.size) parts.push(e.data) }
  const stopped = new Promise(r => { rec.onstop = r })
  draw(0); rec.start()
  const start = performance.now()
  for (let i = 0; i < n;) {
    if (o.signal?.aborted) { rec.stop(); await stopped; abortIf(o.signal) }
    const due = Math.floor(((performance.now() - start) / 1000) * o.fps)
    if (due > i) { i = Math.min(n, due); draw(Math.min(i, n - 1)); o.onProgress?.(i, n) }
    await new Promise(r => requestAnimationFrame(r))
  }
  rec.stop(); await stopped; stream.getTracks().forEach(t => t.stop())
  return new Uint8Array(await new Blob(parts).arrayBuffer())
}
