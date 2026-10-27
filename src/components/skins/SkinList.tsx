import type { KeyboardEvent } from 'react'
import { SKINS, SKIN_NAMES } from '../../engine/display/names'
import { setClack, setSkin, useClack, useDisplaySkin } from './store'

/** The one-line description: the skin title after its "NAME: " prefix (as in the DISPLAY ▾ menu). */
const blurb = (title: string) => title.slice(title.indexOf(': ') + 2)

/**
 * The same choice as a list (the phone Tools sheet): a radio group, a 44 px row per skin with its line;
 * arrows move and pick, like native radios. The flip-disc clack toggle follows when that skin is on.
 */
export function SkinList() {
  const skin = useDisplaySkin(), clack = useClack()
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const n = SKIN_NAMES.length, j = (SKIN_NAMES.indexOf(skin) + d + n) % n
    setSkin(SKIN_NAMES[j]); e.currentTarget.querySelectorAll<HTMLElement>('[role=radio]')[j]?.focus()
  }
  return <>
    <div className="skin-list" role="radiogroup" aria-label="Display" onKeyDown={onKey}>
      {SKIN_NAMES.map(name => <button key={name} type="button" role="radio" aria-checked={skin === name} tabIndex={skin === name ? 0 : -1}
        data-skin={name} className={skin === name ? 'selected' : ''} onClick={() => setSkin(name)}>
        <i aria-hidden="true" /><b>{SKINS[name].label}</b><span>{blurb(SKINS[name].title)}</span>
      </button>)}
    </div>
    {skin === 'flipdisc' && <button type="button" className={`skin-list-clack${clack ? ' selected' : ''}`} aria-pressed={clack} onClick={() => setClack(!clack)}>FLIP-DISC CLACK: <b>{clack ? 'ON' : 'OFF'}</b></button>}
  </>
}
