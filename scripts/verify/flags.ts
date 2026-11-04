/**
 * Release flag checks for `pnpm verify` (#144, #145): every flag in `src/site/flags.ts` is documented (docs/DEPLOY.md
 * names its `VITE_FLAG_<ID>`, the URL params list has `?flags=`), and with the `xray` flag off the palette, the
 * shell and the shortcuts table have no X-ray in them. The dock, the card's ⓘ and the keys are UI: the browser half
 * is the `flagsoff` section of scripts/c10-browser.ts.
 */
import { readFileSync } from 'node:fs'
import { FLAGS, flag, setFlag } from '../../src/site/flags'
import { SHORTCUTS, URL_PARAMS } from '../../src/site/shortcuts'
import { shellHelp, shellKnows } from '../../src/components/palette/shellHelp'
import { paletteItems } from '../../src/components/palette/api'
import type { Assert } from '../lib/check'

export function flagChecks(assert: Assert) {
  const deploy = readFileSync('docs/DEPLOY.md', 'utf8')
  const undocumented = FLAGS.filter(f => !/^[a-z][a-z0-9]*$/.test(f.id) || f.description.length < 10 || !deploy.includes(`VITE_FLAG_${f.id.toUpperCase()}`)).map(f => f.id)
  assert('flags: every flag has a lower-case id, a description and its VITE_FLAG_<ID> row in docs/DEPLOY.md', !undocumented.length, undocumented.join(', '))
  assert('flags: ids are unique and the URL params list names ?flags=', new Set(FLAGS.map(f => f.id)).size === FLAGS.length && URL_PARAMS.some(p => p.keys.startsWith('?flags=')))

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
