/**
 * Checks for the kinetic type board (#129, src/engine/kinetic, src/widgets/boards/kinetic*.ts):
 * - the word: the validator folds case and space, rejects a character outside the flap drum or the font, caps
 *   the length at 12; `?word=` parses; the twelve modules round-trip the word;
 * - each effect: its loop wraps (t and t ± one period give the same frame), it moves in between, and its first
 *   and last frames spell the word exactly (every pixel of the word once, at full value, nothing else);
 * - the cards: every dot on the screen sits on the card's one lattice, red only on the screen, the settled frame
 *   has no red but the caret, reduced motion holds the word, each card loops, a flap edit flips and lands,
 *   control boxes inside the grid, the determinism lint, and the frame time (warn-only).
 * Called from verify.ts (`kineticChecks(assert)`); also runnable alone: `npx tsx scripts/kinetic.ts`.
 */
import { DEFAULT_WORD, DRUM, WORD_MAX, parseWord, slotText, toSlots, wordData, wordOf, wordParam, wordPixels, wordWidth, type Frame } from '../src/engine/kinetic/word'
import { MAGNET, MELT, SHATTER, WAVE, magnetFrame, meltFrame, shatterFrame, waveFrame } from '../src/engine/kinetic/drift'
import { FLAP, SCRAMBLE, TYPE, flapFrame, scrambleFrame, typewriterFrame } from '../src/engine/kinetic/glyphs'
import { bitmapFont } from '../src/engine/fields/bitmapFont'
import { sampleLayersInto } from '../src/engine/sampler/gridSampler'
import { dot480 } from '../src/engine/theme/tokens'
import { withChrome, type WidgetPreset } from '../src/widgets'
import { kineticBoard } from '../src/widgets/boards/kinetic'
import { latticeFor } from '../src/widgets/boards/kinetic-kit'
import { sampleCard, type CtxExtra } from './lib/cards'
import { detLint } from './lib/detLint'
import { fmtLoaded, medianLoaded } from './lib/load'

type Assert = (name: string, cond: boolean, detail?: string) => void
const WORDS = ['KINETIC', 'A', 'HELLO WORLD', 'ABCDEFGHIJKL', 'GO 42!']
/** Every effect as (word, t) → frame; the flap reads the twelve module characters of the word. */
const EFFECTS: { name: string; period: number; frame: (w: string, t: number) => Frame; text: (w: string) => string }[] = [
  { name: 'melt', period: MELT.period, frame: meltFrame, text: w => w },
  { name: 'wave', period: WAVE.period, frame: waveFrame, text: w => w },
  { name: 'magnet', period: MAGNET.period, frame: (w, t) => magnetFrame(w, t), text: w => w },
  { name: 'shatter', period: SHATTER.period, frame: shatterFrame, text: w => w },
  { name: 'scramble', period: SCRAMBLE.period, frame: scrambleFrame, text: w => w },
  { name: 'typewriter', period: TYPE.period, frame: typewriterFrame, text: w => w },
  { name: 'flap', period: FLAP.period, frame: (w, t) => flapFrame(slotText(toSlots(w)), t), text: w => slotText(toSlots(w)) },
]
const PERIOD: Record<string, number> = { 'kt-flap': FLAP.period, 'kt-melt': MELT.period, 'kt-scramble': SCRAMBLE.period, 'kt-wave': WAVE.period, 'kt-type': TYPE.period, 'kt-magnet': MAGNET.period, 'kt-shatter': SHATTER.period }
const key = (f: Frame) => JSON.stringify(f)

