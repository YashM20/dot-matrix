/// <reference lib="webworker" />
/**
 * The IR sandbox worker: samples visitor programs off the main thread (`protocol.ts`, `remote.ts`). It reads only
 * batches `checkBatch` accepts. The page terminates it when a batch overruns its watchdog, so a program (or a bug in
 * the frame guard) that never returns stops here and never freezes the page.
 */
import { checkBatch, evaluateBatch, pointStore, type ItemResult, type WorkerReply } from './protocol'

const scope = self as unknown as DedicatedWorkerGlobalScope
const store = pointStore()
const post = (m: WorkerReply, moved: Transferable[] = []) => scope.postMessage(m, moved)

scope.addEventListener('message', (e: MessageEvent<unknown>) => {
  const b = checkBatch(e.data)
  if (!b) return
  const results: ItemResult[] = evaluateBatch(b, store, index => post({ kind: 'start', id: b.id, index }))
  post({ kind: 'done', id: b.id, results }, results.flatMap(r => (r.status === 'ok' ? [r.values.buffer] : [])))
})
post({ kind: 'ready' })
