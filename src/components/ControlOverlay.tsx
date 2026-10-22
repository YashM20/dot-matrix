import { useState, type CSSProperties, type FocusEvent, type KeyboardEvent } from 'react'
import { HIT_PAD, controlRange, keyValue, keyYOf, settle } from '../engine'
import type { Control, GridConfig } from '../engine'
import type { ControlInput } from '../hooks/useControlInput'

/**
 * Accessibility overlay (P2): one real, visually transparent element per control, placed over its
 * box, so keyboard and assistive tech drive the same `data` as the pointer:
 * `<button>` (button), `role=switch` (toggle), `<input type=range>` (slider, knob, crank, stepper),
 * a group of two ranges (xy) and a `radiogroup` (segmented). Buttons and switches share one roving
 * tab stop per card (arrow keys move between them); each range and each radiogroup is its own stop,
 * because arrows change its value. Pointer input is handled by the card itself (`useControlInput`);
 * these elements ignore the pointer, except the aria-hidden hit pads, which only set `touch-action`.
 */
export function ControlOverlay({ controls, grid, data, input }: { controls: Control[]; grid: GridConfig; data: Record<string, number>; input: ControlInput }) {
  const taps = controls.filter(c => c.kind === 'button' || c.kind === 'toggle')
  const [rove, setRove] = useState<string | undefined>(undefined)
  const stop = taps.some(c => c.key === rove) ? rove : taps[0]?.key
  const val = (key: string, c: Control) => { const v = data[key]; if (typeof v === 'number') return v; const { min } = controlRange(c); return Number.isFinite(min) ? min : 0 }

  const onFocus = (key: string) => (e: FocusEvent<HTMLElement>) => {
    let visible = true
    try { visible = e.currentTarget.matches(':focus-visible') } catch { /* old browsers: treat as visible */ }
    if (taps.some(c => c.key === key)) setRove(key)
    input.focus(key, visible)
  }
  const onBlur = () => input.focus(undefined, false)
  /** Buttons / switches: arrows and Home / End move the roving tab stop (Space / Enter click natively). */
  const roveKeys = (key: string) => (e: KeyboardEvent<HTMLElement>) => {
    const i = taps.findIndex(c => c.key === key), n = taps.length
    const j = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % n : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + n) % n
      : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1
    if (j < 0 || n < 2) { input.focus(key, true); return }
    e.preventDefault()
    setRove(taps[j].key)
    e.currentTarget.parentElement?.querySelector<HTMLElement>(`[data-dot-focus="${CSS.escape(taps[j].key)}"]`)?.focus()
  }
  /** Ranges: our own key mapping (quantized, unbounded cranks), so every axis behaves the same. */
  const rangeKeys = (c: Control, key: string) => (e: KeyboardEvent<HTMLInputElement>) => {
    input.focus(c.key, true)
    const v = keyValue(c, input.value(key), e.key)
    if (v === null) return
    e.preventDefault()
    input.set({ [key]: v })
  }

  const range = (c: Control, key: string, label: string, style?: CSSProperties, focusAttr = true) => {
    const { min, max, step } = controlRange(c), v = val(key, c), bounded = Number.isFinite(min) && Number.isFinite(max)
    return <input key={key} type="range" className="dot-a11y-ctl" style={style} aria-label={label} data-dot-focus={focusAttr ? c.key : undefined}
      min={bounded ? min : -1e9} max={bounded ? max : 1e9} step={step > 0 && bounded ? step : 'any'} value={v} aria-valuenow={v}
      aria-orientation={c.orientation === 'vertical' || c.kind === 'knob' ? 'vertical' : undefined}
      onChange={e => input.set({ [key]: settle(c, Number(e.currentTarget.value)) })}
      onKeyDown={rangeKeys(c, key)} onFocus={onFocus(c.key)} onBlur={onBlur} />
  }

  const one = (c: Control) => {
    const box = place(c.box, grid), { min, max } = controlRange(c), on = val(c.key, c) >= (min + max) / 2
    switch (c.kind) {
      case 'button':
        return <button key={c.key} type="button" className="dot-a11y-ctl" style={box} aria-label={c.label} data-dot-focus={c.key} tabIndex={c.key === stop ? 0 : -1}
          onClick={() => input.press(c)} onKeyDown={roveKeys(c.key)} onFocus={onFocus(c.key)} onBlur={onBlur} />
      case 'toggle':
        return <button key={c.key} type="button" role="switch" className="dot-a11y-ctl" style={box} aria-label={c.label} aria-checked={on} data-dot-focus={c.key} tabIndex={c.key === stop ? 0 : -1}
          onClick={() => { const v = keyValue(c, val(c.key, c), 'Enter'); if (v !== null) input.set({ [c.key]: v }) }}
          onKeyDown={roveKeys(c.key)} onFocus={onFocus(c.key)} onBlur={onBlur} />
      case 'xy':
        return <div key={c.key} role="group" aria-label={c.label} className="dot-a11y-group" style={box}>
          {range(c, c.key, `${c.label} X`)}
          {range(c, keyYOf(c), `${c.label} Y`, undefined, false)}
        </div>
      case 'segmented': {
        const n = Math.max(1, c.options ?? 2), sel = Math.round(val(c.key, c)), vertical = c.orientation === 'vertical'
        const choose = (i: number, focus?: HTMLElement | null) => { input.set({ [c.key]: i }); focus?.focus() }
        return <div key={c.key} role="radiogroup" aria-label={c.label} className="dot-a11y-group" style={box}
          onKeyDown={e => {
            input.focus(c.key, true)
            const v = keyValue(c, sel, e.key)
            if (v === null) return
            e.preventDefault()
            choose(v, e.currentTarget.querySelector<HTMLElement>(`[data-dot-option="${v}"]`))
          }}>
          {Array.from({ length: n }, (_, i) => (
            <button key={i} type="button" role="radio" className="dot-a11y-ctl" aria-checked={i === sel} tabIndex={i === sel ? 0 : -1}
              aria-label={c.optionLabels?.[i] ?? String(i + 1)} data-dot-option={i} data-dot-focus={i === sel ? c.key : undefined}
              style={vertical ? { left: 0, width: '100%', top: `${i / n * 100}%`, height: `${100 / n}%` } : { top: 0, height: '100%', left: `${i / n * 100}%`, width: `${100 / n}%` }}
              onClick={() => choose(i)} onFocus={onFocus(c.key)} onBlur={onBlur} />
          ))}
        </div>
      }
      default:
        return range(c, c.key, c.label, box)
    }
  }

  return (
    <div className="dot-a11y">
      {controls.map(c => {
        const [col, row, w, h] = c.box
        return <div key={`hit:${c.key}`} className={`dot-a11y-hit dot-a11y-hit--${c.kind === 'button' || c.kind === 'toggle' || c.kind === 'segmented' || c.kind === 'stepper' ? 'tap' : 'drag'}`}
          data-dot-hit={c.key} aria-hidden="true" style={place([col - HIT_PAD, row - HIT_PAD, w + 2 * HIT_PAD, h + 2 * HIT_PAD], grid, true)} />
      })}
      {controls.map(one)}
    </div>
  )
}

/** A cell box as percentages of the card, centred, at least the minimum target size. */
function place([col, row, w, h]: Control['box'], grid: GridConfig, hit = false): CSSProperties {
  const min = hit ? 'var(--dot-hit-min)' : 'var(--dot-target-min)'
  return {
    left: `${(col + w / 2 + .5) / grid.cols * 100}%`, top: `${(row + h / 2 + .5) / grid.rows * 100}%`,
    width: `max(${min}, ${w / grid.cols * 100}%)`, height: `max(${min}, ${h / grid.rows * 100}%)`,
  }
}
