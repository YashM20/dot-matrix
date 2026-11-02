/** Materials checks, board group (scripts/materials.ts): the materials board invariants and budgets, and the M2 cards. */
import { readFileSync } from 'node:fs'
import { DRAFTS, lensOffset, fromDraft, rake, twill, weaveRelief } from '../../src/engine/matter'
import { hourOf, lightDir, sunAt, torch, type Light, type Vec3 } from '../../src/engine/light'
import { gpuTag, gpuValues, layerPass } from '../../src/engine/renderer/webgl/passes'
import { worldAt, worldReset } from '../../src/engine/physics/world'
import { simReset, simStep } from '../../src/engine/sim/sim'
import { sceneLight } from '../../src/engine/light/input'
import { sampleLayers } from '../../src/engine/sampler/gridSampler'
import { beginDrag, dragValue } from '../../src/engine/interaction/controls'
import { touchIntent } from '../../src/engine/interaction/gesture'
import { dot480 } from '../../src/engine/theme/tokens'
import type { Pointer } from '../../src/engine/context'
import { TILE, withChrome, type WidgetContext, type WidgetPreset } from '../../src/widgets/types'
import * as M from '../../src/widgets/boards/materials'
import { lightBoard } from '../../src/widgets/boards/light'
import { LIGHT_DEFAULTS, matGrille, matKnob, matLight, matLoom, materialsBoard, materialsHooks, materialsSources, matTerrazzo } from '../../src/widgets/boards/materials'
import { freezeWallClock } from '../lib/freeze'
import { fmtLoaded, medianLoaded, onceLoaded, type Loaded } from '../lib/load'
import { type Assert, same, DEG, type MaterialsOptions } from './util'

/** Cards with no red in their pristine run (M §4.2: the pool's pebble only appears when one is dropped). */
const NO_ACCENT_AT_REST = new Set(['mat-pool'])
/** Cards whose live element is a region rather than sites. */
const RED_REGIONS = new Set(['mat-terrazzo', 'mat-window', 'mat-candle'])
export const POINTER = (x: number, y: number, down = false): Pointer => ({ id: 1, x, y, inside: true, down, tDown: 0, tUp: 0, vx: 0, vy: 0, pressure: 0 })
/** Run `f` with the wall clock frozen at a local date (the golden clock by default), restoring it after. */
export function atClock<T>(f: () => T, y = 2026, m = 0, d = 1, h = 9, min = 41): T {
  const Real = globalThis.Date
  freezeWallClock(y, m, d, h, min)
  try { return f() } finally { globalThis.Date = Real }
}

