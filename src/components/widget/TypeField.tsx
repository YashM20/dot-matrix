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
  // the limit counts what the card draws (sanitized: upper case, the font's glyphs; ß becomes SS), not the raw input
  const words = sanitize(value)
  useEffect(() => {
    const t = window.setTimeout(() => onText({ [key]: textId(words, true) }), SETTLE_MS)
    return () => window.clearTimeout(t)
  }, [words, key, onText])
  /** An edit past the limit is cut back until the card's text fits (a paste keeps what fits). */
  const fit = (next: string) => { let v = next; while (v && sanitize(v).length > max) v = v.slice(0, -1); return v }
  return <label className="wp-type" htmlFor={id}>
    <span>{typing.label.toUpperCase()}</span>
    <input id={id} type="text" value={value} maxLength={max * 4} placeholder={typing.placeholder} autoComplete="off" spellCheck={false}
      enterKeyHint="done" aria-describedby={`${id}-n`} onChange={e => setValue(fit(e.target.value))} />
    <small id={`${id}-n`} aria-live="polite">{words.length}/{max}</small>
  </label>
}
