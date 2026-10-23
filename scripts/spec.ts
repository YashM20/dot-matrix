/**
 * Card spec v1 checks (also run by `pnpm verify`):
 *   - schema ↔ validator agree on ~45 valid / invalid / semantic fixtures (semantic = structurally fine,
 *     rejected only by the validator's IR / reference / size checks), with paths;
 *   - preset → spec → JSON → spec → preset keeps the golden dot hash for every preset that exports
 *     (all IR-board cards without a single baked layer, at every golden time);
 *   - spec → preset → spec is stable; v0 → v1 migration; the example specs load and render.
 * Run alone: npx tsx scripts/spec.ts            (add --examples to rewrite examples/specs/*.json)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { iconPaths } from '../src/engine/fields/iconSDF'
import { encodeSamples } from '../src/spec/codec'
import { EASES, GROUPS, MASKS, THEME_COLORS, TONES, CONTROL_KINDS, GENERATOR_PARAMS, exportPreset, loadSpec, migrateSpec, presetToSpec, specToPreset, validateSpec, type CardSpec } from '../src/spec'
import { irBoard } from '../src/widgets/boards/ir'
import { TILE, layoutFor, tileStyle, type WidgetPreset } from '../src/widgets/types'
import type { DotInstance } from '../src/engine/types'
import { freezeWallClock } from './lib/freeze'
import { sampleCard, uniquePresets } from './lib/cards'
import { schemaValidator } from './lib/jsonschema'

type Assert = (name: string, cond: boolean, detail?: string) => void
const SCHEMA_FILE = 'schema/card.v1.schema.json', EXAMPLES = 'examples/specs'
const fnv1a = (str: string, h = 0x811c9dc5) => { for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h >>> 0 }
const q = (d: DotInstance) => `${d.x.toFixed(2)},${d.y.toFixed(2)},${d.r.toFixed(3)},${d.opacity.toFixed(3)},${d.color}`
/** The golden hash of `scripts/golden.ts` (sorted quantized dot list, FNV-1a 32). */
export const goldenHash = (p: WidgetPreset, t: number) => { let h = 0x811c9dc5; for (const k of sampleCard(p, t).map(q).sort()) h = fnv1a(k + ';', h); return h.toString(16).padStart(8, '0') }
const goldenTimes = (p: WidgetPreset) => (p.animated ? [0, 1.3] : [0])

