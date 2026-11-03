/** Materials checks, workshop and tilt groups (scripts/materials.ts): M3's board, its per-card invariants, and M3.10 tilt on both boards. */
import { readFileSync } from 'node:fs'
import { matcapMatrix, twill } from '../../src/engine/matter'
import { hourOf, lightDir, sunAt, type Vec3 } from '../../src/engine/light'
import { worldAt, worldReset } from '../../src/engine/physics/world'
import { sceneLight } from '../../src/engine/light/input'
import { sampleLayers } from '../../src/engine/sampler/gridSampler'
import { dot480 } from '../../src/engine/theme/tokens'
import type { Pointer } from '../../src/engine/context'
import { TILE, withChrome, type WidgetPreset } from '../../src/widgets/types'
import { lightBoard } from '../../src/widgets/boards/light'
import { workshopBoard, workshopHooks, workshopSources } from '../../src/widgets/boards/workshop'
import { lightTrace } from '../../src/widgets/boards/materials-shared'
import { materialsBoard } from '../../src/widgets/boards/materials'
import { bucketLight, lightOfBucket } from '../../src/engine/light/input'
import { dla } from '../../src/engine/algo/dla'
import { voronoiBorder2 } from '../../src/engine/noise/voronoi'
import { knitAt } from '../../src/engine/matter/knit'
import { leatherAt, leatherCells } from '../../src/engine/matter/leather'
import { sandRelax, sandVolume, sandRake } from '../../src/engine/matter/sand'
import { DET_PATHS, detLint } from '../lib/detLint'
import { fmtLoaded, medianLoaded, onceLoaded, type Loaded } from '../lib/load'
import { type Assert, same, DEG, type MaterialsOptions } from './util'
import { POINTER, atClock } from './board'

// ── workshop (M3, M §5) ───────────────────────────────────────────────────────────────────────────────
/** Workshop cards with no red at rest: purely material (denim, paper, leather) or red only while touched (sand, mercury, thread). */
const WS_NO_ACCENT_AT_REST = new Set(['mat-denim', 'mat-paper', 'mat-leather', 'mat-sand', 'mat-mercury', 'mat-thread'])
const WS_NEVER_RED = new Set(['mat-denim', 'mat-paper', 'mat-leather'])
const WS_PHYSICS = new Set(['mat-sand', 'mat-mercury', 'mat-thread'])
const wsFrame = (p: WidgetPreset, t: number, pointers?: Pointer[], data?: Record<string, number>) =>
  sampleLayers(withChrome(p)({ t, data: { ...p.defaults, ...data }, pointers }), p.grid, p.style, dot480)

