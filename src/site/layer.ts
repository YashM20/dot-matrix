/**
 * The phone tab bar asks the command layer (lazy, mounted once the page is idle) for its sheets. A
 * request made before the layer has mounted wakes the mount and waits for the layer to take it.
 */
export type LayerRequest = 'tools' | 'palette'

let handler: ((r: LayerRequest) => void) | null = null
let pending: LayerRequest | null = null
const wakers = new Set<() => void>()

export function requestLayer(r: LayerRequest) {
  if (handler) return handler(r)
  pending = r
  for (const w of wakers) w()
}
/** The command layer listens; a request that came before it mounted runs now. */
export function onLayerRequest(h: (r: LayerRequest) => void): () => void {
  handler = h
  if (pending) { const p = pending; pending = null; h(p) }
  return () => { if (handler === h) handler = null }
}
/** The App's lazy mount: wake up as soon as anything is requested. */
export function onLayerWake(w: () => void): () => void {
  wakers.add(w)
  return () => { wakers.delete(w) }
}