// ── fixtures ──
type Expect = 'valid' | 'invalid' | 'semantic'
type J = Record<string, unknown>
const base = (): J => ({ version: 1, id: 'fx', name: 'Fixture', grid: { cols: 32, rows: 32 }, style: { shape: 'squircle', sizeMin: .2, sizeMax: .95 }, layers: [] })
const withLayer = (l: unknown, extra: J = {}): J => ({ ...base(), ...extra, layers: [l] })
const f32 = (n: number, x = .5) => encodeSamples(new Float64Array(n).fill(x), 'f32')
const icon = Object.keys(iconPaths)[0]
const FIXTURES: [string, unknown, Expect, string?][] = [
  ['minimal', base(), 'valid'],
  ['ir layer: lattice, origin, bounds, toneStops', withLayer({ kind: 'ir', src: 'smoothstep(.5, .2, length(u - .5, v - .5))', tone: 'auto', lattice: 2, origin: [0, 4], bounds: [0, 0, 12, 10], toneStops: [{ at: .2, tone: 'faint' }, { at: .6, tone: 'mid', blend: .1 }] }), 'valid'],
  ['text literal: align, scale pair, smooth', withLayer({ kind: 'text', text: 'HELLO', at: [16, 4], align: 'center', scale: [2, 3], smooth: false, tone: 'idle' }), 'valid'],
  ['text bind + format', withLayer({ kind: 'text', bind: 'data.value * 100', format: { pad: 3, suffix: '%' }, at: [0, 0], lattice: 3, origin: [2, 8] }, { data: { value: .4 } }), 'valid'],
  ['sites: per-point values + tones', withLayer({ kind: 'sites', points: [[4, 4], [8.5, 4, .5]], size: 2, tones: ['active', null] }), 'valid'],
  ['sites: IR bind', withLayer({ kind: 'sites', points: [[4, 4], [8, 4]], bind: 'u', size: 1.5, tone: 'mid' }), 'valid'],
  ['raster f32 window + tones', withLayer({ kind: 'raster', grid: { cols: 32, rows: 32 }, window: [1, 1, 2, 2], format: 'f32', asset: f32(4), tones: { palette: ['mid', 'faint'], asset: 'AAH/AQ==' } }), 'valid'],
  ['raster u8 full grid', withLayer({ kind: 'raster', grid: { cols: 4, rows: 2 }, format: 'u8', asset: encodeSamples([0, .5, 1, 0, 0, 0, 1, 1], 'u8') }), 'valid'],
  ['generator ring + opts', withLayer({ kind: 'generator', name: 'ring', params: [16, 16, 10, { thickness: 2, every: 3 }], tone: 'faint' }), 'valid'],
  ['generator icon', withLayer({ kind: 'generator', name: 'icon', params: [icon, 2, 2, 16, { fill: true }] }), 'valid'],
  ['full header', {
    ...base(), group: 'chart', grid: { cols: 32, rows: 32, pitch: 2.25 }, theme: { dotActive: '#ff3b30', bg: '#0b0c0dff' }, data: { value: .5, mode: 0 },
    controls: [{ key: 'value', kind: 'knob', box: [0, 0, 32, 32], min: 0, max: 1, step: .01, label: 'Value' }, { key: 'mode', kind: 'segmented', box: [0, 28, 32, 4], options: 2, optionLabels: ['A', 'B'], label: 'Mode' }],
    states: { low: { data: { value: .1 } }, high: { data: { value: .9 } } }, initial: 'low',
    transitions: { enter: { mask: 'radial', ease: 'decelerate', duration: 420, delay: 70 }, change: false, exit: { mask: 'scan' } },
    springKeys: ['value'], live: true, clock: false, burst: 2, chrome: 'dots', label: 'FX', bleed: false, media: 'camera',
  }, 'valid'],
  ['not an object', [1, 2], 'invalid', '$'],
  ['version 2', { ...base(), version: 2 }, 'invalid', '$.version'],
  ['missing layers', (() => { const r = base(); delete r.layers; return r })(), 'invalid', '$.layers'],
  ['unknown top-level key', { ...base(), script: 'alert(1)' }, 'invalid', '$.script'],
  ['unknown layer kind', withLayer({ kind: 'svg', d: 'M0 0' }), 'invalid', '$.layers[0].kind'],
  ['bad tone', withLayer({ kind: 'ir', src: 'u', tone: 'red' }), 'invalid', '$.layers[0].tone'],
  ['grid cols 0', { ...base(), grid: { cols: 0, rows: 4 } }, 'invalid', '$.grid.cols'],
  ['grid too big', { ...base(), grid: { cols: 600, rows: 4 } }, 'invalid', '$.grid.cols'],
  ['id with spaces', { ...base(), id: 'My Card' }, 'invalid', '$.id'],
  ['theme colour not hex', { ...base(), theme: { dotActive: 'red' } }, 'invalid', '$.theme.dotActive'],
  ['theme shadow token', { ...base(), theme: { accent: '#ff0000' } }, 'invalid', '$.theme.accent'],
  ['text with text and bind', withLayer({ kind: 'text', text: 'A', bind: 'u', at: [0, 0] }), 'invalid', '$.layers[0]'],
  ['text with neither', withLayer({ kind: 'text', at: [0, 0] }), 'invalid', '$.layers[0]'],
  ['generator arity', withLayer({ kind: 'generator', name: 'dot', params: [1] }), 'invalid', '$.layers[0].params'],
  ['generator unknown name', withLayer({ kind: 'generator', name: 'polygon', params: [] }), 'invalid', '$.layers[0].name'],
  ['control kind', { ...base(), controls: [{ key: 'v', kind: 'dial', box: [0, 0, 4, 4], label: 'V' }] }, 'invalid', '$.controls[0].kind'],
  ['transition mask', { ...base(), transitions: { enter: { mask: 'swirl' } } }, 'invalid', '$.transitions.enter.mask'],
  ['site with 4 numbers', withLayer({ kind: 'sites', points: [[1, 2, .5, 9]] }), 'invalid', '$.layers[0].points[0]'],
  ['oversize text', withLayer({ kind: 'text', text: 'A'.repeat(300), at: [0, 0] }), 'invalid', '$.layers[0].text'],
  ['too many layers', { ...base(), layers: Array.from({ length: 257 }, () => ({ kind: 'ir', src: 'u' })) }, 'invalid', '$.layers'],
  ['oversize IR', withLayer({ kind: 'ir', src: 'u+'.repeat(2500) + 'u' }), 'invalid', '$.layers[0].src'],
  ['asset not base64', withLayer({ kind: 'raster', grid: { cols: 1, rows: 1 }, format: 'u8', asset: '***' }), 'invalid', '$.layers[0].asset'],
  ['data key not an identifier', { ...base(), data: { '1abc': 1 } }, 'invalid', '$.data.1abc'],
  ['generator param type', withLayer({ kind: 'generator', name: 'bars', params: ['1,2', 0, 10, 8] }), 'invalid', '$.layers[0].params[0]'],
  ['IR syntax error', withLayer({ kind: 'ir', src: 'u +* v' }), 'semantic', '$.layers[0].src'],
  ['IR unknown function', withLayer({ kind: 'ir', src: 'foo(u)' }), 'semantic', '$.layers[0].src'],
  ['IR host access attempt', withLayer({ kind: 'sites', points: [[1, 1]], bind: 'globalThis.process' }), 'semantic', '$.layers[0].bind'],
  ['bad text bind', withLayer({ kind: 'text', bind: 'data.', at: [0, 0] }), 'semantic', '$.layers[0].bind'],
  ['unknown icon', withLayer({ kind: 'generator', name: 'icon', params: ['nope', 0, 0, 8] }), 'semantic', '$.layers[0].params[0]'],
  ['asset byte count', withLayer({ kind: 'raster', grid: { cols: 32, rows: 32 }, window: [0, 0, 1, 1], format: 'f32', asset: f32(3) }), 'semantic', '$.layers[0].asset'],
  ['initial without state', { ...base(), initial: 'idle' }, 'semantic', '$.initial'],
  ['springKey without data', { ...base(), springKeys: ['value'] }, 'semantic', '$.springKeys[0]'],
  ['sizeMin > sizeMax', { ...base(), style: { shape: 'circle', sizeMin: 1, sizeMax: .5 } }, 'semantic', '$.style.sizeMin'],
  ['tones length', withLayer({ kind: 'sites', points: [[1, 1], [2, 2]], tones: ['mid'] }), 'semantic', '$.layers[0].tones'],
  ['bind with valued points', withLayer({ kind: 'sites', points: [[1, 1, .5]], bind: 'u' }), 'semantic', '$.layers[0].bind'],
  ['raster window outside grid', withLayer({ kind: 'raster', grid: { cols: 2, rows: 2 }, window: [0, 0, 2, 1], format: 'u8', asset: 'AAAA' }), 'semantic', '$.layers[0].window'],
]
/** > 4 MB of individually valid rasters: only the whole-spec size limit rejects it. */
const oversize = () => ({ ...base(), grid: { cols: 512, rows: 512 }, layers: Array.from({ length: 6 }, () => ({ kind: 'raster', grid: { cols: 512, rows: 512 }, window: [0, 0, 511, 255], format: 'f32', asset: f32(512 * 256, 0) })) })

