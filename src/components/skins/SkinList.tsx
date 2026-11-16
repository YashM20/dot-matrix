import { SKINS, SKIN_NAMES } from '../../engine/display/names'
import { useRoving } from '../../hooks/useRoving'
import { setSkin, useDisplaySkin } from './store'

/** The one-line description: the skin title after its "NAME: " prefix (as in the DISPLAY ▾ menu). */
const blurb = (title: string) => title.slice(title.indexOf(': ') + 2)

/**
 * The same choice as a list (the phone Tools sheet): a radio group, a 44 px row per skin with its line;
 * arrows (and Home, End) move and pick, like native radios.
 */
export function SkinList() {
  const skin = useDisplaySkin()
  const onKey = useRoving({ items: '[role=radio]', axis: 'both', pick: true })
  return (
    <div className="skin-list" role="radiogroup" aria-label="Display" onKeyDown={onKey}>
      {SKIN_NAMES.map(name => <button key={name} type="button" role="radio" aria-checked={skin === name} tabIndex={skin === name ? 0 : -1}
        data-skin={name} className={skin === name ? 'selected' : ''} onClick={() => setSkin(name)}>
        <i aria-hidden="true" /><b>{SKINS[name].label}</b><span>{blurb(SKINS[name].title)}</span>
      </button>)}
    </div>
  )
}
