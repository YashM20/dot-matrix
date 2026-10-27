/**
 * The derived widget index (docs/SHARE-PLAN.md §3): `deriveWidgetMeta` (src/widgets/meta.ts) for every widget,
 * with its uid (ids.json), boards, golden hash and old slugs. Postbuild writes it to `dist/widgets.json` (fetched
 * lazily by later tools: search, oEmbed, the registry; never in first load) and builds the `/widget/<slug>/`
 * crawler pages from it. `metaChecks` runs in `pnpm verify`.
 *
 *   npx tsx scripts/widgets/meta.ts            → print a summary
 *   npx tsx scripts/widgets/meta.ts <slug|uid> → print one widget's metadata
 */
import { readFileSync } from 'node:fs'
import { boards } from '../../src/widgets'
import { cardAliases, resolveCardId } from '../../src/widgets/manifest'
import { cardBlurbs, deriveWidgetMeta, type WidgetMeta } from '../../src/widgets/meta'
import { dot480 } from '../../src/engine/theme/tokens'
import { readIds, uidOf } from './ids'

type Assert = (name: string, cond: boolean, detail?: string) => void

const goldens = () => (JSON.parse(readFileSync('goldens/hashes.json', 'utf8')) as { presets: Record<string, Record<string, { hash: string }>> }).presets

export function widgetIndex(): WidgetMeta[] {
  const ids = readIds(), gold = goldens(), on = new Map<string, string[]>()
  for (const b of boards) for (const p of b.items) { const l = on.get(p.id) ?? []; if (!l.includes(b.id)) l.push(b.id); on.set(p.id, l) }
  const seen = new Set<string>(), out: WidgetMeta[] = []
  for (const b of boards) for (const p of b.items) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    const aliases = [...Object.keys(cardAliases).filter(k => cardAliases[k] === p.id), ...Object.keys(ids).filter(k => k !== p.id && resolveCardId(k) === p.id)]
    out.push(deriveWidgetMeta(p, { uid: uidOf(p.id, ids) ?? '', board: b.id, boards: on.get(p.id), version: gold[p.id]?.['t=0']?.hash, aliases: [...new Set(aliases)] }, dot480))
  }
  return out
}

export function metaChecks(check: Assert, index = widgetIndex()) {
  const noBlurb = index.filter(w => !(w.blurb.length >= 12 && w.blurb.length <= 120 && w.tags.length >= 1 && w.tags.every(t => /^[a-z0-9-]+$/.test(t)))).map(w => w.slug)
  check('share: every widget has an authored blurb (12–120 chars) and lowercase tags (src/widgets/meta.ts)', !noBlurb.length, noBlurb.join(', '))
  const slugs = new Set(index.map(w => w.slug)), stray = Object.keys(cardBlurbs).filter(k => !slugs.has(k))
  check('share: no blurb for a widget that does not exist', !stray.length, stray.join(', '))
  const broken = index.filter(w => !w.uid || !w.layerCount || !w.dots || !w.version).map(w => w.slug)
  check('share: the derived layer builds for every widget (uid, layers, visible dots, golden version)', !broken.length, broken.length ? broken.join(', ') : `${index.length} widgets, ${(JSON.stringify(index).length / 1024).toFixed(1)} KB json`)
}

if (/[\\/]scripts[\\/]widgets[\\/]meta\.ts$/.test(process.argv[1] ?? '')) {
  const index = widgetIndex(), key = process.argv[2]
  if (key) console.log(JSON.stringify(index.find(w => w.slug === key || w.uid === key) ?? `no widget ${key}`, null, 2))
  else {
    const n = (f: (w: WidgetMeta) => boolean) => index.filter(f).length
    console.log(`${index.length} widgets: ${n(w => w.animated)} animated, ${n(w => w.interactive)} interactive, ${n(w => w.live)} live, ${n(w => !!w.media)} with media; renderers ${['svg', 'canvas', 'webgl'].map(r => `${r} ${n(w => w.renderer === r)}`).join(', ')}`)
    metaChecks((name, ok, detail) => console[ok ? 'log' : 'error'](`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`), index)
  }
}
