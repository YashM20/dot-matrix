/**
 * Board — Type: the variable dot type system (src/engine/type). Stroke-font glyphs are signed
 * distances to hand-authored centrelines, set on coarser lattices for big sizes, so weight, width,
 * roundness and slant are just numbers. Six TILE cards: a variable-axes specimen with knobs, an
 * SDF morph through DOTS → 480 → FIELD, an LED marquee with sub-cell scrolling, a kinetic
 * headline (wave, bounce, breathing weight), a word-to-word dot migration, and a "type anything"
 * card that sets whatever text `data.text` holds. The board's one red is the marquee's ON AIR dot.
 */
import type { Control } from '../../engine/context'
import { clamp } from '../../engine/math'
import { ease } from '../../engine/motion'
import { migrate, migrationLayers } from '../../engine/migrate'
import type { Layer } from '../../engine/types'
import {
  bounceGlyphs, breathe, glyphs, marqueeField, typeField, typeFrame, typeLayout, typeMigration, typeMorph, typeWidth, waveGlyphs, weightWave,
  frameDots, type TypeFrame, type TypeOptions,
} from '../../engine/type'
import { textOf } from '../../data/text'
import { TAU, TILE, layer, layoutFor, tileStyle, type WidgetPreset } from '../types'

const T = layoutFor(TILE)
type Pt = [number, number]
const tile = { chrome: 'dots', grid: TILE, style: tileStyle } as const
const clamp01 = (x: number) => clamp(x, 0, 1)
/** A lattice frame whose origin keeps lattice dots on whole card cells from the card's left edge. */
const frame = (k: number, row: number) => typeFrame(TILE, k, [0, row])
/** Text centred on the card on frame `fr`, cap line at lattice row `row`. */
const centred = (fr: TypeFrame, row: number, o: Omit<TypeOptions, 'grid'>): TypeOptions => ({ ...o, grid: fr.grid, col: fr.colOf(71.5), row, align: 'center' })

// ── 01 VARIABLE ─────────────────────────────────────────────────────────────
// A specimen that answers three knobs: weight, width and roundness. "GO" on a 2× lattice, a
// pangram at text size under it, the knobs' 270° dotted tracks at the bottom (the components-board
// knob in miniature), each with its axis tag.
const KN = { y: 108, r: 13, xs: [26, 72, 118], start: (TAU * 5) / 8, sweep: (TAU * 3) / 4 }
const AXES = [{ key: 'wght', tag: 'WGHT', label: 'Weight' }, { key: 'wdth', tag: 'WDTH', label: 'Width' }, { key: 'rond', tag: 'ROND', label: 'Roundness' }] as const
const knob = (cx: number, v: number, hot: boolean): Layer[] => {
  const ring = { spacing: 2.6, size: 1.3, start: KN.start }, a = KN.start + v * KN.sweep
  return [
    layer(T.dotRing(cx, KN.y, KN.r, { ...ring, sweep: KN.sweep }), hot ? 'idle' : 'mid'),
    layer(T.dotRing(cx, KN.y, KN.r, { ...ring, sweep: Math.max(1e-6, v * KN.sweep), size: 1.8 }), 'value'),
    layer(T.dots([[cx + (KN.r - 6) * Math.sin(a), KN.y - (KN.r - 6) * Math.cos(a)]], 3.4), 'value'),
  ]
}
const SPEC = frame(2, 14)
export const typeAxesCard: WidgetPreset = {
  id: 'type-axes', name: 'Variable', label: '01  VARIABLE', group: 'text', ...tile,
  defaults: { wght: .55, wdth: .5, rond: .7 },
  controls: AXES.map((ax, i): Control => ({ key: ax.key, kind: 'knob', box: [KN.xs[i] - KN.r - 5, KN.y - KN.r - 5, 2 * KN.r + 10, 2 * KN.r + 10], label: ax.label })),
  layers: ctx => {
    const d = ctx.data, axes = { weight: clamp01(d.wght), width: clamp01(d.wdth), roundness: clamp01(d.rond) }
    return [
      SPEC.layer(typeField('GO', centred(SPEC, 0, { size: 21, ...axes }))),
      layer(typeField('QUICK FOX JUMPS', { grid: TILE, col: 71.5, row: 66, size: 9, align: 'center', ...axes }), 'idle'),
      ...AXES.flatMap((ax, i) => [
        ...knob(KN.xs[i], axes[(['weight', 'width', 'roundness'] as const)[i]], ctx.hover === ax.key || ctx.focus === ax.key),
        layer(T.text(ax.tag, KN.xs[i], 130, { align: 'center' }), ctx.focus === ax.key ? 'value' : 'idle'),
      ]),
    ]
  },
}

