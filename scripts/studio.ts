/**
 * Dot Studio checks (P6-D): the document model round-trips (JSON + storage), undo / redo, preset
 * reference stacks draw exactly like the presets, DOTS and spec v1 import, blends, the timeline
 * tracks and state firing. `pnpm verify` runs them through `studioChecks()`; the browser side is
 * `scripts/studio-browser.ts` (needs the dev server).
 */
import { sampleLayers } from '../src/engine/sampler/gridSampler'
import { dot480 } from '../src/engine/theme/tokens'
import { widgetById, withChrome } from '../src/widgets'
import { EXAMPLES } from '../src/components/dwitter/examples'
import { cardFromJSON, cardPreset, cardToJSON, commit, compileCard, historyOf, importDots, importPreset, irLayer, librarySave, libraryList, loadLocal, newCard, normalizeZ, redo, saveLocal, textLayer, undo, validateCard, type StudioCard } from '../src/components/studio/doc'
import { presetAsSpecCard, specV0, specV1 } from '../src/components/studio/adapter'
import { firingFrame, sampleCard, stateData, timelineFrame, timelinePhase } from '../src/components/studio/playback'

type Assert = (name: string, cond: boolean, detail?: string) => void
const lit = (ds: { opacity: number; r: number }[]) => ds.filter(d => d.opacity > 0 && d.r > 0).length
const sig = (ds: { x: number; y: number; r: number; opacity: number; color: string }[]) => ds.map(d => `${d.x.toFixed(2)},${d.y.toFixed(2)},${d.r.toFixed(3)},${d.opacity.toFixed(3)},${d.color}`).join(';')
const memKV = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } }

function scratch(): StudioCard {
  const c = newCard('scratch')
  c.layers = normalizeZ([
    irLayer('.5 + .5 * sin(u * 18 - t * 3) * (.4 + data.level)', { name: 'a', tone: 'mid', lattice: 2 }),
    irLayer('smoothstep(.42, .1, length(u - .5, v - .55))', { name: 'b', blend: 'multiply' }),
    textLayer('DOT', { name: 't', params: { col: 20, row: 110 }, lattice: 2 }),
  ])
  c.data = { level: .3 }
  c.states = [{ name: 'idle', data: { level: .2 } }, { name: 'high', data: { level: 1 } }]
  c.machine = [{ from: 'idle', to: 'high', on: 'press', mask: 'radial', ease: 'emphasized', ms: 400 }]
  return c
}