export async function workshopChecks(assert: Assert, opts: MaterialsOptions): Promise<void> {
  const H = workshopHooks, board = workshopBoard, byId = (id: string) => board.find(p => p.id === id)!
  // cold: a warm copy of the three modules draws every card (so the engine is hot, as in the app), then a fresh copy's
  // first frame is timed: its bakes and its own code's first run
  type Cards = WidgetPreset[]
  const copy = async (tag: string): Promise<Cards | null> => {
    const stamp = `${tag}${Date.now()}`, files = ['workshop', 'workshop-live', 'workshop-physics', 'workshop-plate', 'workshop-stone', 'workshop-frost']
    const mods = await Promise.all(files.map(f => import(`../../src/widgets/boards/${f}.ts?cold=${stamp}`).catch(() => null) as Promise<Record<string, unknown> | null>))
    if (mods.some(m => !m)) return null
    const cards = mods.flatMap(m => Object.values(m!).filter((v): v is WidgetPreset => !!v && typeof v === 'object' && 'layers' in v && 'id' in v))
    return board.map(p => cards.find(q => q.id === p.id) ?? p)
  }
  const warmCopy = opts.quick ? null : await copy('wa'), coldCopy = opts.quick ? null : await copy('wb')
  for (const p of lightBoard) for (let i = 0; i < 3; i++) wsFrame(p, i)
  if (warmCopy) atClock(() => warmCopy.forEach(p => wsFrame(p, 0)))
  const cold = opts.quick ? [] : atClock(() => (coldCopy ?? board).map(p => [p.id, onceLoaded(() => wsFrame(p, 0))] as const))

  const key = (p: WidgetPreset, t: number) => atClock(() => JSON.stringify(wsFrame(p, t)))
  assert('workshop board: every card is a pure function of t (same t, same dots, any order)', board.every(p => [0, 1.3, 7.7, 3600].every(t => key(p, t) === key(p, t))) && key(board[0], 7.7) === (key(board[1], 1), key(board[0], 7.7)))
  let accent = true, detail = ''
  for (const p of board) for (const t of [0, 1.3, 6]) {
    const ls = atClock(() => withChrome(p)({ t, data: { ...p.defaults } })), red = ls.filter(l => l.tone === 'active')
    const dots = atClock(() => wsFrame(p, t)).filter(d => d.color === dot480.dotActive)
    const own = red.length ? new Set(sampleLayers(red, p.grid, p.style, dot480).map(d => `${d.x.toFixed(2)},${d.y.toFixed(2)}`)) : new Set<string>()
    if (red.length > 1 || !dots.every(d => own.has(`${d.x.toFixed(2)},${d.y.toFixed(2)}`)) || !red.every(l => !!l.sites)) { accent = false; detail = `${p.id} t ${t}: ${red.length} red layers` }
    if (t === 0 && !dots.length && !WS_NO_ACCENT_AT_REST.has(p.id)) { accent = false; detail = `${p.id}: no accent at rest` }
    if (WS_NO_ACCENT_AT_REST.has(p.id) && dots.length) { accent = false; detail = `${p.id}: red in the pristine run at t ${t}` }
  }
  assert('workshop board: one accent per card, on the live element (knit, wood, ice at rest; sand, mercury, thread only while touched; denim, paper, leather never: accentAtRest false)', accent, detail)
  const dim = board.some(p => [0, 1.3, 6].some(t => atClock(() => withChrome(p)({ t, data: { ...p.defaults } })).some(l => l.tone === 'activeDim') || atClock(() => wsFrame(p, t)).some(d => d.color === dot480.dotActiveDim)))
  assert('workshop board: no activeDim (was-active is size contrast until the owner rules, M §10.6)', !dim)
  assert('workshop board: quantized (every card style has quantizeSteps ≥ 2)', board.every(p => (p.style.quantizeSteps ?? 0) >= 2))
  const keys = ['lightSrc', 'lightAz', 'lightEl', 'tx', 'ty']
  assert('workshop board: every card declares lightSrc/lightAz/lightEl/tx/ty in defaults; sand, mercury and thread also gx/gy (0, 1)', board.every(p => keys.every(k => p.defaults && k in p.defaults) && (!WS_PHYSICS.has(p.id) || (p.defaults!.gx === 0 && p.defaults!.gy === 1))) && workshopSources.length === 1)
  assert('workshop board: one row a card, three columns (WORKSHOP manifest title, play group): M3\'s nine, then XM\'s plate, stone and frost', board.length === 12 && new Set(board.map(p => p.id)).size === 12)
  // a red that is never a material: denim (no redline: §10.2), paper and leather (no awl: §10.3) never show it, whatever the input
  const neverRed = [...WS_NEVER_RED].every(id => [0, 1.3, 6].every(t => !atClock(() => wsFrame(byId(id), t, [POINTER(70, 70)], { k: 1 })).some(d => d.color === dot480.dotActive)))
  assert('workshop board: denim, paper and leather draw no red, hovered or pressed (the owner options stay off)', neverRed)
  const warm = (p: WidgetPreset, hover: boolean) => atClock(() => {
    for (let i = 0; i < 4; i++) wsFrame(p, i / 60, hover ? [POINTER(30 + i, 60)] : undefined)
    return medianLoaded(i => wsFrame(p, 5.5 + i / 60, hover ? [POINTER(34 + i, 60 + (i % 3))] : undefined), 13)
  })
  const rows = opts.quick ? [] : board.map(p => ({ id: p.id, rest: warm(p, false), hover: warm(p, true), cold: cold.find(c => c[0] === p.id)![1] }))
  for (const w of [H.sandWorld(), H.mercuryWorld(), H.threadWorld(), H.plateWorld()]) worldReset(w)
  const within = (r: Loaded, budget: number) => r.ms <= budget * r.load
  if (!opts.quick) assert('workshop board: frame ≤ 4 ms (median, warm, × load), no pointer and a hovering torch', rows.every(r => within(r.rest, 4) && within(r.hover, 4)), rows.map(r => `${r.id} ${fmtLoaded(r.rest)}/${fmtLoaded(r.hover)}`).join(', '))
  if (!opts.quick) assert('workshop board: cold first frame ≤ 30 ms (× load)', !!coldCopy && rows.every(r => within(r.cold, 30)), rows.map(r => `${r.id} ${fmtLoaded(r.cold, 1)}`).join(', ') + (coldCopy ? '' : ' (no fresh module graph)'))
  if (opts.bench) {
    console.log('  workshop --bench (ms):   card            cold    warm   hover   (each ÷ its load)')
    for (const r of rows) console.log(`                           ${r.id.padEnd(14)} ${(r.cold.ms / r.cold.load).toFixed(1).padStart(6)} ${(r.rest.ms / r.rest.load).toFixed(2).padStart(7)} ${(r.hover.ms / r.hover.load).toFixed(2).padStart(7)}`)
  }
  const det = detLint(['src/engine/matter/sand', 'src/engine/matter/mercury', 'src/engine/matter/thread'])
  assert('workshop: sand, mercury and thread are in the determinism lint (registered by file) and clean', ['sand', 'mercury', 'thread'].every(f => (DET_PATHS as readonly string[]).includes(`src/engine/matter/${f}`)) && det.scanned.length === 3 && !det.violations.length,
    det.violations.map(v => `${v.file}:${v.line} ${v.rule}`).join('; ') || det.scanned.join(', '))

  // ── knit ──
  {
    const o = H.KNIT_OPTS, out = new Float64Array(3), b = new Float64Array(3)
    let periodic = true
    // plain stockinette columns 0 … 6 (x + 6 stays out of the purl frame at column 7)
    for (let y = 0; y < 64; y++) for (let x = 0; x < 36; x++) { knitAt(x, y, o, out); knitAt(x, y + 4, o, b); if (out[0] !== b[0]) periodic = false; knitAt(x + 6, y, o, b); if (out[0] !== b[0]) periodic = false }
    // one V: the two legs meet at the foot (the middle of the stitch is a crest on its bottom row, a gap on its top row)
    knitAt(2.5, 3, o, out); const foot = out[0]; knitAt(2.5, 0, o, out); const top = out[0]
    const s0 = H.knitState(H.knitProgress(0)), red = reds(byId('mat-knit'), 0)
    assert('knit: stitch V period 4 cells (6 across: two 3-cell legs), the V open at the top and closed at the foot', periodic && foot > .7 && top < .5 * foot, `foot ${foot.toFixed(2)}, top ${top.toFixed(2)}`)
    assert('knit: t = 0 is a finished row, the working loop (the one red) at its end; it knits a stitch per 0.4 s', s0.k === H.KNIT.N && s0.shift === 0 && red.length > 0 && H.knitState(H.knitProgress(4)).k === 9 && H.knitState(H.knitProgress(.2)).shift > 0,
      `t 0: ${s0.k}/${H.KNIT.N}, t 4: ${H.knitState(H.knitProgress(4)).k} stitches`)
    let fast = 0
    for (let i = 0; i < 12 * 20; i++) fast = Math.max(fast, Math.abs(H.knitState(H.knitProgress((i + 1) / 12)).x - H.knitState(H.knitProgress(i / 12)).x))
    const w = H.knitWorld()
    worldReset(w)
    const at = (t: number, ps: Pointer[] = []) => atClock(() => wsFrame(byId('mat-knit'), t, ps))
    at(4.9, [POINTER(70, 70)]); for (let k = 0; k < 3; k++) at(5 + k / 30, [POINTER(70, 70, true)]); for (let k = 0; k < 12; k++) at(5.1 + k / 12)
    assert('knit: a tap knits one more row (the swatch catches up at 2.5 rows/s); the loop moves ≤ 2 cells a frame at 12 fps', Math.abs(w.live[0] - 1) < 1e-6 && fast <= 2 + 1e-9, `extra rows ${w.live[0]}, loop ${fast.toFixed(2)} cells / frame`)
    worldReset(w)
  }
  // ── denim ──
  {
    const dd = twill(3, 4, 1)
    let up = 0; for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (dd(c, r)) up++
    const dots = atClock(() => wsFrame(byId('mat-denim'), 0)), pitch = TILE.pitch!
    const selv = dots.filter(d => Math.abs(d.x / pitch - .5 - H.DENIM.selvedge[0]) < 1e-6 || Math.abs(d.x / pitch - .5 - H.DENIM.selvedge[1]) < 1e-6)
    assert('denim: 3/1 twill warp fraction .75; the selvedge is value, with no active dot', up / 64 === .75 && selv.length > 200 && selv.every(d => d.color === dot480.value) && !dots.some(d => d.color === dot480.dotActive), `${selv.length} selvedge dots`)
  }
  // ── paper ──
  {
    const g = H.paperGeo(), n = g.n
    let ok = true, detail = ''
    for (const az of [16, 48]) {
      const data = { lightSrc: 1, lightAz: az, lightEl: 0 }, L = lightOfBucket(az, 0), dots = atClock(() => wsFrame(byId('mat-paper'), 0, undefined, data))
      const at = new Map(dots.map(d => [`${Math.round(d.x / TILE.pitch! - .5)},${Math.round(d.y / TILE.pitch! - .5)}`, d.color]))
      let lit = 0, litN = 0, far = 0, farN = 0
      for (let i = 0; i < n.x.length; i++) {
        if (!(g.floor[i] > 0 && g.floor[i] < H.PAPER.inkAt) || n.mask[i] < .5) continue
        const tilt = Math.hypot(n.x[i], n.y[i]), facing = (n.x[i] * L[0] + n.y[i] * L[1]) / (Math.hypot(L[0], L[1]) * (tilt || 1))
        if (tilt < .5) continue
        const c = at.get(`${i % 144},${Math.floor(i / 144)}`)
        if (facing > .7) { litN++; if (c === dot480.dotIdle || c === dot480.value) lit++ }
        if (facing < -.7) { farN++; if (c === undefined) far++ }
      }
      if (!litN || !farN || lit < .8 * litN || far < .8 * farN) { ok = false; detail = `az ${az}: lit ${lit}/${litN}, far void ${far}/${farN}` } else detail += `az ${az}: lit ${lit}/${litN}, void ${far}/${farN}; `
    }
    assert('paper: deboss lit wall/dark wall under raked light (the wall facing the light ≥ idle, the far wall void, from either side)', ok, detail)
    const w = H.paperWorld()
    worldReset(w)
    const at = (t: number, ps: Pointer[] = []) => atClock(() => wsFrame(byId('mat-paper'), t, ps))
    const inked = (d: ReturnType<typeof at>) => d.filter(q => q.color === dot480.value).length, full = inked(at(3))
    at(4.9, [POINTER(70, 90)]); for (let k = 0; k < 3; k++) at(5 + k / 30, [POINTER(70, 90, true)])
    const lifted = inked(at(5.15))
    for (let k = 1; k <= 6; k++) at(5.15 + k / 12)
    const back = inked(at(5.8)), count = w.live[1]
    assert('paper: a tap is one more impression: the ink lifts, is laid again within 0.4 s, the count goes up', lifted < full && back === full && count === 1, `value dots ${full} → ${lifted} → ${back}`)
    worldReset(w)
  }
  // ── wood ──
  {
    const { rings } = H.woodBase(), P = rings.phase.data, M = H.woodCut('09', '41').n.mask, cols = 96
    let worst = 0
    for (let j = 1; j < 95; j++) for (let i = 1; i < 95; i++) {
      const k = j * cols + i
      if (M[k] < .5 || M[k - 1] < .5 || M[k + 1] < .5 || M[k - cols] < .5 || M[k + cols] < .5) continue
      worst = Math.max(worst, Math.hypot((P[k + 1] - P[k - 1]) / 2, (P[k + cols] - P[k - cols]) / 2))
    }
    const red = reds(byId('mat-wood'), 0)
    assert('wood: ring period ≥ 3 cells everywhere (|∇phase| ≤ 1/3 per lattice cell); the colon is the only red', worst <= 1 / 3 && red.length === 2 && reds(byId('mat-wood'), .7).length === 0, `shortest ring ${(1 / worst).toFixed(2)} cells`)
  }
  // ── leather ──
  {
    let crease = 0, creaseOn = 0, top = 0, topOff = 0
    for (let y = 20; y < 130; y++) for (let x = 14; x < 130; x++) {
      const h = leatherAt(x, y), b = voronoiBorder2(x / 3.2, y / 3.2, 11) * 3.2
      if (h < .1) { crease++; if (b < .75) creaseOn++ }
      if (h > .99 * .85) { top++; if (b > .25) topOff++ }
    }
    assert('leather: grain creases = voronoi borders (crease cells within ¾ cell of a Worley border; pebble tops off them)', crease > 500 && creaseOn === crease && topOff === top, `${crease} crease cells, ${top} tops`)
    // the card's bake tables the Worley points: it must be leatherAt, bit for bit (other scales and seeds too)
    let cells = 0, off = 0
    for (const o of [{}, { scale: 2.1, seed: 5, vary: .3 }, { scale: 7.7, seed: -3 }]) {
      const out = leatherCells(200, [3, 2, 150, 120], o)
      for (let y = 2; y <= 120; y++) for (let x = 3; x <= 150; x++) { cells++; if (!Object.is(out[y * 200 + x], leatherAt(x, y, o))) off++ }
    }
    assert('leather: leatherCells ≡ leatherAt (the tabled Worley search, bit for bit)', cells > 50000 && off === 0, `${off} of ${cells} cells differ`)
  }
  // ── sand ──
  {
    const w = H.sandWorld(), sd = H.sand, s = Float32Array.from(simAtStepView(w)), v0 = sandVolume(sd, s)
    sandRake(sd, s, 20, 30, 1, .2); sandRake(sd, s, 30, 32, 1, .1); sandRake(sd, s, 40, 20, .2, 1)
    for (let k = 0; k < 40; k++) sandRelax(sd, s)
    const v1 = sandVolume(sd, s)
    assert('sand: talus relaxation conserves volume (±1e-4)', Math.abs(v1 - v0) / v0 <= 1e-4, `${v0.toFixed(3)} → ${v1.toFixed(3)}`)
    worldReset(w)
    const at = (t: number, ps: Pointer[] = []) => atClock(() => wsFrame(byId('mat-sand'), t, ps))
    at(1, [POINTER(70, 90)]); for (let k = 0; k < 3; k++) at(1.03 + k / 30, [POINTER(70, 90, true)]); at(1.2)
    const stones = H.stonesOf(w.live).length
    for (let k = 0; k < 8; k++) at(2 + k / 30, [POINTER(30 + 8 * k, 60, true)])
    const rake = at(2 + 8 / 30, [POINTER(94, 60, true)]).filter(d => d.color === dot480.dotActive).length
    at(2.4)
    let t = 2.4
    while (w.mode !== 'pristine' && t < 30) { t += 1 / 12; at(t) }
    assert('sand: a tap drops a stone, a press-drag carves with the rake head (5 red tines), heals to pristine after 12 s idle', stones === 3 && rake === 5 && w.mode === 'pristine' && t > 14, `stones ${stones}, rake ${rake} red, pristine again at t ${t.toFixed(1)}`)
    worldReset(w)
  }
  // ── ice ──
  {
    const a = H.iceFern(), b = dla({ w: 96, h: 96, n: 2600, seed: 17, kill: 1.6, minStep: .6 })
    assert('ice: same cluster as dla seed (bit for bit)', a.count === b.count && same(a.x, b.x) && same(a.y, b.y) && same(a.parent, b.parent), `${a.count} grains`)
    const w = H.iceWorld()
    worldReset(w)
    const grains = (t: number, ps: Pointer[] = []) => atClock(() => wsFrame(byId('mat-ice'), t, ps)).length
    const before = grains(10)
    for (let k = 0; k < 3; k++) grains(10 + k / 30, [POINTER(72, 78, true)])
    const melted = grains(10.2), refrozen = (() => { let t = 10.2; while (w.mode !== 'pristine' && t < 30) { t += 1 / 12; grains(t) } return grains(t) })()
    assert('ice: a tap is a breath: the frost round it melts, then freezes back (pristine again)', melted < before && w.mode === 'pristine' && refrozen > melted, `${before} → ${melted} dots`)
    worldReset(w)
  }
  // ── mercury ──
  {
    const w = H.mercuryWorld(), m0 = H.mercuryMass(H.mercury, simAtStepView(w))
    worldReset(w)
    const at = (t: number, ps: Pointer[] = [], data?: Record<string, number>) => atClock(() => wsFrame(byId('mat-mercury'), t, ps, data))
    // stir, then a tap on the pool, then tip the phone: mass stays (ink + beads), a red bead appears and rejoins
    for (let k = 0; k < 20; k++) at(1 + k / 30, [POINTER(40 + 3 * k, 110, true)])
    at(1.7); at(1.75, [POINTER(72, 118)]); for (let k = 0; k < 3; k++) at(1.8 + k / 30, [POINTER(72, 118, true)]); at(1.95)
    const bead = at(2.1).filter(d => d.color === dot480.dotActive).length
    for (let k = 0; k < 60; k++) at(2.2 + k / 30, [], { gx: .5, gy: .87 })
    const m1 = H.mercuryMass(H.mercury, w.live), gone = at(4.5, [], { gx: .5, gy: .87 }).filter(d => d.color === dot480.dotActive).length
    assert('mercury: ink mass conserved within fluid tolerance (±0.1%: the step puts back what the advection loses; stirred, split, tipped); a tap splits a red bead off that rejoins in 1.5 s', Math.abs(m1 - m0) / m0 <= 1e-3 && bead > 0 && gone === 0, `mass ${m0.toFixed(1)} → ${m1.toFixed(1)}, bead ${bead} red dots`)
    worldReset(w)
  }
  // ── thread ──
  {
    const w = H.threadWorld(), th = H.THREAD
    worldReset(w)
    const at = (t: number, ps: Pointer[] = [], data?: Record<string, number>) => atClock(() => wsFrame(byId('mat-thread'), t, ps, data))
    at(1, [POINTER(72, 90)], { gx: .02, gy: 1 })
    for (let k = 0; k < 90; k++) at(1 + k / 30, [], { gx: .03, gy: 1 })
    const rest = H.threadStrain(th, w.live), pristine0 = H.threadStrain(th, simAtStepView(w, 0))
    // pull the needle down past the thread's length: the spool pays out and the eye turns red; let go and it winds back
    const end = th.rope.n - 1, ex = () => w.live[th.rope.X + end], ey = () => w.live[th.rope.Y + end]
    for (let k = 0; k < 4; k++) at(4 + k / 30, [POINTER(ex(), ey(), true)])
    for (let k = 0; k < 20; k++) at(4.2 + k / 30, [POINTER(72 + k, 125 + k, true)])
    const paid = w.live[th.S] - th.length, eye = at(4.9, [POINTER(92, 142, true)]).filter(d => d.color === dot480.dotActive).length
    at(5); for (let k = 0; k < 60; k++) at(5.1 + k / 30)
    const wound = w.live[th.S] - th.length
    assert('thread: max strain ≤ 2% at rest (hanging, and settled live under gravity); a pull pays thread out with the needle\'s eye red, and it winds back', pristine0 <= .02 && rest <= .02 && paid > 3 && eye > 0 && wound < .5, `strain ${(100 * pristine0).toFixed(2)}% / ${(100 * rest).toFixed(2)}%, paid ${paid.toFixed(1)} cells, eye ${eye} red, then ${wound.toFixed(2)}`)
    worldReset(w)
  }
}
/** A world's pristine state at step n (t = 0 by default), copied. */
function simAtStepView(w: import('../../src/engine/physics/world').World, t = 0): Float32Array {
  return Float32Array.from(atClock(() => worldAt(w, t)))
}
/** Red dots of a card's frame at t (golden clock). */
function reds(p: WidgetPreset, t: number, data?: Record<string, number>): ReturnType<typeof sampleLayers> {
  return atClock(() => wsFrame(p, t, undefined, data)).filter(d => d.color === dot480.dotActive)
}

