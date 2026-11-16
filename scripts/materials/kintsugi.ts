/**
 * Materials checks, kintsugi group (scripts/materials.ts `--only kintsugi`): the kintsugi plate on `/workshop/`
 * (docs/living-matter/X-advanced.md #3). The fracture: every crack is connected and ends at the rim or at an older
 * seam, the shards tile the broken piece with no gap (each one 4-connected), a break never crosses an old seam, and two
 * fresh runs agree bit for bit (the determinism lint covers the file). The card: red only while a seam is filling, the
 * repair completes (every crack a seam, the shards home), a tap breaks the piece under the finger and 6 s of idle
 * heal back to the loop, and the frame costs.
 */
import { fracture, type Fracture } from '../../src/engine/matter/kintsugi'
import { worldReset } from '../../src/engine/physics/world'
import { sampleLayers } from '../../src/engine/sampler/gridSampler'
import { dot480 } from '../../src/engine/theme/tokens'
import type { Pointer } from '../../src/engine/context'
import { withChrome, type WidgetPreset } from '../../src/widgets/types'
import { kintsugiHooks as K } from '../../src/widgets/boards/workshop-kintsugi'
import { workshopBoard } from '../../src/widgets/boards/workshop'
import { DET_PATHS, detLint } from '../lib/detLint'
import { fmtLoaded, medianLoaded, onceLoaded } from '../lib/load'
import { type Assert, same, type MaterialsOptions } from './util'
import { POINTER, atClock } from './board'

const COLS = 144, ROWS = 144
const frame = (p: WidgetPreset, t: number, pointers?: Pointer[]) => atClock(() => sampleLayers(withChrome(p)({ t, data: { ...p.defaults }, pointers }), p.grid, p.style, dot480))

/** The crack network's faults: components and loose ends that touch neither the rim nor an old seam. */
function crackFaults(f: Fracture, plate: Uint8Array, old: Uint8Array | null): string[] {
  const bad: string[] = [], seen = new Uint8Array(COLS * ROWS)
  const rimOrSeam = (i: number) => {
    const x = i % COLS, y = (i / COLS) | 0
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const q = (y + dy) * COLS + x + dx
      if (!plate[q] || (old && old[q])) return true
    }
    return false
  }
  const nbs = (i: number) => {
    const x = i % COLS, y = (i / COLS) | 0, out: number[] = []
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && f.crack[(y + dy) * COLS + x + dx]) out.push((y + dy) * COLS + x + dx)
    return out
  }
  for (const s of f.order) {
    if (seen[s]) continue
    let anchored = false
    const stack = [s]
    seen[s] = 1
    while (stack.length) {
      const c = stack.pop()!, nb = nbs(c)
      if (rimOrSeam(c)) anchored = true
      else if (nb.length <= 1) bad.push(`loose end at ${c % COLS},${(c / COLS) | 0}`)
      for (const q of nb) if (!seen[q]) { seen[q] = 1; stack.push(q) }
    }
    if (!anchored) bad.push(`a crack network at ${s % COLS},${(s / COLS) | 0} reaches neither rim nor seam`)
  }
  return bad
}
/** Gaps in the tiling: plate cells in the piece without a shard, shards in more than one piece, a shard on an old seam. */
function tileFaults(f: Fracture, plate: Uint8Array, old: Uint8Array | null): string[] {
  const bad: string[] = []
  for (let i = 0; i < COLS * ROWS; i++) {
    if (!plate[i] && f.shard[i] !== -1) bad.push(`shard off the plate at ${i}`)
    if (plate[i] && !(old && old[i]) && f.shard[i] < 0) bad.push(`gap at ${i % COLS},${(i / COLS) | 0}`)
    if (old && old[i] && f.shard[i] !== -1) bad.push(`shard on an old seam at ${i}`)
  }
  for (let s = 1; s <= f.count; s++) {
    let first = -1
    for (let i = 0; i < COLS * ROWS && first < 0; i++) if (f.shard[i] === s) first = i
    const seen = new Uint8Array(COLS * ROWS), stack = [first]
    let n = 0
    seen[first] = 1
    while (stack.length) {
      const c = stack.pop()!
      n++
      for (const q of [c - 1, c + 1, c - COLS, c + COLS]) if (!seen[q] && f.shard[q] === s) { seen[q] = 1; stack.push(q) }
    }
    if (n !== f.area[s]) bad.push(`shard ${s} in pieces (${n} of ${f.area[s]} joined)`)
  }
  return bad
}