// ── the hand-authored text + sites example ──
function textSitesSpec(): CardSpec {
  const T = layoutFor(TILE), C = 71.5, R = 50, ring = T.dotRing(C, C, R, { spacing: 4.6, size: 2 })
  const points = ring.sites!.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)] as [number, number])
  return {
    version: 1, id: 'spec-gauge', name: 'Spec Gauge', group: 'polar', grid: { cols: TILE.cols, rows: TILE.rows, pitch: TILE.pitch },
    style: { shape: tileStyle.shape, sizeMin: tileStyle.sizeMin, sizeMax: tileStyle.sizeMax, cornerRoundness: tileStyle.cornerRoundness!, opacityMode: tileStyle.opacityMode!, quantizeSteps: tileStyle.quantizeSteps! },
    data: { value: .62 },
    controls: [{ key: 'value', kind: 'knob', box: [C - R, C - R, 2 * R, 2 * R], min: 0, max: 1, step: .01, label: 'Value' }],
    layers: [
      { kind: 'sites', points, size: 2, tone: 'faint' },
      { kind: 'sites', points, size: 2, tone: 'active', bind: "// arc from 12 o'clock, clockwise to data.value\nlet a = fract(atan(u - .5, .5 - v) / TAU);\na < clamp(data.value, 0, 1) ? 1 : 0" },
      { kind: 'text', bind: 'data.value * 100', at: [C / 3, 0], align: 'center', smooth: true, lattice: 3, origin: [0, 46], tone: 'value' },
      { kind: 'text', text: 'SPEC  GAUGE', at: [C, 96], align: 'center', tone: 'idle' },
    ],
    states: { low: { data: { value: .18 } }, full: { data: { value: 1 } } },
    transitions: { enter: { mask: 'radial', ease: 'decelerate', duration: 420 }, change: { mask: 'ign', ease: 'standard', duration: 200 } },
    springKeys: ['value'], chrome: 'dots', label: 'SPEC  GAUGE',
  }
}
/** The examples: an IR card, the text + sites card, a baked photo card. */
function exampleSpecs(): Record<string, CardSpec> {
  const photo = uniquePresets().find(p => p.id === 'silhouette')!
  return { 'ir-ripple': presetToSpec(irBoard[0]), 'text-sites-gauge': textSitesSpec(), 'baked-photo': presetToSpec(photo, { precision: 'f32' }) }
}

