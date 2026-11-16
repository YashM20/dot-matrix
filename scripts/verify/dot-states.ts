/**
 * Dot control states (#358): one hover, press and focus grammar from `src/widgets/dot-controls.ts`. On the boards that
 * used to draw their own (instrument, heartbeat, scope, glyph, pond koi, type), for every control:
 *  - focus draws a ring in the kit's tone and size (`idle`, 1.3), so no focusable control goes without one;
 *  - the ring marches between two frames and holds still under reduced motion;
 *  - hover draws the kit's halo (`value` sites of the outline size), except where the card's own surface reacts
 *    instead (the XY pad and the mic ring, where a halo has no room, and the pond you feed by pointing at it).
 * On its own: `pnpm exec tsx scripts/verify/dot-states.ts`.
 */
import type { FrameContext } from '../../src/engine/context'
import type { Layer } from '../../src/engine/types'
import { OUTLINE } from '../../src/widgets/dot-controls'
import type { WidgetPreset } from '../../src/widgets/types'
import { checker, type Assert } from '../lib/check'

/** Controls whose hover lifts the card's own surface instead of a halo (written down in each card). */
const OWN_HOVER = new Set(['inst-xy/x', 'scope-mic/mic', 'pond-koi/koi'])

export async function dotStateChecks(assert: Assert) {
  const { instrumentBoard } = await import('../../src/widgets/boards/instrument')
  const { heartbeatBoard } = await import('../../src/widgets/boards/heartbeat')
  const { scopeBoard } = await import('../../src/widgets/boards/scope')
  const { glyphLongpress } = await import('../../src/widgets/boards/glyph')
  const { typeAxesCard } = await import('../../src/widgets/boards/type')
  const { pondKoi } = await import('../../src/widgets/boards/pond/koi')
  const cards: WidgetPreset[] = [...instrumentBoard, ...heartbeatBoard, ...scopeBoard, glyphLongpress, typeAxesCard, pondKoi]

  const frame = (p: WidgetPreset, t: number, ix: Partial<FrameContext> = {}) => p.layers({ t, data: { ...(p.defaults ?? {}) }, ...ix } as FrameContext)
  const ring = (ls: Layer[]) => JSON.stringify(ls.filter(l => l.tone === 'idle' && l.size === 1.3 && l.sites).map(l => l.sites))
  const halo = (ls: Layer[]) => ls.filter(l => l.tone === 'value' && l.size === OUTLINE.size && l.sites?.length).length
  const noRing: string[] = [], still: string[] = [], frozen: string[] = [], noHalo: string[] = []
  let n = 0
  for (const p of cards) for (const c of p.controls ?? []) {
    const id = `${p.id}/${c.key}`, rest = ring(frame(p, .35))
    const a = ring(frame(p, .35, { focus: c.key })), b = ring(frame(p, .55, { focus: c.key }))
    const ra = ring(frame(p, .35, { focus: c.key, reducedMotion: true })), rb = ring(frame(p, .55, { focus: c.key, reducedMotion: true }))
    n++
    if (a === rest) noRing.push(id)
    else if (a === b) still.push(id)
    if (ra !== rb) frozen.push(id)
    if (!OWN_HOVER.has(id) && halo(frame(p, .35, { hover: c.key })) <= halo(frame(p, .35))) noHalo.push(id)
  }
  assert('dot states: every control on the six boards draws the kit focus ring (idle, 1.3) on focus', n >= 30 && !noRing.length, `${n} controls, none: ${noRing.join(' ')}`)
  assert('dot states: the focus ring marches, and holds still under reduced motion', !still.length && !frozen.length, `still: ${still.join(' ')} / moving under reduced motion: ${frozen.join(' ')}`)
  assert('dot states: hover draws the kit halo (value, outline size), except the cards whose own surface reacts', !noHalo.length, noHalo.join(' '))
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('verify/dot-states.ts')) {
  const { assert, done } = checker('dot states')
  await dotStateChecks(assert)
  done('dot states: all checks passed')
}