export async function boardChecks(assert: Assert, load: number, opts: MaterialsOptions, run: (g: string) => boolean): Promise<void> {
  // cold: a fresh module graph (cache-busting query) so the lazy bakes are measured, before anything else draws
  type Mod = typeof import('../../src/widgets/boards/materials')
  const fresh = (tag: string) => import(`../../src/widgets/boards/materials.ts?cold=${tag}${Date.now()}`).catch(() => null) as Promise<Mod | null>
  const warmMod = await fresh('a'), coldMod = await fresh('b')
  // the M2 cards live in their own modules, which the fresh board module shares with the warm one: bust them too
  const freshCards = async (file: string, tag: string) => Object.values(await import(`../../src/widgets/boards/${file}.ts?cold=${tag}${Date.now()}`).catch(() => ({})) as Record<string, unknown>)
    .filter((v): v is WidgetPreset => !!v && typeof v === 'object' && 'layers' in v && 'id' in v)
  const coldM2 = [...await freshCards('materials-glass', 'b'), ...await freshCards('materials-live', 'b'), ...await freshCards('materials-wear', 'b')]
  const frameOf = (p: WidgetPreset, t: number, pointers?: Pointer[], data?: Record<string, number>) =>
    sampleLayers(withChrome(p)({ t, data: { ...p.defaults, ...data }, pointers }), p.grid, p.style, dot480)
  // the sampler and the engine are warm in the app when a board opens: warm them on another lit board first
  for (const p of lightBoard) for (let i = 0; i < 3; i++) frameOf(p, i)
  if (warmMod) atClock(() => warmMod.materialsBoard.forEach(p => frameOf(p, 0)))
  // timings carry the load sampled next to them (scripts/lib/load.ts): a factor from the top of the script goes stale
  const coldBoard = (coldMod ?? M).materialsBoard.map(p => coldM2.find(q => q.id === p.id) ?? p)
  const cold = atClock(() => coldBoard.map(p => [p.id, onceLoaded(() => frameOf(p, 0))] as const))
  const board = materialsBoard
  if (run('board')) {
    const key = (p: WidgetPreset, t: number) => atClock(() => JSON.stringify(frameOf(p, t)))
    assert('materials board: every card is a pure function of t (same t, same dots, any order)', board.every(p => [0, 1.3, 7.7, 3600].every(t => key(p, t) === key(p, t))) && key(board[0], 7.7) === (key(board[1], 1), key(board[0], 7.7)))
    let accent = true, detail = ''
    for (const p of board) for (const t of [0, 1.3, 6]) {
      const ls = atClock(() => withChrome(p)({ t, data: { ...p.defaults } })), red = ls.filter(l => l.tone === 'active')
      const dots = atClock(() => frameOf(p, t)).filter(d => d.color === dot480.dotActive)
      const own = red.length ? new Set(sampleLayers(red, p.grid, p.style, dot480).map(d => `${d.x.toFixed(2)},${d.y.toFixed(2)}`)) : new Set<string>()
      if (red.length > 1 || !dots.every(d => own.has(`${d.x.toFixed(2)},${d.y.toFixed(2)}`))) { accent = false; detail = `${p.id} t ${t}: ${red.length} red layers` }
      if (t === 0 && dots.length === 0 && !NO_ACCENT_AT_REST.has(p.id)) { accent = false; detail = `${p.id}: no accent at rest` }
      if (NO_ACCENT_AT_REST.has(p.id) && dots.length) { accent = false; detail = `${p.id}: red in the pristine run` }
    }
    assert('materials board: one accent per card, one red layer, on the live element (every card has it at rest but the pool: accentAtRest false)', accent, detail)
    const dim = board.some(p => [0, 1.3, 6].some(t => atClock(() => withChrome(p)({ t, data: { ...p.defaults } })).some(l => l.tone === 'activeDim') || atClock(() => frameOf(p, t)).some(d => d.color === dot480.dotActiveDim)))
    assert('materials board: no activeDim (was-active is size contrast until the owner rules, M §10.6)', !dim)
    // the red layer of each card is its live element, never a band of a material (bands come from toneBands / anisoSpec / matcap)
    const redSources = board.every(p => atClock(() => withChrome(p)({ t: 0, data: { ...p.defaults } })).filter(l => l.tone === 'active').every(l => !!l.sites || RED_REGIONS.has(p.id)))
    assert('materials board: no material dot is dotActive (the red layer is the live sites: shuttle, arc, peak, colon, second, needle, rust front; or a live region: today\'s chip, the hour\'s pane, the flame)', redSources)
    assert('materials board: quantized (every card style has quantizeSteps ≥ 2)', board.every(p => (p.style.quantizeSteps ?? 0) >= 2))
    const keys = ['lightSrc', 'lightAz', 'lightEl', 'tx', 'ty']
    assert('materials board: every card declares lightSrc/lightAz/lightEl/tx/ty in defaults', board.every(p => keys.every(k => p.defaults && k in p.defaults)) && materialsSources.length === 1)
    const hour = atClock(() => hourOf(new Date()))
    const ctxs: [string, WidgetContext, Light][] = [
      ['hover', { t: 0, data: { ...LIGHT_DEFAULTS }, pointers: [POINTER(40, 50)] }, sceneLight({ pointer: { x: 40, y: 50 }, data: { ...LIGHT_DEFAULTS }, hour, torch: { height: 40 } })],
      ['tilt', { t: 0, data: { ...LIGHT_DEFAULTS, lightSrc: 1, lightAz: 20, lightEl: 3 } }, sceneLight({ data: { ...LIGHT_DEFAULTS, lightSrc: 1, lightAz: 20, lightEl: 3 }, hour })],
      ['sun', { t: 0, data: { ...LIGHT_DEFAULTS } }, sceneLight({ data: { ...LIGHT_DEFAULTS }, hour })],
    ]
    const eq = ctxs.every(([, c, want]) => JSON.stringify(atClock(() => matLight(c, { torch: { height: 40 } }))) === JSON.stringify(want))
    assert('materials: matLight ≡ sceneLight for 3 synthetic contexts (hover, lightSrc 1, sun)', eq)
    const warm = (p: WidgetPreset, hover: boolean) => atClock(() => {
      for (let i = 0; i < 4; i++) frameOf(p, i / 60, hover ? [POINTER(30 + i, 60)] : undefined)
      return medianLoaded(i => frameOf(p, 5.5 + i / 60, hover ? [POINTER(34 + i, 60 + (i % 3))] : undefined), 13)
    })
    const rows = opts.quick ? [] : board.map(p => ({ id: p.id, rest: warm(p, false), hover: warm(p, true), cold: cold.find(c => c[0] === p.id)![1] }))
    const within = (r: Loaded, budget: number) => r.ms <= budget * r.load
    assert('materials board: frame ≤ 4 ms (median, warm, × load), no pointer and a hovering torch', rows.every(r => within(r.rest, 4) && within(r.hover, 4)), rows.map(r => `${r.id} ${fmtLoaded(r.rest)}/${fmtLoaded(r.hover)}`).join(', '))
    assert('materials board: cold first frame ≤ 30 ms (× load)', !!coldMod && rows.every(r => within(r.cold, 30)), rows.map(r => `${r.id} ${fmtLoaded(r.cold, 1)}`).join(', ') + (coldMod ? '' : ' (no fresh module graph)'))
    // a rebake is one-shot work: the best of 3 cache misses (minutes 32–34; contention only ever adds time), each with its own load
    const H = materialsHooks, rb = atClock(() => ['32', '33', '34'].map(mm => onceLoaded(() => H.engraving('12', mm, 2026))).reduce((a, b) => (b.ms / b.load < a.ms / a.load ? b : a)))
    const first = H.engraving('12', '34', 2026); H.engraving('12', '35', 2026); const keep = H.engraving('12', '34', 2026) === first; H.engraving('12', '36', 2026); H.engraving('12', '37', 2026)
    assert('marble: the engraving LRU keeps 2', keep && H.engraving('12', '34', 2026) !== first)
    assert('marble: rebake on a minute change ≤ 10 ms', within(rb, 10), fmtLoaded(rb))
    if (opts.bench) {
      console.log('  materials --bench (ms):  card            cold    warm   hover')
      for (const r of rows) console.log(`                           ${r.id.padEnd(14)} ${r.cold.ms.toFixed(1).padStart(6)} ${r.rest.ms.toFixed(2).padStart(7)} ${r.hover.ms.toFixed(2).padStart(7)}`)
    }
  }
  if (!run('cards')) return
  const H = materialsHooks
  // ── loom ──
  {
    const s0 = H.loomAt(0), s13 = H.loomAt(1.3)
    const ls = atClock(() => withChrome(matLoom)({ t: 0, data: { ...matLoom.defaults } }))
    const allWoven = (() => { for (let r = H.LOOM.box[1]; r <= H.LOOM.box[3]; r++) for (let c = H.LOOM.box[0]; c <= H.LOOM.box[2]; c++) if (!H.woven(s0, c, r)) return false; return true })()
    assert('loom: t = 0 is a complete twill 2/2 panel (26/26 picks), shuttle parked at the right selvedge', s0.draft === 'twill22' && s0.parked && s0.done === 26 && Math.abs(s0.x - (H.LOOM.box[2] + .5)) < 1e-9 && allWoven && ls.some(l => l.field.text?.includes('26/26')),
      `t 1.3: ${s13.draft} pick ${s13.pick + 1}, shuttle ${(s13.x - H.LOOM.box[0] + .5).toFixed(2)} cells from the left`)
    const cloth = H.loomCloth(H.drawdownOf('twill22', DRAFTS.twill22)), truth = weaveRelief(twill(2, 4), { cols: 144, rows: 144 }, { box: H.LOOM.box, crossing: 4, lift: 1.2 })
    assert('loom: the woven rows equal weaveRelief(DRAFTS.twill22) (drawdown truth)', same(cloth.height.data, truth.height.data) && same(cloth.warp.data, truth.warp.data))
    const base = fromDraft(H.loomDraft('twill22', {})), edited = fromDraft(H.loomDraft('twill22', { tu5: 1 }))
    let only = true
    for (let r = 0; r < 26; r++) for (let c = 0; c < 24; c++) { const hit = c % 4 === 1 && r % 4 === 1; if ((base(c, r) !== edited(c, r)) !== hit) only = false }
    assert('loom: a tie-up toggle flips exactly the crossings of its shaft × treadle (the panel redraws at once: data has no edit time)', only)
    let fast = 0
    for (let i = 0; i < 40 * H.PANEL; i++) { const a = H.loomAt(i / 40), b = H.loomAt((i + 1) / 40); fast = Math.max(fast, Math.abs(b.x - a.x)) }
    assert('loom: shuttle ≤ 2 cells per frame at the declared fps (STYLE-BIBLE.md:208; the fell steps one pick between throws)', fast <= 2 + 1e-9 && matLoom.fps === 40, `${fast.toFixed(3)} cells / frame at ${matLoom.fps} fps`)
    const red = atClock(() => withChrome(matLoom)({ t: 1.3, data: { ...matLoom.defaults } })).filter(l => l.tone === 'active' || l.tone === 'activeDim')
    const sizes = new Set(atClock(() => sampleLayers(red, TILE, matLoom.style, dot480)).map(d => d.r.toFixed(3)))
    assert('loom: the trail is the shuttle\'s own active layer, smaller sizes, no activeDim', red.length === 1 && red[0].tone === 'active' && (red[0].sites?.length ?? 0) === 3 && sizes.size === 3)
  }
  // ── knob ──
  {
    const { KNOB_CARD: K, KNOB_ARC: A } = H, cx = 48, cy = 50
    let worst = 0
    for (let k = 0; k < 8; k++) {
      const a = k * 45 * DEG + 7 * DEG, s = H.knobSpec(torch(cx + 30 * Math.sin(a), cy - 30 * Math.cos(a), 40, 150)).data, bins = new Float64Array(360)
      for (let r = 0; r < 96; r++) for (let c = 0; c < 96; c++) { const dx = c - cx, dy = r - cy; if (dx * dx + dy * dy < 9) continue; bins[Math.round(Math.atan2(dx, -dy) / DEG + 360) % 360] += s[r * 96 + c] }
      const sm = (i: number) => { let t = 0; for (let j = -4; j <= 4; j++) t += bins[(i + j + 360) % 360]; return t }
      let p1 = 0; for (let i = 0; i < 360; i++) if (sm(i) > sm(p1)) p1 = i
      let p2 = -1; for (let i = 0; i < 360; i++) { const d = Math.abs(((i - p1 + 540) % 360) - 180); if (d > 90 && (p2 < 0 || sm(i) > sm(p2))) p2 = i }
      const off = (x: number, y: number) => Math.abs(((x - y + 540) % 360) - 180), want = a / DEG
      worst = Math.max(worst, Math.min(off(p1, want), off(p1, want + 180)), Math.min(off(p2, want), off(p2, want + 180)))
    }
    assert('knob: the bowtie\'s two brightest lobes lie within ±1 light bucket (5.6°) of the light azimuth, for 8 torch positions', worst <= 360 / 64, `worst ${worst}°`)
    const reds = (v: number) => atClock(() => frameOf(matKnob, 0, undefined, { v })).filter(d => d.color === dot480.dotActive).length
    assert('knob: the value arc\'s active sites = round(v · 40)', [0, .25, .5, .72, 1].every(v => reds(v) === Math.round(v * A.n)), [0, .25, .5, .72, 1].map(reds).join('/'))
    const c = matKnob.controls![0], at = (v: number) => { const a = A.start + v * A.sweep; return { x: K.x + A.r * Math.sin(a), y: K.y - A.r * Math.cos(a) } }
    const tap = (v: number) => { const p = at(v); return dragValue(c, beginDrag(c, p.x, p.y, { v: .72 }), p).v }
    assert('knob: a tap on the arc sets v to its angle', [0, .1, .5, .9, 1].every(v => Math.abs(tap(v) - v) < 1e-6) && touchIntent(c) === 'drag', [.1, .5, .9].map(tap).map(x => x.toFixed(3)).join('/'))
  }
  // ── grille ──
  {
    const g = H.grillePlate(), holes = H.grilleHoles()
    let inside = 0
    for (const h of holes) for (let r = Math.floor(h.y - 2); r <= Math.ceil(h.y + 2); r++) for (let cc = h.x - 2; cc <= h.x + 2; cc++) if (Math.hypot(cc - h.x, r - h.y) <= 1.9 && g.mask.data[r * 144 + cc]) inside++
    let unlit = true, oneRed = true
    for (const t of [0, .37, 1.3, 2.9, 6]) {
      const vu = H.grilleVU(t + .12), dots = atClock(() => frameOf(matGrille, t)), pitch = TILE.pitch!
      const atHole = dots.filter(d => holes.some(h => Math.abs(d.x - (h.x + .5) * pitch) < 1e-3 && Math.abs(d.y - (h.y + .5) * pitch) < 1e-3))
      const shown = vu.lit.reduce((s, n, col) => s + n + (vu.peak[col] > n ? 1 : 0), 0)
      if (atHole.length !== shown) unlit = false
      const red = dots.filter(d => d.color === dot480.dotActive), live = H.livePeak(vu)
      const want = holes.filter(h => h.col === live).sort((p, q) => q.y - p.y)[vu.peak[live] - 1]
      if (red.length !== 1 || Math.abs(red[0].x - (want.x + .5) * pitch) > 1e-3 || Math.abs(red[0].y - (want.y + .5) * pitch) > 1e-3) oneRed = false
    }
    assert('grille: no plate dot inside a hole or its moat; unlit holes draw nothing', inside === 0 && unlit, `${holes.length} holes`)
    assert('grille: exactly one active hole, at the highest peak-hold', oneRed)
    let det = true
    for (let i = 0; i < 200; i++) { const s = i * .137; if (JSON.stringify(H.grilleVU(s)) !== JSON.stringify(H.grilleVU(s))) det = false }
    assert('grille: signal deterministic (two fresh runs equal at 200 t\'s)', det && holes.length === 23 * 11 + 22 * 11)
  }
  // ── marble ──
  {
    const e = H.engraving('09', '41', 2026), n = e.n
    let ok = true, detail = ''
    for (const az of [90, 270]) {
      const L = rake(lightDir(az * DEG, 40 * DEG)) as Vec3, { body, polish } = H.marbleLit(e, L)
      let lit = 0, litN = 0, far = 0, farN = 0
      for (let i = 0; i < n.x.length; i++) {
        if (!e.hero.data[i] || n.mask[i] < .5) continue
        const tilt = Math.hypot(n.x[i], n.y[i]), facing = (n.x[i] * L[0] + n.y[i] * L[1]) / (tilt || 1)
        if (tilt < .5) continue // wall cells only (slope ≥ 30°)
        const v = Math.max(body.data[i], polish.data[i])
        if (facing > .7) { litN++; if (v >= .62) lit++ }
        if (facing < -.7) { farN++; if (v < .06) far++ }
      }
      if (lit < .8 * litN || far < farN || !litN || !farN) { ok = false; detail = `az ${az}: lit ${lit}/${litN}, far void ${far}/${farN}` }
      else detail += `az ${az}: lit ${lit}/${litN}, void ${far}/${farN}; `
    }
    assert('marble: engraved grooves: lit wall ≥ idle and far wall void under a raked light from either side', ok, detail)
  }
  // ── terrazzo ──
  {
    const m = H.monthOf(2026, 0), all = [...m.aggregate.a, ...m.aggregate.b, ...m.aggregate.c]
    let minD = Infinity
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) minD = Math.min(minD, Math.hypot(all[i][0] - all[j][0], all[i][1] - all[j][1]))
    const clear = all.every(([x, y]) => m.keepOut.data[Math.round(y) * 144 + Math.round(x)] < .5)
    assert('terrazzo: aggregate sites ≥ d apart and never inside a dilated day chip', minD >= 3.4 - 1e-9 && clear, `${all.length} chips of aggregate, min ${minD.toFixed(2)}`)
    const cells = new Map<number, number>(); for (const d of m.chip) if (d >= 0) cells.set(d, (cells.get(d) ?? 0) + 1)
    const ls = atClock(() => withChrome(matTerrazzo)({ t: 0, data: { ...matTerrazzo.defaults } })), red = ls.filter(l => l.tone === 'active')
    const redDots = atClock(() => sampleLayers(red, TILE, matTerrazzo.style, dot480)), day1 = cells.get(0) ?? -1
    assert('terrazzo: 31 day chips for Jan 2026, laid from Thursday; today = 1 is the only active layer', m.days === 31 && m.offset === 3 && cells.size === 31 && [...cells.values()].every(k => k >= 12) && red.length === 1 && redDots.length === day1, `${day1} dots in today's chip, ${redDots.length} red`)
    // the chips are one multi-tone layer on the 1.5 lattice: past days are idle (honed) or value (polished), future mid
    const past = (d: number) => {
      const chips = atClock(() => withChrome(matTerrazzo)({ t: 0, data: { ...matTerrazzo.defaults } }), 2026, 0, d).filter(l => l.lattice === 1.5 && l.toneOf)
      return sampleLayers(chips, TILE, matTerrazzo.style, dot480).filter(q => q.color === dot480.dotIdle || q.color === dot480.value).length
    }
    const p1 = past(1), p15 = past(15)
    assert('terrazzo: past/future split follows the date (frozen 2026-01-01 → 0 past)', p1 === 0 && p15 > 0, `past dots: Jan 1 ${p1}, Jan 15 ${p15}`)
  }
  m2CardChecks(assert, frameOf)
}

