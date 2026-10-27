/**
 * F0's golden-key slot (docs/living-matter/F0-foundation.md §3): the golden key and its one-time `style`
 * backfill (F0.5). Called from verify.ts (`goldenKeyChecks(assert)`); also runnable alone:
 * `npx tsx scripts/goldenkey.ts`.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import type { DotInstance, DotStyle } from '../src/engine/types'
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
    const presets = uniquePresets()
    let dots = 0
    const off: string[] = []
    for (const p of presets) for (const t of [0, 1.3]) {
      const ds = sampleCard(p, t)
      dots += ds.length
      const bad = ds.find(d => dotKey(d, p.style) !== legacyKey(d))
      if (bad) off.push(`${p.id} t=${t}: ${dotKey(bad, p.style)}`)
    }
    assert(`golden key: dotKey ≡ legacyKey on every dot of all ${presets.length} presets at t=0 and t=1.3`, !off.length && presets.length >= 177,
      off.length ? off.slice(0, 4).join('; ') : `${dots} dots`)

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
}

const self = process.argv[1]?.replace(/\\/g, '/')
if (self && import.meta.url.endsWith(self.split('/').slice(-2).join('/'))) {
  let failures = 0
  goldenKeyChecks((name, cond, detail = '') => { if (!cond) failures++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) })
  if (failures) process.exit(1)
}
