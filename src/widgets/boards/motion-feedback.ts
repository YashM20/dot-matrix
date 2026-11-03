/**
 * Motion feedback: a skeleton post that shimmers and then resolves into content, and toasts that slide in and
 * out after a SAVE press, one each for success, warning and error. Red marks the one thing that matters: the
 * unread dot once the post has loaded, the error toast.
 */
import type { Layer, Tone } from '../../engine/types'
import { layer } from '../types'
import { BANG, BODY, CHECK, CROSS, PRESS, T, at, dimmed, fade, frac, inCubic, loopCard, outCubic, outline, span, spriteAt, step4, type Pt } from './motion-kit'

// ── SKELETON ────────────────────────────────────────────────────────────────
/**
 * A post as placeholders on a 3.3-cell lattice of faint sites: avatar, name, time, picture, two lines. A
 * slanted shimmer band crosses it three times, then each placeholder in turn gives way to its content.
 */
const SK = { pitch: 3.3, size: 2.4, band: 1.2, passes: 3, stagger: .12, fadeIn: .24, period: 7.4 }
const skDone = SK.band * SK.passes
/** Sites of a w × h box of placeholder dots, top-left (x,y). */
function block(x: number, y: number, w: number, h: number): Pt[] {
  const pts: Pt[] = []
  for (let j = 0; j * SK.pitch <= h + 1e-9; j++) for (let i = 0; i * SK.pitch <= w + 1e-9; i++) pts.push([x + i * SK.pitch, y + j * SK.pitch])
  return pts
}
const disc = (cx: number, cy: number, r: number): Pt[] => block(cx - r, cy - r, 2 * r, 2 * r).filter(([x, y]) => Math.hypot(x - cx, y - cy) <= r + .2)
const PIC = { x: 6, y: 50, w: 132, h: 40 }
const SHAPES: Pt[][] = [
  disc(20, 30, 11), block(40, 23, 60, 3.3), block(40, 36, 36, 3.3),
  block(PIC.x, PIC.y, PIC.w, PIC.h), block(6, 100, 132, 3.3), block(6, 111, 90, 3.3),
]
/** The picture once loaded: two ridges on the placeholder's own sites, and the sun as one big site. */
const PICTURE = (() => {
  const by: Record<'idle' | 'mid', Pt[]> = { idle: [], mid: [] }
  for (const [x, y] of SHAPES[3]) {
    const far = 72 - 9 * Math.sin(x * .05 + 1) - 4 * Math.sin(x * .13), near = 82 - 5 * Math.sin(x * .07 + 2.5) - 3 * Math.sin(x * .19)
    if (y >= near) by.idle.push([x, y])
    else if (y >= far) by.mid.push([x, y])
  }
  return by
})()
/** Content of placeholder `i`. */
function content(i: number): Layer[] {
  switch (i) {
    case 0: return [layer(T.dotRing(20, 30, 11, { spacing: 2.6, size: 1.3 }), 'value'), layer(T.big('M', 20, 23, { lattice: 2, align: 'center' }), 'value')]
    case 1: return [layer(T.big('MIRA K', 40, 21, BODY), 'value'), layer(T.dots([[40 + 6 * 7.8 + 4, 25]], 5), 'active')]
    case 2: return [layer(T.text('2 MIN AGO', 40, 35), 'mid')]
    case 3: return [layer(T.dots([[104, 58]], 12), 'value'), layer(T.dots(PICTURE.mid, SK.size), 'mid'), layer(T.dots(PICTURE.idle, SK.size), 'idle')]
    case 4: return [layer(T.text('SUNRISE OVER THE RIDGE', 6, 99), 'idle')]
    default: return [layer(T.text('6:12 AM, 2 KM IN', 6, 110), 'mid')]
  }
}
const SHIMMER: [number, Tone][] = [[5, 'idle'], [13, 'mid']]
export const skeletonCard = loopCard({
  id: 'mo-skeleton', name: 'Skeleton', period: SK.period, settled: 6,
  draw: lt => {
    const bx = -40 + frac(lt / SK.band) * 220, ghosts = new Map<Tone, Pt[]>(), out: Layer[] = []
    SHAPES.forEach((pts, i) => {
      const t0 = skDone + i * SK.stagger
      if (lt >= t0) { for (const l of content(i)) out.push(...fade(l, span(lt, t0, SK.fadeIn))); return }
      for (const p of pts) {
        const d = Math.abs(p[0] + .6 * (p[1] - 70) - bx), tone = SHIMMER.find(([r]) => d < r)?.[1] ?? 'faint'
        const list = ghosts.get(tone) ?? []
        list.push(p); ghosts.set(tone, list)
      }
    })
    return [...[...ghosts].map(([tone, pts]) => layer(T.dots(pts, SK.size), tone)), ...out]
  },
  foot: lt => {
    const n = SHAPES.filter((_, i) => lt >= skDone + i * SK.stagger).length
    return [n < SHAPES.length ? 'LOADING' : 'LOADED', `${n}/${SHAPES.length} PARTS`]
  },
})