type FrameFn = (p: WidgetPreset, t: number, pointers?: Pointer[], data?: Record<string, number>) => ReturnType<typeof sampleLayers>
/** The M2 cards (M §4.3: M2.2, M2.4–M2.7, the candle of §4.4). */
function m2CardChecks(assert: Assert, frameOf: FrameFn): void {
  const H = materialsHooks, byId = (id: string) => materialsBoard.find(p => p.id === id)!
  const reds = (p: WidgetPreset, t: number, data?: Record<string, number>, pointers?: Pointer[]) => atClock(() => frameOf(p, t, pointers, data)).filter(d => d.color === dot480.dotActive)
  const pitch = TILE.pitch!, cell = (d: { x: number; y: number }) => [d.x / pitch - .5, d.y / pitch - .5]
  // ── lens ──
  {
    const lens = byId('mat-lens'), ls = atClock(() => withChrome(lens)({ t: 0, data: { ...lens.defaults } }))
    const tagged = ls.filter(l => gpuTag(l.field)), pass = tagged.length === 1 ? layerPass(tagged[0], TILE, lens.style, pitch) : null
    assert('lens: the lattice-1 field is what goldens hash (no gpu tag consulted)', tagged.length === 1 && tagged[0].lattice === undefined && sampleLayers(tagged, TILE, lens.style, dot480).length > 0)
    assert('lens: layerPass(through) is a pass at density 2 with toneOf (passes.ts:70-93)', !!pass && pass.tag.density === 2 && !!pass.toneOf && pass.cols >= 2 * 140)
    // park the lens over the second's tick (12 o'clock at 09:41:00: card (72, 20)) and check the red dot sits where the glass shows it
    const data = { lx: 72 / 144, ly: (144 - 36) / 132 }, red = reds(lens, 0, data)
    const c = H.lensCentre({ ...lens.defaults, ...data }), off = lensOffset({ cx: c[0], cy: c[1], hw: H.LENS.hw, hh: H.LENS.hh, radius: H.LENS.radius, bezel: H.LENS.bezel, lut: H.lensLUT(), magnify: H.LENS.magnify })
    const [px, py] = red.length === 1 ? cell(red[0]) : [NaN, NaN], o = new Float64Array(2), inLens = off(px, py, o) >= 0
    const err = Math.hypot(px + o[0] - 72, py + o[1] - 20)
    assert('lens: the second tick is the only active dot, refracted by the same offset as the scene', red.length === 1 && inLens && err < .1 && reds(lens, 0).length === 1, `p + offset(p) − tick = ${err.toFixed(3)} cells`)
    const ctx0: WidgetContext = { t: 0, data: { ...lens.defaults } }
    assert('lens: tx = ty = 0 → rimAngle −60° exactly', H.lensRim(ctx0, [100, 70]).angle === -60 * DEG && H.lensRim(ctx0, [100, 70]).power === 3 && Math.abs(H.lensRim({ t: 0, data: { ...lens.defaults, tx: 1 } }, [100, 70]).angle + 35 * DEG) < 1e-12)
    const fill = medianLoaded(i => {
      const q = layerPass(atClock(() => withChrome(lens)({ t: 5 + i / 12, data: { ...lens.defaults } })).find(l => gpuTag(l.field))!, TILE, lens.style, pitch)!
      let s = 0
      for (let r = 0; r < q.rows; r++) for (let k = 0; k < q.cols; k++) s += q.field((q.map[0] + k * q.map[1]) / q.den[0], (q.map[2] + r * q.map[3]) / q.den[1])
      return s
    }, 7)
    // the same 83k reads of a constant field: the loop and call overhead every pass pays, whatever its field
    const flat = gpuValues(() => .5, { density: 2 })
    const bare = medianLoaded(i => {
      const q = { ...layerPass(atClock(() => withChrome(lens)({ t: 5 + i / 12, data: { ...lens.defaults } })).find(l => gpuTag(l.field))!, TILE, lens.style, pitch)!, field: flat }
      let s = 0
      for (let r = 0; r < q.rows; r++) for (let k = 0; k < q.cols; k++) s += q.field((q.map[0] + k * q.map[1]) / q.den[0], (q.map[2] + r * q.map[3]) / q.den[1])
      return s
    }, 7)
    assert('lens: GPU value fill ≤ 2 ms (the density-2 field over its pass beyond a constant field, × load)', fill.ms - bare.ms <= 2 * fill.load, `${fmtLoaded(fill)}; a constant field ${fmtLoaded(bare)}`)
  }
  // ── pool ──
  {
    const pool = byId('mat-pool'), w = H.poolWorld
    worldReset(w)
    assert('pool: t = 0 is the pristine run after its 4 s lead (no pebble, no red)', simStep(w.sim, 0) === 120 && reds(pool, 0).length === 0 && w.mode === 'pristine')
    simReset(w.sim)
    worldAt(w, 3600)
    assert('pool: lead + period ≤ maxSteps (1,020 ≤ 1,080); a cold jump to t = 3600 has lag 0', 120 + 900 <= w.sim.maxSteps && w.sim.maxSteps === 1080 && w.sim.lag === 0, `maxSteps ${w.sim.maxSteps}, lag ${w.sim.lag}`)
    // two loops, then 20 scrubs: the total (checkpoints + 6 working copies) stays ≤ 256 KB and nothing is evicted once warm
    for (let t = 0; t <= 64; t += 1 / 30) worldAt(w, t)
    const before = H.poolMemory().checkpoints
    for (let k = 0; k < 20; k++) worldAt(w, (k * 7.31) % 34)
    const mem = H.poolMemory()
    assert('pool: total memory (checkpoints + 6 working copies) ≤ 256 KB after 2 loops + 20 random scrubs (≈125 KB expected), 0 evictions once warm', mem.bytes <= 256 * 1024 && mem.checkpoints === before && mem.checkpoints <= 8, `${(mem.bytes / 1024).toFixed(1)} KB, ${mem.checkpoints} checkpoints`)
    // a tap at t = 10 drops a pebble: the world forks live, the sinking pebble is the only red, and it heals back after idle
    worldReset(w)
    const at = (t: number, pointers: Pointer[] = []) => atClock(() => frameOf(pool, t, pointers))
    // a tap holds the pointer down for a few frames (gesture.ts TOUCH.tapPress 90 ms): the world forks on the first one
    // and steps the press on the next
    at(9.9, [POINTER(60, 70)])
    for (let k = 0; k < 3; k++) at(10 + k / 30, [POINTER(60, 70, true)])
    const live = w.mode === 'live'
    at(10 + 3 / 30)
    const sinking = at(10.4).filter(d => d.color === dot480.dotActive)
    let t = 10.4
    while (w.mode !== 'pristine' && t < 20) { t += 1 / 30; at(t) }
    assert('pool: a tap forks live, the pebble is the only active dot, heals to pristine after idle', live && sinking.length === 1 && w.mode === 'pristine' && t < 20, `live ${live}, red ${sinking.length}, pristine again at t ${t.toFixed(2)}`)
    const src = readFileSync(new URL('../../src/widgets/boards/materials-live.ts', import.meta.url), 'utf8')
    const imp = src.match(/import \{([^}]*)\} from '\.\.\/\.\.\/engine\/life\/ripple'/)?.[1].split(',').map(x => x.trim()).sort().join(',')
    assert('pool: uses only createRipple / rippleStep / rippleSplat / rippleGrad (the L1.2 API)', imp === 'createRipple,rippleGrad,rippleSplat,rippleStep' && !/from '\.\.\/\.\.\/engine\/life\/(?!ripple')/.test(src), imp)
    worldReset(w)
  }
  // ── window ──
  {
    const win = byId('mat-window'), g = H.windowGeometry(), came: [number, number][] = []
    for (let i = 0; i < g.kind.length; i++) if (g.kind[i] === 2) came.push([i % 144, Math.floor(i / 144)])
    const bins = new Map<number, [number, number][]>()
    for (const p of came) { const k = (p[1] >> 3) * 32 + (p[0] >> 3); if (!bins.has(k)) bins.set(k, []); bins.get(k)!.push(p) }
    let minD = Infinity
    for (let j = 0; j < 96; j++) for (let i = 0; i < 96; i++) {
      if (g.lat[j * 96 + i] < 0) continue
      const x = (i + .5) * 1.5 - .5, y = (j + .5) * 1.5 - .5
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const p of bins.get(((Math.floor(y) >> 3) + a) * 32 + (Math.floor(x) >> 3) + b) ?? []) minD = Math.min(minD, Math.hypot(p[0] - x, p[1] - y))
    }
    const cameSet = new Set(came.map(p => p[1] * 144 + p[0]))
    const onCame = atClock(() => frameOf(win, 1.3)).filter(d => { const [x, y] = cell(d); return Math.abs(x - Math.round(x)) < 1e-6 && Math.abs(y - Math.round(y)) < 1e-6 && cameSet.has(Math.round(y) * 144 + Math.round(x)) })
    const dull = onCame.every(d => d.color === dot480.dotMid || d.color === dot480.dotFaint)
    assert('window: every pane cell is ≥ 1 cell from a came cell (moat); came never brighter than mid', minD >= 1 && dull && came.length > 500, `nearest pane dot ${minD.toFixed(2)} cells from the lead; ${onCame.length} glints on ${came.length} came cells`)
    let hours = true, detail = ''
    for (let h = 0; h < 24; h++) {
      const red = atClock(() => withChrome(win)({ t: 0, data: { ...win.defaults } }), 2026, 0, 1, h, 15).filter(l => l.tone === 'active')
      const lit = red.length === 1 ? sampleLayers(red, TILE, win.style, dot480) : []
      const panes = new Set(lit.map(d => { const i = Math.round((d.x / pitch + .5) / 1.5 - .5), j = Math.round((d.y / pitch + .5) / 1.5 - .5); return g.lat[j * 96 + i] }))
      if (red.length !== 1 || panes.size !== 1 || !panes.has(h % 12)) { hours = false; detail = `hour ${h}: panes ${[...panes].join(',')}` }
    }
    assert('window: hour h lights petal h % 12 only (24 frozen-clock hours)', hours, detail)
    const gains = [6.5, 7.5, 8.5, 10, 12].map(h => H.skyGain(h, sunAt(h)))
    assert('window: day vs night gain monotone in sun elevation', gains.every((v, k) => k === 0 || v >= gains[k - 1]) && H.skyGain(23, sunAt(23)) < gains[0], gains.map(v => v.toFixed(3)).join(' ≤ '))
  }
  // ── patch ──
  {
    const g = H.patchGeo(), t = g.t
    let worst = 0
    for (let r = 50; r < 110; r++) for (let c = 50; c < 95; c++) {
      if (H.boltSdf(c, r) > -.5) continue
      // the iso-lines by the same ±1-cell differences the tangents use; skip the medial ridge and the corners' kinks
      const gx = (H.boltSdf(c + 1, r) - H.boltSdf(c - 1, r)) / 2, gy = (H.boltSdf(c, r + 1) - H.boltSdf(c, r - 1)) / 2, l = Math.hypot(gx, gy)
      if (l < .95) continue
      const i = r * 144 + c
      worst = Math.max(worst, Math.abs(t.x[i] * -gy / l + t.y[i] * gx / l))
    }
    assert('patch: satin tangents ⟂ the motif\'s iso-lines (|T·∇d⊥| ≤ .05)', worst <= .05, `worst ${worst.toFixed(3)}`)
    const st = g.run
    let ok = true
    for (const tt of [0, .3, .6, 3, 12.6, 24.5, 30]) {
      const s = H.sewing(tt, st.count, st.total), dots = atClock(() => frameOf(byId('mat-patch'), tt)).filter(d => d.color === dot480.dotActive)
      const want = st.at(s.s), [x, y] = dots.length === 1 ? cell(dots[0]) : [NaN, NaN]
      if (tt >= H.SEW.unpick && s.sewn !== Math.floor(s.phase * st.count)) ok = false
      if (!(Math.hypot(x - want[0], y - want[1]) <= .01)) ok = false
    }
    const s0 = H.sewing(0, st.count, st.total)
    assert('patch: stitches sewn = floor(lap phase · count); needle at at(sewn)', ok && s0.sewn === st.count && s0.s === 0, `${st.count} stitches; t 0 → ${s0.sewn} sewn`)
  }
  // ── rust ──
  {
    const rust = byId('mat-rust'), p = H.rustPlate('66')
    let worst = 0
    for (const days of [10, 30, 66, 120, 200, 365]) {
      const want = H.rustCover(days), theta = H.rustThreshold(p, want)
      let n = 0
      for (let i = 0; i < p.rust.length; i++) if (p.n.mask[i] > .5 && p.rust[i] > theta) n++
      worst = Math.max(worst, Math.abs(n / p.total - want))
    }
    assert('rust: coverage(days) within ±1% of 1 − e^(−days/180) (histogram threshold)', worst <= .01 && atClock(() => H.daysSince(new Date())) === 66, `worst ${(100 * worst).toFixed(2)}%`)
    const theta = H.rustThreshold(p, H.rustCover(66))
    let ra = 0, rn = 0, ua = 0, un = 0
    for (let i = 0; i < p.rust.length; i++) { if (!(p.n.mask[i] > .5)) continue; if (p.rust[i] > theta) { ra += p.ao.data[i]; rn++ } else { ua += p.ao.data[i]; un++ } }
    assert('rust: crevices rust before open plate (mean ao of rusted < unrusted)', ra / rn < ua / un, `${(ra / rn).toFixed(3)} < ${(ua / un).toFixed(3)}`)
    const w = H.rustWorld
    worldReset(w)
    const front = reds(rust, 0), ls = atClock(() => withChrome(rust)({ t: 0, data: { ...rust.defaults } }))
    atClock(() => withChrome(rust)({ t: 20, data: { ...rust.defaults } }))
    // a click holds the button for a few frames: the world forks on the first and takes the kick on the next
    for (let k = 1; k <= 3; k++) atClock(() => withChrome(rust)({ t: 20 + k / 30, data: { ...rust.defaults, k: 1 } }))
    const forked = w.mode === 'live'
    atClock(() => withChrome(rust)({ t: 20.5, data: { ...rust.defaults } }))
    const sanded = atClock(() => H.rustShown(w.live, new Date()))
    let t = 20.5
    while (w.mode !== 'pristine' && t < 40) { t += 1 / 12; atClock(() => withChrome(rust)({ t, data: { ...rust.defaults } })) }
    assert('rust: front ≤ 250 dots, the only active layer; RESET forks live and heals', front.length > 0 && front.length <= 250 && ls.filter(l => l.tone === 'active').length === 1 && forked && sanded.count === 0 && w.mode === 'pristine', `${front.length} front dots; reset shows ${sanded.count}, pristine again at t ${t.toFixed(1)}`)
    worldReset(w)
  }
  // ── candle ──
  {
    const candle = byId('mat-candle'), top = H.candleTop(9 + 41 / 60), red = reds(candle, 1.3), ys = red.map(d => cell(d)[1]), drips = H.candleDrips()
    assert('candle: the top burns down 4 cells an hour (96 at midnight); the flame is the one red layer, above the wax', Math.abs(top - (H.CANDLE.full + 4 * (9 + 41 / 60))) < 1e-9 && red.length > 6 && ys.every(y => y < top) && drips.length === 3 && drips.every(d => d.length >= 3), `top row ${top.toFixed(1)}, flame ${red.length} dots`)
  }
}

