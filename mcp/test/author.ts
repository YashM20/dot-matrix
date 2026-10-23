/**
 * Offline test of the P6 authoring tools over stdio JSON-RPC (like `test/server.ts`):
 * render_card returns a valid PNG, score_card returns gates, refine_card terminates within N rounds
 * and improves or holds on 3 seeded weak programs, record_verdict + Bradley–Terry rank, push_to_device
 * stays unconfigured / refuses non-loopback. The verdict log goes to a temp file, never `.dot480/`.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { fitBT, type VerdictRecord } from '../../scripts/author/bt'
import { SEEDS } from '../../scripts/author/seeds'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const tmp = mkdtempSync(join(tmpdir(), 'dot480-author-'))
const env: NodeJS.ProcessEnv = { ...process.env, DOT480_VERDICTS: join(tmp, 'verdicts.jsonl'), DOT480_DEVICE_URL: 'http://example.com:8080/frame' }
delete env.DOT480_DEVICE_DIR
const child = spawn(process.execPath, ['--import', 'tsx', join(root, 'src', 'main.ts')], { cwd: root, env, stdio: ['pipe', 'pipe', 'inherit'] })
const waiting = new Map<number, (m: Record<string, any>) => void>()
createInterface({ input: child.stdout! }).on('line', line => {
  const m = JSON.parse(line)
  if (m.id !== undefined && waiting.has(m.id)) { waiting.get(m.id)!(m); waiting.delete(m.id) }
})
let id = 0
const rpc = (method: string, params: Record<string, unknown> = {}, ms = 15000) => new Promise<Record<string, any>>((ok, fail) => {
  const n = ++id, timer = setTimeout(() => fail(new Error(`${method} timed out`)), ms)
  waiting.set(n, m => { clearTimeout(timer); ok(m) })
  child.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id: n, method, params }) + '\n')
})
const call = (name: string, args: Record<string, unknown>, ms?: number) => rpc('tools/call', { name, arguments: args }, ms).then(r => r.result ?? { isError: true, error: r.error })
let failures = 0
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++ }
const isPng = (b64: string) => {
  const b = Buffer.from(b64 ?? '', 'base64')
  return b.length > 33 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && b.subarray(12, 16).toString() === 'IHDR' && b.readUInt32BE(16) > 0 && b.readUInt32BE(20) > 0 && b.subarray(-8, -4).toString() === 'IEND'
}

try {
  await rpc('initialize', { protocolVersion: '2025-11-25', clientInfo: { name: 'dot-author-test', version: '0' }, capabilities: {} })
  child.stdin!.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
  const names = ((await rpc('tools/list')).result?.tools ?? []).map((t: any) => t.name)
  check('tools/list: authoring tools present', ['render_card', 'score_card', 'refine_card', 'record_verdict', 'push_to_device', 'describe_board'].every(n => names.includes(n)), names.join(', '))

  const r1 = await call('render_card', { id: 'level-03' })
  const img = r1.content?.find((c: any) => c.type === 'image')
  check('render_card { id } → valid PNG + describe text', !r1.isError && img?.mimeType === 'image/png' && isPng(img.data) && r1.content.some((c: any) => c.type === 'text' && c.text.length > 10), `${r1.structuredContent?.bytes} B`)
  const r2 = await call('render_card', { ...SEEDS.strobe, t: .5, px: 1 })
  check('render_card { ir, lattice, t } → valid PNG', !r2.isError && isPng(r2.content?.find((c: any) => c.type === 'image')?.data), r2.structuredContent?.key)
  const bad = await call('render_card', { ir: 'u + foo' })
  check('render_card bad IR → tool error with position', bad.isError === true && /foo.*1:5/.test(bad.content?.[0]?.text ?? ''), bad.content?.[0]?.text)

  const s = await call('score_card', { id: 'ir-ripple' }, 30000)
  const ids = (s.structuredContent?.gates ?? []).map((g: any) => g.id)
  check('score_card → gates G1–G5 + proxies, no preference without history', !s.isError && ['G1', 'G2', 'G3', 'G4', 'G5', 'V2', 'V7', 'L1'].every(g => ids.includes(g)) && s.structuredContent?.preference === undefined, s.content?.[0]?.text?.split('\n')[0])

  const N = 4
  for (const [name, seed] of Object.entries(SEEDS)) {
    const r = await call('refine_card', { ...seed, rounds: N }, 120000)
    const rounds = r.structuredContent?.rounds ?? []
    const passed = rounds.map((x: any) => x.score.passed), first = rounds[0]?.score, last = rounds.at(-1)?.score
    const monotone = rounds.every((x: any, i: number) => i === 0 || x.score.passed > rounds[i - 1].score.passed || (x.score.passed === rounds[i - 1].score.passed && x.score.deficit <= rounds[i - 1].score.deficit))
    check(`refine_card ${name}: ≤ ${N} rounds, improves or holds`, !r.isError && rounds.length >= 1 && rounds.length <= N + 1 && monotone && last.passed >= first.passed,
      `${r.structuredContent?.stopped}; passed ${passed.join('→')}; deficit ${first?.deficit}→${last?.deficit}`)
  }
  const r0 = await call('refine_card', { ...SEEDS.redFlood, rounds: 0 })
  check('refine_card rounds: 0 only scores', r0.structuredContent?.rounds?.length === 1)

  // like/kill history → Bradley–Terry rank in score_card
  for (const [args, verdict] of [[{ id: 'level-03' }, 'like'], [{ id: 'ir-ripple' }, 'like'], [{ id: 'level-03' }, 'like'], [SEEDS.speckle, 'kill']] as const) {
    const v = await call('record_verdict', { ...args, verdict, note: 'test' })
    check(`record_verdict ${verdict} ${(args as any).id ?? 'speckle'}`, !v.isError && v.structuredContent?.path === env.DOT480_VERDICTS, v.content?.[0]?.text)
  }
  const sl = await call('score_card', { id: 'level-03' }, 30000), pref = sl.structuredContent?.preference
  check('score_card includes the BT rank once history exists', pref?.rank === 1 && pref?.of === 3 && pref?.exemplars?.kill?.[0]?.startsWith('ir:'), JSON.stringify(pref))

  const recs: VerdictRecord[] = [{ key: 'a', verdict: 'like' }, { key: 'b', verdict: 'kill' }, { key: 'c', verdict: 'like' }, { key: 'a', verdict: 'like' }, { key: 'd', verdict: 'kill' }, { key: 'c', verdict: 'kill' }]
  const f1 = fitBT(recs), f2 = fitBT([...recs].reverse()), f3 = fitBT(recs)
  check('BT fit deterministic (same and reversed order)', JSON.stringify(f1) === JSON.stringify(f3) && JSON.stringify(f1.items) === JSON.stringify(f2.items), f1.items.map(x => `${x.key}:${x.strength.toFixed(3)}`).join(' '))
  check('BT fit orders liked > mixed > killed', f1.items.map(x => x.key).join('') === 'acbd' || f1.items.map(x => x.key).join('') === 'acdb')
  check('BT fit with no history is empty', fitBT([]).items.length === 0)

  const pf = await call('push_to_device', { id: 'level-03', target: 'file' })
  check('push_to_device file → not configured by default', !pf.isError && pf.structuredContent?.status === 'not-configured')
  const ph = await call('push_to_device', { id: 'level-03', target: 'http' })
  check('push_to_device http refuses a non-loopback URL', ph.isError === true && /loopback/.test(ph.content?.[0]?.text ?? ''), ph.content?.[0]?.text)
  const pb = await call('push_to_device', { id: 'level-03', target: 'serial' })
  check('push_to_device rejects an unknown target', pb.isError === true)
} catch (e) { console.error(e); failures++ }
child.kill()
rmSync(tmp, { recursive: true, force: true })
if (failures) { console.error(`\n${failures} author check(s) failed`); process.exit(1) }
console.log('\nauthor checks passed')
