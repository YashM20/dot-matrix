/**
 * Automated fidelity scorecard (docs/MASTER-PLAN.md §2.2 gates G1–G3, G5 + §2.6 metrics).
 *
 *   pnpm fidelity                 # every preset (same as --all)
 *   pnpm fidelity timer level-03  # some presets
 *   pnpm fidelity --all --json    # also write .snapshots/fidelity.json
 *
 * G1 dot integrity  base-grid dots off their cell centre (lattice/site dots excluded; skipped for
 *                   jittered styles), NaN/∞ dots, visible dots with zero radius.       pass = 0/0/0
 * G2 accent         layers with tone 'active' and red (dotActive/activeDim) dot count. informational
 *                   until `accentRole` lands.
 * G3 lattice ladder explicit lattice values off {0.72,1,1.3,1.6,2,2.5,3,4} (±0.01).        pass = 0
 *                   Site sizes off the ladder are counted too, but informational (knob sites are huge).
 * G5 perf           median of 5 (after warm-up) layers()+sampleLayers: static mount ≤ 30 ms,
 *                   animated frame ≤ 4 ms.
 * Metrics           10-bin tonal histogram (digits = relative bin height), opacity spread p90−p10,
 *                   visible dots, ink coverage (Σπr² / card area), densest 8×8 block vs lit centroid
 *                   block, and for animated cards centroid speed (cells/frame at 12 fps) and the
 *                   fraction of dots changed per frame (mean over t = 0…1 s).
 *
 * The scoring itself lives in `scripts/lib/fidelity.ts` (`scoreFidelity`), shared with `scripts/author/`.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { widgetById } from '../src/widgets'
import { uniquePresets } from './lib/cards'
import { scoreFidelity } from './lib/fidelity'
import { freezeWallClock } from './lib/freeze'

freezeWallClock()
const args = process.argv.slice(2), json = args.includes('--json')
const ids = args.filter(a => !a.startsWith('--'))
const presets = ids.length && !args.includes('--all') ? ids.map(id => widgetById(id) ?? (console.error(`unknown card ${id}`), process.exit(1))) : uniquePresets()

const cards = presets.map(scoreFidelity)
const spark = (h: number[]) => { const mx = Math.max(1, ...h); return h.map(x => (x ? Math.max(1, Math.round((x / mx) * 9)) : 0)).join('') }
const pad = (s: string | number, n: number) => String(s).padEnd(n)
const lpad = (s: string | number, n: number) => String(s).padStart(n)
const head = `${pad('card', 18)} ${pad('board', 10)} ${pad('G1 off/nan/r0', 14)} ${pad('G2 act/red', 11)} ${pad('G3 lat-off size-off', 22)} ${pad('G5 ms/budget', 14)} ${lpad('dots', 6)} ${pad('hist 0→1', 10)} ${lpad('sprd', 5)} ${lpad('cov%', 5)} ${pad('dense/ctr', 10)} motion c/f chg%`
console.log(head); console.log('-'.repeat(head.length + 4))
for (const c of cards) {
  const g1 = `${c.g1.pass ? 'ok' : 'FAIL'} ${c.g1.jitter ? 'jit' : c.g1.offGrid}/${c.g1.nonFinite}/${c.g1.zeroRadius}`
  const list = (ks: number[]) => (ks.length ? `${ks.length}(${ks.slice(0, 3).join(',')}${ks.length > 3 ? '…' : ''})` : '0')
  const g3 = `${c.g3.pass ? 'ok' : 'FAIL'} ${list(c.g3.offLadder)} ${list(c.g3.offLadderSizes)}`
  const g5 = `${c.g5.pass ? 'ok' : 'FAIL'} ${c.g5.ms.toFixed(1)}/${c.g5.budgetMs}`
  const dm = `${c.metrics.densestBlock.join(',')}/${c.metrics.centroidBlock.join(',')}`
  const mo = c.motion ? `${c.motion.cellsPerFrame.toFixed(2)} ${(c.motion.changedFraction * 100).toFixed(0)}%` : ''
  console.log(`${pad(c.id, 18)} ${pad(c.board, 10)} ${pad(g1, 14)} ${pad(`${c.g2.activeLayers}/${c.g2.redDots}`, 11)} ${pad(g3, 22)} ${pad(g5, 14)} ${lpad(c.metrics.dots, 6)} ${pad(spark(c.metrics.histogram), 10)} ${lpad(c.metrics.spread.toFixed(2), 5)} ${lpad(c.metrics.coverage.toFixed(1), 5)} ${pad(dm, 10)} ${mo}`)
}
const fails = (g: 'g1' | 'g3' | 'g5') => cards.filter(c => !c[g].pass).length
console.log(`\n${cards.length} cards — G1 fail ${fails('g1')}, G3 fail ${fails('g3')}, G5 fail ${fails('g5')}; G2 info: ${cards.filter(c => c.g2.activeLayers > 1).length} cards with >1 active layer`)
if (json) { mkdirSync('.snapshots', { recursive: true }); writeFileSync('.snapshots/fidelity.json', JSON.stringify(cards, null, 1)); console.log('.snapshots/fidelity.json') }
