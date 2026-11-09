/**
 * Every browser probe CI runs (scripts/ci/probes.ts runs them, scripts/ci/affected.ts picks them for a PR push).
 * `shard` places a probe in the full run (`probes=all`, every push to main); rebalance by the timing table each shard
 * writes to the job summary, so no shard outlasts materials, which runs alone. `secs` is its usual time on a runner
 * (from those tables): a partial run packs the picked probes into as few shards as that allows.
 * `$BASE` in an argument becomes the preview's URL; `$HOST` the same without the trailing slash.
 */
import { boardIds } from '../../src/widgets/manifest'

export type Probe = { name: string; shard: number; secs: number; args: string[]; env?: Record<string, string>; timeoutMin?: number }

export const PROBES: Probe[] = [
  { name: 'editor', shard: 1, secs: 150, args: ['scripts/editor-browser.ts', '--only', 'desktop'] },
  { name: 'editor-phone', shard: 2, secs: 145, args: ['scripts/editor-browser.ts', '--only', 'phone,landscape'] },
  { name: 'c10', shard: 2, secs: 70, args: ['scripts/c10-browser.ts', '$BASE'] },
  { name: 'layout', shard: 3, secs: 160, args: ['scripts/site/layout.ts', '$BASE', '--widths', '1920,1440,1280'] },
  { name: 'chunks', shard: 3, secs: 55, args: ['scripts/site/chunks-browser.ts'] },
  { name: 'layout-narrow', shard: 4, secs: 165, args: ['scripts/site/layout.ts', '$BASE', '--widths', '1024,768,390,320'] },
  { name: 'browse', shard: 4, secs: 55, args: ['scripts/site/browse-browser.ts'] },
  // mobile.ts in two halves: its MAKE tabs take up to a minute each on a runner
  { name: 'mobile', shard: 5, secs: 65, args: ['scripts/site/mobile.ts', '$BASE', 'first-load,fps,chrome,tab:make=tune,tab:make=compose,tab:make=code,tab:make=draw,tab:about'] },
  { name: 'mobile-boards', shard: 13, secs: 210, args: ['scripts/site/mobile.ts', '$BASE', boardIds.join(',')] },
  // the mat-lens checks alone take minutes on a runner (its frames are slow there): materials gets 8 minutes
  { name: 'materials', shard: 6, secs: 360, args: ['scripts/materials-browser.ts'], timeoutMin: 8 },
  { name: 'audio', shard: 7, secs: 35, args: ['scripts/audio-chrome.ts'], env: { URL: '$BASE' } },
  { name: 'theme-boot', shard: 7, secs: 10, args: ['scripts/site/theme-boot.ts'] },
  { name: 'light', shard: 7, secs: 25, args: ['scripts/light-browser.ts'] },
  { name: 'ir-worker', shard: 8, secs: 30, args: ['scripts/ir-worker-browser.ts'] },
  { name: 'game', shard: 8, secs: 20, args: ['scripts/game-browser.ts', '$BASE'] },
  { name: 'nav', shard: 9, secs: 160, args: ['scripts/site/nav.ts', '$BASE'] },
  { name: 'essay', shard: 9, secs: 95, args: ['scripts/essay-browser.ts', '$BASE'] },
  // the #28 timing gates, 10 runs each on an idle runner (Node only: no page, no Chrome)
  { name: 'gates', shard: 9, secs: 15, args: ['scripts/gates.ts', '--runs', '10'] },
  { name: 'csp', shard: 10, secs: 150, args: ['scripts/site/csp-browser.ts'] },
  { name: 'a11y', shard: 10, secs: 45, args: ['scripts/site/a11y.ts'] },
  // the same axe run at phone width (#187): touch emulation, so the 44 px targets apply
  { name: 'a11y-phone', shard: 12, secs: 50, args: ['scripts/site/a11y.ts', '--width', '390'] },
  // life finishes in about two minutes (the koi heal waits for their meal, up to ~40 s), or hangs
  // its own watchdog fires first, so the log names the step it hung in
  { name: 'life', shard: 11, secs: 205, args: ['scripts/life-browser.ts'], timeoutMin: 5, env: { LIFE_BROWSER_TIMEOUT_S: '270' } },
  { name: 'c6', shard: 12, secs: 15, args: ['scripts/c6-browser.ts', '--url', '$HOST'] },
  { name: 'analytics', shard: 12, secs: 60, args: ['scripts/site/analytics-browser.ts'] },
  // a runner has no GPU and webgl.ts launches its own Chrome: its `--swiftshader` turns WebGL2 on (squares passes as is)
  { name: 'webgl', shard: 12, secs: 25, args: ['scripts/webgl.ts', '--no-perf', '--swiftshader'] },
  { name: 'squares', shard: 12, secs: 15, args: ['scripts/squares-browser.ts'] },
  { name: 'skins', shard: 12, secs: 5, args: ['scripts/skins-browser.ts', '--fidelity'] },
  { name: 'likes', shard: 12, secs: 12, args: ['scripts/likes-browser.ts'] },
  { name: 'theme-picker', shard: 12, secs: 35, args: ['scripts/site/theme-picker.ts'] },
]

/** A partial run's shards: the picked probes, longest first, each into the first shard with room (first-fit
 *  decreasing). A shard holds `max(MIN_SHARD_SECS, the longest pick)`, so the run lasts about as long as its longest
 *  probe on as few runners as fit. A full run keeps the hand-balanced `shard` column. */
const MIN_SHARD_SECS = 150
export function packShards(picked: Probe[]): Map<string, number> {
  const cap = Math.max(MIN_SHARD_SECS, ...picked.map(p => p.secs))
  const bins: number[] = [], out = new Map<string, number>()
  for (const p of [...picked].sort((a, b) => b.secs - a.secs || a.name.localeCompare(b.name))) {
    let i = bins.findIndex(used => used + p.secs <= cap)
    if (i < 0) i = bins.push(0) - 1
    bins[i] += p.secs
    out.set(p.name, i + 1)
  }
  return out
}
