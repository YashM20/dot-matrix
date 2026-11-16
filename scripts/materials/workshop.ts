/** Materials checks, workshop and tilt groups (scripts/materials.ts): the workshop board's four cards, the ice card's world, and M3.10 tilt on both boards. */
import { readFileSync } from 'node:fs'
import { matcapMatrix } from '../../src/engine/matter'
import { hourOf, lightDir, sunAt, type Vec3 } from '../../src/engine/light'
import { worldReset } from '../../src/engine/physics/world'
import { sceneLight } from '../../src/engine/light/input'
import { sampleLayers } from '../../src/engine/sampler/gridSampler'
import { dot480 } from '../../src/engine/theme/tokens'
import type { Pointer } from '../../src/engine/context'
import { TILE, withChrome, type WidgetPreset } from '../../src/widgets/types'
import { textSize } from '../../src/engine/layout'
import { lightBoard } from '../../src/widgets/boards/light'
import { workshopBoard, workshopHooks, workshopSources } from '../../src/widgets/boards/workshop'
import { lightTrace } from '../../src/widgets/boards/materials-shared'
import { materialsBoard } from '../../src/widgets/boards/materials'
import { bucketLight, lightOfBucket } from '../../src/engine/light/input'
import { dla } from '../../src/engine/algo/dla'
import { fmtLoaded, medianLoaded, onceLoaded, type Loaded } from '../lib/load'
import { type Assert, same, DEG, type MaterialsOptions } from './util'
import { POINTER, atClock } from './board'

// ── workshop (M3, M §5) ───────────────────────────────────────────────────────────────────────────────
const wsFrame = (p: WidgetPreset, t: number, pointers?: Pointer[], data?: Record<string, number>) =>
  sampleLayers(withChrome(p)({ t, data: { ...p.defaults, ...data }, pointers }), p.grid, p.style, dot480)

export async function workshopChecks(assert: Assert, opts: MaterialsOptions): Promise<void> {
  const H = workshopHooks, board = workshopBoard, byId = (id: string) => board.find(p => p.id === id)!
  // cold: a warm copy of the three modules draws every card (so the engine is hot, as in the app), then a fresh copy's
  // first frame is timed: its bakes and its own code's first run
  type Cards = WidgetPreset[]
  const copy = async (tag: string): Promise<Cards | null> => {
    const stamp = `${tag}${Date.now()}`, files = ['workshop', 'workshop-ice', 'workshop-frost', 'workshop-kintsugi', 'workshop-kintsugi-shade', 'workshop-fold']
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
    if (t === 0 && !dots.length) { accent = false; detail = `${p.id}: no accent at rest` }
  }
  assert('workshop board: one accent per card, on the live element, and every card shows it at t = 0 (the freezing cells, the sticking grains, the filling seam, the moving crease)', accent, detail)
  const dim = board.some(p => [0, 1.3, 6].some(t => atClock(() => withChrome(p)({ t, data: { ...p.defaults } })).some(l => l.tone === 'activeDim') || atClock(() => wsFrame(p, t)).some(d => d.color === dot480.dotActiveDim)))
  assert('workshop board: no activeDim (was-active is size contrast until the owner rules, M §10.6)', !dim)
  assert('workshop board: quantized (every card style has quantizeSteps ≥ 2)', board.every(p => (p.style.quantizeSteps ?? 0) >= 2))
  const keys = ['lightSrc', 'lightAz', 'lightEl', 'tx', 'ty']
  assert('workshop board: every card declares lightSrc/lightAz/lightEl/tx/ty in defaults', board.every(p => keys.every(k => p.defaults && k in p.defaults)) && workshopSources.length === 1)
  assert('workshop board: the four cards the owner kept (frost, ice, kintsugi, paper fold), once each', board.map(p => p.id).join() === 'mat-frost,mat-ice,mat-kintsugi,mat-fold')
  // the right-hand tag never runs into the card's title: no header dot in the 5 cells right of the title
  {
    const pitch = TILE.pitch!, bad: string[] = []
    for (const p of board) {
      const tw = textSize(p.name.toUpperCase())[0], cols = atClock(() => wsFrame(p, 0)).filter(d => d.y / pitch - .5 < 7).map(d => Math.round(d.x / pitch - .5))
      if (cols.some(c => c >= tw && c < tw + 5)) bad.push(p.id)
    }
    assert('workshop board: each tag stays 5 cells clear of the title', !bad.length, bad.join(', '))
  }
  const warm = (p: WidgetPreset, hover: boolean) => atClock(() => {
    for (let i = 0; i < 4; i++) wsFrame(p, i / 60, hover ? [POINTER(30 + i, 60)] : undefined)
    return medianLoaded(i => wsFrame(p, 5.5 + i / 60, hover ? [POINTER(34 + i, 60 + (i % 3))] : undefined), 13)
  })
  const rows = opts.quick ? [] : board.map(p => ({ id: p.id, rest: warm(p, false), hover: warm(p, true), cold: cold.find(c => c[0] === p.id)![1] }))
  for (const w of [H.iceWorld(), H.kintsugiWorld()]) worldReset(w)
  const within = (r: Loaded, budget: number) => r.ms <= budget * r.load
  if (!opts.quick) assert('workshop board: frame ≤ 4 ms (median, warm, × load), no pointer and a hovering torch', rows.every(r => within(r.rest, 4) && within(r.hover, 4)), rows.map(r => `${r.id} ${fmtLoaded(r.rest)}/${fmtLoaded(r.hover)}`).join(', '))
  if (!opts.quick) assert('workshop board: cold first frame ≤ 30 ms (× load)', !!coldCopy && rows.every(r => within(r.cold, 30)), rows.map(r => `${r.id} ${fmtLoaded(r.cold, 1)}`).join(', ') + (coldCopy ? '' : ' (no fresh module graph)'))
  if (opts.bench) {
    console.log('  workshop --bench (ms):   card            cold    warm   hover   (each ÷ its load)')
    for (const r of rows) console.log(`                           ${r.id.padEnd(14)} ${(r.cold.ms / r.cold.load).toFixed(1).padStart(6)} ${(r.rest.ms / r.rest.load).toFixed(2).padStart(7)} ${(r.hover.ms / r.hover.load).toFixed(2).padStart(7)}`)
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
  const files = ['materials', 'materials-shared', 'materials-glass', 'materials-live', 'materials-wear', 'workshop', 'workshop-ice', 'workshop-frost', 'workshop-kintsugi', 'workshop-kintsugi-shade', 'workshop-fold']
  const src = Object.fromEntries(files.map(f => [f, readFileSync(new URL(`../../src/widgets/boards/${f}.ts`, import.meta.url), 'utf8')]))
  assert('materials: no card reads DeviceOrientation directly (both boards)', files.every(f => !/DeviceOrientation|deviceorientation/.test(src[f])))
  const gravity = files.filter(f => /data\.g[xy]\b|data\[['"]g[xy]['"]\]/.test(src[f]))
  assert('materials: no card reads data.light or gx/gy (no gravity step on either board now)', files.every(f => !/data\.light\b/.test(src[f])) && !gravity.length,
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