// ── 02 MORPH ────────────────────────────────────────────────────────────────
// DOTS → 480 → FIELD → DOTS: each word holds, then its signed distance blends into the next one's,
// letter by letter (the left columns resolve first). Under it, the pair and a dotted progress rail.
const WORDS = ['DOTS', '480', 'FIELD'], HOLD = 1.4, FLOW = 1.6, CYCLE = HOLD + FLOW
const MOR = frame(2.5, 34), MOR_OPTS = centred(MOR, 0, { size: 16, weight: .55, roundness: .7 })
export const typeMorphCard: WidgetPreset = {
  id: 'type-morph', name: 'Morph', label: '02  MORPH', group: 'text', ...tile, animated: true,
  layers: ({ t }) => {
    const n = WORDS.length, i = Math.floor(t / CYCLE) % n, tau = t % CYCLE, k = tau < HOLD ? 0 : clamp01((tau - HOLD) / FLOW)
    const a = WORDS[i], b = WORDS[(i + 1) % n], rail: Pt[] = Array.from({ length: 23 }, (_, j) => [17 + j * 5, 118])
    const lit = Math.round(k * (rail.length - 1))
    return [
      MOR.layer(typeMorph(a, b, k, { ...MOR_OPTS, sweep: .45 })),
      layer(T.text(`${a} > ${b}`, 72, 104, { align: 'center' }), 'idle'),
      layer(T.dots(rail.slice(0, lit + 1), 1.6), 'value'),
      layer(T.dots(rail.slice(lit + 1), 1.2), 'faint'),
      layer(T.text(`SDF ${k.toFixed(2)}`, 72, 128, { align: 'center' }), 'mid'),
    ]
  },
}

// ── 03 MARQUEE ──────────────────────────────────────────────────────────────
// An LED panel: a 3× lattice of unlit LEDs, a hinted message scrolling through it in quarter-LED
// steps (part-lit LEDs carry the sub-cell motion), and a 1× ticker running the other way below.
// The live dot (chrome) is the board's red: ON AIR.
const LED = frame(3, 24), LED_ROWS = 23, LED_COLS = LED.grid.cols
const LED_MSG = 'DOT/480 — FIELD-BASED DOT MATRIX', LED_MSG2 = 'NOW BOARDING  GATE 480  ON TIME', TICK_MSG = 'SUB-CELL SCROLL · 1/4 LED PER STEP · SAME T, SAME FRAME'
const ledPanel = LED.layer(Object.assign((_u: number, v: number) => (v * (LED.grid.rows - 1) < LED_ROWS - .5 ? .22 : 0), { bounds: [0, 0, LED_COLS - 1, LED_ROWS - 1] as [number, number, number, number] }), 'faint')
export const typeMarqueeCard: WidgetPreset = {
  id: 'type-marquee', name: 'Marquee', label: '03  MARQUEE', group: 'text', ...tile, animated: true, live: true,
  layers: ({ t }) => [
    ledPanel,
    LED.layer(marqueeField(LED_MSG, t, { grid: LED.grid, row: 1, size: 9, weight: .62, roundness: .55, speed: 7, sub: 4, gap: 12, from: 0, to: LED_COLS - 1 })),
    LED.layer(marqueeField(LED_MSG2, t + 2.3, { grid: LED.grid, row: 13, size: 9, weight: .62, roundness: .55, speed: 4.5, sub: 4, gap: 12, from: 0, to: LED_COLS - 1 }), 'idle'),
    layer(T.hrule(4, 101, 136, 2), 'faint'),
    layer(marqueeField(TICK_MSG, t, { grid: TILE, row: 107, size: 7, weight: .45, speed: -10, sub: 4, gap: 18, from: 4, to: 139 }), 'mid'),
    layer(T.hrule(4, 119, 136, 2), 'faint'),
    layer(T.text('7 LED/S', 4, 131), 'mid'),
    layer(T.text('1/4 STEP', 139, 131, { align: 'right' }), 'mid'),
  ],
}

