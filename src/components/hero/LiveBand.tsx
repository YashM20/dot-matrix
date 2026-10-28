/**
 * The live number band (docs/LAYOUT-THEME-PLAN.md §1c #13, T2): one engine stat, the dots this visit has drawn
 * (every frame a DotCanvas paints adds its dots, src/site/stats.ts), drawn in dot type through the pipeline like
 * any card. It reads the counter at most 4 times a second, only while the band is on screen and the tab visible;
 * under reduced motion it does not tick, it shows the count from when it came into view. Lazy (App mounts it idle).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { DotCanvas } from '../DotCanvas'
import type { GridConfig } from '../../engine/types'
import { textAt, textSize } from '../../engine/layout'
import { baseStyle, layer } from '../../widgets/types'
import { drawn } from '../../site/stats'
import { useThemeTokens } from '../../site/theme/useTheme'

/** 5×7 dot type at a 4 px pitch, one dot of margin; the grid is as wide as the number (a digit more, a few cells more). */
const PITCH = 4, ROWS = 9
const STYLE = { ...baseStyle, sizeMin: .3, sizeMax: .95, cornerRoundness: .25 }
const EVERY_MS = 250

export function LiveBand() {
  const [count, setCount] = useState(drawn.dots)
  // the band sits on the page, not in a card, so it takes the site theme's dot tones (ink on paper in light)
  const theme = useThemeTokens()
  const box = useRef<HTMLDivElement>(null)
  // the band's own redraws are not counted (it would count itself up): the dots its DotCanvas adds between this
  // commit's layout effects and its passive effects (the child's passive effect runs first) are set aside
  const own = useRef(0), mark = useRef(0)
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let seen = false, timer = 0
    const read = () => setCount(drawn.dots - own.current)
    const stop = () => { window.clearInterval(timer); timer = 0 }
    const sync = () => {
      read()
      if (seen && !reduced && !document.hidden) { if (!timer) timer = window.setInterval(read, EVERY_MS) } else stop()
    }
    const io = new IntersectionObserver(es => { seen = es.some(e => e.isIntersecting); sync() })
    if (box.current) io.observe(box.current)
    document.addEventListener('visibilitychange', sync)
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', sync); stop() }
  }, [])
  const text = count.toLocaleString('en')
  const cols = Math.ceil(textSize(text)[0]) + 1
  const grid = useMemo<GridConfig>(() => ({ cols, rows: ROWS, pitch: PITCH }), [cols])
  const layers = useMemo(() => { const l = [layer(textAt(grid, text, 0, 1), 'value')]; return () => l }, [grid, text])
  useLayoutEffect(() => { mark.current = drawn.dots }, [text])
  useEffect(() => { own.current += drawn.dots - mark.current }, [text])
  return <>
    <div className="live-number" ref={box} style={{ width: cols * PITCH }}><DotCanvas layers={layers} grid={grid} style={STYLE} theme={theme} change={false} /></div>
    <p className="fig-cap live-label"><b className="live"><i aria-hidden="true" />LIVE</b>dots drawn this visit, each one sampled from a field <span className="sr-only">: {text}</span></p>
  </>
}