// ── TOAST ───────────────────────────────────────────────────────────────────
/**
 * SAVE is pressed, and a toast rises into place, holds, and drops away: success, then warning, then error.
 * The error toast is the red one, and it shakes once as it lands.
 */
const TOASTS: { word: string; title: string; detail: string; mark: string[]; tone: Tone }[] = [
  { word: 'SUCCESS', title: 'ALL SAVED', detail: 'ON 3 DEVICES', mark: CHECK, tone: 'value' },
  { word: 'WARNING', title: 'SYNC LATER', detail: 'RETRY ON WI-FI', mark: BANG, tone: 'idle' },
  { word: 'ERROR', title: 'SAVE FAILED', detail: 'DISK IS FULL', mark: CROSS, tone: 'active' },
]
const TO = { slot: 2.5, press: .2, enter: .3, rise: .35, leave: 2, fall: .3, lift: 12, x: 6, y: 70, w: 132, h: 40, r: 12, shake: .35 }
const BTN = { x: 40, y: 30, w: 64, h: 26 }
export const toastCard = loopCard({
  id: 'mo-toast', name: 'Toast', period: TO.slot * TOASTS.length, settled: 1.2, fps: 24,
  draw: lt => {
    const i = Math.min(TOASTS.length - 1, Math.floor(lt / TO.slot)), s = lt - i * TO.slot, k = TOASTS[i]
    const pv = s < TO.press ? PRESS : 1
    const out: Layer[] = [
      layer(T.text('DRAFT 3', 6, 16), 'idle'),
      layer(T.text(s < TO.press ? 'SAVING' : 'EDITED NOW', 138, 16, { align: 'right' }), 'mid'),
      layer(at(outline(BTN.x, BTN.y, BTN.w, BTN.h, BTN.h / 2), pv), 'value'),
      layer(dimmed(T.big('SAVE', BTN.x + BTN.w / 2, BTN.y + BTN.h / 2 - 4.5, { ...BODY, align: 'center' }), pv), 'value'),
    ]
    // in: decelerate up into the slot; out: accelerate down and away
    const e = outCubic(span(s, TO.enter, TO.rise)), x = inCubic(span(s, TO.leave, TO.fall)), a = e * (1 - x)
    if (a <= 0) return out
    const y = Math.round(TO.y + (1 - e) * TO.lift + x * TO.lift)
    const since = s - TO.enter - TO.rise, shaking = k.tone === 'active' && since >= 0 && since < TO.shake
    const dx = shaking ? Math.round(4 * Math.sin(since * 20 * Math.PI) * (1 - since / TO.shake)) : 0
    const x0 = TO.x + dx, cy = y + TO.h / 2
    const toast = [
      layer(outline(x0, y, TO.w, TO.h, TO.r), k.tone),
      layer(T.dotRing(x0 + 18, cy, 10, { spacing: 2.6, size: 1.3 }), k.tone),
      layer(spriteAt(k.mark, x0 + 18.5 - 5.6, cy + .5 - 5.6, 1.6), k.tone),
      layer(T.big(k.title, x0 + 36, y + 9, BODY), k.tone),
      layer(T.text(k.detail, x0 + 36, y + 24), 'mid'),
    ]
    for (const l of toast) out.push(...fade(l, step4(a)))
    return out
  },
  foot: lt => {
    const i = Math.min(TOASTS.length - 1, Math.floor(lt / TO.slot)), s = lt - i * TO.slot
    return [s < TO.enter ? 'SAVING' : TOASTS[i].word, `${i + 1}/${TOASTS.length}`]
  },
})
