import { useMemo, useState } from 'react'
import type { DotStyle, Field, GridConfig, Layer, Tone } from '../../engine/types'
import { hash01 } from '../../engine/math'
import { createRaster, type Raster } from '../../engine/raster'
import { halftone, halftoneStream } from '../../engine/halftone'
import { portrait } from '../../widgets/boards/mirror'
import { layer, layoutFor, type WidgetContext } from '../../widgets/types'
import { DotCanvas } from '../../components/DotCanvas'
import { Controls, Range } from '../ui/kit'

/**
 * Temporal stability: one still portrait plus fresh sensor noise every frame, halftoned three ways.
 * White-noise thresholds re-roll every dot every frame; an STBN slice per frame is better distributed
 * but still re-rolls; the stream (STBN + per-cell slice memory + level hysteresis) holds still.
 * Each panel counts the dots that changed since the previous frame.
 */
const S = 72, GRID: GridConfig = { cols: S, rows: S + 10, pitch: 4 }, T = layoutFor(GRID)
const LEVELS = 6, TOP = LEVELS - 1
const STYLE: DotStyle = { shape: 'squircle', cornerRoundness: .1, sizeMin: 0, sizeMax: 2.3, quantizeSteps: 0, opacityMode: 'fromValue', sizeCurve: v => (v - .7) / .3 * .7 + .3 }
const bandOf = (v: number): Tone => (v < .79 ? 'faint' : v < .85 ? 'mid' : v < .91 ? 'idle' : 'value')
const BOX: [number, number, number, number] = [0, 0, S - 1, S - 1]

function input(frame: number, noise: number): Raster {
  const r = createRaster(GRID, 'card', BOX)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = noise ? (hash01(x * 131 + y, frame % 997) + hash01(x * 37 + y * 101, (frame * 7) % 991) - 1) * noise : 0
    r.data[y * S + x] = Math.max(0, Math.min(1, portrait(x * 2, 12 + y * 1.83) + n))
  }
  return r
}
function whiteNoise(r: Raster, frame: number): Raster {
  const out = createRaster(GRID, 'card', BOX)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, q = Math.min(TOP, Math.floor(r.data[i] * TOP + hash01(x * 7 + y * 977, frame % 983)))
    out.data[i] = q / TOP
  }
  return out
}
const KINDS = ['white', 'stbn', 'stream'] as const
type Kind = typeof KINDS[number]
interface Frame { frame: number; noise: number; out: Record<Kind, Float32Array>; changed: Record<Kind, number> }
let last: Frame | undefined
const stream = halftoneStream({ step: 1, levels: LEVELS })
function frameAt(frame: number, noise: number): Frame {
  if (last && last.frame === frame && last.noise === noise) return last
  const r = input(frame, noise)
  const out = { white: whiteNoise(r, frame).data, stbn: halftone(r, { step: 1, levels: LEVELS, frame }).data, stream: Float32Array.from(stream.push(r, frame).data) }
  const changed = { white: 0, stbn: 0, stream: 0 }
  if (last) for (const k of KINDS) { const a = last.out[k], b = out[k]; let n = 0; for (let i = 0; i < S * S; i++) if (a[i] !== b[i]) n++; changed[k] = n }
  return (last = { frame, noise, out, changed })
}
const dotsOf = (d: Float32Array): Field => {
  const f: Field = (u, v) => { const c = Math.round(u * (S - 1)), r = Math.round(v * (GRID.rows - 1)); if (r >= S) return 0; const q = d[r * S + c]; return q ? .7 + .3 * q : 0 }
  f.bounds = [0, 0, S - 1, S - 1]
  return f
}
const NAMES: Record<Kind, string> = { white: 'WHITE NOISE', stbn: 'STBN', stream: 'STBN+HOLD' }
const panel = (kind: Kind) => (ctx: WidgetContext): Layer[] => {
  const f = frameAt(ctx.frame ?? 0, ctx.data.noise ?? .06), n = f.changed[kind]
  return [
    { field: dotsOf(f.out[kind]), toneOf: bandOf },
    layer(T.text(NAMES[kind], 0, S + 2), 'idle'),
    layer(T.text(String(n).padStart(4, '0'), S - 1, S + 2, { align: 'right' }), kind === 'stream' ? 'value' : 'mid'),
  ]
}
const SOURCES = { white: panel('white'), stbn: panel('stbn'), stream: panel('stream') }

export default function FigFlicker() {
  const [noise, setNoise] = useState(.06)
  const data = useMemo(() => ({ noise }), [noise])
  return (
    <>
      <div className="cards cards--3">
        {KINDS.map(k => <div className="panel panel--dark" key={k} data-kind={k}><DotCanvas layers={SOURCES[k]} data={data} grid={GRID} style={STYLE} animated change={false} /></div>)}
      </div>
      <Controls>
        <Range label="Sensor noise" name="noise" value={noise} min={0} max={.15} step={.01} onChange={setNoise} format={v => v.toFixed(2)} />
      </Controls>
    </>
  )
}
