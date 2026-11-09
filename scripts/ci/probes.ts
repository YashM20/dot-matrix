/**
 * The browser probes as CI shards (.github/workflows/probes.yml); the table of probes is scripts/ci/probe-list.ts.
 * A full run uses each probe's own `shard`; a partial run (`--only` a list) packs the picked probes into as few
 * shards as their usual times allow (`packShards`), so `--matrix` and `--shard` must get the same `--only`.
 * Each probe runs on its own, one after another (several serve `dist/` on the same fixed port). Probes that
 * take a base URL get a `vite preview` of `dist/` on port 4317, started here for the run and stopped at the end.
 *
 *   npx tsx scripts/ci/probes.ts --shard 2 [--only browse,a11y|all]   run shard 2 (only the named probes in it)
 *   npx tsx scripts/ci/probes.ts --only browse,a11y                   run the named probes, any shard
 *   npx tsx scripts/ci/probes.ts --matrix [--only browse,a11y|all]    print the shards with work, as JSON: [1,3]
 *   npx tsx scripts/ci/probes.ts --list                               print the table
 *
 * Needs `dist/` (vite build) and Chrome ($CHROME or the usual paths). Exit 1 when a probe fails, 2 on a bad name.
 * Writes a timing table to $GITHUB_STEP_SUMMARY when it is set. Rebalance shards by those timings: no shard should
 * outlast materials, which runs alone. Split a long probe by its own filters (editor `--only`,
 * layout `--widths`).
 */
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { delimiter, resolve as absolute } from 'node:path'
import { serveDist } from '../lib/cdp'
import { packShards, PROBES } from './probe-list'

const BASE = 'http://localhost:4317/'
/** A hung probe fails here instead of holding its shard to the job timeout (15 minutes). */
const TIMEOUT_MIN = 5

const argv = process.argv.slice(2)
const opt = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined }
const onlyArg = (opt('--only') ?? 'all').trim()
const only = onlyArg === '' || onlyArg === 'all' ? undefined : onlyArg === 'none' ? [] : onlyArg.split(',').map(s => s.trim()).filter(Boolean)
const unknown = only?.filter(n => !PROBES.some(p => p.name === n)) ?? []
if (unknown.length) { console.error(`unknown probe(s): ${unknown.join(', ')} (known: ${PROBES.map(p => p.name).join(', ')})`); process.exit(2) }
const shard = opt('--shard') ? Number(opt('--shard')) : undefined
const chosen = PROBES.filter(p => !only || only.includes(p.name))
const packed = only ? packShards(chosen) : undefined
const shardOf = (p: (typeof PROBES)[number]) => packed?.get(p.name) ?? p.shard
const picked = chosen.filter(p => shard === undefined || shardOf(p) === shard)

if (argv.includes('--list')) { for (const p of PROBES) console.log(`${String(p.shard).padStart(2)}  ${String(p.secs).padStart(3)} s  ${p.name.padEnd(13)} ${p.args.join(' ')}`); process.exit(0) }
if (argv.includes('--matrix')) { console.log(JSON.stringify([...new Set(picked.map(shardOf))].sort((a, b) => a - b))); process.exit(0) }
if (!picked.length) { console.log('no probes picked'); process.exit(0) }

const sub = (s: string) => s.replace('$BASE', BASE).replace('$HOST', BASE.replace(/\/$/, ''))
const server = picked.some(p => [...p.args, ...Object.values(p.env ?? {})].some(a => a.startsWith('$'))) ? await serveDist(4317) : undefined
const tsx = process.platform === 'win32' ? 'node_modules/.bin/tsx.cmd' : 'node_modules/.bin/tsx'
const rows: { name: string; ok: boolean; secs: number }[] = []
const gh = !!process.env.GITHUB_ACTIONS

/** One probe as a child; resolves with its exit code (null after a timeout). */
const run = (p: (typeof PROBES)[number]) => new Promise<number | null>(resolve => {
  // pnpm keeps the bins of indirect deps (esbuild, which webgl.ts and squares-browser.ts call) in a hidden folder
  const env = { ...process.env, PATH: `${absolute('node_modules/.pnpm/node_modules/.bin')}${delimiter}${process.env.PATH}`, ...Object.fromEntries(Object.entries(p.env ?? {}).map(([k, v]) => [k, sub(v)])) }
  const child = spawn(tsx, p.args.map(sub), { stdio: 'inherit', env, shell: process.platform === 'win32' })
  const min = p.timeoutMin ?? TIMEOUT_MIN
  const timer = setTimeout(() => { console.log(`${p.name}: timed out after ${min} min`); child.kill('SIGKILL') }, min * 60_000)
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