export function studioChecks(assert: Assert) {
  // document model: JSON round trip, validation errors, storage
  const c = scratch(), json = cardToJSON(c), back = cardFromJSON(json)
  assert('studio: document JSON round trip is exact', cardToJSON(back) === json && JSON.stringify(validateCard(structuredClone(c))) === JSON.stringify(c))
  const bad = (mut: (x: StudioCard) => void) => { const x = structuredClone(c); mut(x); try { validateCard(x); return '' } catch (e) { return (e as Error).message } }
  const errs = [bad(x => { x.kind = 'nope' as 'dot480.studio' }), bad(x => { x.grid.cols = 9999 }), bad(x => { (x.layers[0] as { kind: string }).kind = 'evil' }), bad(x => { x.layers[1].id = x.layers[0].id }), bad(x => { x.states = [] }), bad(x => { x.transitions.enter.mask = 'zz' as 'bayer' })]
  let notJSON = ''; try { cardFromJSON('{oops') } catch (e) { notJSON = (e as Error).message }
  assert('studio: malformed documents are refused with a reason', errs.every(Boolean) && /not JSON/.test(notJSON), errs.join(' | '))
  const kv = memKV(); saveLocal(c, kv); librarySave(c, kv); librarySave(scratch(), kv)
  assert('studio: localStorage save / load / library', cardToJSON(loadLocal(kv)!) === json && libraryList(kv).length === 2 && libraryList(kv)[1].id === c.id)

  // compile + sample: 2 IR layers (multiply folds b into a) + text
  const comp = compileCard(c), ls = comp.layers({ t: .5, data: { level: .3 } })
  const dots = sampleLayers(ls, c.grid, c.style, dot480)
  assert('studio: card compiles to engine layers (blend folds into the layer below)', ls.length === 2 && comp.errors.size === 0 && comp.keys.includes('level') && comp.usesT && lit(dots) > 200, `${ls.length} layers, ${lit(dots)} lit`)
  const broken = structuredClone(c); (broken.layers[0] as { src: string }).src = '.5 + (u'
  const bc = compileCard(broken, new Map())
  assert('studio: an IR error is reported per layer with line:col', bc.errors.size === 1 && bc.errors.get(broken.layers[0].id)!.line === 1)

  // undo / redo with coalescing
  let h = historyOf(c)
  const named = (n: string) => ({ ...h.present, name: n })
  h = commit(h, named('a'), 'name', 1000); h = commit(h, named('ab'), 'name', 1200); h = commit(h, named('abc'), 'name', 1400)
  h = commit(h, { ...h.present, data: { level: .9 } }, undefined, 5000)
  const u1 = undo(h), u2 = undo(u1), r1 = redo(u2)
  assert('studio: undo / redo (typing coalesces into one step)', h.past.length === 2 && u1.present.name === 'abc' && u2.present.name === 'scratch' && r1.present.name === 'abc' && redo(r1).present.data.level === .9 && undo(u2) === u2)

  // 5 presets as read-only reference stacks: identical dots to the preset itself
  const ids = ['level-03', 'afterlight', 'thermal-monitor', 'ui-toggle', 'timer']
  const same = ids.map(id => {
    const p = widgetById(id)!, card = importPreset(id), pc = cardPreset(card), grid = { ...p.grid, pitch: p.grid.pitch ?? 4 }
    const want = sampleLayers(withChrome(p)({ t: 0, data: { ...p.defaults } }), grid, p.style, dot480)
    const got = sampleLayers(pc.layers({ t: 0, data: { ...card.data } }), pc.grid, pc.style, dot480)
    return { id, ok: card.layers.every(l => l.kind === 'preset-layer') && sig(got) === sig(want) && lit(got) > 0, n: card.layers.length }
  })
  assert('studio: 5 presets import as reference stacks that draw exactly like the preset', same.every(s => s.ok), same.map(s => `${s.id}:${s.n}${s.ok ? '' : ' ✗'}`).join(' '))

  // DOTS import + spec v1 round trip + spec v0
  const ex = EXAMPLES[0], dc = importDots(ex)
  assert('studio: a DOTS program imports as a one-layer card', dc.layers.length === 1 && dc.layers[0].kind === 'ir' && lit(sampleCard({ card: dc, compiled: compileCard(dc), theme: dot480 }, 1, {})) > 100)
  const { spec } = specV1.toSpec(c), again = specV1.fromSpec(JSON.parse(JSON.stringify(spec)))
  const s1 = sig(sampleCard({ card: c, compiled: compileCard(c), theme: dot480 }, 0, c.data)), s2 = sig(sampleCard({ card: again, compiled: compileCard(again), theme: dot480 }, 0, again.data))
  assert('studio: card spec v1 out and back draws the same frame (states + transitions kept)', s1 === s2 && again.states.length === 2 && again.transitions.enter.mask === c.transitions.enter.mask, `${spec.layers.map(l => l.kind).join(',')}`)
  const ref = presetAsSpecCard(widgetById('afterlight')!)
  assert('studio: a preset imports as an editable spec v1 stack', ref.layers.length > 0 && lit(sampleCard({ card: ref, compiled: compileCard(ref), theme: dot480 }, 0, ref.data)) > 100, ref.layers.map(l => l.kind).join(','))
  const v0 = specV0.toSpec(c)
  assert('studio: spec v0 keeps the plain IR layers and reports the rest', v0.spec.layers.length === 1 && v0.dropped.length === 2)

  // timeline tracks + state firing
  const inp = { card: c, compiled: comp, theme: dot480 }
  const full = lit(timelineFrame(inp, .9)), enter = lit(timelineFrame(inp, .05)), exit = lit(timelineFrame(inp, 2.995))
  const changing = timelinePhase(c, 1.4)
  assert('studio: timeline enter / change / exit use the engine masks', enter < full && exit < full && changing.track === 'change' && changing.p > 0 && changing.p < 1, `enter ${enter}, full ${full}, exit ${exit}`)
  const f = { edge: c.machine[0], start: 0 }, mid = firingFrame(inp, 0, f, 60), done = firingFrame(inp, 0, f, 400)
  assert('studio: firing an edge dissolves state A into state B', !mid.done && done.done && sig(done.dots) === sig(sampleCard(inp, 0, stateData(c, 'high'))) && sig(mid.dots) !== sig(done.dots))
  const t0 = performance.now(); for (let i = 0; i < 20; i++) timelineFrame(inp, i * .15); const ms = (performance.now() - t0) / 20
  assert('studio: a 144² timeline frame (2 IR + text) samples in ≤ 16 ms', ms <= 16, `${ms.toFixed(2)} ms`)
}
