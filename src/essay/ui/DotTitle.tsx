import { useMemo } from 'react'
import type { DotStyle, GridConfig, Layer } from '../../engine/types'
import { textAt, textSize } from '../../engine/layout'
import { DotCanvas } from '../../components/DotCanvas'

const STYLE: DotStyle = { shape: 'squircle', sizeMin: .3, sizeMax: 1.55, cornerRoundness: .25, opacityMode: 'fromValue', quantizeSteps: 5 }

/** Greedy word wrap to `max` glyphs per line. */
function wrap(text: string, max: number): string[] {
  const out: string[] = []
  let line = ''
  for (const w of text.split(' ')) {
    if (line && (line + ' ' + w).length > max) { out.push(line); line = w } else line = line ? `${line} ${w}` : w
  }
  if (line) out.push(line)
  return out
}

/**
 * A heading set in the engine's own 5×7 dot font, through Field → Grid Sampler → Renderer
 * (static and sparse, so it lands on the SVG renderer). The section number is the one red element.
 * The real text sits in the heading for screen readers and search; the dots are presentational.
 */
export function DotTitle({ text, num, level = 2, max = 22, smooth = false, id }: { text: string; num?: string; level?: 1 | 2; max?: number; smooth?: boolean; id?: string }) {
  const lines = useMemo(() => wrap(text.toUpperCase(), max), [text, max])
  const { grid, layers } = useMemo(() => {
    const opts = { smooth }, [, h] = textSize('A', opts), lead = num ? textSize(`${num} `, opts)[0] + 1 : 0
    const w = Math.max(...lines.map(l => textSize(l, opts)[0])) + lead
    const gap = smooth ? 4 : 3, grid: GridConfig = { cols: w + 2, rows: lines.length * (h + gap) - gap + 2, pitch: smooth ? 3 : 4 }
    const layers: Layer[] = lines.map((l, i) => ({ field: textAt(grid, l, 1 + lead, 1 + i * (h + gap), opts), tone: 'value' }))
    if (num) layers.push({ field: textAt(grid, num, 1, 1, opts), tone: 'active' })
    return { grid, layers }
  }, [lines, num, smooth])
  const source = useMemo(() => () => layers, [layers])
  const Tag = level === 1 ? 'h1' : 'h2'
  return (
    <Tag className={`dot-title dot-title--${level}`} id={id}>
      <span className="sr-only">{num ? `${num}. ` : ''}{text}</span>
      <span className="dot-title-art" style={{ maxWidth: grid.cols * grid.pitch! }} aria-hidden="true">
        <DotCanvas layers={source} grid={grid} style={STYLE} renderer={level === 1 ? undefined : 'svg'} change={false} enter={level === 1 ? { delay: 150, mask: 'bayer', duration: 1100 } : undefined} />
      </span>
    </Tag>
  )
}
