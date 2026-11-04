import { useEffect, useState } from 'react'
import { TEST_HOOKS } from '../lib/testHooks'
import type { Data, Source } from './source'

const merged = (sources: readonly Source[] | undefined): Data => Object.assign({}, ...(sources ?? []).map(s => s.snapshot().data))

/**
 * Board binding: subscribes to the board's `sources` while it is mounted and returns their data
 * merged (keys are namespaced per source). With the test hooks on (`src/lib/testHooks.ts`: dev builds, or a
 * probe) it also exposes `window.dot480Live[id](payload)` so a devtools console or a test can push into a source;
 * a normal visit gets no such global (#149).
 */
export function useLiveData(sources: readonly Source[] | undefined): Data {
  const [data, setData] = useState(() => merged(sources))
  useEffect(() => {
    if (!sources?.length) return
    const g = globalThis as { dot480Live?: Record<string, (payload: unknown) => void> }
    const hooks = TEST_HOOKS ? (g.dot480Live ??= {}) : undefined
    if (hooks) for (const s of sources) hooks[s.id] = p => s.push(p)
    const offs = sources.map(s => s.subscribe(() => setData(merged(sources))))
    return () => { offs.forEach(off => off()); if (hooks) for (const s of sources) delete hooks[s.id] }
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
