/**
 * MICRO MOTION fixes (#238, #413) for `pnpm verify`: each pins one fix so it can't come back.
 * The pull hint clears the chat rows and the ring at every pull offset, the empty send field's placeholder is `mid`
 * with the caret before it, and the read ticks are drawn dots that stay out of the card's accessible name.
 */
import { sampleLayers } from '../../src/engine/sampler/gridSampler'
import { describe } from '../../src/engine/describe'
import { dot480 } from '../../src/engine/theme/tokens'
import type { Layer } from '../../src/engine/types'
import { HINT_CLEAR, pullCard, pullParts } from '../../src/widgets/boards/motion-pull'
import { HOLDER_X, sendCard } from '../../src/widgets/boards/motion-chat'
import type { Assert } from '../lib/check'

const pitch = pullCard.grid.pitch ?? dot480.gridPx
const lit = (ls: Layer[]) => sampleLayers(ls, pullCard.grid, pullCard.style, dot480).filter(d => d.opacity > 0 && d.r > 0)
/** Lit dot rows of some layers, in cells: [top, bottom] of the dot centres (none lit: null). */
function rows(ls: Layer[]): [number, number] | null {
  const ys = lit(ls).map(d => d.y / pitch - .5)
  return ys.length ? [Math.min(...ys), Math.max(...ys)] : null
}

export function motionChecks(assert: Assert) {
  // mo-pull: the hint sat on the first chat row around offsets 20 to 30, and on the hold while refreshing
  {
    const bad: string[] = []
    let seen = 0
    for (let off = 0; off <= 60; off += .5) for (const lt of [1, 2.5]) {
      const p = pullParts(lt, off), hint = rows(p.hint)
      if (!hint) continue
      seen++
      const list = rows(p.rows), ring = rows(p.ring)
      if (list && list[0] - hint[1] < HINT_CLEAR + 1 - 1e-6) bad.push(`${p.phase} ${off}: ${(list[0] - hint[1]).toFixed(1)} to the rows`)
      if (ring && hint[0] - ring[1] < 2) bad.push(`${p.phase} ${off}: ${(hint[0] - ring[1]).toFixed(1)} to the ring`)
    }
    for (let off = 0; off <= 60; off += .5) for (const lt of [1, 2.5]) if (lit(pullParts(lt, off).ring).some(d => d.y - d.r < 0)) bad.push(`${off}: ring above the card`)
    assert('motion: mo-pull hint clears the chat rows by 4 rows and the ring, and the ring stays in the card, at every pull offset', seen > 100 && !bad.length, `${seen} frames with a hint; ${bad.slice(0, 4).join(', ')}`)
  }
  // mo-send: the empty field's MESSAGE is mid (faint broke up at zoom) and starts past the caret
  {
    const ls = sendCard.layers({ t: .1, data: { ...sendCard.defaults } }), holder = ls.find(l => typeof l.field === 'function' && l.field.text === 'MESSAGE')
    const caret = ls.find(l => l.tone === 'value' && l.sites?.length && l.sites.every(([x]) => x === l.sites![0][0]))
    const hx = (holder?.field as { from?: { args: unknown[] } } | undefined)?.from?.args[1] as number | undefined
    assert('motion: mo-send placeholder is mid', holder?.tone === 'mid', `tone ${holder?.tone}`)
    assert('motion: mo-send caret sits before the placeholder', !!caret && hx !== undefined && hx - caret.sites![0][0] >= HOLDER_X - 1e-6, `caret ${caret?.sites?.[0]}, placeholder at ${hx}`)
  }
  // mo-send: the read ticks are drawn, so the name says READ and no check mark
  {
    const label = describe(sendCard, { reducedMotion: true }).label
    assert('motion: mo-send name reads READ with no tick symbol', label.includes('READ') && !/[^\x20-\x7e]/.test(label), label)
  }
}
