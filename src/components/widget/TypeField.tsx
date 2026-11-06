/**
 * The widget page's text field for a card that sets words (`WidgetPreset.typing`, e.g. `type-anything`).
 * What the visitor types goes through `textId` (upper case, the font's glyphs only) into the card's data key,
 * so the card stays a pure function of its numbers. Each change waits a beat, so the card flies to the word
 * once it is typed, not once per letter.
 */
import { useEffect, useId, useState } from 'react'
import { sanitize, textId } from '../../data/text'
import type { WidgetPreset } from '../../widgets/types'
import './TypeField.css'

/** How long the field waits after the last key before the card takes the new words (ms). */
const SETTLE_MS = 250

export function TypeField({ typing, onText }: { typing: NonNullable<WidgetPreset['typing']>; onText: (patch: Record<string, number>) => void }) {
  const id = useId()
  const [value, setValue] = useState('')
  const { key, max = 40 } = typing
  useEffect(() => {
    const t = window.setTimeout(() => onText({ [key]: textId(value) }), SETTLE_MS)
    return () => window.clearTimeout(t)
  }, [value, key, onText])
  const kept = sanitize(value).length
  return <label className="wp-type" htmlFor={id}>
    <span>{typing.label.toUpperCase()}</span>
    <input id={id} type="text" value={value} maxLength={max} placeholder={typing.placeholder} autoComplete="off" spellCheck={false}
      enterKeyHint="done" aria-describedby={`${id}-n`} onChange={e => setValue(e.target.value)} />
    <small id={`${id}-n`} aria-live="polite">{kept}/{max}</small>
  </label>
}
