/**
 * The oldschool board's feedback card: the effect from src/engine/oldschool/feedback.ts, a frame filming itself, its
 * border fed by one red source. The texture is a fixed-dt sim replayed from a known start, so any t gives the same frame.
 */
import { feedbackQuad, feedbackSim, feedbackSpin, sampleTexture } from '../../engine/oldschool/feedback'
import { dsin } from '../../engine/noise/dmath'
import { simPhase, simStep, simView } from '../../engine/sim/sim'
import { layer, type WidgetPreset } from '../types'
import { ACTIVE, BODY_BOTTOM, BODY_TOP, CREDIT_FEEDBACK, IDLE, MID, VALUE, caption, footer, frac, pad, plate, tile } from './oldschool-kit'

const K = 2

// ── 05 ECHO ── the article's loop on a 96-texel texture with a 12-texel border and its rotation, each copy faded by .82
// (the article: .75) and read as black off the texture, so copies don't tile. The border starts as a thin line and a
// row of dashes; a red block runs round it, and every frame carries its trail inward.
const S = 96, BORDER = 12, DT = 1 / 20, SRC = 6, FADE = .82
/** Where the red block is at step n: once round the border band every 6 s, in texels (lower-left corner). */
function sourceAt(n: number): [number, number] {
  const k = frac(n * DT / 6) * 4, side = Math.floor(k), f = k - side, span = S - BORDER, lo = (BORDER - SRC) / 2
  const along = lo + f * span
  return side === 0 ? [along, lo] : side === 1 ? [lo + span, along] : side === 2 ? [lo + span - f * span, lo + span] : [lo, lo + span - f * span]
}
/** The article's spin; a narrower zoom than its .8 ± .3, so every copy is smaller than the last and the frame stays in view. */
const zoom = (t: number) => .86 + .1 * dsin(.2 * t)
const echo = feedbackSim({
  size: S, border: BORDER, dt: DT, lead: 6, period: 42, every: 40, wrap: 'clear', fade: FADE, zoom,
  init: tex => {
    // the frame: a thin line round the outside, a row of dashes inside it
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const edge = Math.min(i, j, S - 1 - i, S - 1 - j), along = Math.max(i, j)
      if (edge < 2 || (edge >= 6 && edge < 8 && along % 8 < 5)) tex[j * S + i] = edge < 2 ? .7 : .45
    }
  },
  source: (tex, size, n) => {
    const [x0, y0] = sourceAt(n)
    for (let j = Math.floor(y0); j < y0 + SRC; j++) for (let i = Math.floor(x0); i < x0 + SRC; i++) tex[(((j % size) + size) % size) * size + (((i % size) + size) % size)] = 1
  },
})
/** The card's sim, for tests (reset, replay). */
export const echoSim = echo
export const osEcho: WidgetPreset = {
  id: 'os-echo', name: 'Oldschool Echo', label: 'ECHO', ...tile, credit: CREDIT_FEEDBACK,
  layers: ctx => {
    const n = simStep(echo, ctx.t), tex = simView(echo, ctx.t), tt = n * DT, a = feedbackSpin(tt), s = zoom(tt)
    const [sx0, sy0] = sourceAt(n), uv: [number, number] = [0, 0]
    // the body is square: screen x, y ∈ [−1, 1] over the 120 body rows, centred
    const half = (BODY_BOTTOM - BODY_TOP) / 2, cy = (BODY_TOP + BODY_BOTTOM) / 2
    const body = plate(K, (x, y, ink) => {
      const px = (x - 71.5) / half, py = (cy - y) / half
      if (px < -1.2 || px > 1.2) return
      feedbackQuad(px, py, a, s, uv)
      const v = sampleTexture(tex, S, uv[0], uv[1], 'clear')
      // the source itself, where the texture shows it (wrapped like the read)
      const ti = uv[0] * S, tj = uv[1] * S
      if (ti >= sx0 && ti < sx0 + SRC && tj >= sy0 && tj < sy0 + SRC) { ink.v = 1; ink.tone = ACTIVE; return }
      if (v < .06) return
      ink.v = v; ink.tone = v > .62 ? VALUE : v > .3 ? IDLE : MID
    })
    return [
      caption(`FADE .${Math.round(FADE * 100)}`),
      layer(body),
      ...footer(`FRAME ${pad(n, 4)}`, `LOOP ${pad(simPhase(echo, ctx.t) * 100, 2)}%`),
    ]
  },
}
