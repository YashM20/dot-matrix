import { useEffect, useState } from 'react'
import type { Data, Source } from './source'

const merged = (sources: readonly Source[] | undefined): Data => Object.assign({}, ...(sources ?? []).map(s => s.snapshot().data))

/**
 * Board binding: subscribes to the board's `sources` while it is mounted and returns their data
 * merged (keys are namespaced per source). Also exposes `window.dot480Live[id](payload)` so a
 * devtools console, an extension or a test can push into a source.
 */
export function useLiveData(sources: readonly Source[] | undefined): Data {
  const [data, setData] = useState(() => merged(sources))
  useEffect(() => {
    if (!sources?.length) return
    const g = globalThis as { dot480Live?: Record<string, (payload: unknown) => void> }
    const hooks = (g.dot480Live ??= {})
    for (const s of sources) hooks[s.id] = p => s.push(p)
    const offs = sources.map(s => s.subscribe(() => setData(merged(sources))))
    return () => { offs.forEach(off => off()); for (const s of sources) delete hooks[s.id] }
  }, [sources])
  return data
}

/** The subset of `data` a card declares in its defaults (so a card only re-samples on its own keys). */
export function pick(data: Data, keys: Record<string, number> | undefined): Data | undefined {
  if (!keys) return undefined
  const out: Data = {}
  for (const k in keys) if (k in data) out[k] = data[k]
  return out
}
