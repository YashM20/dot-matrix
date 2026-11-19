/**
 * Every card's text has its glyphs (#412). The 5×7 font (`src/engine/fields/bitmapFont.ts`) draws a character it lacks
 * as a blank cell with no warning, so this check puts a `Proxy` in the font table's prototype chain: a lookup that
 * misses an own glyph falls through to it and is recorded. Then it builds every preset's layers (`withChrome(p)(ctx)`,
 * no sampling) at a few `t` values, with reduced motion, and with each control hovered, pressed and focused, and fails
 * naming the card and the code point. `foldText` / `sanitize` test with `hasOwn`, so text they fold never counts.
 * In `pnpm verify`; on its own: `pnpm exec tsx scripts/verify/glyphs.ts`.
 */
import { bitmapFont, glyph } from '../../src/engine/fields/bitmapFont'
import { widgetPresets, withChrome } from '../../src/widgets'
import type { WidgetContext, WidgetPreset } from '../../src/widgets/types'
import { checker, type Assert } from '../lib/check'

const TIMES = [0, .5, 1.7, 4.2, 12.9]
const codePoints = (s: string) => [...s].map(ch => `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`).join(' ')

/** Runs `fn` with misses recorded; the font's own prototype is back afterwards, whatever `fn` does. */
export function withMissRecorder<T>(fn: (missed: Set<string>) => T): T {
  const missed = new Set<string>(), proto = Object.getPrototypeOf(bitmapFont) as object
  const trap = new Proxy(proto, { get: (target, key, receiver) => { if (typeof key === 'string' && !(key in target)) missed.add(key); return Reflect.get(target, key, receiver) } })
  Object.setPrototypeOf(bitmapFont, trap)
  try { return fn(missed) } finally { Object.setPrototypeOf(bitmapFont, proto) }
}

/** The contexts a card is built in: `t` values, reduced motion, and each control hovered, pressed and focused. */
function contexts(p: WidgetPreset): [string, WidgetContext][] {
  const ctx = (t: number, more: Partial<WidgetContext> = {}): WidgetContext => ({ t, frame: Math.round(t * 60), data: { ...p.defaults }, grid: p.grid, ...more })
  const out: [string, WidgetContext][] = TIMES.map(t => [`t=${t}`, ctx(t)])
  out.push(['reduced motion', ctx(1.7, { reducedMotion: true })])
  for (const c of p.controls ?? []) for (const state of ['hover', 'pressed', 'focus'] as const) out.push([`${state} ${c.key}`, ctx(.5, { [state]: c.key })])
  return out
}

export function glyphChecks(assert: Assert) {
  // the recorder itself: a missed lookup is seen, a hit and a fold are not, and the table is restored
  const probe = withMissRecorder(missed => { glyph('A'); glyph('~'); glyph('ß'); return [...missed] })
  assert('glyphs: the recorder sees missed font lookups (~, ß → SS) and leaves the font as it was', probe.join() === '~,SS' && Object.getPrototypeOf(bitmapFont) === Object.prototype, probe.join())

  const bad: string[] = [], seen = new Set<string>()
  let builds = 0
  withMissRecorder(missed => {
    for (const p of widgetPresets) {
      if (seen.has(p.id)) continue
      seen.add(p.id)
      const layers = withChrome(p)
      for (const [state, ctx] of contexts(p)) {
        missed.clear()
        layers(ctx); builds++
        if (missed.size) bad.push(`${p.id} (${state}): ${[...missed].map(k => `${JSON.stringify(k)} ${codePoints(k)}`).join(', ')}`)
      }
    }
  })
  assert('glyphs: every card\'s text has its glyphs at every t, reduced motion, and each control hovered, pressed and focused (#412)',
    seen.size > 200 && !bad.length, bad.length ? bad.slice(0, 20).join('; ') : `${seen.size} cards, ${builds} builds`)
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('verify/glyphs.ts')) {
  const { assert, done } = checker('glyphs')
  glyphChecks(assert)
  done('glyphs: all checks passed')
}
