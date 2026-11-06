/**
 * Release flag checks for `pnpm verify` (#144, #145): every flag in `src/site/flags.ts` is documented (docs/DEPLOY.md
 * names its `VITE_FLAG_<ID>`), the URL never sets a flag (a fresh load of the module in a fake browser whose address
 * has `?flags=`, `?worker=0` and `?clack=1` reads only localStorage), and with the `xray` flag off the palette, the
 * shell and the shortcuts table have no X-ray in them. The dock, the card's ⓘ and the keys are UI: the browser half
 * is the `flagsoff` section of scripts/c10-browser.ts. On its own: `npx tsx scripts/verify/flags.ts`.
 */
import { readFileSync } from 'node:fs'
import { FLAGS, flag, setFlag } from '../../src/site/flags'
import { SHORTCUTS, URL_PARAMS } from '../../src/site/shortcuts'
import { shellHelp, shellKnows } from '../../src/components/palette/shellHelp'
import { paletteItems } from '../../src/components/palette/api'
import { checker, type Assert } from '../lib/check'

export async function flagChecks(assert: Assert) {
  const deploy = readFileSync('docs/DEPLOY.md', 'utf8')
  const undocumented = FLAGS.filter(f => !/^[a-z][a-z0-9]*$/.test(f.id) || f.description.length < 10 || !deploy.includes(`VITE_FLAG_${f.id.toUpperCase()}`)).map(f => f.id)
  assert('flags: every flag has a lower-case id, a description and its VITE_FLAG_<ID> row in docs/DEPLOY.md', !undocumented.length, undocumented.join(', '))
  assert('flags: ids are unique, and the URL params list names no flag param (?flags=, ?worker=, ?clack=)', new Set(FLAGS.map(f => f.id)).size === FLAGS.length
    && !URL_PARAMS.some(p => /\?(flags|worker|clack)=/.test(p.keys)))
  await urlCheck(assert)

  const xrayRow = (rows: readonly { keys: string; does: string }[]) => rows.some(r => /x-ray/i.test(r.does))
  const shellHasXray = () => shellHelp().some(([c]) => c.startsWith('xray'))
  const paletteHasXray = () => paletteItems().some(i => i.id === 'a:xray')
  const def = FLAGS.find(f => f.id === 'xray')
  assert('flags: xray is off by default, and off here', def?.default === false && !flag('xray'))
  assert('flags: xray off: no palette action, no shell command or help row, no X / ⇧X shortcut rows',
    !paletteHasXray() && !shellKnows('xray') && !shellKnows('X-RAY') && !shellHasXray() && !xrayRow(SHORTCUTS) && shellKnows('fps') && shellKnows('nope'),
    `palette ${paletteHasXray()}, shell ${shellKnows('xray')}, help ${shellHasXray()}, shortcuts ${xrayRow(SHORTCUTS)}`)
  setFlag('xray', true)
  const on = flag('xray') && paletteHasXray() && shellKnows('xray') && shellHasXray()
  setFlag('xray', null)
  assert('flags: setFlag(xray) brings the palette action and the shell command back; null drops the override', on && !flag('xray') && !paletteHasXray())
}

/** A fresh copy of the flags module in a fake browser: the address asks for flags, localStorage holds one override. */
async function urlCheck(assert: Assert) {
  const g = globalThis as Record<string, unknown>, keep = { window: g.window, location: g.location, localStorage: g.localStorage }
  const store = new Map<string, string>([['dot480:flags', JSON.stringify({ make: true })]])
  g.window = { addEventListener() {}, removeEventListener() {} }
  g.location = { search: '?flags=xray,likes,-analytics,lab&worker=0&clack=1', href: 'https://example.test/?flags=xray' }
  g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
  try {
    const fresh = await import(`../../src/site/flags.ts?url-check=${Date.now()}`) as typeof import('../../src/site/flags')
    const want = Object.fromEntries(FLAGS.map(f => [f.id, f.id === 'make' ? true : f.default]))
    const got = Object.fromEntries(FLAGS.map(f => [f.id, fresh.flag(f.id)]))
    assert('flags: URL params (?flags=, ?worker=0, ?clack=1) change no flag; the saved localStorage override still does', JSON.stringify(got) === JSON.stringify(want)
      && store.get('dot480:flags') === JSON.stringify({ make: true }), JSON.stringify(got))
    const likes = FLAGS.find(f => f.id === 'likes')
    assert('flags: likes is on by default', likes?.default === true)
  } finally { for (const [k, v] of Object.entries(keep)) if (v === undefined) delete g[k]; else g[k] = v }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('verify/flags.ts')) {
  const { assert, done } = checker('flags')
  await flagChecks(assert)
  done('flags: all checks passed')
}
