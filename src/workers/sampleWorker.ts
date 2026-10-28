/// <reference lib="webworker" />
/**
 * Module worker: samples animated preset cards off the main thread (see `protocol.ts`, `client.ts`) and,
 * when asked (`px`), rasterizes the frame on an `OffscreenCanvas` with the same buffer renderer, so the
 * main thread only blits one `ImageBitmap` per card and frame.
 */
import { handleSample, type DropRequest, type SampleRequest } from './protocol'
import { renderCanvasBuffer } from '../engine/renderer/canvasBuffer'
import { dotBufferOver } from '../engine/buffer/dotBuffer'

const scope = self as unknown as DedicatedWorkerGlobalScope
const canvases = new Map<number, OffscreenCanvas>()
scope.addEventListener('message', (e: MessageEvent<SampleRequest | DropRequest>) => {
  const req = e.data
  if (req.kind === 'drop') { canvases.delete(req.card); return }
  const reply = handleSample(req)
  if (reply.kind !== 'frame') { scope.postMessage(reply); return }
  if (req.px && typeof OffscreenCanvas !== 'undefined') {
    const { w, h, scale } = req.px
    let canvas = canvases.get(req.card)
    if (!canvas) canvases.set(req.card, (canvas = new OffscreenCanvas(w, h)))
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
    const ctx = canvas.getContext('2d')
    if (ctx) {
      const buf = dotBufferOver(reply.capacity, reply.bytes, reply.palette, reply.ext)
      buf.n = reply.n; buf.shape = reply.shape; buf.roundness = reply.roundness; buf.joints = reply.joints
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h); ctx.setTransform(scale, 0, 0, scale, 0, 0)
      renderCanvasBuffer(ctx, buf)
      reply.bitmap = canvas.transferToImageBitmap()
    }
  }
  const moved: Transferable[] = reply.ext ? [reply.bytes, reply.ext] : [reply.bytes]
  if (reply.bitmap) moved.push(reply.bitmap)
  scope.postMessage(reply, moved)
})
