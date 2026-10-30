/**
 * F0's golden-key slot (docs/living-matter/F0-foundation.md §3): the golden key and its one-time `style`
 * backfill (F0.5), the square site cover (F0.6) and per-card fps (F0.10). Called from verify.ts
 * (`goldenKeyChecks(assert)`); also runnable alone:
 * `npx tsx scripts/goldenkey.ts`.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import type { DotInstance, DotStyle, Layer } from '../src/engine/types'
import { coverExponent, hides } from '../src/engine/sampler/cover'
import { sampleLayers, sampleLayersInto } from '../src/engine/sampler/gridSampler'
import { mulberry32 } from '../src/engine/sampler/jitter'
import { createDotBuffer, toDots } from '../src/engine/buffer/dotBuffer'
import { dot480 } from '../src/engine/theme/tokens'
import { cardFps, tierOf } from '../src/widgets/fps'
import { widgetPresets } from '../src/widgets'
import { withChrome, type WidgetPreset } from '../src/widgets/types'
import { freezeWallClock } from './lib/freeze'
import { sampleCard, uniquePresets } from './lib/cards'
import { CHANNELS, diffGoldens, dotKey, goldenRow, legacyKey, styleSig, type Goldens } from './lib/goldenKey'

type Assert = (name: string, cond: boolean, detail?: string) => void
const FILE = 'goldens/hashes.json'

/** `git show <rev>:goldens/hashes.json` as presets, or undefined (no git, shallow history, no such rev). */
function goldensAt(rev: string): Goldens | undefined {
  const r = spawnSync('git', ['show', `${rev}:${FILE}`], { encoding: 'utf8', maxBuffer: 64 << 20 })
  if (r.status !== 0 || !r.stdout) return undefined
  try { return JSON.parse(r.stdout).presets } catch { return undefined }
}
const hasStyle = (g: Goldens) => Object.values(g).every(row => Object.values(row).every(e => typeof e.style === 'string'))