// ── 04 KINETIC ──────────────────────────────────────────────────────────────
// A headline in motion: WAVE rides a travelling sine with a weight wave chasing it, BOUNCE hops
// letter by letter and squashes on landing, BREATHE inhales and exhales its weight.
const KIN1 = frame(2, 16), KIN2 = frame(1.5, 66)
export const typeKineticCard: WidgetPreset = {
  id: 'type-kinetic', name: 'Kinetic', label: '04  KINETIC', group: 'text', ...tile, animated: true,
  layers: ({ t }) => [
    KIN1.layer(typeField('WAVE', centred(KIN1, 2, { size: 15, roundness: .8, glyph: glyphs(waveGlyphs(t, { amp: 2, period: 1.8, phase: .14 }), weightWave(t, { min: .25, max: .9, period: 1.8, spread: .14 })) }))),
    KIN2.layer(typeField('BOUNCE', centred(KIN2, 3, { size: 11, weight: .55, glyph: bounceGlyphs(t, { height: 3, period: 1.2, stagger: .1, weight: .55 }) })), 'idle'),
    layer(typeField('BREATHE', { grid: TILE, col: 71.5, row: 106, size: 13, align: 'center', hint: false, weight: breathe(t, { min: .3, max: .9, period: 3.2 }) }), 'mid'),
  ],
}

// ── 05 FLIGHT ───────────────────────────────────────────────────────────────
// Word to word by dot migration: every lit dot of one word flies (Hilbert-rank pairs, a staggered
// sweep, bowed paths) to a dot of the next. The count is the number of dots in flight.
const FLIGHT = ['HELLO', 'WORLD', 'DOT 480'], F_HOLD = 1.4, F_FLY = 1.3, F_CYCLE = F_HOLD + F_FLY
const FLY = frame(2.5, 40), FLY_OPTS = { ...centred(FLY, 0, { size: 13, weight: .5, roundness: .75 }) }
export const typeFlightCard: WidgetPreset = {
  id: 'type-flight', name: 'Flight', label: '05  FLIGHT', group: 'text', ...tile, animated: true,
  layers: ({ t }) => {
    const n = FLIGHT.length, i = Math.floor(t / F_CYCLE) % n, tau = t % F_CYCLE, a = FLIGHT[i], b = FLIGHT[(i + 1) % n]
    const m = typeMigration(a, b, FLY, FLY_OPTS, { stagger: .35, arc: .18, ease: ease.emphasized })
    const p = tau < F_HOLD ? 0 : clamp01((tau - F_HOLD) / F_FLY)
    const word = p <= 0 ? a : p >= 1 ? b : ''
    return [
      ...(word ? [FLY.layer(typeField(word, { ...FLY_OPTS, grid: FLY.grid }))] : migrationLayers(m, p)),
      layer(T.text(`${m.count} DOTS`, 72, 118, { align: 'center' }), p > 0 && p < 1 ? 'value' : 'idle'),
      layer(T.text(`${a} > ${b}`, 72, 128, { align: 'center' }), 'mid'),
    ]
  },
}

