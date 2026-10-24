import { useRef, type KeyboardEvent } from 'react'
import { SKINS, SKIN_NAMES } from '../../engine/display/names'
import { setClack, setSkin, useClack, useDisplaySkin } from './store'

/**
 * Dotted segmented control for the global display skin (header). A radio group: arrow keys move and
 * select, Home/End jump. The flip-disc skin adds a clack toggle (muted by default).
 */
export function SkinSwitcher() {
  const skin = useDisplaySkin(), clack = useClack()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKey = (e: KeyboardEvent) => {
    const i = SKIN_NAMES.indexOf(skin), n = SKIN_NAMES.length
    const j = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % n : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i + n - 1) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1
    if (j < 0) return
    e.preventDefault()
    setSkin(SKIN_NAMES[j])
    refs.current[j]?.focus()
  }
  return (
    <div className="skin-switch">
      <div className="skin-seg" role="radiogroup" aria-label="Display" onKeyDown={onKey}>
        {SKIN_NAMES.map((name, i) => (
          <button key={name} ref={el => { refs.current[i] = el }} type="button" role="radio" aria-checked={skin === name} tabIndex={skin === name ? 0 : -1}
            title={SKINS[name].title} className={skin === name ? 'selected' : ''} onClick={() => setSkin(name)}>
            <i aria-hidden="true" />{SKINS[name].label}
          </button>
        ))}
      </div>
      {skin === 'flipdisc' && (
        <button type="button" className={`skin-clack${clack ? ' selected' : ''}`} aria-pressed={clack} title="Flip-disc clack (sound)" onClick={() => setClack(!clack)}>
          {clack ? 'CLACK ON' : 'CLACK OFF'}
        </button>
      )}
    </div>
  )
}