export function goldenKeyChecks(assert: Assert): void {
  // sample like `pnpm golden`: frozen wall clock (restored after, the rest of verify reads the real one)
  const RealDate = Date
  freezeWallClock()
  try {
    // F0.5) the key
    // A dot keys as legacyKey + its channel suffixes. Every dot of a card without join / shapeOf layers (the 177 pre-F0
    // cards and every plain card since) must carry no suffix, so no existing hash can move; dots of cards that opt in
    // (squares: `join`, `shapeOf`) carry exactly their channels after the unchanged legacy prefix.
    const presets = uniquePresets()
    let dots = 0, suffixed = 0
    const off: string[] = [], opted = new Set<string>()
    const optsIn = (p: WidgetPreset, t: number) => withChrome(p)({ t, data: { ...p.defaults } }).some(l => l.join !== undefined || l.shapeOf !== undefined || typeof l.lattice === 'object' || l.sizeAxis !== undefined)
    for (const p of presets) for (const t of [0, 1.3]) {
      const ds = sampleCard(p, t), canSuffix = optsIn(p, t)
      dots += ds.length
      for (const d of ds) {
        const k = dotKey(d, p.style), L = legacyKey(d)
        if (k === L) continue
        if (canSuffix && k.startsWith(L)) { suffixed++; opted.add(p.id); continue }
        off.push(`${p.id} t=${t}: ${k}`); break
      }
    }
    assert(`golden key: dotKey ≡ legacyKey on every dot of all ${presets.length} presets at t=0 and t=1.3, except the channel suffixes of join / shapeOf / rect-cell cards`, !off.length && presets.length >= 177,
      off.length ? off.slice(0, 4).join('; ') : `${dots} dots; ${suffixed} suffixed on ${[...opted].join(', ') || 'none'}`)

    const base: DotStyle = { shape: 'squircle', sizeMin: .2, sizeMax: .95, cornerRoundness: .1 }
    const d0: DotInstance = { x: 1.5, y: 2.25, r: .5, opacity: .6, color: '#fff', shape: 'squircle', roundness: .1 }
    const joint = { hx: .5, hy: .25, ro: .125, ri: .0625, seam: .1 }
    const L = legacyKey(d0), suffix = (d: Partial<DotInstance>) => dotKey({ ...d0, ...d }, base).slice(L.length)
    const want: [string, Partial<DotInstance>, string][] = [
      ['unchanged', {}, ''],
      ['unstamped', { shape: undefined, roundness: undefined }, ''],
      ['shape≠base', { shape: 'square' }, ',ssquare:0.100'],
      ['roundness≠base', { roundness: 1 }, ',ssquircle:1.000'],
      ['join+joint', { join: 0b101000000011, joint }, `,j${0b101000000011}:0.500:0.250:0.125:0.063:0.100`],
      ['rot≠0 (radians)', { rot: Math.PI / 4 }, ',θ0.785'],
      ['rot 0', { rot: 0 }, ''],
      ['aspect≠1', { aspect: 2 }, ',a2.000'],
      ['aspect 1', { aspect: 1 }, ''],
      ['motif', { motif: 'tri' }, ',mtri'],
      ['all, in table order', { shape: 'square', join: 3, joint, rot: -Math.PI / 2, aspect: .5, motif: 'x' }, ',ssquare:0.100,j3:0.500:0.250:0.125:0.063:0.100,θ-1.571,a0.500,mx'],
    ]
    const wrong = want.map(([name, d, s]) => [name, suffix(d), s]).filter(([, got, s]) => got !== s)
    assert('golden key: each channel appears only on its trigger (synthetic dots: shape≠base, join+joint, rot≠0 in radians, aspect≠1, motif); channel order fixed',
      !wrong.length && CHANNELS.length === 5, wrong.map(([n, got, s]) => `${n}: "${got}" want "${s}"`).join('; ') || `${want.length} cases`)
    let threw = ''
    try { dotKey({ ...d0, join: 1 }, base) } catch (e) { threw = (e as Error).message }
    assert('golden key: join without joint throws', /no joint/.test(threw), threw)

    // the backfill: the commit that added `style` kept every hash/dots pair of its parent
    const now: Goldens = JSON.parse(readFileSync(FILE, 'utf8')).presets, head = goldensAt('HEAD')
    let before: Goldens | undefined, after: Goldens | undefined, where = ''
    if (head && !hasStyle(head)) { before = head; after = now; where = 'HEAD → working tree' }
    else if (head) {
      const log = spawnSync('git', ['log', '--reverse', '--format=%H', '-S"style"', '--', FILE], { encoding: 'utf8' })
      const c = log.status === 0 ? log.stdout.trim().split('\n')[0] : ''
      if (c) { before = goldensAt(`${c}^`); after = goldensAt(c); where = `${c.slice(0, 7)}^ → ${c.slice(0, 7)}` }
    }
    if (before && after) {
      const ids = Object.keys(before), same = ids.length === Object.keys(after).length && ids.every(id => id in after)
      const moved = ids.filter(id => after[id] && Object.keys({ ...before[id], ...after[id] }).some(t => before[id][t]?.hash !== after[id][t]?.hash || before[id][t]?.dots !== after[id][t]?.dots))
      assert(`golden key: backfill kept all ${ids.length} hashes`, same && !moved.length && hasStyle(after) && ids.length >= 177,
        `${where}${same ? '' : '; preset set differs'}${moved.length ? `; moved: ${moved.slice(0, 5).join(', ')}` : ''}${hasStyle(after) ? '' : '; an entry has no style'}`)
    } else assert('golden key: backfill kept all hashes (backfill commit not in this history, e.g. a shallow clone: every entry has style)', hasStyle(now))

    // --check sees a style-only change: a whole-card square restyle that moves no dot centre
    // (the first static preset whose dot list the restyle leaves alone: square `sites` dots cover more cells, F0.6)
    let restyle: { id: string; was: Goldens; now: Goldens } | undefined
    for (const p of presets.filter(q => !q.animated).slice(0, 40)) {
      const sq: DotStyle = { ...p.style, shape: 'square' }, was: Goldens = { [p.id]: goldenRow(p) }, now: Goldens = { [p.id]: goldenRow(p, sq) }
      if (was[p.id]['t=0'].hash === now[p.id]['t=0'].hash && now[p.id]['t=0'].style === `square:${styleSig(p.style).split(':')[1]}`) { restyle = { id: p.id, was, now }; break }
    }
    const diff = restyle && diffGoldens(restyle.was, restyle.now), line = diff?.changed[0] ?? ''
    assert('golden key: --check reports a style-only change (synthetic square restyle of one preset in memory)',
      !!diff && diff.changed.length === 1 && !diff.added.length && !diff.removed.length && /style squircle:[\d.]+→square:/.test(line) && !/ dots\)/.test(line),
      restyle ? line : 'no preset keeps its dot list under a square restyle')
  } finally { globalThis.Date = RealDate }
  coverChecks(assert)
  fpsChecks(assert)
}