export function specChecks(assert: Assert, opts: { writeExamples?: boolean } = {}) {
  freezeWallClock()
  const schema = JSON.parse(readFileSync(SCHEMA_FILE, 'utf8')) as J, schemaCheck = schemaValidator(schema)
  const defs = schema.$defs as Record<string, J>, props = schema.properties as Record<string, J>

  // the schema's enums are the TS constants (no drift between the two)
  const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  const drift = [
    ['tone', eq(defs.tone.enum, TONES)], ['group', eq(props.group.enum, GROUPS)], ['theme', eq(Object.keys(props.theme.properties as J), THEME_COLORS)],
    ['mask', eq((defs.transition.properties as Record<string, J>).mask.enum, MASKS)], ['ease', eq((defs.transition.properties as Record<string, J>).ease.enum, EASES)],
    ['control kind', eq((defs.control.properties as Record<string, J>).kind.enum, CONTROL_KINDS)], ['generators', eq((defs.generatorLayer.properties as Record<string, J>).name.enum, Object.keys(GENERATOR_PARAMS))],
  ].filter(([, ok]) => !ok).map(([n]) => n)
  assert('spec schema: enums match the TS constants (tones, groups, theme tokens, masks, eases, controls, generators)', drift.length === 0, drift.join(', '))

  // schema ↔ validator on the fixtures
  const disagree: string[] = [], badPath: string[] = []
  for (const [name, json, expect, path] of [...FIXTURES, ['spec over 4 MB', oversize(), 'semantic', '$'] as const]) {
    const s = schemaCheck(json), v = validateSpec(json)
    const want = expect === 'valid' ? [true, true] : expect === 'invalid' ? [false, false] : [true, false]
    if ((s === null) !== want[0] || v.ok !== want[1]) disagree.push(`${name} (schema ${s ?? 'ok'}, validator ${v.ok ? 'ok' : v.errors[0].path + ' ' + v.errors[0].message})`)
    if (path && !v.ok && !v.errors.some(e => e.path === path || e.path.startsWith(`${path}.`) || e.path.startsWith(`${path}[`))) badPath.push(`${name}: want ${path}, got ${v.errors.map(e => e.path).join(' ')}`)
  }
  const n = FIXTURES.length + 1
  assert(`spec validator ≡ schema on ${n} fixtures (${FIXTURES.filter(f => f[2] === 'valid').length} valid, ${FIXTURES.filter(f => f[2] === 'invalid').length} invalid, ${FIXTURES.filter(f => f[2] === 'semantic').length + 1} validator-only)`, disagree.length === 0, disagree.slice(0, 4).join('; '))
  assert('spec validator: errors carry the offending JSON path (unknown kind, bad bind, oversize, refs)', badPath.length === 0, badPath.slice(0, 4).join('; '))
  const big = validateSpec(JSON.stringify(oversize())), unk = validateSpec(FIXTURES.find(f => f[0] === 'unknown layer kind')![1]), bind = validateSpec(FIXTURES.find(f => f[0] === 'bad text bind')![1])
  assert('spec validator: rejects oversize / unknown kind / bad bind with readable messages', !big.ok && /more than 4000000/.test(big.errors[0].message) && /unknown layer kind "svg"/.test(unk.errors[0]?.message ?? '') && /^IR: /.test(bind.errors[0]?.message ?? ''),
    `${big.errors[0]?.message} | ${unk.errors[0]?.message} | ${bind.errors[0]?.message}`)

  // preset → spec → JSON → spec → preset, for every preset
  const goldens = JSON.parse(readFileSync('goldens/hashes.json', 'utf8')).presets as Record<string, Record<string, { hash: string }>>
  const t0 = performance.now(), irIds = new Set(irBoard.map(p => p.id))
  let exported = 0, matched = 0, full = 0, fullMatched = 0, stable = 0, bytes = 0
  const kinds: Record<string, number> = {}, unsupported: string[] = [], mismatched: string[] = [], unstable: string[] = [], irOk: string[] = []
  for (const p of uniquePresets()) {
    let rep
    try { rep = exportPreset(p) } catch (e) { unsupported.push(`${p.id} (${(e as Error).message.slice(0, 60)})`); continue }
    exported++
    const json = JSON.stringify(rep.spec), back = specToPreset(JSON.parse(json))
    bytes += json.length
    for (const [k, c] of Object.entries(rep.kinds)) kinds[k] = (kinds[k] ?? 0) + c
    // TS code that moves sites or text per frame exports as the t = 0 frame; only IR that reads t stays animated
    const isFull = rep.baked.length === 0, times = back.animated ? goldenTimes(p) : [0]
    // against the committed golden first (cheap); recompute the preset's own hash only when that differs
    const ok = times.every(t => { const h = goldenHash(back, t); return h === goldens[p.id]?.[`t=${t}`]?.hash || h === goldenHash(p, t) })
    if (ok) matched++; else mismatched.push(p.id)
    if (isFull) { full++; if (ok) fullMatched++ }
    if (irIds.has(p.id) && isFull && ok) irOk.push(p.id)
    if (JSON.stringify(presetToSpec(back)) === json) stable++; else unstable.push(p.id)
  }
  const ms = performance.now() - t0, total = uniquePresets().length
  console.log(`  spec export: ${exported}/${total} presets, layers ${Object.entries(kinds).map(([k, c]) => `${k} ${c}`).join(', ')}; ${full} without a bake; ${(bytes / 1e6).toFixed(1)} MB JSON; ${ms.toFixed(0)} ms`)
  if (unsupported.length) console.log(`  spec export unsupported: ${unsupported.join(', ')}`)
  assert('spec round-trip: every IR-board card is pure IR/text/sites and keeps its golden hashes at every golden time', irOk.length === irBoard.length, `${irOk.join(', ')}`)
  assert(`spec round-trip: preset → spec → JSON → preset keeps the golden hash (${matched}/${exported} presets, ${fullMatched}/${full} with no baked layer; IR cards at every golden time)`, matched === exported && matched >= irBoard.length + 10, mismatched.slice(0, 8).join(', '))
  assert('spec round-trip: preset → spec → preset → spec is byte-stable JSON', stable === exported, unstable.slice(0, 8).join(', '))

  // spec → JSON → spec, the generator subset by hand, migration
  const gauge = textSitesSpec(), gp = specToPreset(gauge)
  const gaugeStable = JSON.stringify(presetToSpec(gp)) === JSON.stringify(gauge) && JSON.stringify(JSON.parse(JSON.stringify(gauge))) === JSON.stringify(gauge)
  const at = (data: J, state?: string) => sampleCard(gp, 0, gp.style, undefined, { data: data as Record<string, number>, state }).length
  const live = at({ value: .62 }) !== at({ value: .2 }) && at({ value: .2 }, 'full') === at({ value: 1 })
  assert('spec: hand-written text+sites spec is stable through preset → spec, its binds and states drive the dots', gaugeStable && live && !gp.animated, `dots ${at({ value: .62 })} / ${at({ value: .2 })} / full ${at({ value: .2 }, 'full')}`)
  const v0 = { spec: 0, id: 'old-card', title: 'Old Card', cols: 144, rows: 144, pitch: 2.25, defaults: { value: .3 }, layers: [
    { type: 'ir', program: 'step(.5, u)', lattice: 3, at: [0, 12], rect: [0, 0, 48, 40], tone: 'auto' },
    { type: 'text', value: '42', x: 60, y: 40, lattice: 3, tone: 'value' }, { type: 'text', value: 'OLD', x: 4, y: 130, tone: 'idle' },
    { type: 'dots', points: [[71.5, 71.5]], size: 3, tone: 'active' }] }
  const mig = loadSpec(JSON.stringify(v0)), m = mig.ok ? mig.spec : undefined
  const migOk = !!m && m.version === 1 && m.name === 'Old Card' && m.layers.map(l => l.kind).join() === 'ir,text,text,sites' && sampleCard(specToPreset(m), 0).length > 100
  let unknownVersion = ''
  try { migrateSpec({ version: 7 }) } catch (e) { unknownVersion = (e as Error).message }
  assert('spec migrate: v0 draft → v1 validates and renders; v1 passes through; unknown versions are refused', migOk && migrateSpec(gauge) === gauge && /unknown spec version 7/.test(unknownVersion), mig.ok ? '' : mig.errors.map(e => `${e.path} ${e.message}`).join('; '))

  // examples
  const examples = exampleSpecs()
  if (opts.writeExamples) {
    mkdirSync(EXAMPLES, { recursive: true })
    for (const [name, s] of Object.entries(examples)) writeFileSync(`${EXAMPLES}/${name}.json`, JSON.stringify(s, null, 1) + '\n')
  }
  const bad: string[] = []
  for (const [name, s] of Object.entries(examples)) {
    let text = ''
    try { text = readFileSync(`${EXAMPLES}/${name}.json`, 'utf8') } catch { bad.push(`${name} missing`); continue }
    const r = loadSpec(text)
    if (!r.ok || schemaCheck(JSON.parse(text)) !== null) { bad.push(`${name} invalid`); continue }
    if (JSON.stringify(r.spec) !== JSON.stringify(s)) bad.push(`${name} stale (npx tsx scripts/spec.ts --examples)`)
    else if (sampleCard(specToPreset(r.spec), 0).length < 50) bad.push(`${name} renders almost nothing`)
  }
  // the IR example is the ir-ripple card itself (both golden times); the photo is Float32 (lossy), so its hash is reported, not required
  const ripple = specToPreset(examples['ir-ripple']), photo = specToPreset(examples['baked-photo']), src = uniquePresets().find(p => p.id === photo.id)!
  if (![0, 1.3].every(t => goldenHash(ripple, t) === goldenHash(irBoard[0], t))) bad.push('ir-ripple.json draws differently from ir-ripple')
  const photoSame = goldenHash(photo, 0) === goldenHash(src, 0)
  assert(`spec examples: ${Object.keys(examples).map(n => `${n}.json`).join(', ')} are current, schema-valid and render`, bad.length === 0,
    bad.length ? bad.join('; ') : `${photo.id} at Float32 ${photoSame ? 'keeps' : 'changes'} its golden hash`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let failures = 0
  specChecks((name, cond, detail = '') => {
    if (cond) console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`)
    else { console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`); failures++ }
  }, { writeExamples: process.argv.includes('--examples') })
  if (failures) { console.error(`\n${failures} spec check(s) failed`); process.exit(1) }
}