// ── tilt (M3.10, both boards) ─────────────────────────────────────────────────────────────────────────
export function tiltChecks(assert: Assert): void {
  const both = [...materialsBoard, ...workshopBoard]
  // the hub's bucket: a light turned less than one bucket (1/64 turn) keeps it; a full bucket moves it
  let sticky = true
  for (let k = 0; k < 64; k++) {
    const a0 = k / 64 * 2 * Math.PI, prev = bucketLight(lightDirAt(a0))
    if (bucketLight(lightDirAt(a0 + .7 / 64 * 2 * Math.PI), prev).az !== prev.az) sticky = false
    if (bucketLight(lightDirAt(a0 + 1 / 64 * 2 * Math.PI), prev).az === prev.az) sticky = false
  }
  assert('materials: tilt bucket changes only on a ≥ 1/64-turn change', sticky)
  const files = ['materials', 'materials-shared', 'materials-glass', 'materials-live', 'materials-wear', 'workshop', 'workshop-live', 'workshop-physics', 'workshop-plate', 'workshop-stone', 'workshop-frost']
  const src = Object.fromEntries(files.map(f => [f, readFileSync(new URL(`../../src/widgets/boards/${f}.ts`, import.meta.url), 'utf8')]))
  assert('materials: no card reads DeviceOrientation directly (both boards)', files.every(f => !/DeviceOrientation|deviceorientation/.test(src[f])))
  const gravity = files.filter(f => /data\.g[xy]\b|data\[['"]g[xy]['"]\]/.test(src[f]))
  assert('materials: no card reads data.light, and no light or matcap path reads gx/gy (only the sand, mercury and thread step inputs do)', files.every(f => !/data\.light\b/.test(src[f])) && gravity.join() === 'workshop-physics' && (src['workshop-physics'].match(/data\.g[xy]\b/g) ?? []).length === 2,
    `gx/gy read in: ${gravity.join(', ')}`)
  const noTilt = (d: Record<string, number>) => { const { tx: _x, ty: _y, ...rest } = d; return rest }
  const same0 = both.every(p => [0, 1.3].every(t => atClock(() => JSON.stringify(sampleLayers(withChrome(p)({ t, data: { ...p.defaults, tx: 0, ty: 0 } }), p.grid, p.style, dot480)) === JSON.stringify(sampleLayers(withChrome(p)({ t, data: noTilt({ ...p.defaults }) }), p.grid, p.style, dot480)))))
  assert('materials: tx = ty = 0 → every matcap and KK card equals its no-tilt frame (bit for bit, both boards)', same0 && matcapMatrix(0, [0, 0]) === null)
  // each card's light through matLight: the pointer (hover), else the hub (lightSrc 1), else the sun, each = sceneLight
  // (a sky-only call, the window's panes, sees no pointer: under hover it is the sun)
  const hour = atClock(() => hourOf(new Date())), ctxs = [
    ['hover', [POINTER(60, 70)], {}], ['tilt', undefined, { lightSrc: 1, lightAz: 20, lightEl: 3 }], ['sun', undefined, {}],
  ] as const
  let ok = true, detail = '', lit = 0
  for (const p of both) {
    let calls = 0
    for (const [name, pointers, data] of ctxs) {
      lightTrace.on = true; lightTrace.calls.length = 0
      try { atClock(() => withChrome(p)({ t: 0, data: { ...p.defaults, ...data }, pointers: pointers ? [...pointers] : undefined })) } finally { lightTrace.on = false }
      calls += lightTrace.calls.length
      for (const { input, light } of lightTrace.calls) {
        const want = sceneLight(input), arr = Array.isArray(light)
        const good = JSON.stringify(want) === JSON.stringify(light) && input.hour === hour
          && (name === 'hover' ? (input.pointer ? !arr : JSON.stringify(light) === JSON.stringify(sunAt(hour))) : name === 'tilt' ? arr && JSON.stringify(light) === JSON.stringify(lightOfBucket(20, 3)) : arr && JSON.stringify(light) === JSON.stringify(sunAt(hour)))
        if (!good) { ok = false; detail = `${p.id} (${name})` }
      }
    }
    if (calls) lit++
  }
  assert('materials: each card\'s light, in order: pointer → lightSrc 1 → sun (3 synthetic contexts), equal to sceneLight (every lit card, both boards)', ok && lit >= both.length - 1, detail || `${lit} of ${both.length} cards light through matLight (the lens's light is its rim, from the pointer and the tilt offset)`)
}
const lightDirAt = (az: number): Vec3 => lightDir(az, 40 * DEG)