/** F0.10) per-card fps and the phone tier (src/widgets/fps.ts). */
function fpsChecks(assert: Assert): void {
  const rows: [number, number, number][] = [[12, 12, 12], [30, 30, 15], [60, 60, 30], [20, 20, 12], [8, 8, 8], [24, 24, 12], [25, 25, 13]]
  const bad = rows.filter(([b, full, phone]) => cardFps(b, 'full') !== full || cardFps(b, 'phone') !== phone || cardFps(b, 'phone') > b)
  const tiers = tierOf(true, false, 16) === 'phone' && tierOf(false, true, 16) === 'phone' && tierOf(false, false, 4) === 'phone' && tierOf(false, false, 5) === 'full' && tierOf(false, false, undefined) === 'full'
  assert('fps: cardFps full → base; phone → max(12, round(base/2)), never above base (12 → 12, 30 → 15, 60 → 30, 20 → 12)', !bad.length && tiers,
    `${bad.map(([b]) => `${b} → ${cardFps(b, 'phone')}`).join(', ')}${tiers ? '' : ' tier rules (coarse pointer, saveData, ≤ 4 cores) wrong'}` || 'phone tier: coarse pointer, saveData or ≤ 4 cores')
  // the allow-list is DESIGN.md's "Cards that declare a rate" table: every declared fps is a row there, with the same rate
  const declared = new Map(widgetPresets.filter(p => p.fps !== undefined).map(p => [p.id, p.fps!]))
  const design = readFileSync('DESIGN.md', 'utf8'), at = design.indexOf('Cards that declare a rate:')
  const table = new Map<string, number>()
  if (at >= 0) for (const line of design.slice(at).split('\n').slice(1)) {
    const m = /^\s*\|\s*`([\w-]+)`\s*\|\s*(\d+)\s*\|/.exec(line)
    if (m) table.set(m[1], Number(m[2]))
    else if (table.size && !/^\s*\|/.test(line)) break
  }
  const drift = [...new Set([...declared.keys(), ...table.keys()])].filter(id => declared.get(id) !== table.get(id)).map(id => `${id}: preset ${declared.get(id) ?? '-'}, DESIGN.md ${table.get(id) ?? '-'}`)
  const src = readFileSync('src/components/DotWidget.tsx', 'utf8')
  const passes = src.includes("camera.status === 'live' ? 30 : preset.fps !== undefined ? cardFps(preset.fps, fpsTier()) : undefined") && (src.match(/ fps=\{fps\}/g) ?? []).length === 2
  assert('fps: the presets that declare fps are exactly DESIGN.md\'s fps table, at its rates (DotWidget passes the tiered fps to DotCanvas and the X-ray overlay)', table.size > 0 && !drift.length && passes,
    !table.size ? 'no fps table under "Cards that declare a rate:" in DESIGN.md' : drift.length ? drift.join('; ') : passes ? [...declared].map(([id, f]) => `${id} ${f}`).join(', ') : 'DotWidget no longer passes the tiered fps to both')
}

