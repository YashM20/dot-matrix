import { useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { DotStyle, Field, Layer } from '../../engine/types'
import { DotCanvas } from '../../components/DotCanvas'
import { Controls, Panel, Range } from '../ui/kit'
import { figStyle } from '../ui/style'

/** Three metaballs; the reader holds the third. Pure in (u, v, x, y). */
const blobs = (x: number, y: number): Field => (u, v) => {
  const a = .018 / ((u - .3) ** 2 + (v - .35) ** 2 + 1e-4)
  const b = .012 / ((u - .7) ** 2 + (v - .68) ** 2 + 1e-4)
  const c = .016 / ((u - x) ** 2 + (v - y) ** 2 + 1e-4)
  const s = a + b + c
  return s < .35 ? 0 : Math.min(1, (s - .35) / 1.4)
}
/** "The field": sampled so finely and unquantized that it reads as continuous. */
const FINE: DotStyle = { shape: 'circle', sizeMin: 0, sizeMax: 1.25, opacityMode: 'fromValue', quantizeSteps: 0 }
const FINE_GRID = { cols: 120, rows: 120, pitch: 2 }
const clamp = (x: number) => Math.min(.95, Math.max(.05, x))

/** Field → Grid Sampler → Renderer, with the reader's hand on the field and on the pitch. */
export default function FigPipeline() {
  const [at, setAt] = useState<[number, number]>([.62, .3])
  const [n, setN] = useState(28)
  const layers = useMemo(() => { const l: Layer[] = [{ field: blobs(at[0], at[1]), tone: 'auto' }]; return () => l }, [at])
  const grid = useMemo(() => ({ cols: n, rows: n, pitch: 4 }), [n])
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (e.type === 'pointermove' && !e.buttons && e.pointerType !== 'mouse') return
    const r = e.currentTarget.getBoundingClientRect()
    setAt([clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height)])
  }
  const key = (e: KeyboardEvent) => {
    const d = { ArrowLeft: [-.04, 0], ArrowRight: [.04, 0], ArrowUp: [0, -.04], ArrowDown: [0, .04] }[e.key]
    if (d) { e.preventDefault(); setAt(([x, y]) => [clamp(x + d[0]), clamp(y + d[1])]) }
  }
  const surface = (child: React.ReactNode, label: string) => (
    <div className="stage stage--sq stage--drag" role="slider" tabIndex={0} aria-label={label} aria-valuetext={`x ${at[0].toFixed(2)}, y ${at[1].toFixed(2)}`}
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); move(e) }} onPointerMove={move} onKeyDown={key}>{child}</div>
  )
  return (
    <>
      <div className="pair">
        <Panel label="1 · FIELD  f(u, v) → 0..1">{surface(<DotCanvas layers={layers} grid={FINE_GRID} style={FINE} change={false} />, 'Drag the blob in the field')}</Panel>
        <Panel label={`2 · SAMPLED ${n}×${n} · 3 · RENDERED, 5 STEPS`}>{surface(<DotCanvas layers={layers} grid={grid} style={figStyle} change={false} />, 'Drag the blob in the dots')}</Panel>
      </div>
      <Controls>
        <Range label="Dots per side (pitch)" name="pitch" value={n} min={10} max={60} onChange={setN} />
      </Controls>
    </>
  )
}