export function kineticChecks(assert: Assert): void {
  // ── the word ───────────────────────────────────────────────────────────────────────────────────────
  {
    const cases: [string | null, string | null][] = [
      ['kinetic', 'KINETIC'], ['  hello   world ', 'HELLO WORLD'], ['go 42!', 'GO 42!'], ['ÄPFEL', null], ['A<B', null], ['DOT/480', null],
      ['', null], ['   ', null], [null, null], ['ABCDEFGHIJKLMNOP', 'ABCDEFGHIJKL'], ['ABCDEFGHIJK MNOP', 'ABCDEFGHIJK'],
    ]
    const wrong = cases.filter(([raw, want]) => parseWord(raw) !== want).map(([raw]) => JSON.stringify(raw))
    const drum = [...DRUM].every(ch => !!bitmapFont[ch]) && new Set(DRUM).size === DRUM.length
    assert('kinetic: word validator (upper-cases, folds spaces, rejects a character outside the drum or font, caps at 12)', wrong.length === 0 && drum && WORD_MAX === 12, wrong.join(', ') || `${DRUM.length} drum glyphs`)
    const params: [string, string][] = [['?word=hello', 'HELLO'], ['?word=GO+NOW', 'GO NOW'], ['?word=h%C3%A9', DEFAULT_WORD], ['', DEFAULT_WORD], ['?skin=oled&word=dot', 'DOT']]
    const badParam = params.filter(([q, w]) => wordParam(q) !== w).map(([q]) => q)
    const trip = WORDS.filter(w => wordOf(wordData(w)) !== w)
    assert('kinetic: ?word= parses, the twelve modules round-trip the word, all blank shows the default', !badParam.length && !trip.length && wordOf({}) === DEFAULT_WORD, [...badParam, ...trip].join(', '))
  }

  // ── the effects ────────────────────────────────────────────────────────────────────────────────────
  {
    const spells = (f: Frame, text: string) => {
      const want = new Set(wordPixels(text).map(p => `${p.x},${p.y}`)), got = f.cells.map(c => `${c.x},${c.y}`)
      return got.length === want.size && new Set(got).size === got.length && got.every(k => want.has(k)) && f.cells.every(c => c.v === 1 && c.tone === 'value')
    }
    const ends: string[] = [], loops: string[] = [], still: string[] = [], red: string[] = []
    for (const e of EFFECTS) for (const w of WORDS) {
      const P = e.period, text = e.text(w)
      if (!spells(e.frame(w, 0), text) || !spells(e.frame(w, P - 1e-3), text) || !spells(e.frame(w, 3 * P), text)) ends.push(`${e.name}/${w}`)
      // dyadic t: t + P is exact in binary, so the folded time is the same number
      for (const t of [.25, 1.25, 2.5, 3.75, P - .5]) if (key(e.frame(w, t)) !== key(e.frame(w, t + P)) || key(e.frame(w, t)) !== key(e.frame(w, t - 2 * P))) loops.push(`${e.name}/${w}@${t}`)
      const mids = [1.25, 1.5, 2.5, 3.25, 4.25, 5].filter(t => t < P).map(t => e.frame(w, t))
      if (!mids.some(f => !spells(f, text))) still.push(`${e.name}/${w}`)
      if (!mids.some(f => [...f.cells, ...f.marks].some(c => c.tone === 'active'))) red.push(`${e.name}/${w}`)
    }
    assert('kinetic: every effect\'s first and last frames spell the word exactly (each pixel once, full value, nothing else)', ends.length === 0, ends.join(', ') || `${EFFECTS.length} effects × ${WORDS.length} words`)
    assert('kinetic: every effect\'s loop wraps (t, t + P and t − 2P draw the same frame)', loops.length === 0, loops.join(', '))
    assert('kinetic: every effect moves the word mid-loop and shows its red', still.length === 0 && red.length === 0, [...still.map(s => `still ${s}`), ...red.map(s => `no red ${s}`)].join(', '))
    const det = detLint(['src/engine/kinetic/', 'src/widgets/boards/kinetic'])
    assert('det: no engine-specific Math in the kinetic effects or board (in the determinism lint)', !det.violations.length && det.scanned.length >= 7, det.violations.map(x => `${x.file}:${x.line} ${x.rule}`).join('; ') || `${det.scanned.length} files`)
  }

  // ── the cards ──────────────────────────────────────────────────────────────────────────────────────
  {
    const pitch = 2.25, onScreen = (y: number) => y / pitch >= 12 && y / pitch < 127
    const offGrid: string[] = [], strayRed: string[] = [], settledRed: string[] = [], reduced: string[] = [], loops: string[] = [], boxes: string[] = []
    for (const p of kineticBoard) {
      const k = p.id === 'kt-flap' ? 2 : latticeFor(wordWidth(DEFAULT_WORD))
      for (const t of [0, 1.25, 2.5, 3.75]) {
        const dots = sampleCard(p, t), screen = dots.filter(d => onScreen(d.y))
        // one lattice: every screen dot's centre is a whole number of lattice steps from the first one's
        const x0 = screen[0]?.x ?? 0, y0 = screen[0]?.y ?? 0, step = k * pitch
        const frac = (v: number) => Math.abs(v / step - Math.round(v / step))
        if (screen.some(d => frac(d.x - x0) > 1e-3 || frac(d.y - y0) > 1e-3)) offGrid.push(`${p.id}@${t}`)
        if (dots.some(d => d.color === dot480.dotActive && !onScreen(d.y))) strayRed.push(`${p.id}@${t}`)
        if (t === 0 && (dots.some(d => d.color === dot480.dotActive) !== (p.id === 'kt-type'))) settledRed.push(p.id)
      }
      const at = (t: number, extra: CtxExtra = {}) => JSON.stringify(sampleCard(p, t, p.style, undefined, extra))
      if (at(2.5, { reducedMotion: true }) !== at(0)) reduced.push(p.id)
      if (at(1.25) !== at(1.25 + PERIOD[p.id]) || at(3.75) !== at(3.75 + PERIOD[p.id])) loops.push(p.id)
      for (const c of p.controls ?? []) { const [x, y, w, h] = c.box; if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > p.grid.cols || y + h > p.grid.rows) boxes.push(`${p.id}:${c.key}`) }
    }
    assert('kinetic: on the grid (every dot on a card\'s screen sits on that card\'s one lattice, at t 0, 1.25, 2.5, 3.75)', offGrid.length === 0, offGrid.join(', '))
    assert('kinetic: one red (only on the screen; the settled word has none but the typewriter caret)', strayRed.length === 0 && settledRed.length === 0, [...strayRed, ...settledRed].join(', '))
    assert('kinetic: reduced motion holds the word, and every card loops on its period', reduced.length === 0 && loops.length === 0, [...reduced.map(s => `reduced ${s}`), ...loops.map(s => `loop ${s}`)].join(', '))
    assert('kinetic: control boxes are [col, row, width, height] inside the card grid', boxes.length === 0, boxes.join(', '))

    // a flap edit: on an interaction frame module 5 goes K → L, flips (a leaf in red) and lands on L
    const flap = kineticBoard[0], data = { ...wordData(DEFAULT_WORD) }, ix: CtxExtra = { hover: 'w5' }
    const edited = { ...data, w5: data.w5 + 1 }
    flap.layers({ ...ix, t: 20, data }); flap.layers({ ...ix, t: 20.01, data: edited })
    const mid = sampleCard(flap, 20.025, flap.style, undefined, { ...ix, data: edited }), end = sampleCard(flap, 20.2, flap.style, undefined, { ...ix, data: edited })
    const settledNew = sampleCard(flap, 0, flap.style, undefined, { ...ix, data: edited })
    const same = (a: typeof end, b: typeof end) => JSON.stringify(a.filter(d => onScreen(d.y))) === JSON.stringify(b.filter(d => onScreen(d.y)))
    assert('kinetic: a flap edit flips the module on its own (red leaf) and lands on the new character', mid.some(d => d.color === dot480.dotActive) && same(end, settledNew) && wordOf(edited) !== DEFAULT_WORD, `${wordOf(edited)}`)

    const frame = (p: WidgetPreset, t: number) => sampleLayersInto(withChrome(p)({ t, data: { ...p.defaults } }), p.grid, p.style, dot480)
    for (const p of kineticBoard) {
      for (let i = 0; i < 4; i++) frame(p, i / 12)
      const r = medianLoaded(i => frame(p, 1.5 + i * .37), 9)
      assert(`kinetic: ${p.id} frame ≤ 4 ms (layers + sample, median warm × load)`, r.ms <= 4 * r.load, `${fmtLoaded(r)}, ${frame(p, 1.5).n} dots`)
    }
  }
}

const self = process.argv[1]?.replace(/\\/g, '/')
if (self && import.meta.url.endsWith(self.split('/').slice(-2).join('/'))) {
  const { assert, done } = (await import('./lib/check')).checker('kinetic')
  kineticChecks(assert)
  done()
}