export async function kintsugiChecks(assert: Assert, opts: MaterialsOptions): Promise<void> {
  const card = workshopBoard.find(p => p.id === 'mat-kintsugi')!, plate = K.plateMask()
  // the fracture, over the first breaks of a few pristine cycles and a tap on a mended plate
  const cases: { name: string; f: Fracture; old: Uint8Array | null }[] = []
  for (const c of [0, 1, 4]) for (let b = 0; b < K.KIN.breaks; b++) { const br = K.pristineBreak(c, b); cases.push({ name: `cycle ${c} break ${b}`, f: br.f, old: br.prev?.seams ?? null }) }
  const tapped = K.breakOf(K.pristineBreak(0, 2), [40, 100], 5)
  cases.push({ name: 'a tap on cycle 0', f: tapped.f, old: tapped.prev!.seams })
  const cracks = cases.flatMap(k => crackFaults(k.f, plate, k.old).map(e => `${k.name}: ${e}`))
  assert('kintsugi: cracks are connected and every one ends at the rim or at an older seam (10 breaks)', !cracks.length, cracks.slice(0, 3).join('; ') || cases.map(k => k.f.count).join('/') + ' shards')
  const tiles = cases.flatMap(k => tileFaults(k.f, plate, k.old).map(e => `${k.name}: ${e}`))
  assert('kintsugi: the shards tile the plate (no gap, none on an old seam, each shard one 4-connected piece)', !tiles.length, tiles.slice(0, 3).join('; '))
  // a later break stays inside the piece it struck: it never changes a cell outside it
  const later = cases.filter(k => k.old)
  const inside = later.every(k => { for (let i = 0; i < COLS * ROWS; i++) if (k.f.shard[i] === 0 && k.f.crack[i]) return false; return k.f.count >= 2 })
  assert('kintsugi: a break on a mended plate stops at its seams (only the struck piece breaks, into ≥ 2 shards)', inside, later.map(k => k.f.count).join('/'))
  // determinism: two fresh runs of the same break, bit for bit; the lint covers the file
  const o = { cols: COLS, rows: ROWS, plate, impact: [60, 80] as const, seed: 9 }
  const a = fracture(o), b = fracture(o)
  assert('kintsugi: a break is deterministic (two fresh runs: shards, reach and tangents bit for bit)', same(a.shard, b.shard) && same(a.reach, b.reach) && same(a.tx, b.tx) && same(a.order, b.order), `${a.count} shards, ${a.order.length} crack cells`)
  const det = detLint(['src/engine/matter/kintsugi'])
  assert('kintsugi: the fracture is in the determinism lint (by file) and clean', (DET_PATHS as readonly string[]).includes('src/engine/matter/kintsugi') && det.scanned.length === 1 && !det.violations.length, det.violations.map(v => `${v.file}:${v.line} ${v.rule}`).join('; '))
  const h0 = K.breakHash(0, 0), h1 = K.breakHash(0, 0)
  assert('kintsugi: pristine break hashes are stable (the browser probe compares them with Chrome)', h0 === h1 && h0 !== K.breakHash(0, 1), `${h0.toString(16)} / ${K.breakHash(0, 1).toString(16)}`)

  // the card: red only while a seam fills; the repair completes
  const red = (t: number, ps?: Pointer[]) => frame(card, t, ps).filter(d => d.color === dot480.dotActive).length
  const at = (t: number) => K.pristineAt(t)
  const struck = [-2.5, -2].map(t => red(t)), filling = red(0), mended = red(1.5)
  assert('kintsugi: t = 0 is mid-repair (a red seam front); no red while the plate is struck or once mended', filling > 0 && struck.every(r => r === 0) && mended === 0 && at(0).beat.phase === 'mending' && at(1.5).beat.phase === 'mended',
    `red ${struck.join('/')} struck, ${filling} filling, ${mended} mended`)
  const done = at(1.5), allSeams = done.b.f.order.every(i => done.b.seams[i] === 1) && done.beat.part === 0 && done.beat.fill >= done.b.f.maxReach
  // every seam of the plate (this break's and the older ones) drawn in value, under a sun and a torch
  const seams: number[] = []
  for (let i = 0; i < COLS * ROWS; i++) if (done.b.seams[i]) seams.push(i)
  const lights = [[-.5, .4, .77], { at: [30, 120, 44], falloff: 180 }] as const
  const shown = Math.min(...lights.map(L => { const s = K.shadeBreak(done.b, done.beat, 0, L as never); return seams.filter(i => s.tones[i] === K.BAND.VALUE && s.values.data[i] > .8).length }))
  assert('kintsugi: the repair completes: every crack is a seam, the shards are home, and every seam draws in the brightest neutral', allSeams && shown === seams.length, `${shown}/${seams.length} seam cells in value`)
  const sizes = [0, 1, 2].map(k => K.pristineBreak(3, k).pieces)
  assert('kintsugi: a pristine cycle breaks the plate three times, each break adding pieces', sizes[0] > 1 && sizes[1] > sizes[0] && sizes[2] > sizes[1], sizes.join(' → '))

  // a tap breaks the piece under the finger; 6 s of idle heal back to the loop
  const w = K.kintsugiWorld()
  worldReset(w)
  frame(card, 30, [POINTER(100, 50)])
  for (let k = 0; k < 3; k++) frame(card, 30.02 + k / 30, [POINTER(100, 50, true)])
  const taps = w.live[1], live = w.mode, mine = K.liveAt(w.live).b
  let t = 30.2, redSeen = 0
  while (t < 35) { t += 1 / 12; redSeen += red(t) }
  const settled = K.liveAt(w.live).beat.phase
  let healed = t
  while (w.mode !== 'pristine' && healed < 50) { healed += 1 / 12; frame(card, healed) }
  const shard = mine.f.shard[50 * COLS + 100]
  assert('kintsugi: a tap breaks the plate there, mends it (a red front on the way), and 6 s idle heal it back to the loop', taps === 1 && live === 'live' && mine.f.count >= 2 && shard >= 1 && redSeen > 0 && settled === 'mended' && w.mode === 'pristine' && healed - 30.1 < 12,
    `${mine.f.count} shards, ${settled} by 4 s, pristine again at t ${healed.toFixed(1)}`)
  worldReset(w)

  const bake = onceLoaded(() => fracture({ ...o, seed: 77 }).count)
  assert('kintsugi: a break bakes in ≤ 20 ms (× load)', bake.ms <= 20 * bake.load, `${fmtLoaded(bake)}, ${bake.value} shards`)
  if (!opts.quick) {
    for (const t0 of [-2.5, 0]) for (let i = 0; i < 3; i++) frame(card, t0 + i / 12)
    const strike = medianLoaded(i => frame(card, -2.6 + i / 12), 9), mend = medianLoaded(i => frame(card, -.5 + i / 12), 13)
    assert('kintsugi: a frame ≤ 4 ms while it breaks and while it mends (median, warm, × load)', strike.ms <= 4 * strike.load && mend.ms <= 4 * mend.load, `${fmtLoaded(strike)} / ${fmtLoaded(mend)}`)
  }
}
