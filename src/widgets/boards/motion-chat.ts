/**
 * Motion chat: a typing indicator that grows into the reply, and a message going out through sending, sent
 * and read. The red is the live moment of each: the contact's dot while they type, the read ticks.
 */
import type { Layer } from '../../engine/types'
import { layer } from '../types'
import { BODY, PRESS, T, at, dimmed, fade, frac, loopCard, outCubic, outline, span, spriteAt, step4 } from './motion-kit'

/** Width in cells of body text (1.3 lattice). */
const bodyW = (s: string) => ([...s].length * 6 - 1) * BODY.lattice
const BUBBLE = { h: 22, r: 11, pad: 8 }
/** A chat bubble at (x,y) sized to `text`, outline then text. */
const bubble = (text: string, x: number, y: number, line: 'mid' | 'idle', ink: 'value' | 'idle'): Layer[] => [
  layer(outline(x, y, bodyW(text) + 2 * BUBBLE.pad, BUBBLE.h, BUBBLE.r), line),
  layer(T.big(text, x + BUBBLE.pad, y + BUBBLE.h / 2 - 4.5, BODY), ink),
]

// ── TYPING ──────────────────────────────────────────────────────────────────
/**
 * You asked a question. A bubble of three dots appears and the dots wave while the other side types; then
 * the bubble stretches to the reply's width and the words come in.
 */
const TY = { start: .6, pop: .15, stop: 3.2, grow: .25, x: 6, y: 78, w: 44, period: 6.6 }
const ASK = 'ARE YOU NEAR?', REPLY = 'TWO MINUTES'
export const typingCard = loopCard({
  id: 'mo-typing', name: 'Typing', period: TY.period, settled: 5, fps: 24,
  draw: lt => {
    const typing = lt >= TY.start && lt < TY.stop, out: Layer[] = [
      layer(T.big('NADIA', 6, 16, BODY), 'value'),
      layer(T.dots([[6 + bodyW('NADIA') + 5, 20]], 5), typing ? 'active' : 'mid'),
      layer(T.text(typing ? 'TYPING' : 'ONLINE', 6, 29), 'mid'),
      layer(T.dotLine(6, 40, 138, 40, { spacing: 3.3, size: 1 }), 'faint'),
      ...bubble(ASK, 138 - bodyW(ASK) - 2 * BUBBLE.pad, 46, 'mid', 'value'),
    ]
    if (lt < TY.start) return out
    const full = bodyW(REPLY) + 2 * BUBBLE.pad, g = outCubic(span(lt, TY.stop, TY.grow)), w = Math.round(TY.w + g * (full - TY.w))
    out.push(...fade(layer(outline(TY.x, TY.y, w, BUBBLE.h, BUBBLE.r), 'idle'), span(lt, TY.start, TY.pop)))
    if (typing) {
      // the wave: each dot rises in turn, whole cells; the raised one is brighter
      for (let i = 0; i < 3; i++) {
        const lift = Math.max(0, Math.sin(lt * 1.6 * 2 * Math.PI - i * .9)), y = TY.y + BUBBLE.h / 2 - Math.round(lift * 3)
        out.push(...fade(layer(T.dots([[TY.x + 12 + i * 10, y]], 5), lift > .5 ? 'value' : 'idle'), span(lt, TY.start, TY.pop)))
      }
    } else if (g >= 1) {
      out.push(...fade(layer(T.big(REPLY, TY.x + BUBBLE.pad, TY.y + BUBBLE.h / 2 - 4.5, BODY), 'value'), span(lt, TY.stop + TY.grow, .2)))
      out.push(layer(T.text('21:04', TY.x, TY.y + BUBBLE.h + 6), 'mid'))
    }
    return out
  },
  foot: lt => (lt < TY.start ? ['WAITING', 'SENT 21:03'] : lt < TY.stop ? ['TYPING', `${(lt - TY.start).toFixed(1)} S`] : ['REPLIED', '1 NEW']),
})

// ── SEND ────────────────────────────────────────────────────────────────────
/**
 * A short reply is typed into the field and sent: the button sinks, the words fly up into a bubble, and the
 * status under it goes SENDING, then one tick for SENT, then two red ticks for READ.
 */
