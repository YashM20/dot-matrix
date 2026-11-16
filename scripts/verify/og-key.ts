/**
 * OG image cache key checks for `pnpm verify` (#103): postbuild keys each widget OG image on the card's rows in
 * `goldens/<board>.json` (`readGoldens`), so a card whose golden changes gets a new image and every other card keeps
 * its cached one. The build no longer writes the old `goldens/hashes.json` index. On its own:
 * `npx tsx scripts/verify/og-key.ts`.
 */
import { readFileSync } from 'node:fs'
import { readGoldens } from '../lib/goldenFiles'
import { ogKey } from '../site/postbuild'
import { widgetIndex } from '../widgets/meta'
import { checker, type Assert } from '../lib/check'

export function ogKeyChecks(assert: Assert) {
  const golden = readGoldens().presets, widgets = widgetIndex()
  const missing = widgets.filter(w => !golden[w.slug]).map(w => w.slug)
  assert('og key: every widget has a golden row, so its OG image key follows its card', widgets.length > 100 && !missing.length, missing.join(', '))

  // change one card's golden row in memory: only that card's key moves
  const a = widgets[0].slug, salt = 'salt'
  const first = Object.keys(golden[a])[0]
  const edited = { ...golden, [a]: { ...golden[a], [first]: { ...golden[a][first], hash: 'changed' } } }
  const before = widgets.map(w => ogKey(salt, w.slug, '', golden)), after = widgets.map(w => ogKey(salt, w.slug, '', edited))
  const moved = widgets.filter((_, i) => before[i] !== after[i]).map(w => w.slug)
  assert(`og key: a changed golden for ${a} gives it a new key and leaves the other ${widgets.length - 1} keys the same`,
    moved.length === 1 && moved[0] === a && new Set(before).size === widgets.length, moved.join(', '))

  const named = ['scripts/site/postbuild.ts', 'vite.config.ts', '.gitignore'].filter(f => readFileSync(f, 'utf8').includes('goldens/hashes.json'))
  assert('og key: the build neither writes nor reads goldens/hashes.json', !named.length, named.join(', '))
}

if (/[\\/]verify[\\/]og-key\.ts$/.test(process.argv[1] ?? '')) {
  const { assert, done } = checker('og key')
  ogKeyChecks(assert)
  done('og key: all checks passed')
}