/** The site cover before F0.6 (gridSampler.ts:222-225 at c619dae), frozen: the cells a site at (x, y) of size k hid. */
function legacyCover(x: number, y: number, k: number, cols: number, rows: number): Set<number> {
  const out = new Set<number>(), reach = k / 2 + .25
  for (let r = Math.max(0, Math.ceil(y - reach)); r <= Math.min(rows - 1, Math.floor(y + reach)); r++)
    for (let c = Math.max(0, Math.ceil(x - reach)); c <= Math.min(cols - 1, Math.floor(x + reach)); c++)
      if (Math.hypot(c - x, r - y) <= reach) out.add(r * cols + c)
  return out
}
/** The same scan through `hides()` (what the sampler runs now). */
function hidesCover(x: number, y: number, k: number, cols: number, rows: number, n: number): Set<number> {
  const out = new Set<number>(), reach = k / 2 + .25
  for (let r = Math.max(0, Math.ceil(y - reach)); r <= Math.min(rows - 1, Math.floor(y + reach)); r++)
    for (let c = Math.max(0, Math.ceil(x - reach)); c <= Math.min(cols - 1, Math.floor(x + reach)); c++)
      if (hides(c - x, r - y, reach, n)) out.add(r * cols + c)
  return out
}

/** F0.6) the square cover for `sites` (src/engine/sampler/cover.ts). */
function coverChecks(assert: Assert): void {
  const rnd = mulberry32(0xc0e7), cols = 40, rows = 40, pitch = 4
  const grid = { cols, rows, pitch }, sq: DotStyle = { shape: 'square', sizeMin: .3, sizeMax: 1.6, cornerRoundness: 1, opacityMode: 'fromValue', quantizeSteps: 5 }
  // a full card under three site layers (sizes 1.5, 2.5, 3.5) at fractional positions
  const sited: Layer[] = [1.5, 2.5, 3.5].map(size => ({ field: () => 1, size, sites: Array.from({ length: 12 }, () => [1 + rnd() * (cols - 2), 1 + rnd() * (rows - 2)] as [number, number]) }))
  const layers: Layer[] = [{ field: () => .8 }, ...sited]
  const all = sited.flatMap(l => l.sites!.map(([x, y]) => ({ x, y, reach: l.size! / 2 + .25 })))
  const dots = sampleLayers(layers, grid, sq, dot480), card = dots.slice(all.length)
  const under = card.filter(d => { const c = d.x / pitch - .5, r = d.y / pitch - .5; return all.some(s => Math.max(Math.abs(c - s.x), Math.abs(r - s.y)) <= s.reach) })
  // the circle rule would have left these card cells showing at the square sites' corners
  const leak = new Set<number>()
  for (const s of all) {
    const old = legacyCover(s.x, s.y, (s.reach - .25) * 2, cols, rows)
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (Math.max(Math.abs(c - s.x), Math.abs(r - s.y)) <= s.reach && !old.has(r * cols + c)) leak.add(r * cols + c)
  }
  assert("sampler: square site dots hide every card cell under them (shape square and cornerRoundness 1; no card dot centre inside any site's Chebyshev reach)",
    dots.length - card.length === all.length && !under.length && card.length > 0 && leak.size > 0,
    `${all.length} sites, ${card.length} card dots, ${under.length} under a site; the circle rule leaked ${leak.size} corner cells`)

  const nOf = (r: number) => coverExponent('squircle', r)
  const bands = [
    nOf(0) === 2 && nOf(.1) <= 2.5 && nOf(.129) <= 2.5 && nOf(.13) > 2.5 && nOf(.44) < 8 && nOf(.448) >= 8,
    coverExponent('superformula', .9) === 2 && coverExponent('circle', .9) === 2 && coverExponent('square') === Infinity,
    // (.75, .75): outside the circle, inside an n = 2.5 superellipse; the ≤ 2.5 band must answer like the circle
    !hides(.75, .75, 1, 2.5) && hides(.75, .75, 1, 2.51) && .75 ** 2.5 * 2 <= 1,
    // (.9, .9): inside the Chebyshev square, outside n = 4; (.95, .95) outside n = 7.8, inside n ≥ 8
    hides(.9, .9, 1, Infinity) && !hides(.9, .9, 1, 4) && hides(.7, .7, 1, 4) && !hides(.95, .95, 1, nOf(.44)) && hides(.95, .95, 1, nOf(.448)) && hides(1, -1, 1, 8) && !hides(1.001, 0, 1, 8),
  ]
  assert("sampler: hides bands: n ≤ 2.5 (r ≤ .129) circle, n ≥ 8 (r ≥ .447) Chebyshev, superellipse between; 'superformula' → n 2", bands.every(Boolean), bands.map(b => (b ? 'ok' : 'FAIL')).join(' '))

  let diamond = 0, quarter = 0, general = 0, circle = 0, N = 0
  for (let i = 0; i < 4000; i++) {
    const dx = (rnd() - .5) * 5, dy = (rnd() - .5) * 5, R = .5 + rnd() * 2
    N++
    for (const rot of [Math.PI / 4, -Math.PI / 4, 5 * Math.PI / 4]) if (hides(dx, dy, R, Infinity, rot) !== (Math.abs(dx) / R + Math.abs(dy) / R <= Math.SQRT2)) diamond++
    for (const n of [3, 4, 7, Infinity]) {
      for (const rot of [Math.PI / 2, -Math.PI / 2, Math.PI, 3 * Math.PI / 2, 2 * Math.PI]) if (hides(dx, dy, R, n, rot) !== hides(dx, dy, R, n, 0)) quarter++
      for (const rot of [.3, 1.1, -2, 2.9]) {
        const c = Math.cos(rot), s = Math.sin(rot)
        if (hides(dx, dy, R, n, rot) !== hides(dx * c + dy * s, dy * c - dx * s, R, n, 0)) general++
      }
    }
    for (const rot of [.3, Math.PI / 4]) if (hides(dx, dy, R, 2.3, rot) !== (Math.hypot(dx, dy) <= R)) circle++
  }
  assert('sampler: hides rot = π/4 is the diamond ax + ay ≤ √2; rot = π/2 ≡ rot 0; general rot ≡ an explicitly rotated offset',
    !diamond && !quarter && !general && !circle, `${N} offsets: diamond ${diamond}, quarter ${quarter}, general ${general}, circle-ignores-rot ${circle} mismatches`)

  let sites = 0, cells = 0, diff = 0
  const forms: [DotStyle['shape'], number][] = [['squircle', 0], ['squircle', .1], ['squircle', .129], ['circle', .9], ['superformula', .5]]
  for (let i = 0; i < 1e4; i++) {
    const x = rnd() * cols, y = rnd() * rows, k = 1 + rnd() * 3, old = legacyCover(x, y, k, cols, rows)
    sites++; cells += old.size
    for (const [shape, r] of forms) {
      const now = hidesCover(x, y, k, cols, rows, coverExponent(shape, r))
      if (now.size !== old.size || [...old].some(c => !now.has(c))) diff++
    }
  }
  assert('sampler: circle/squircle ≤ 2.5 cover ≡ legacy (frozen copy of :222-225) on 1e4 random sites, k ∈ [1, 4]', !diff && sites === 1e4,
    `${sites} sites × ${forms.length} forms, ${cells} legacy cells, ${diff} differ`)

  let same = true, worst = 0
  for (const style of [sq, { ...sq, shape: 'squircle', cornerRoundness: .3 } as DotStyle, { ...sq, shape: 'squircle', cornerRoundness: .1 } as DotStyle]) {
    const a = sampleLayers(layers, grid, style, dot480), b = toDots(sampleLayersInto(layers, grid, style, dot480, createDotBuffer(64)))
    same &&= a.length === b.length
    for (let i = 0; same && i < a.length; i++) {
      const e = Math.max(Math.abs(a[i].x - b[i].x), Math.abs(a[i].y - b[i].y), Math.abs(a[i].r - b[i].r), Math.abs(a[i].opacity - b[i].opacity))
      worst = Math.max(worst, e); same = e <= 1e-4 * Math.max(1, Math.abs(a[i].x), Math.abs(a[i].y)) && a[i].color === b[i].color && a[i].shape === b[i].shape
    }
  }
  assert('sampler: DotBuffer path emits the same set (sampleLayersInto vs sampleLayers)', same, `square, squircle .3 and .1 sites; max float32 error ${worst.toExponential(1)}`)
}

const self = process.argv[1]?.replace(/\\/g, '/')
if (self && import.meta.url.endsWith(self.split('/').slice(-2).join('/'))) {
  let failures = 0
  goldenKeyChecks((name, cond, detail = '') => { if (!cond) failures++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) })
  if (failures) process.exit(1)
}
