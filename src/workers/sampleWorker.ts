/// <reference lib="webworker" />
/**
 * Module worker: samples animated preset cards off the main thread (see `protocol.ts`, `client.ts`) and,
 * when asked (`px`), rasterizes the frame on an `OffscreenCanvas` with the same buffer renderer, so the
 * main thread only blits one `ImageBitmap` per card and frame.
 *
 * Boards load lazily, one chunk per board (`widgets/manifest.ts` `loadBoard`, docs/living-matter/F0-foundation.md
 * §7 R13): this chunk carries the sampler and the renderer, not the cards. A card's first request waits for its
 * board's chunk once (the main thread drew that first frame itself; later frames keep the last one on screen until
 * the reply lands); a card whose board is unknown or fails to load gets an error reply and samples on the main thread.
 */
import { handleSample, type DropRequest, type SampleRequest } from './protocol'
import { renderCanvasBuffer } from '../engine/renderer/canvasBuffer'
import { dotBufferOver } from '../engine/buffer/dotBuffer'
import { loadBoard } from '../widgets/manifest'
import { registeredPreset } from '../widgets/registry'
import { catalog } from '../widgets/catalog'

/** Card id → board (the generated catalog: every card, about 2.7 kB gz, so the first request needs one chunk fetch only). */
let boardOf: Map<string, string> | undefined
/** Load the board chunk behind `preset`; never throws, `handleSample` reports a miss (unknown card, failed fetch). */
async function loadPresetBoard(preset: string): Promise<void> {
  const board = (boardOf ??= new Map(catalog.map(([slug, , board]) => [slug, board]))).get(preset)
  try { if (board) await loadBoard(board) } catch { /* the error reply sends the card to the main thread; the next card retries */ }
}

const scope = self as unknown as DedicatedWorkerGlobalScope
const canvases = new Map<number, OffscreenCanvas>()
/** Cards whose request waits for a board chunk; a drop meanwhile removes the card, so no canvas is made for it. */
const waiting = new Set<number>()
scope.addEventListener('message', (e: MessageEvent<SampleRequest | DropRequest>) => {
  const req = e.data
  if (req.kind === 'drop') { canvases.delete(req.card); waiting.delete(req.card); return }
  if (registeredPreset(req.preset)) { answer(req, true); return }
  waiting.add(req.card)
  void loadPresetBoard(req.preset).then(() => answer(req, waiting.delete(req.card)))
})

/** Sample (and, when asked and the card is still mounted, rasterize) one frame and post it back. */
function answer(req: SampleRequest, raster: boolean) {
  const reply = handleSample(req)
  if (reply.kind !== 'frame') { scope.postMessage(reply); return }
  if (raster && req.px && typeof OffscreenCanvas !== 'undefined') {
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
}
