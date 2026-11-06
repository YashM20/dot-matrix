/**
 * The browser probes as CI shards (.github/workflows/probes.yml): one table of every probe, its command and its
 * shard. Each probe runs on its own, one after another (several serve `dist/` on the same fixed port). Probes that
 * take a base URL get a `vite preview` of `dist/` on port 4317, started here for the run and stopped at the end.
 *
 *   npx tsx scripts/ci/probes.ts --shard 2 [--only browse,a11y|all]   run shard 2 (only the named probes in it)
 *   npx tsx scripts/ci/probes.ts --only browse,a11y                   run the named probes, any shard
 *   npx tsx scripts/ci/probes.ts --matrix [--only browse,a11y|all]    print the shards with work, as JSON: [1,3]
 *   npx tsx scripts/ci/probes.ts --list                               print the table
 *
 * Needs `dist/` (vite build) and Chrome ($CHROME or the usual paths). Exit 1 when a probe fails, 2 on a bad name.
 * Writes a timing table to $GITHUB_STEP_SUMMARY when it is set. Rebalance shards by those timings.
 */
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { serveDist } from '../lib/cdp'

const BASE = 'http://localhost:4317/'
/** `$BASE` in an argument becomes the preview's URL; `$HOST` the same without the trailing slash. */
const PROBES: { name: string; shard: number; args: string[]; env?: Record<string, string> }[] = [
  { name: 'editor', shard: 1, args: ['scripts/editor-browser.ts'] },
  { name: 'nav', shard: 1, args: ['scripts/site/nav.ts', '$BASE'] },
  { name: 'mobile', shard: 2, args: ['scripts/site/mobile.ts', '$BASE'] },
  { name: 'theme-boot', shard: 2, args: ['scripts/site/theme-boot.ts'] },
  { name: 'theme-picker', shard: 2, args: ['scripts/site/theme-picker.ts'] },
  { name: 'layout', shard: 3, args: ['scripts/site/layout.ts', '$BASE'] },
  { name: 'browse', shard: 3, args: ['scripts/site/browse-browser.ts'] },
  { name: 'chunks', shard: 3, args: ['scripts/site/chunks-browser.ts'] },
  { name: 'csp', shard: 3, args: ['scripts/site/csp-browser.ts'] },
  { name: 'a11y', shard: 4, args: ['scripts/site/a11y.ts'] },
  { name: 'analytics', shard: 4, args: ['scripts/site/analytics-browser.ts'] },
  { name: 'likes', shard: 4, args: ['scripts/likes-browser.ts'] },
  { name: 'c10', shard: 5, args: ['scripts/c10-browser.ts', '$BASE'] },
  { name: 'essay', shard: 5, args: ['scripts/essay-browser.ts', '$BASE'] },
  { name: 'game', shard: 5, args: ['scripts/game-browser.ts', '$BASE'] },
  { name: 'audio', shard: 5, args: ['scripts/audio-chrome.ts'], env: { URL: '$BASE' } },
  { name: 'c6', shard: 5, args: ['scripts/c6-browser.ts', '--url', '$HOST'] },
  { name: 'webgl', shard: 6, args: ['scripts/webgl.ts', '--no-perf'] },
  { name: 'squares', shard: 6, args: ['scripts/squares-browser.ts'] },
  { name: 'skins', shard: 6, args: ['scripts/skins-browser.ts', '--fidelity'] },
  { name: 'materials', shard: 6, args: ['scripts/materials-browser.ts'] },
  { name: 'life', shard: 6, args: ['scripts/life-browser.ts'] },
  { name: 'light', shard: 6, args: ['scripts/light-browser.ts'] },
  { name: 'ir-worker', shard: 6, args: ['scripts/ir-worker-browser.ts'] },
]
const TIMEOUT_MS = 8 * 60_000

const argv = process.argv.slice(2)
const opt = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined }
const onlyArg = (opt('--only') ?? 'all').trim()
const only = onlyArg === '' || onlyArg === 'all' ? undefined : onlyArg === 'none' ? [] : onlyArg.split(',').map(s => s.trim()).filter(Boolean)
const unknown = only?.filter(n => !PROBES.some(p => p.name === n)) ?? []
if (unknown.length) { console.error(`unknown probe(s): ${unknown.join(', ')} (known: ${PROBES.map(p => p.name).join(', ')})`); process.exit(2) }
const shard = opt('--shard') ? Number(opt('--shard')) : undefined
const picked = PROBES.filter(p => (!only || only.includes(p.name)) && (shard === undefined || p.shard === shard))

if (argv.includes('--list')) { for (const p of PROBES) console.log(`${p.shard}  ${p.name.padEnd(13)} ${p.args.join(' ')}`); process.exit(0) }
if (argv.includes('--matrix')) { console.log(JSON.stringify([...new Set(picked.map(p => p.shard))].sort())); process.exit(0) }
if (!picked.length) { console.log('no probes picked'); process.exit(0) }

const sub = (s: string) => s.replace('$BASE', BASE).replace('$HOST', BASE.replace(/\/$/, ''))
const server = picked.some(p => [...p.args, ...Object.values(p.env ?? {})].some(a => a.startsWith('$'))) ? await serveDist(4317) : undefined
const tsx = process.platform === 'win32' ? 'node_modules/.bin/tsx.cmd' : 'node_modules/.bin/tsx'
const rows: { name: string; ok: boolean; secs: number }[] = []
const gh = !!process.env.GITHUB_ACTIONS

/** One probe as a child; resolves with its exit code (null after a timeout). */
const run = (p: (typeof PROBES)[number]) => new Promise<number | null>(resolve => {
  const env = { ...process.env, ...Object.fromEntries(Object.entries(p.env ?? {}).map(([k, v]) => [k, sub(v)])) }
  const child = spawn(tsx, p.args.map(sub), { stdio: 'inherit', env, shell: process.platform === 'win32' })
  const timer = setTimeout(() => { console.log(`${p.name}: timed out after ${TIMEOUT_MS / 60_000} min`); child.kill('SIGKILL') }, TIMEOUT_MS)
  child.on('exit', code => { clearTimeout(timer); resolve(code) })
})

try {
  for (const p of picked) {
    console.log(gh ? `::group::${p.name}` : `\n── ${p.name} ──`)
    const t = Date.now()
    const code = await run(p)
    // a probe that died early may leave its Chrome or preview server behind; free the fixed ports for the next one
    if (process.platform !== 'win32') spawnSync('pkill', ['-f', 'remote-debugging-port=0'], { stdio: 'ignore' })
    rows.push({ name: p.name, ok: code === 0, secs: Math.round((Date.now() - t) / 1000) })
    if (gh) console.log('::endgroup::')
    console.log(`${code === 0 ? 'PASS' : 'FAIL'} ${p.name} (${rows.at(-1)!.secs} s, exit ${code})`)
    if (gh && code !== 0) console.log(`::error title=probe ${p.name}::${p.name} failed (exit ${code})`)
  }
} finally {
  server?.stop()
}

const table = ['| probe | result | seconds |', '| --- | --- | ---: |', ...rows.map(r => `| ${r.name} | ${r.ok ? 'pass' : '**FAIL**'} | ${r.secs} |`)].join('\n')
console.log(`\n${table}`)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Probes${shard ? `, shard ${shard}` : ''}\n\n${table}\n\n`)
process.exit(rows.every(r => r.ok) ? 0 : 1)
