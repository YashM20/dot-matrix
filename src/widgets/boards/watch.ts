/**
 * Board: WATCH, smartwatch faces drawn in dots (issue #126). Eight faces, each in a round or squircle case:
 * analog, large digital, complications, moon phase, tide clock, sunrise and sunset, world clock and step ring,
 * then one card that carries all eight and switches between them.
 *
 * Time comes from the device clock (frozen in goldens, scripts/lib/freeze.ts); the moon, the sun and the tide are
 * computed on the device from it (src/engine/astro). Red is the board's one accent: one live thing per face.
 */
import { TILE, layer, type WidgetPreset } from '../types'
import { CX, CY, T, circle, mod, states, style, ui, type Pt } from './watch-kit'
import { analogFace, digitalFace } from './watch-hands'
import { complicationsFace, stepsFace } from './watch-life'
import { moonFace, sunFace } from './watch-sky'
import { tideFace, worldFace } from './watch-tide'

/** The faces in the switcher's order (and the board's). */
export const WATCH_FACES: WidgetPreset[] = [analogFace, digitalFace, complicationsFace, moonFace, tideFace, sunFace, worldFace, stepsFace]
const N = WATCH_FACES.length
/** The switcher's face index for a `face` value (wraps, so any number picks a face). */
export const faceIndex = (v: number | undefined) => mod(Math.round(Number.isFinite(v) ? v! : 0), N)
/** Page dots in the label row, one per face. */
const PAGES: Pt[] = Array.from({ length: N }, (_, i) => [104 + i * 5, 3])

// ── FACES ─ the switcher ─────────────────────────────────────────────────────────
/**
 * One watch, every face: tap the right half (or swipe toward it) for the next face, the left half for the previous
 * one; arrow keys step too, and it wraps. A knob control whose `map` steps by one from the value at press.
 */
export const facesCard: WidgetPreset = {
  id: 'watch-faces', name: 'Faces', group: 'composite', chrome: 'dots', label: '', grid: TILE, style, animated: true, clock: true,
  defaults: { face: 0, ...Object.fromEntries(WATCH_FACES.flatMap(f => Object.entries(f.defaults ?? {}))) },
  controls: [{
    key: 'face', kind: 'knob', box: [CX - 64, CY - 64, 128, 128], min: 0, max: N, step: 1, wrap: true,
    map: (x, _y, v) => v + (x >= CX ? 1 : -1), label: 'Watch face',
  }],
  layers: ctx => {
    const i = faceIndex(ctx.data.face), f = WATCH_FACES[i], s = ui(ctx, 'face')
    return [
      layer(T.text(f.name.toUpperCase(), 0, 0), 'idle'),
      layer(T.dots(PAGES.filter((_, k) => k !== i), 1.5), 'faint'),
      layer(T.dots([PAGES[i]], 2.6), 'value'),
      ...f.layers({ ...ctx, data: { ...f.defaults, ...ctx.data } }),
      // hover lights the case (the glow lands between bezel and edge), focus marches just inside the bezel
      ...states(s, ctx.t, circle(CX, CY, 58), circle(CX, CY, 58), 1.5),
    ]
  },
}
export const watchBoard: WidgetPreset[] = [...WATCH_FACES, facesCard]
