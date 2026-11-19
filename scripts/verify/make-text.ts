/**
 * MAKE text folds to the dot font (#412), one check per way text gets in: the TEXT field (`typedText`, what
 * `LayerFields.tsx` stores), text typed on the canvas (`typeText` through the store, with a stand-in input), and an
 * imported card or document (`cardFromJSON` / `docFromJSON` through `validateCard`). Accents fold, ß becomes SS, and
 * what the font lacks is dropped and named in a note. `sanitize` keeps its live-feed behaviour.
 * In `pnpm verify`; on its own: `pnpm exec tsx scripts/verify/make-text.ts`.
 */
import { foldText, sanitize, undrawnNote } from '../../src/data/text'
import { typedText } from '../../src/components/editor/direct'
import { addFrame, addLayer, blankCard, docFromJSON, docToJSON, EDITOR_VERSION, frameById, type EditorDoc } from '../../src/components/editor/doc'
import { useEditor } from '../../src/components/editor/store'
import { bindTypingInput, commitTyping, startTyping, typeText } from '../../src/components/editor/typing'
import { cardFromJSON, cardToJSON, historyOf, textLayer, type StudioLayer, type TextLayer } from '../../src/components/studio/doc'
import { checker, type Assert } from '../lib/check'

/** Typed into MAKE: lower case, accents, ß, a curly quote and a tilde. */
const TYPED = 'Café Straße ~ “x”'
const FOLDED = 'CAFE STRASSE  X'

export function makeTextChecks(assert: Assert) {
  const f = foldText(TYPED)
  assert('make text: foldText upper-cases, folds accents and ß, keeps spacing, names what it drops', f.text === FOLDED && f.dropped.join('') === '~“”', `${JSON.stringify(f.text)} [${f.dropped.join('')}]`)
  assert('make text: sanitize still collapses and trims for live feeds', sanitize('  Zoë   Björk ~ ') === 'ZOE BJORK' && sanitize('Ñandú') === 'NANDU')
  assert('make text: the font draws " ; [ ] | @ and sanitize keeps them (#412)', sanitize('Say "hi"; [a|b] @home') === 'SAY "HI"; [A|B] @HOME')
  assert('make text: the note names the characters, and says nothing when all draw', undrawnNote(f.dropped) === 'the dot font has no ~ “ ”' && undrawnNote(foldText('ok').dropped) === '')

  // the TEXT field stores typedText: folded, at most 64 glyphs (ß can grow it)
  assert('make text: the TEXT field folds what you type (É → E, ß → SS) and caps it at 64', typedText(TYPED) === FOLDED && typedText('ß'.repeat(40)).length === 64, typedText(TYPED))

  // text typed on the canvas, through the store, with a stand-in for the hidden input
  const st = useEditor.getState
  let d: EditorDoc = addFrame({ kind: 'dot480.editor', v: EDITOR_VERSION, name: 't', frames: [] }, blankCard({ cols: 80, rows: 80, pitch: 4 }), { at: { x: 0, y: 0 } }).doc
  const tx = textLayer('OLD', { params: { col: 4, row: 4 } }), FID = d.frames[0].id
  d = addLayer(d, FID, tx)
  useEditor.setState({ h: historyOf(d), note: '' })
  const fake = { value: '', selectionStart: 0 as number | null, focus() {}, select() {}, blur() {}, setSelectionRange(a: number) { this.selectionStart = a } }
  bindTypingInput(fake as unknown as HTMLInputElement)
  startTyping(FID, tx.id)
  fake.value = 'straße~'; fake.selectionStart = 7; typeText(fake.value)
  const textNow = () => (frameById(st().h.present, FID)!.card.layers.find(l => l.id === tx.id) as TextLayer).params.text
  const typed = textNow(), note = st().note, input = `${fake.value}|${fake.selectionStart}`
  typeText('STRASSE', true) // inside an IME composition the input is left alone
  const composing = fake.value
  bindTypingInput(null); commitTyping()
  assert('make text: typing on the canvas folds into the layer, names the dropped ~ in the note, and the input follows with its caret',
    typed === 'STRASSE' && note === 'the dot font has no ~' && input === 'STRASSE|7' && composing === 'STRASSE', `${typed} / ${note} / ${input}`)

  // an imported card and document: text layers (and spec text layers) fold, and the dropped characters are named
  const card = blankCard({ cols: 40, rows: 20, pitch: 4 })
  const spec: StudioLayer = { id: 'sp', name: 'spec', kind: 'spec', tone: 'preset', z: 1, blend: 'normal', visible: true, spec: { kind: 'text', text: 'Señor @home', at: [1, 1] } }
  card.layers = [textLayer(TYPED, { id: 'tl' }), spec]
  const json = cardToJSON(card), gone = new Set<string>(), back = cardFromJSON(json, gone)
  const texts = (ls: StudioLayer[]) => ls.map(l => (l.kind === 'text' ? l.params.text : l.kind === 'spec' && l.spec.kind === 'text' ? l.spec.text : '')).join('|')
  const docGone = new Set<string>(), doc = docFromJSON(docToJSON(addFrame({ kind: 'dot480.editor', v: EDITOR_VERSION, name: 'd', frames: [] }, JSON.parse(json)).doc), docGone)
  assert('make text: an imported card or document folds its text layers and names what the font lacks',
    texts(back.layers) === `${FOLDED}|SENOR @HOME` && [...gone].join('') === '~“”' && texts(doc.frames[0].card.layers) === texts(back.layers) && [...docGone].join('') === [...gone].join(''),
    `${texts(back.layers)} [${[...gone].join('')}]`)
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('verify/make-text.ts')) {
  const { assert, done } = checker('make text')
  makeTextChecks(assert)
  done('make text: all checks passed')
}
