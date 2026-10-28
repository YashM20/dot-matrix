/**
 * Worker sampling protocol + the worker-side handler (MASTER-PLAN §3.11). The preset module runs in the
 * worker: a request names a preset by id, the worker builds its layers with `withChrome`, samples them into
 * a `DotBuffer` over the `ArrayBuffer` the main thread handed over (transferred), and transfers it back.
 * Plain module so headless checks can call `handleSample` without a Worker.
 */
import { sampleLayersInto } from '../engine/sampler/gridSampler'
import { createDotBuffer, dotBufferOver } from '../engine/buffer/dotBuffer'
import type { DotStyle, GridConfig, JointGeom, ThemeTokens } from '../engine/types'
import { widgetPresets, withChrome, type WidgetPreset } from '../widgets'

export interface SampleRequest {
  kind: 'sample'; card: number; seq: number; preset: string
  t: number; frame: number; data: Record<string, number>
  grid: GridConfig; style: DotStyle; theme: ThemeTokens
  /** A retired frame's backing store to sample into (transferred), with its dot capacity. */
  bytes?: ArrayBuffer; capacity?: number
  /** Its squares channels (`DotBuffer.ext`), transferred with `bytes` when the frame had them. */
  ext?: ArrayBuffer
  /** Also rasterize the frame (worker `OffscreenCanvas`) at this backing size / scale, so the main thread only blits it. */
  px?: { w: number; h: number; scale: number }
}
/** The card unmounted: free its worker-side canvas. */
export interface DropRequest { kind: 'drop'; card: number }
export type SampleReply =
  | { kind: 'frame'; card: number; seq: number; t: number; n: number; capacity: number; bytes: ArrayBuffer; palette: readonly string[]; shape?: DotStyle['shape']; roundness?: number; bitmap?: ImageBitmap; ext?: ArrayBuffer; joints?: JointGeom[] }
  | { kind: 'error'; card: number; seq: number; message: string }

let byId: Map<string, WidgetPreset> | undefined
/** Sample one frame; the reply's `bytes` must be transferred. */
export function handleSample(req: SampleRequest): SampleReply {
  try {
    const p = (byId ??= new Map(widgetPresets.map(w => [w.id, w]))).get(req.preset)
    if (!p) return { kind: 'error', card: req.card, seq: req.seq, message: `unknown preset ${req.preset}` }
    const { grid, style, theme } = req
    const buf = req.bytes && req.bytes.byteLength && req.capacity ? dotBufferOver(req.capacity, req.bytes, [], req.ext) : createDotBuffer(grid.cols * grid.rows)
    sampleLayersInto(withChrome(p)({ t: req.t, frame: req.frame, data: req.data, grid }), grid, style, theme, buf)
    return { kind: 'frame', card: req.card, seq: req.seq, t: req.t, n: buf.n, capacity: buf.capacity, bytes: buf.bytes, palette: buf.palette, shape: buf.shape, roundness: buf.roundness, ext: buf.ext, joints: buf.joints }
  } catch (error) {
    return { kind: 'error', card: req.card, seq: req.seq, message: error instanceof Error ? error.message : String(error) }
  }
}
