/**
 * The levels board's way in: a small dot-drawn PRESS START button that opens HIVE in play mode.
 * The game itself (sim, worlds, renderer) loads only when opened. `?board=levels&play=1` opens it directly.
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { ThemeTokens } from '../../engine/types'
import { dot480 } from '../../engine/theme/tokens'
import { layer, layoutFor, tileStyle } from '../../widgets/types'
import { paint, sampleInto, surfaceFor } from './dots'
import './hive.css'

const HivePlay = lazy(() => import('./HivePlay'))
/** The title card's cursor (levels.ts `CURSOR`), copied so the button doesn't pull the lazily loaded levels board in. */
const CURSOR = ['#...', '##..', '###.', '####', '###.', '##..', '#...']
const GRID = { cols: 64, rows: 11 }, PITCH = 3
const T = layoutFor(GRID)
const cursor = T.lattice(1, 3, 2)
const style = { ...tileStyle, sizeMin: .3 * PITCH / 2.25, sizeMax: .95 * PITCH / 2.25 }

const wantsPlay = () => new URLSearchParams(window.location.search).get('play') === '1'
function setPlayParam(on: boolean) {
  const url = new URL(window.location.href)
  if (on) url.searchParams.set('play', '1'); else url.searchParams.delete('play')
  window.history.replaceState(null, '', url)
}

export function HiveStart({ theme = dot480 }: { theme?: ThemeTokens }) {
  const [open, setOpen] = useState(wantsPlay)
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const s = surfaceFor(canvas, GRID.cols, GRID.rows, PITCH), reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let on = true
    const draw = () => {
      sampleInto(s, [layer(cursor.at(cursor.sprite(CURSOR, 0, 0)), 'value'), ...(on ? [layer(T.big('PRESS START', 11, 2, { lattice: 1 }), 'value')] : [])], style, theme)
      paint(s, theme)
    }
    draw()
    if (reduced) return
    const id = window.setInterval(() => { on = !on; draw() }, 600)
    return () => clearInterval(id)
  }, [theme])
  const start = useCallback(() => { setPlayParam(true); setOpen(true) }, [])
  const close = useCallback(() => { setPlayParam(false); setOpen(false) }, [])
  return <>
    <button type="button" className="hive-start" onClick={start} aria-label="Press start: play HIVE">
      <canvas ref={ref} aria-hidden="true" />
      <span className="hive-start-sub" aria-hidden="true">PLAY HIVE — KEYBOARD, GAMEPAD OR TOUCH</span>
    </button>
    {open && <Suspense fallback={null}><HivePlay theme={theme} onClose={close} /></Suspense>}
  </>
}
