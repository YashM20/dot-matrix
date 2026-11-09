/**
 * Touching dots (warn only; #225 macro review, INTERFACES cause 3). Every card is sampled at t = 0 one site layer at
 * a time, and a pair of visible dots of the same layer closer than the sum of their radii is a touch: two dots that
 * fuse into a bar or a blob at zoom. Lattice and card-grid layers keep a gap by construction (dot < pitch), so only
 * site layers (`Layer.sites`) are checked. It prints, it never fails: `pnpm verify` runs it as a report.
 *
 *   npx tsx scripts/touching.ts            # the report, worst cards first
 *   npx tsx scripts/touching.ts settings   # one card, with the touching pairs
 */
import { sampleLayers } from '../src/engine/sampler/gridSampler'
import type { DotInstance } from '../src/engine/types'
import { withChrome, type WidgetPreset } from '../src/widgets'
import { uniquePresets } from './lib/cards'
import { theme, visible } from './lib/stats'

export interface Touch { layer: number; a: [number, number]; b: [number, number]; overlap: number }

/** The touching pairs among `dots` (radii and centres in px): a grid bucket per cell of the largest diameter. */
export function touchingPairs(dots: DotInstance[], eps = 1e-3): [DotInstance, DotInstance][] {
  const lit = dots.filter(d => visible(d) && d.join === undefined && d.aspect === undefined)
  if (lit.length < 2) return []
  const cell = Math.max(...lit.map(d => 2 * d.r)), buckets = new Map<string, DotInstance[]>(), out: [DotInstance, DotInstance][] = []
  for (const d of lit) {
    const cx = Math.floor(d.x / cell), cy = Math.floor(d.y / cell)
    for (let j = cy - 1; j <= cy + 1; j++) for (let i = cx - 1; i <= cx + 1; i++)
      for (const e of buckets.get(`${i},${j}`) ?? []) if (Math.hypot(d.x - e.x, d.y - e.y) < d.r + e.r - eps) out.push([e, d])
    const k = `${cx},${cy}`, b = buckets.get(k)
    if (b) b.push(d); else buckets.set(k, [d])
  }
  return out
}

/** Every touch on card `p` at t = 0, per site layer (positions in card cells). */
export function cardTouches(p: WidgetPreset): Touch[] {
  const pitch = p.grid.pitch ?? theme.gridPx, cell = (d: DotInstance): [number, number] => [+(d.x / pitch - .5).toFixed(2), +(d.y / pitch - .5).toFixed(2)]
  const layers = withChrome(p)({ t: 0, data: { ...p.defaults } }), out: Touch[] = []
  layers.forEach((l, i) => {
    if (!l.sites?.length) return
    for (const [a, b] of touchingPairs(sampleLayers([l], p.grid, p.style, theme)))
      out.push({ layer: i, a: cell(a), b: cell(b), overlap: +((a.r + b.r - Math.hypot(a.x - b.x, a.y - b.y)) / pitch).toFixed(2) })
  })
  return out
}

/** The report: cards with touching dots, worst first (warn only). Returns the number of cards that touch. */
export function touchingReport(log: (line: string) => void = console.warn, top = 20): number {
  const rows: [string, number, number][] = []
  for (const p of uniquePresets()) {
    let touches: Touch[]
    try { touches = cardTouches(p) } catch { continue } // a card that can't sample headless (icons, media) is the smoke test's job
    if (touches.length) rows.push([p.id, touches.length, new Set(touches.map(t => t.layer)).size])
  }
  rows.sort((a, b) => b[1] - a[1])
  if (!rows.length) { console.log('✓ touching dots: no site layer has dots closer than their radii'); return 0 }
  log(`⚠ touching dots (warn only): ${rows.length} card(s), ${rows.reduce((n, r) => n + r[1], 0)} pair(s) in site layers; worst ${Math.min(top, rows.length)}:`)
  for (const [id, n, l] of rows.slice(0, top)) log(`    ${id}: ${n} pair(s) in ${l} layer(s)`)
  return rows.length
}

if (/touching\.ts$/.test(process.argv[1] ?? '')) {
  const id = process.argv[2]
  if (id) {
    const p = uniquePresets().find(q => q.id === id)
    if (!p) { console.error(`unknown card ${id}`); process.exit(1) }
    const touches = cardTouches(p)
    console.log(`${id}: ${touches.length} touching pair(s)`)
    for (const t of touches.slice(0, 40)) console.log(`  layer ${t.layer}: (${t.a.join(', ')}) ~ (${t.b.join(', ')}) overlap ${t.overlap} cells`)
  } else touchingReport()
}
