import type { ReactNode } from 'react'
import type { DotStyle } from '../../engine/types'

/** UI dots (quantized, the default squircle) for figure canvases. */
export const figStyle: DotStyle = { shape: 'squircle', sizeMin: .3, sizeMax: 1.55, cornerRoundness: .25, opacityMode: 'fromValue', quantizeSteps: 5 }

export function Range({ label, value, min, max, step = 1, onChange, format, name }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string; name?: string
}) {
  return (
    <label className="ctl">
      <span className="ctl-label">{label}</span>
      <input type="range" name={name} min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)} />
      <output>{format ? format(value) : value}</output>
    </label>
  )
}

/** A row of mutually exclusive buttons (aria-pressed). */
export function Choice<T extends string | number>({ label, options, value, onChange, names }: {
  label: string; options: readonly T[]; value: T; onChange: (v: T) => void; names?: Partial<Record<string, string>>
}) {
  return (
    <div className="ctl ctl--choice" role="group" aria-label={label}>
      <span className="ctl-label">{label}</span>
      <div className="ctl-buttons">
        {options.map(o => <button key={String(o)} type="button" aria-pressed={o === value} onClick={() => onChange(o)}>{names?.[String(o)] ?? String(o)}</button>)}
      </div>
    </div>
  )
}

export function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return <button type="button" className="ctl-toggle" role="switch" aria-checked={on} onClick={() => onChange(!on)}><i aria-hidden="true" />{label}</button>
}

export const Controls = ({ children }: { children: ReactNode }) => <div className="ctls">{children}</div>
/** Cards side by side (2–3 up, 1 up on phones). */
export const Cards = ({ children, n = 3 }: { children: ReactNode; n?: 2 | 3 | 5 }) => <div className={`cards cards--${n}`}>{children}</div>
/** A plain panel holding a figure canvas, with an optional dot-sized label (HTML, mono). */
export const Panel = ({ label, children, note }: { label?: string; children: ReactNode; note?: ReactNode }) => (
  <div className="panel">{label && <div className="panel-label">{label}</div>}{children}{note && <div className="panel-note">{note}</div>}</div>
)