// ── 06 TYPE ANYTHING ────────────────────────────────────────────────────────
// Whatever `data.text` (a `textId`) holds, set as large as it fits: words wrap into up to three
// lines, the biggest lattice and size that fit win. A caret blinks after the last letter. When the
// text changes, the old text's dots fly into the new one (the board-wide "type anything" moment).
interface Fit { fr: TypeFrame; lines: string[]; size: number; row0: number; lead: number }
const AREA = { top: 16, bottom: 120, left: 6, right: 138 }
function wrap(words: string[], fits: (line: string) => boolean, max: number): string[] | null {
  const lines: string[] = []
  for (const w of words) {
    const cur = lines[lines.length - 1]
    if (cur !== undefined && fits(`${cur} ${w}`)) lines[lines.length - 1] = `${cur} ${w}`
    else { if (!fits(w) || lines.length === max) return null; lines.push(w) }
  }
  return lines
}
const fitCache = new Map<string, Fit>()
function fit(text: string): Fit {
  const hit = fitCache.get(text)
  if (hit) return hit
  const words = text.split(/\s+/).filter(Boolean)
  // the largest cap (lattice × size) that fits in ≤ 3 lines, strokes ≥ 2 dots (size ≥ 9); ties go to the bigger dots
  let best: Fit | undefined
  for (const k of [3, 2.5, 2, 1.5, 1.25, 1]) for (let size = 15; size >= 9; size--) {
    if (best && k * size <= best.fr.lattice * best.size) continue
    const fr = frame(k, AREA.top), lead = Math.round(size * 1.45), w = (AREA.right - AREA.left - 2 * k - 2) / k
    const lines = wrap(words, line => typeWidth(line, { grid: fr.grid, size, weight: .55 }) <= w, 3)
    const h = lines ? (lines.length - 1) * lead + size : Infinity
    if (lines && h * k <= AREA.bottom - AREA.top) best = { fr, lines, size, lead, row0: Math.round(((AREA.bottom - AREA.top) / k - h) / 2) }
  }
  best ??= { fr: frame(1, AREA.top), lines: [text.slice(0, 20)], size: 7, lead: 10, row0: 0 }
  if (fitCache.size > 32) fitCache.delete(fitCache.keys().next().value!)
  fitCache.set(text, best)
  return best
}
const anyOpts = (f: Fit, j: number): TypeOptions => ({ ...centred(f.fr, f.row0 + j * f.lead, { size: f.size, weight: .55, roundness: .7 }), col: f.fr.colOf(71.5 - f.fr.lattice) })
const anyField = (f: Fit) => {
  const fs = f.lines.map((line, j) => typeField(line, anyOpts(f, j)))
  const out = Object.assign((u: number, v: number) => { let m = 0; for (const g of fs) { const x = g(u, v); if (x > m) m = x } return m }, {
    bounds: fs.reduce<[number, number, number, number]>((b, g) => (g.bounds ? [Math.min(b[0], g.bounds[0]), Math.min(b[1], g.bounds[1]), Math.max(b[2], g.bounds[2]), Math.max(b[3], g.bounds[3])] : b), [Infinity, Infinity, -Infinity, -Infinity]),
  })
  return out
}
/** Last text shown and when it changed (board time), so a new string flies in from the old one. */
let shown: { text: string; prev: string; since: number } | undefined
const ANY_FLY = 1.1
export const DEFAULT_TEXT = 'TYPE ANYTHING'
export const typeAnythingCard: WidgetPreset = {
  id: 'type-anything', name: 'Type Anything', label: '06  TYPE ANYTHING', group: 'text', ...tile, animated: true,
  defaults: { text: 0 },
  layers: ({ t, data }) => {
    const text = (textOf(data.text, DEFAULT_TEXT).trim() || DEFAULT_TEXT).toUpperCase()
    if (!shown || t < shown.since) shown = { text, prev: text, since: t }
    else if (shown.text !== text) shown = { text, prev: shown.text, since: t }
    const f = fit(text), p = clamp01((t - shown.since) / ANY_FLY), out: Layer[] = []
    if (shown.prev !== text && p < 1) {
      const g = fit(shown.prev), from = frameDots(anyField(g), g.fr), to = frameDots(anyField(f), f.fr)
      out.push(...migrationLayers(flight(shown.prev, text, from, to), p))
    } else out.push(f.fr.layer(anyField(f)))
    // caret: a two-dot-wide bar after the last line, blinking at 1 Hz (steady while flying)
    const last = typeLayout(f.lines[f.lines.length - 1], anyOpts(f, f.lines.length - 1)), cx = f.fr.cardX(last.ink[2] + 1.5), top = f.fr.cardY(last.ink[1]), bottom = f.fr.cardY(last.ink[3])
    const caret: Pt[] = []
    for (let y = top; y <= bottom + 1e-6; y += f.fr.lattice) caret.push([cx + f.fr.lattice, y])
    if (p < 1 || Math.floor(t * 2) % 2 === 0) out.push(layer(T.dots(caret, f.fr.lattice), 'idle'))
    out.push(layer(T.text(`${[...text].length} CHARS`, 4, 132), 'mid'))
    return out
  },
}
let flightMemo: { key: string; m: ReturnType<typeof typeMigration> } | undefined
function flight(a: string, b: string, from: ReturnType<typeof frameDots>, to: ReturnType<typeof frameDots>) {
  const key = `${a}\u0000${b}`
  if (flightMemo?.key !== key) flightMemo = { key, m: migrate(from, to, { stagger: .3, arc: .15, ease: ease.emphasized }) }
  return flightMemo.m
}

export const typeBoard: WidgetPreset[] = [typeAxesCard, typeMorphCard, typeMarqueeCard, typeKineticCard, typeFlightCard, typeAnythingCard]
