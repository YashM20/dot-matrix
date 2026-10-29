/**
 * A board or widget name in the engine's own dot type (docs/LAYOUT-THEME-PLAN.md §1c #3, T6; Nothing's rule: dot type
 * only for names). The name is a `Layer[]` of `textAt` fields on a cell grid, sampled and drawn by `DotCanvas` like any
 * card (Field → Grid Sampler → Renderer), so every glyph pixel is one dot. It wraps at word boundaries to the width of
 * its box (a ResizeObserver on the parent), so a long name on a phone takes two lines instead of overflowing. The
 * canvas is decoration (`aria-hidden`): the heading around it carries the name as text.
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { DotCanvas } from './DotCanvas'
import type { DotStyle, GridConfig } from '../engine/types'
import { textAt, textSize } from '../engine/layout'
import { layer } from '../widgets/types'
import { useThemeTokens } from '../site/theme/useTheme'

/** One font row = one dot; two empty rows between lines. */
const LINE = 9
/** Quantized like every UI dot; radii are px, so they scale with the pitch (a full dot is ~72% of the pitch). */
const STYLE: DotStyle = { shape: 'squircle', sizeMin: .1, sizeMax: .36, cornerRoundness: .25, opacityMode: 'fromValue', quantizeSteps: 5 }

/** Greedy word wrap to `max` cells per line (a word longer than a line keeps its own line). */
function wrap(text: string, max: number): string[] {
  const lines: string[] = []
  let cur = ''
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${w}` : w
    if (cur && textSize(next)[0] > max) { lines.push(cur); cur = w } else cur = next
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['']
}

/** A board title is `NAME — what it is`: the name goes in dot type, the rest stays text beside it. */
const splitTitle = (title: string): [string, string] => { const i = title.indexOf(' — '); return i < 0 ? [title, ''] : [title.slice(0, i), title.slice(i + 3)] }

/** The board heading: the name in dot type (its text for screen readers), the subtitle as a mono label. */
export function BoardTitle({ title, id }: { title: string; id?: string }) {
  const [name, sub] = splitTitle(title)
  return <h2 className="board-title" id={id}>
    <span className="sr-only">{name}{sub && ' — '}</span><DotName text={name} />{sub && <span className="board-title-sub">{sub}</span>}
  </h2>
}

export function DotName({ text, pitch = 3, className = '' }: { text: string; pitch?: number; className?: string }) {
  const box = useRef<HTMLSpanElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = box.current?.parentElement
    if (!el) return
    const measure = () => setWidth(el.clientWidth)
    const ro = new ResizeObserver(measure)
    ro.observe(el); measure()
    return () => ro.disconnect()
  }, [])
  const theme = useThemeTokens()
  const upper = text.toUpperCase()
  const lines = useMemo(() => wrap(upper, width ? Math.max(6, Math.floor(width / pitch) - 1) : Infinity), [upper, width, pitch])
  const cols = Math.max(...lines.map(l => Math.ceil(textSize(l)[0]))) + 1
  const grid = useMemo<GridConfig>(() => ({ cols, rows: lines.length * LINE - 1, pitch }), [cols, lines.length, pitch])
  const layers = useMemo(() => { const l = lines.map((s, i) => layer(textAt(grid, s, 0, 1 + i * LINE), 'value')); return () => l }, [grid, lines])
  const style = useMemo(() => ({ ...STYLE, sizeMin: STYLE.sizeMin * pitch, sizeMax: STYLE.sizeMax * pitch }), [pitch])
  return <span ref={box} className={`dot-name ${className}`} aria-hidden="true" style={{ width: cols * pitch, height: grid.rows * pitch }}>
    <DotCanvas layers={layers} grid={grid} style={style} theme={theme} change={false} />
  </span>
}
