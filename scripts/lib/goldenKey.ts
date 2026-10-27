/**
 * The golden key (docs/living-matter/F0-foundation.md §2.5): the single owner of how one dot is turned
 * into the string `scripts/golden.ts` hashes, plus the entry/compare logic, so verify can unit-test it
 * (importing golden.ts would run that script).
 *
 * Per dot: `legacyKey` (x, y → 2dp; r, opacity → 3dp; colour), the pre-F0 key verbatim, plus one
 * suffix per optional channel that carries information. Pre-F0 dots carry none, so they key exactly
 * as before and no existing hash moves. Channels, in this fixed order:
 *
 *   shape   `,s<shape>:<roundness 3dp>`  dot shape or roundness differs from the preset's base style
 *   join    `,j<mask>:<hx>:<hy>:<ro>:<ri>:<seam>`  `join` set (`joint` required, params 3dp)
 *   rot     `,θ<radians 3dp>`  `rot` set and ≠ 0
 *   aspect  `,a<aspect 3dp>`  `aspect` set and ≠ 1
 *   motif   `,m<motif>`  `motif` set
 *
 * Tracks fill the `DotInstance` fields (src/engine/types.ts); they never edit the key format here.
 * Each golden entry also stores the whole-card `style` signature (`styleSig`, not hashed), so a
 * card-wide dot → square flip is caught even when no dot centre moves.
 */
import { squircleExponent } from '../../src/engine/renderer/shapePath'
import type { DotInstance, DotStyle } from '../../src/engine/types'
import type { WidgetPreset } from '../../src/widgets'
import { sampleCard } from './cards'

/** The pre-F0 key (golden.ts:28 before F0.5), kept verbatim. */
export const legacyKey = (d: DotInstance) => `${d.x.toFixed(2)},${d.y.toFixed(2)},${d.r.toFixed(3)},${d.opacity.toFixed(3)},${d.color}`

const f3 = (x: number) => x.toFixed(3)
/** The optional channels, in key order (the table above). Each returns '' when it carries nothing. */
export const CHANNELS: readonly ((d: DotInstance, base: DotStyle) => string)[] = [
  // shape: an unstamped dot (no `shape` / `roundness`) draws with the base style, so it carries nothing
  (d, base) => {
    const shape = d.shape ?? base.shape, r = d.roundness ?? base.cornerRoundness ?? 0
    return shape !== base.shape || r !== (base.cornerRoundness ?? 0) ? `,s${shape}:${f3(r)}` : ''
  },
  d => {
    if (d.join === undefined) return ''
    if (!d.joint) throw new Error(`golden key: dot at ${d.x},${d.y} has join ${d.join} but no joint (the sampler must stamp the resolved join params)`)
    const { hx, hy, ro, ri, seam } = d.joint
    return `,j${Math.round(d.join)}:${f3(hx)}:${f3(hy)}:${f3(ro)}:${f3(ri)}:${f3(seam)}`
  },
  d => (d.rot !== undefined && d.rot !== 0 ? `,θ${f3(d.rot)}` : ''),
  d => (d.aspect !== undefined && d.aspect !== 1 ? `,a${f3(d.aspect)}` : ''),
  d => (d.motif !== undefined ? `,m${d.motif}` : ''),
]
/** Golden key of one dot: legacyKey(d) + every channel's suffix. */
export function dotKey(d: DotInstance, base: DotStyle): string {
  let k = legacyKey(d)
  for (const ch of CHANNELS) k += ch(d, base)
  return k
}
/** Whole-card dot style: `<shape>:<n 2dp>` with n = squircleExponent(cornerRoundness). Stored per entry, not hashed. */
export const styleSig = (s: DotStyle) => `${s.shape}:${squircleExponent(s.cornerRoundness ?? 0).toFixed(2)}`

/** FNV-1a 32 over UTF-16 code units. */
export function fnv1a(str: string, h = 0x811c9dc5): number {
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h >>> 0
}
const hex = (n: number) => n.toString(16).padStart(8, '0')

/** One golden row: `style` first, so adding it to an old file is a pure line addition in the diff. */
export interface Entry { style?: string; hash: string; dots: number }
export type Goldens = Record<string, Record<string, Entry>>
export const TIMES = { static: [0], animated: [0, 1.3] }

/** Hash of a dot list: keys sorted (a pure re-ordering is not a change), FNV-1a 32 of `key;` each. */
export function hashDots(dots: DotInstance[], base: DotStyle): { hash: string; dots: number } {
  const keys = dots.map(d => dotKey(d, base)).sort()
  let h = 0x811c9dc5; for (const k of keys) h = fnv1a(k + ';', h)
  return { hash: hex(h), dots: keys.length }
}
/** The golden row of one preset (every sampled t), sampled the way the app draws it; `style` overrides the preset's (a restyle). */
export function goldenRow(p: WidgetPreset, style: DotStyle = p.style): Record<string, Entry> {
  const row: Record<string, Entry> = {}
  for (const t of p.animated ? TIMES.animated : TIMES.static) row[`t=${t}`] = { style: styleSig(style), ...hashDots(sampleCard(p, t, style), style) }
  return row
}

/** `--check`: a preset changed when any row's hash, dot count or style differs. */
export function diffGoldens(golden: Goldens, current: Goldens): { changed: string[]; added: string[]; removed: string[] } {
  const changed: string[] = [], added: string[] = [], removed = Object.keys(golden).filter(id => !(id in current))
  for (const [id, row] of Object.entries(current)) {
    const g = golden[id]; if (!g) { added.push(id); continue }
    const diffs: string[] = []
    for (const t of Object.keys({ ...row, ...g })) {
      const a = g[t], b = row[t]
      if (a?.hash !== b?.hash || a?.dots !== b?.dots) diffs.push(`${t} ${a?.hash ?? '-'}→${b?.hash ?? '-'} (${a?.dots ?? 0}→${b?.dots ?? 0} dots)`)
      if (a?.style !== b?.style) diffs.push(`${t} style ${a?.style ?? '-'}→${b?.style ?? '-'}`)
    }
    if (diffs.length) changed.push(`${id}: ${diffs.join(', ')}`)
  }
  return { changed, added, removed }
}

/**
 * `--backfill-style` guard: the presets whose `hash` / `dots` would change, or that would be added or
 * removed. The backfill writes only when this is empty (then the only diff is the added `style` lines).
 */
export function backfillOffenders(golden: Goldens, current: Goldens): string[] {
  const out: string[] = []
  for (const id of Object.keys(golden)) if (!(id in current)) out.push(`removed  ${id}`)
  for (const [id, row] of Object.entries(current)) {
    const g = golden[id]
    if (!g) { out.push(`added    ${id}`); continue }
    for (const t of Object.keys({ ...row, ...g }))
      if (g[t]?.hash !== row[t]?.hash || g[t]?.dots !== row[t]?.dots) out.push(`changed  ${id} ${t} ${g[t]?.hash ?? '-'}→${row[t]?.hash ?? '-'} (${g[t]?.dots ?? 0}→${row[t]?.dots ?? 0} dots)`)
  }
  return out
}
