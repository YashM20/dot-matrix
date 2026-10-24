/**
 * Main-thread side of worker sampling. One shared module worker per page; each live card gets a
 * `RemoteSampler` that posts frame requests (coalesced: at most one in flight, the newest pending one
 * wins) and receives transferable double buffers (plus, when asked, the frame rasterized in the worker as an
 * `ImageBitmap`): the frame on screen (`front`) stays here, the one
 * before it is handed back to the worker for the next frame, so steady state allocates nothing.
 * Off with `?worker=0`, when `Worker` is missing, or after the worker fails; callers then sample locally.
 */
import { dotBufferOver, type DotBuffer } from '../engine/buffer/dotBuffer'
import type { DotStyle, GridConfig, ThemeTokens } from '../engine/types'
import { workerIds } from '../widgets/registry'
import type { DropRequest, SampleReply, SampleRequest } from './protocol'

let worker: Worker | null | undefined
const cards = new Map<number, (reply: SampleReply) => void>()
let nextCard = 1

function fail() {
  worker?.terminate(); worker = null
  for (const handle of cards.values()) handle({ kind: 'error', card: 0, seq: -1, message: 'worker failed' })
}
function getWorker(): Worker | null {
  if (worker !== undefined) return worker
  if (typeof Worker === 'undefined' || (typeof location !== 'undefined' && new URLSearchParams(location.search).get('worker') === '0')) return (worker = null)
  try {
    worker = new Worker(new URL('./sampleWorker.ts', import.meta.url), { type: 'module' })
    worker.addEventListener('message', (e: MessageEvent<SampleReply>) => cards.get(e.data.card)?.(e.data))
    worker.addEventListener('error', e => { console.warn('sample worker failed, sampling on the main thread', e.message); fail() })
  } catch { worker = null }
  return worker
}

/** Preset id behind a layers function, if it is a registered preset's `withChrome(p)` the worker can rebuild (no live media). */
export function workerPresetId(layers: object): string | undefined {
  return workerIds.get(layers)
}

export interface RemoteSampler {
  /** Ask for the frame at `t`; the reply arrives through `onFrame` (dropped if superseded or disposed). */
  request(t: number, frame: number, data: Record<string, number>, grid: GridConfig, style: DotStyle, theme: ThemeTokens, px?: SampleRequest['px']): void
  /** The worker is gone or refused this card: sample on the main thread from now on. */
  readonly failed: boolean
  dispose(): void
}

/** A remote sampler for `layers`, or null when it must be sampled on the main thread. */
export function remoteSampler(layers: object, onFrame: (buf: DotBuffer, t: number, bitmap?: ImageBitmap) => void): RemoteSampler | null {
  const preset = workerPresetId(layers), w = preset ? getWorker() : null
  if (!preset || !w) return null
  const card = nextCard++
  let seq = 0, inFlight = false, pending: SampleRequest | null = null, front: DotBuffer | null = null, spare: DotBuffer | null = null, failed = false, disposed = false
  const send = (req: SampleRequest) => {
    if (spare) { req.bytes = spare.bytes; req.capacity = spare.capacity; spare = null }
    inFlight = true
    try { w.postMessage(req, req.bytes ? [req.bytes] : []) } catch { failed = true; inFlight = false }
  }
  cards.set(card, reply => {
    inFlight = false
    if (disposed) cards.delete(card)
    if (reply.kind === 'error') { failed = true; console.warn('sample worker:', reply.message); return }
    if (disposed) { reply.bitmap?.close(); return }
    const buf = dotBufferOver(reply.capacity, reply.bytes, reply.palette)
    buf.n = reply.n; buf.shape = reply.shape; buf.roundness = reply.roundness
    spare = front; front = buf
    if (pending) { const next = pending; pending = null; send(next) }
    onFrame(buf, reply.t, reply.bitmap)
  })
  return {
    get failed() { return failed || worker === null },
    request(t, frame, data, grid, style, theme, px) {
      if (disposed) return
      const req: SampleRequest = { kind: 'sample', card, seq: ++seq, preset, t, frame, data, grid, style, theme, px }
      if (inFlight) pending = req; else send(req)
    },
    dispose() {
      disposed = true; pending = null; front = spare = null
      // keep the handler until the in-flight reply lands (it closes the bitmap), then forget the card
      if (!inFlight) cards.delete(card)
      worker?.postMessage({ kind: 'drop', card } satisfies DropRequest)
    },
  }
}
