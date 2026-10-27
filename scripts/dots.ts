/**
 * DOTS tab checks (P6-C, "Dwitter for dots"): share-link round trip and limits, the 8 seed programs,
 * the remix gallery and its dot-rendered graph. `pnpm verify` runs them through `dotsChecks()`; the
 * browser side is the editor probe, `scripts/editor-browser.ts`.
 */
import { IR_LIMITS, irProgram } from '../src/engine/ir'
import { sampleLayers } from '../src/engine/sampler/gridSampler'
import { dot480 } from '../src/engine/theme/tokens'
import { checkShared, decodeShare, encodeShare, programHash, ShareError, SHARE_MAX_ENCODED, type SharedProgram } from '../src/lib/share'
import { EXAMPLES } from '../src/components/dwitter/examples'
import { graphLayers, layoutGraph, loadGallery, recordProgram, SEEDS } from '../src/components/dwitter/gallery'
import { compileSource, dataFor, DOTS_STYLE, gridOf, programLayers, programName } from '../src/components/dwitter/program'

type Assert = (name: string, cond: boolean, detail?: string) => void
const rejects = async (f: () => Promise<unknown>) => { try { await f(); return '' } catch (e) { return e instanceof ShareError ? e.message : `wrong error: ${e}` } }
const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url')

