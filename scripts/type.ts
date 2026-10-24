/**
 * C8 dot type checks (src/engine/type + the `type` board): stroke font coverage, hinted crispness,
 * axes, kerning, SDF morph ends, quantized marquee, the Node CJK skip, determinism and the board.
 */
import { STROKE_CHARS, canRasterText, kernUnits, marqueeField, marqueeOffset, strokeGlyph, typeAt, typeField, typeLayout, typeMorph, typeWidth } from '../src/engine/type'
import { cellU, sampleLayers } from '../src/engine/sampler/gridSampler'
import { dot480 } from '../src/engine/theme/tokens'
import { boardById, withChrome } from '../src/widgets'
import type { Field } from '../src/engine/types'

type Assert = (name: string, cond: boolean, detail?: string) => void
const G = { cols: 120, rows: 30 }
const cells = (f: Field, g = G) => { const out: number[] = []; for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) out.push(f(cellU(c, g.cols), cellU(r, g.rows))); return out }
const ink = (f: Field, g = G) => cells(f, g).reduce((s, v) => s + v, 0)

export function typeChecks(assert: Assert) {
  // font: A–Z, 0–9 and punctuation parse to non-empty strokes inside a sane box
  const need = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:;!?-+/()%'
  const bad = [...need].filter(ch => { const g = strokeGlyph(ch); return !g || !g.strokes.length || g.w < 0 || g.w > 9.5 || g.y0 < -1.5 || g.y1 > 11.5 })
  assert(`type font: ${STROKE_CHARS.length} stroke glyphs, every A–Z / 0–9 / punctuation glyph parses inside its box`, bad.length === 0 && strokeGlyph('a') === strokeGlyph('A'), bad.join(''))

  // hinting: an H at size 14 has stems of whole dots (every stem-body cell is exactly 0 or 1); terminals
  // carry only the roundness axis' corner softening (≥ .75, a full dot after quantizing)
  const H = typeLayout('H', { grid: G, col: 2, row: 2, size: 14, weight: .5 })
  const stem: number[] = []; for (let r = 3; r < 15; r++) for (let c = H.ink[0] - 1; c < H.ink[0] + H.thickness + 1; c++) stem.push(typeAt(H, c, r))
  const ends = [typeAt(H, H.ink[0], 2), typeAt(H, H.ink[0], 15)]
  assert('type hint: hinted stems are whole dots, cap box is exactly `size` rows', stem.every(v => v === 0 || v === 1) && H.ink[3] - H.ink[1] + 1 === 14 && typeAt(H, H.ink[0], 1) === 0 && ends.every(v => v >= .75) && typeAt(H, H.ink[0], 16) === 0, `T ${H.thickness}, terminals ${ends.map(v => v.toFixed(2))}`)

  // axes: weight adds ink, width widens, slant leans the top right, roundness squares the O's corner
  const at = (o: object) => typeField('DOTS', { grid: G, col: 2, row: 4, size: 14, ...o })
  const wLight = ink(at({ weight: .1 })), wBold = ink(at({ weight: .9 }))
  const narrow = typeWidth('DOTS', { grid: G, size: 14, width: 0 }), wide = typeWidth('DOTS', { grid: G, size: 14, width: 1 })
  const I = (sl: number) => typeLayout('I', { grid: G, col: 20, row: 4, size: 14, slant: sl })
  const topX = (l: ReturnType<typeof typeLayout>) => { for (let c = 0; c < G.cols; c++) if (typeAt(l, c, 4) >= .5) return c; return -1 }
  const O = (r: number) => typeLayout('O', { grid: G, col: 2, row: 2, size: 20, weight: .4, roundness: r })
  const corner = (l: ReturnType<typeof typeLayout>) => typeAt(l, l.ink[0] + 1, l.ink[1] + 1)
  assert('type axes: weight, width, slant and roundness each move the glyphs the right way', wBold > wLight * 2 && wide > narrow * 1.5 && topX(I(.25)) > topX(I(0)) + 2 && corner(O(0)) > .5 && corner(O(1)) < .5,
    `ink ${wLight.toFixed(0)}→${wBold.toFixed(0)}, width ${narrow}→${wide}`)

  // kerning: AV / LT / TA tuck in, HH / OO / NN don't; AV sets narrower than AH
  assert('type kerning: profile kerning tightens AV, LT, TA and leaves straight / round pairs alone',
    kernUnits('A', 'V') < -1 && kernUnits('L', 'T') < -1 && kernUnits('T', 'A') < -1 && kernUnits('H', 'H') === 0 && kernUnits('O', 'O') === 0 && kernUnits('N', 'N') === 0 && typeWidth('AV', { grid: G, size: 14 }) < typeWidth('AH', { grid: G, size: 14 }),
    `AV ${kernUnits('A', 'V').toFixed(2)}, LT ${kernUnits('L', 'T').toFixed(2)}`)

  // SDF morph: k = 0 / 1 reproduce both words' masks; halfway has ink; the sweep starts on the left
  const mo = { grid: G, col: 4, row: 4, size: 16 }, A = typeField('DOTS', mo), B = typeField('480', mo)
  const m0 = cells(typeMorph('DOTS', '480', 0, mo)), m1 = cells(typeMorph('DOTS', '480', 1, mo)), mh = cells(typeMorph('DOTS', '480', .5, { ...mo, sweep: .5 }))
  const same = (x: number[], f: Field) => { const y = cells(f); return x.every((v, i) => (v >= .5) === (y[i] >= .5)) }
  assert('type morph: SDF blend ends on both words, mid-sweep shape has ink', same(m0, A) && same(m1, B) && mh.filter(v => v >= .5).length > 30)

  // marquee: offsets are whole 1/sub steps, the same t gives the same frame, the loop repeats after a period
  const mq = (t: number) => cells(marqueeField('HELLO WORLD', t, { grid: G, row: 4, size: 12, speed: 8, sub: 4, gap: 10 }))
  const period = (typeWidth('HELLO WORLD', { grid: G, size: 12 }) + 10) / 8
  const eq = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9)
  assert('type marquee: quantized sub-cell offsets, repeatable frames, seamless loop',
    marqueeOffset(.1, 8, 4) === .75 && eq(mq(.5), mq(.5 + .01)) && !eq(mq(.5), mq(.6)) && eq(mq(.25), mq(.25 + period)) && mq(.53).some(v => v > 0 && v < 1))

  // CJK / emoji: Node has no canvas, so they are skipped (no throw, no ink), Latin around them still sets
  const cjk = typeLayout('A字🙂B', { grid: G, size: 12 })
  assert('type CJK path: skipped headlessly (stroke font only), Latin still set', !canRasterText() && cjk.skipped === 2 && cjk.glyphs.length === 2)

  // determinism + speed: same input, same cells; a 4-letter TILE-size word samples quickly
  const T0 = performance.now(); for (let i = 0; i < 10; i++) ink(at({ weight: i / 10 })); const ms = (performance.now() - T0) / 10
  assert('type field: deterministic, fast enough to re-set every frame', eq(cells(at({})), cells(at({}))) && ms < 40, `${ms.toFixed(2)} ms per 120×30 word`)

  // board: every card renders, only the marquee's live dot is red
  const board = boardById('type')!, reds: string[] = []
  const counts = board.items.map(p => {
    const dots = sampleLayers(withChrome(p)({ t: 1.3, data: { ...p.defaults } }), p.grid, p.style, dot480).filter(d => d.opacity > 0)
    if (dots.some(d => d.color === dot480.dotActive)) reds.push(p.id)
    return dots.length
  })
  assert(`type board: ${board.items.length} cards render, one red (the marquee's ON AIR dot)`, counts.every(n => n > 100) && reds.join() === 'type-marquee', `dots ${counts.join('/')}`)
}
