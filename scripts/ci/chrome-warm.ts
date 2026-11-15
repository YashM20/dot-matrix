/**
 * Start Chrome once and close it, before a CI job's first probe (.github/workflows/probes.yml). The first start on a
 * fresh runner reads Chrome's files from a cold disk and can miss the probes' DevTools-port wait (issue #224). This
 * takes that cost up front and logs how long the start took. It never fails the job: the probes retry on their own.
 *   npx tsx scripts/ci/chrome-warm.ts
 */
import { rmSync } from 'node:fs'
import { findChrome } from '../lib/cdp'
import { startChrome } from '../lib/chrome'

const chrome = findChrome()
if (!chrome) { console.log('chrome-warm: no Chrome found (set $CHROME): skipped'); process.exit(0) }
const t0 = performance.now()
try {
  const { proc, profile } = await startChrome(chrome, ['--no-first-run', '--no-default-browser-check', ...(process.env.CHROME_FLAGS?.split(' ').filter(Boolean) ?? []), 'about:blank'], 'dot-warm-')
  console.log(`chrome-warm: ${chrome} opened its DevTools port in ${((performance.now() - t0) / 1000).toFixed(1)} s`)
  proc.kill()
  await new Promise(r => setTimeout(r, 300))
  try { rmSync(profile, { recursive: true, force: true }) } catch { /* Chrome may still hold files */ }
} catch (e) {
  console.log(`::warning title=chrome-warm::${(e as Error).message.split('\n')[0]}`)
  console.log((e as Error).message)
}
process.exit(0)