export async function dotsChecks(assert: Assert) {
  // round trip: every example, with and without parent, deflated and plain, non-ASCII source
  let ok = true, worst = 0
  const cases: SharedProgram[] = [...EXAMPLES.map(e => ({ src: e.src, grid: e.grid, lattice: e.lattice, tone: e.tone })), { ...EXAMPLES[1], parent: 'deadbeef' }, { src: '// räksmörgås → ✓\nu * v', grid: 'wide', lattice: 1, tone: 'active' }]
  for (const p of cases) for (const compress of [true, false]) {
    const enc = await encodeShare(p, { compress }), back = await decodeShare(enc)
    ok &&= JSON.stringify(back) === JSON.stringify(checkShared(p)) && /^[bz][A-Za-z0-9_-]+$/.test(enc) && (compress || enc[0] === 'b')
    worst = Math.max(worst, enc.length)
  }
  const z = await encodeShare(EXAMPLES[7])
  assert('dots share: encode → decode round-trips every example (deflate + plain, parent, unicode)', ok && z[0] === 'z', `longest ${worst} chars; heartbeat ${EXAMPLES[7].src.length} B → ${z.length} chars`)

  // size limits: a 4 kB program of incompressible text still fits a link; one char over is refused
  let seed = 7
  const noise = Array.from({ length: IR_LIMITS.source - 4 }, () => String.fromCharCode(33 + ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 16) % 94)).join('')
  const max: SharedProgram = { src: `//${noise.replace(/\n/g, ' ')}\n1`, grid: 'square', lattice: 2, tone: 'auto' }
  const maxEnc = await encodeShare(max)
  const over = await rejects(() => encodeShare({ ...max, src: max.src + ' ' }))
  const long = await rejects(() => decodeShare('b' + 'A'.repeat(SHARE_MAX_ENCODED)))
  // deflate bomb: 300 kB of JSON that compresses to a few hundred bytes must stop at the inflate cap
  const bombJson = new TextEncoder().encode(JSON.stringify({ v: 1, s: 'a'.repeat(300_000), g: 'square', l: 2, o: 'auto' }))
  const bombZ = new Uint8Array(await new Response(new Blob([bombJson]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer())
  const bomb = await rejects(() => decodeShare('z' + b64url(bombZ)))
  const plainBig = await rejects(() => decodeShare('b' + b64url(new TextEncoder().encode(JSON.stringify({ v: 1, s: '1'.repeat(IR_LIMITS.source + 1), g: 'square', l: 2, o: 'auto' })))))
  assert('dots share: IR ≤ 4 kB fits (incompressible ≤ link cap); over-size source, link and deflate bomb are refused',
    maxEnc.length <= SHARE_MAX_ENCODED && compileSource(max.src).program !== undefined && !!over && !!long && /size limit/.test(bomb) && /more than/.test(plainBig),
    `4 kB noise → ${maxEnc.length} chars; bomb ${bombZ.length} B → "${bomb}"`)

  // malformed links: never throw anything but ShareError, never evaluate
  const bad = await Promise.all([
    rejects(() => decodeShare('zNotARealLink')), rejects(() => decodeShare('q' + b64url(new Uint8Array([1])))), rejects(() => decodeShare('b!!')),
    rejects(() => decodeShare('b' + b64url(new TextEncoder().encode('{"v":2}')))),
    ...[{ g: 'huge' }, { l: 5 }, { o: 'red' }, { p: 'xyz' }, { s: 42 }].map(o => rejects(() => decodeShare('b' + b64url(new TextEncoder().encode(JSON.stringify({ v: 1, s: '1', g: 'square', l: 2, o: 'auto', ...o })))))),
  ])
  const invalid = await decodeShare(await encodeShare({ src: 'let x = u * ;\nx', grid: 'square', lattice: 2, tone: 'auto' }))
  const err = compileSource(invalid.src).error
  assert('dots share: corrupt / unknown-format / bad-field links are ShareErrors; a link to a bad program decodes and fails to parse with line:col',
    bad.every(m => m && !m.startsWith('wrong')) && !!err && err.line === 1 && err.col === 13, `${bad.length} rejected; "${err?.message}"`)

  // hashes: stable, 8 hex, sensitive to every field
  const h = programHash(EXAMPLES[0])
  assert('dots share: program hash is stable and covers src/grid/lattice/tone', /^[0-9a-f]{8}$/.test(h) && h === programHash({ ...EXAMPLES[0] }) &&
    new Set([h, programHash({ ...EXAMPLES[0], src: EXAMPLES[0].src + ' ' }), programHash({ ...EXAMPLES[0], grid: 'wide' }), programHash({ ...EXAMPLES[0], lattice: 2 }), programHash({ ...EXAMPLES[0], tone: 'mid' })]).size === 5)

  // the 8 seeds: parse, compile in both modes (same values), render non-empty and move with t
  const names = EXAMPLES.map(e => e.name)
  const rows: string[] = []
  let seedsOk = names.join() === 'ripple,plasma,rings,spiral,rain,lissajous,checker warp,heartbeat'
  for (const e of EXAMPLES) {
    const c = compileSource(e.src)
    if (!c.program) { seedsOk = false; rows.push(`${e.name}: ${c.error.message}`); continue }
    const closure = irProgram(e.src), data = dataFor(c.program.info.data, {})
    const env = { t: 1.3, data }, f1 = c.program(env), f2 = closure(env)
    let same = true
    for (let i = 0; i < 64; i++) { const u = (i % 8) / 7, v = (i >> 3) / 7; same &&= Math.abs(f1(u, v) - f2(u, v)) < 1e-9 }
    const lit = (t: number) => sampleLayers(programLayers(c.program!, { t, data }, e), gridOf(e), DOTS_STYLE, dot480).filter(d => d.opacity > 0 && d.r > 0)
    const a = lit(.5), b = lit(2.5), moved = a.length !== b.length || a.some((d, i) => d.x !== b[i].x || d.r !== b[i].r || d.color !== b[i].color)
    seedsOk &&= same && a.length > 150 && b.length > 150 && moved && programName(e.src) === e.name
    rows.push(`${e.name} ${a.length}/${b.length}`)
  }
  assert('dots examples: all 8 parse, compile (closure ≡ function), render non-empty and animate', seedsOk, rows.join(', '))

  // gallery: record a remix (stubbed localStorage), parent kept, seeds never stored, graph draws nodes and edges
  const store = new Map<string, string>()
  const g = globalThis as { localStorage?: unknown }, prev = g.localStorage
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) } })
  try {
    const child: SharedProgram = { ...EXAMPLES[0], src: EXAMPLES[0].src.replace('38', '44'), parent: SEEDS[0].id }
    let list = recordProgram(loadGallery(), child)
    list = recordProgram(list, { ...child, src: child.src.replace('44', '50'), parent: programHash(child) })
    list = recordProgram(list, EXAMPLES[2])
    const reloaded = loadGallery(), graph = layoutGraph(reloaded)
    const depth = graph.nodes.map(n => n.row), layers = graphLayers(graph, programHash(child))
    const dots = sampleLayers(layers, graph.grid, DOTS_STYLE, dot480).filter(d => d.opacity > 0)
    const stored = JSON.parse(store.get('dot480.dots.gallery') ?? '[]') as unknown[]
    assert('dots gallery: remixes keep their parent across reloads, seeds stay unstored, the graph renders thumbnails, edges and the current frame',
      reloaded.length === 10 && stored.length === 2 && reloaded[9].parent === programHash(child) && Math.max(...depth) === 2 && layers.length === 3 && dots.length > 500 && dots.some(d => d.color === dot480.dotActive),
      `${reloaded.length} entries, depth ${Math.max(...depth)}, ${dots.length} graph dots`)
  } finally {
    if (prev === undefined) delete g.localStorage; else Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: prev })
  }
}

if (/dots\.ts$/.test(process.argv[1] ?? '')) {
  let failures = 0
  await dotsChecks((name, cond, detail = '') => { console.log(`${cond ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (!cond) failures++ })
  process.exit(failures ? 1 : 0)
}