const SEND = { type: .2, typed: 1.2, press: 1.6, fly: 1.8, flight: .4, sent: 3, read: 4.4, period: 7.2 }
const MSG = 'AT 8, OK?', FIELD = { x: 6, y: 104, w: 102, h: 22 }, BTN = { cx: 126, cy: 115, r: 11 }
const ARROW = ['...#...', '..###..', '.#.#.#.', '...#...', '...#...', '...#...', '...#...']
const OUT = { x: 138 - bodyW(MSG) - 2 * BUBBLE.pad, y: 46 }
type SendState = 'DRAFT' | 'TYPING' | 'SENDING' | 'SENT' | 'READ'
const sendState = (lt: number): SendState =>
  lt < SEND.type ? 'DRAFT' : lt < SEND.fly ? 'TYPING' : lt < SEND.sent ? 'SENDING' : lt < SEND.read ? 'SENT' : 'READ'
export const sendCard = loopCard({
  id: 'mo-send', name: 'Send', period: SEND.period, settled: 6,
  draw: lt => {
    const st = sendState(lt), n = Math.min(MSG.length, Math.floor(span(lt, SEND.type, SEND.typed) * MSG.length))
    const inField = lt < SEND.fly, pv = lt >= SEND.press && lt < SEND.fly ? PRESS : 1
    const tx = FIELD.x + 8, ty = FIELD.y + FIELD.h / 2 - 4.5
    const out: Layer[] = [
      ...bubble('DINNER?', 6, 18, 'mid', 'idle'),
      layer(outline(FIELD.x, FIELD.y, FIELD.w, FIELD.h, BUBBLE.r), 'mid'),
      layer(at(T.dotRing(BTN.cx, BTN.cy, BTN.r, { spacing: 2.6, size: 1.3 }), pv), n > 0 && inField ? 'value' : 'mid'),
      layer(dimmed(spriteAt(ARROW, BTN.cx + .5 - 5.6, BTN.cy + .5 - 5.6, 1.6), pv), n > 0 && inField ? 'value' : 'mid'),
    ]
    if (inField) {
      if (n > 0) out.push(layer(T.big(MSG.slice(0, n), tx, ty, BODY), 'value'))
      else out.push(layer(T.text('MESSAGE', tx, ty + 1), 'faint'))
      if (frac(lt / .9) < .55) { const cx = tx + n * 6 * BODY.lattice + 1; out.push(layer(T.dotLine(cx, ty - 1, cx, ty + 10, { spacing: 2.2, size: 1.4 }), 'value')) }
      return out
    }
    // the words fly from the field into the bubble, which draws in as they land
    const f = outCubic(span(lt, SEND.fly, SEND.flight)), bx = OUT.x + BUBBLE.pad, by = OUT.y + BUBBLE.h / 2 - 4.5
    out.push(layer(T.big(MSG, Math.round(tx + (bx - tx) * f), Math.round(ty + (by - ty) * f), BODY), 'value'))
    out.push(...fade(layer(outline(OUT.x, OUT.y, bodyW(MSG) + 2 * BUBBLE.pad, BUBBLE.h, BUBBLE.r), 'mid'), step4(span(lt, SEND.fly + SEND.flight * .6, .2))))
    if (f < 1) return out
    const sy = OUT.y + BUBBLE.h + 6
    if (st === 'SENDING') {
      const k = Math.floor(lt * 6) % 3
      out.push(layer(T.text('SENDING', 138, sy, { align: 'right' }), 'mid'))
      out.push(...[0, 1, 2].map(i => layer(T.dots([[80 + i * 5, sy + 3]], 1.8), i === k ? 'value' : 'faint')))
    } else {
      const word = st === 'SENT' ? 'SENT' : 'READ 21:04', x = 138 - [...word].length * 6 + 1
      out.push(layer(T.text(word, 138, sy, { align: 'right' }), 'mid'))
      const tone = st === 'READ' ? 'active' : 'value', tick = (x0: number) => layer(T.big('✓', x0, sy - 1, BODY), tone)
      out.push(...(st === 'READ' ? [tick(x - 14), tick(x - 9.5)] : [tick(x - 10)]))
    }
    return out
  },
  foot: lt => [sendState(lt), '21:04'],
})
