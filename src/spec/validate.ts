/**
 * `validateSpec(json)` — hand-written card spec v1 validator. Structural rules mirror
 * `schema/card.v1.schema.json` exactly (scripts/spec.ts checks both on the same fixtures); on top it
 * checks what a schema cannot: IR sources parse within the IR limits, the JSON size, asset byte
 * counts against their window, tone indices, `initial` / `springKeys` references, icon names.
 * Never evaluates anything. Errors carry JSON paths (`$.layers[2].src`).
 */
import { iconPaths } from '../engine/fields/iconSDF'
import { IRError, parse, validate as validateIR } from '../engine/ir'
import '../engine/noise/ir' // IR noise pack: spec IR may call noise() fbm() turb() voronoi(); don't rely on build.ts loading it first
import { LAYOUT_GENERATORS, type LayoutGenerator } from '../widgets/types'
import { BASE64, BYTES_PER_SAMPLE, base64Bytes, fromBase64 } from './codec'
import { GENERATOR_PARAMS, ICON_OPTS, RING_OPTS, type ParamType } from './generators'
import { CONTROL_KINDS, EASES, GROUPS, LAYER_KINDS, MASKS, SPEC_LIMITS, THEME_COLORS, TONES, type SpecIssue } from './types'

export interface SpecResult { ok: boolean; errors: SpecIssue[] }
export const ID = /^[a-z0-9][a-z0-9-]{0,63}$/
export const KEY = /^[A-Za-z][A-Za-z0-9_]{0,63}$/
export const COLOR = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/
const MAX_ERRORS = 50
const COORD = 1024

type O = Record<string, unknown>
const isObj = (x: unknown): x is O => typeof x === 'object' && x !== null && !Array.isArray(x)
const show = (x: unknown) => { const s = JSON.stringify(x); return s === undefined ? String(x) : s.length > 40 ? `${s.slice(0, 37)}...` : s }

export function validateSpec(input: unknown): SpecResult {
  const errors: SpecIssue[] = []
  const fail = (path: string, message: string) => { if (errors.length < MAX_ERRORS) errors.push({ path, message }); return false }
  let json = input
  if (typeof input === 'string') {
    if (input.length > SPEC_LIMITS.json) return { ok: false, errors: [{ path: '$', message: `spec is ${input.length} characters, more than ${SPEC_LIMITS.json}` }] }
    try { json = JSON.parse(input) } catch { return { ok: false, errors: [{ path: '$', message: 'not JSON' }] } }
  } else {
    let size = 0
    try { size = JSON.stringify(input)?.length ?? 0 } catch { return { ok: false, errors: [{ path: '$', message: 'not serializable as JSON' }] } }
    if (size > SPEC_LIMITS.json) return { ok: false, errors: [{ path: '$', message: `spec is ${size} characters as JSON, more than ${SPEC_LIMITS.json}` }] }
  }

  // ── primitives ──
  const obj = (x: unknown, path: string, allowed: readonly string[], required: readonly string[] = []): x is O => {
    if (!isObj(x)) return fail(path, 'expected an object')
    for (const k of Object.keys(x)) if (!allowed.includes(k)) fail(`${path}.${k}`, 'unknown property')
    for (const k of required) if (!(k in x)) fail(`${path}.${k}`, 'required')
    return true
  }
  const num = (x: unknown, path: string, o: { min?: number; max?: number; exMin?: number; int?: boolean } = {}) => {
    if (typeof x !== 'number' || !Number.isFinite(x)) return fail(path, 'expected a finite number')
    if (o.int && !Number.isInteger(x)) return fail(path, 'expected an integer')
    if (o.min !== undefined && x < o.min) return fail(path, `must be ≥ ${o.min}`)
    if (o.exMin !== undefined && x <= o.exMin) return fail(path, `must be > ${o.exMin}`)
    if (o.max !== undefined && x > o.max) return fail(path, `must be ≤ ${o.max}`)
    return true
  }
  const str = (x: unknown, path: string, o: { min?: number; max?: number; pattern?: RegExp } = {}) => {
    if (typeof x !== 'string') return fail(path, 'expected a string')
    if (o.min !== undefined && x.length < o.min) return fail(path, `must have at least ${o.min} character(s)`)
    if (o.max !== undefined && x.length > o.max) return fail(path, `longer than ${o.max} characters`)
    if (o.pattern && !o.pattern.test(x)) return fail(path, `does not match ${o.pattern}`)
    return true
  }
  const bool = (x: unknown, path: string) => typeof x === 'boolean' || fail(path, 'expected a boolean')
  const oneOf = (x: unknown, path: string, values: readonly unknown[]) => values.includes(x) || fail(path, `must be one of ${values.join(', ')} (got ${show(x)})`)
  const arr = (x: unknown, path: string, o: { min?: number; max?: number } = {}): x is unknown[] => {
    if (!Array.isArray(x)) return fail(path, 'expected an array')
    if (o.min !== undefined && x.length < o.min) return fail(path, `needs at least ${o.min} item(s)`)
    if (o.max !== undefined && x.length > o.max) return fail(path, `has ${x.length} items, more than ${o.max}`)
    return true
  }
  const tuple = (x: unknown, path: string, n: number, o: { min?: number; max?: number; int?: boolean } = { min: -COORD, max: COORD }) => {
    if (!arr(x, path, { min: n, max: n })) return false
    let ok = true
    x.forEach((v, i) => { ok = num(v, `${path}[${i}]`, o) && ok })
    return ok
  }
  const dataMap = (x: unknown, path: string) => {
    if (!isObj(x)) return fail(path, 'expected an object')
    const keys = Object.keys(x)
    if (keys.length > SPEC_LIMITS.dataKeys) fail(path, `has ${keys.length} keys, more than ${SPEC_LIMITS.dataKeys}`)
    for (const k of keys) { if (str(k, `${path}.${k}`, { pattern: KEY })) num(x[k], `${path}.${k}`) }
    return true
  }
  /** IR source: parse + validate within the IR limits (`raw` text binds are still plain expressions). */
  const ir = (x: unknown, path: string) => {
    if (!str(x, path, { min: 1, max: SPEC_LIMITS.ir })) return false
    try { validateIR(parse(x as string)); return true } catch (e) { return fail(path, e instanceof IRError ? `IR: ${e.message}` : 'IR: invalid program') }
  }
  const tone = (x: unknown, path: string) => oneOf(x, path, TONES)
  const placed = (l: O, path: string) => {
    if ('tone' in l) tone(l.tone, `${path}.tone`)
    if ('lattice' in l) num(l.lattice, `${path}.lattice`, { exMin: 0, max: 64 })
    if ('origin' in l) tuple(l.origin, `${path}.origin`, 2)
  }
  const PLACED = ['kind', 'tone', 'lattice', 'origin'] as const

  // ── generator params ──
  const param = (x: unknown, path: string, t: ParamType) => {
    switch (t) {
      case 'n': return num(x, path, { min: -COORD * 4, max: COORD * 4 })
      case 'N': if (arr(x, path, { max: SPEC_LIMITS.params })) x.forEach((v, i) => num(v, `${path}[${i}]`, { min: -COORD * 4, max: COORD * 4 })); return
      case 'pts': if (arr(x, path, { max: SPEC_LIMITS.params })) x.forEach((v, i) => tuple(v, `${path}[${i}]`, 2, { min: -COORD * 4, max: COORD * 4 })); return
      case 'rows': if (arr(x, path, { min: 1, max: 256 })) x.forEach((v, i) => str(v, `${path}[${i}]`, { max: 256 })); return
      case 's': return str(x, path, { min: 1, max: SPEC_LIMITS.text })
      case 'icon': if (str(x, path, { pattern: /^[A-Za-z][A-Za-z0-9-]{0,63}$/ }) && !Object.prototype.hasOwnProperty.call(iconPaths, x as string)) fail(path, `unknown icon ${show(x)}`); return
      case 'ringOpts': if (obj(x, path, RING_OPTS)) for (const k of RING_OPTS) if (k in x) num(x[k], `${path}.${k}`, { min: -COORD * 4, max: COORD * 4 }); return
      case 'iconOpts': if (obj(x, path, Object.keys(ICON_OPTS))) { if ('fill' in x) bool(x.fill, `${path}.fill`); if ('stroke' in x) num(x.stroke, `${path}.stroke`, { min: 0, max: 64 }) } return
    }
  }

  // ── layers ──
  const layer = (l: unknown, path: string) => {
    if (!isObj(l)) return fail(path, 'expected an object')
    if (!LAYER_KINDS.includes(l.kind as never)) return fail(`${path}.kind`, `unknown layer kind ${show(l.kind)} (one of ${LAYER_KINDS.join(', ')})`)
    switch (l.kind) {
      case 'ir':
        if (!obj(l, path, [...PLACED, 'src', 'bounds', 'toneStops'], ['src'])) return
        placed(l, path)
        if ('src' in l) ir(l.src, `${path}.src`)
        if ('bounds' in l && tuple(l.bounds, `${path}.bounds`, 4, { int: true, min: -COORD, max: COORD })) {
          const b = l.bounds as number[]
          if (b[2] < 1 || b[3] < 1) fail(`${path}.bounds`, 'width and height must be ≥ 1')
        }
        if ('toneStops' in l && arr(l.toneStops, `${path}.toneStops`, { min: 1, max: 16 })) l.toneStops.forEach((s, i) => {
          const p = `${path}.toneStops[${i}]`
          if (obj(s, p, ['at', 'tone', 'blend'], ['at', 'tone'])) { if ('at' in s) num(s.at, `${p}.at`, { min: 0, max: 1 }); if ('tone' in s) tone(s.tone, `${p}.tone`); if ('blend' in s) num(s.blend, `${p}.blend`, { min: 0, max: 1 }) }
        })
        return
      case 'text':
        if (!obj(l, path, [...PLACED, 'text', 'bind', 'format', 'at', 'align', 'scale', 'smooth'], ['at'])) return
        placed(l, path)
        if ('text' in l === 'bind' in l) fail(path, 'needs exactly one of text, bind')
        if ('text' in l) str(l.text, `${path}.text`, { max: SPEC_LIMITS.text })
        if ('bind' in l) ir(l.bind, `${path}.bind`)
        if ('format' in l && obj(l.format, `${path}.format`, ['decimals', 'pad', 'prefix', 'suffix'])) {
          const f = l.format as O, p = `${path}.format`
          if ('decimals' in f) num(f.decimals, `${p}.decimals`, { int: true, min: 0, max: 6 })
          if ('pad' in f) num(f.pad, `${p}.pad`, { int: true, min: 0, max: 16 })
          for (const k of ['prefix', 'suffix'] as const) if (k in f) str(f[k], `${p}.${k}`, { max: 32 })
        }
        if ('at' in l) tuple(l.at, `${path}.at`, 2)
        if ('align' in l) oneOf(l.align, `${path}.align`, ['left', 'center', 'right'])
        if ('scale' in l) { if (Array.isArray(l.scale)) tuple(l.scale, `${path}.scale`, 2, { int: true, min: 1, max: 16 }); else num(l.scale, `${path}.scale`, { int: true, min: 1, max: 16 }) }
        if ('smooth' in l) bool(l.smooth, `${path}.smooth`)
        return
      case 'sites': {
        if (!obj(l, path, ['kind', 'points', 'bind', 'size', 'tone', 'tones'], ['points'])) return
        let valued = false
        if ('points' in l && arr(l.points, `${path}.points`, { max: SPEC_LIMITS.points })) l.points.forEach((pt, i) => {
          const p = `${path}.points[${i}]`
          if (!arr(pt, p, { min: 2, max: 3 })) return
          pt.forEach((v, j) => num(v, `${p}[${j}]`, j < 2 ? { min: -COORD, max: COORD } : { min: 0, max: 1 }))
          if (pt.length === 3) valued = true
        })
        if ('bind' in l) { ir(l.bind, `${path}.bind`); if (valued) fail(`${path}.bind`, 'a bound layer cannot also give per-point values') }
        if ('size' in l) num(l.size, `${path}.size`, { exMin: 0, max: 64 })
        if ('tone' in l) tone(l.tone, `${path}.tone`)
        if ('tones' in l && arr(l.tones, `${path}.tones`, { max: SPEC_LIMITS.points })) {
          l.tones.forEach((t, i) => { if (t !== null) tone(t, `${path}.tones[${i}]`) })
          if (Array.isArray(l.points) && l.tones.length !== l.points.length) fail(`${path}.tones`, `has ${l.tones.length} entries for ${l.points.length} points`)
        }
        return
      }
      case 'raster': {
        if (!obj(l, path, [...PLACED, 'grid', 'window', 'format', 'asset', 'tones'], ['grid', 'format', 'asset'])) return
        placed(l, path)
        let cells = -1
        const g = l.grid
        if (obj(g, `${path}.grid`, ['cols', 'rows'], ['cols', 'rows'])) {
          const okC = num(g.cols, `${path}.grid.cols`, { int: true, min: 1, max: SPEC_LIMITS.grid }), okR = num(g.rows, `${path}.grid.rows`, { int: true, min: 1, max: SPEC_LIMITS.grid })
          if (okC && okR) cells = (g.cols as number) * (g.rows as number)
          if ('window' in l && tuple(l.window, `${path}.window`, 4, { int: true, min: 0, max: SPEC_LIMITS.grid - 1 }) && cells >= 0) {
            const [c0, r0, c1, r1] = l.window as number[]
            if (c0 > c1 || r0 > r1 || c1 >= (g.cols as number) || r1 >= (g.rows as number)) { fail(`${path}.window`, 'must satisfy 0 ≤ col0 ≤ col1 < cols, 0 ≤ row0 ≤ row1 < rows'); cells = -1 }
            else cells = (c1 - c0 + 1) * (r1 - r0 + 1)
          }
        }
        const okF = 'format' in l && oneOf(l.format, `${path}.format`, ['f64', 'f32', 'u8'])
        if ('asset' in l && str(l.asset, `${path}.asset`, { max: SPEC_LIMITS.asset, pattern: BASE64 }) && okF && cells >= 0) {
          const want = cells * BYTES_PER_SAMPLE[l.format as 'f64'], got = base64Bytes(l.asset as string)
          if (got !== want) fail(`${path}.asset`, `decodes to ${got} bytes, the window needs ${want}`)
        }
        if ('tones' in l && obj(l.tones, `${path}.tones`, ['palette', 'asset'], ['palette', 'asset'])) {
          const t = l.tones as O, p = `${path}.tones`
          const okP = arr(t.palette, `${p}.palette`, { min: 1, max: 16 })
          if (okP) (t.palette as unknown[]).forEach((x, i) => tone(x, `${p}.palette[${i}]`))
          if ('asset' in t && str(t.asset, `${p}.asset`, { max: SPEC_LIMITS.asset, pattern: BASE64 }) && cells >= 0) {
            const bytes = fromBase64(t.asset as string)
            if (bytes.length !== cells) fail(`${p}.asset`, `decodes to ${bytes.length} bytes, the window needs ${cells}`)
            else if (okP) { const n = (t.palette as unknown[]).length; const bad = bytes.findIndex(b => b !== 255 && b >= n); if (bad >= 0) fail(`${p}.asset`, `palette index ${bytes[bad]} at cell ${bad} is out of range`) }
          }
        }
        return
      }
      case 'generator': {
        if (!obj(l, path, [...PLACED, 'name', 'params'], ['name', 'params'])) return
        placed(l, path)
        if (!oneOf(l.name, `${path}.name`, LAYOUT_GENERATORS) || !arr(l.params, `${path}.params`, { max: 16 })) return
        const sig = GENERATOR_PARAMS[l.name as LayoutGenerator], ps = l.params as unknown[], all = [...sig.req, ...sig.opt]
        if (ps.length < sig.req.length || ps.length > all.length) return fail(`${path}.params`, `${l.name} takes ${sig.req.length}${sig.opt.length ? `–${all.length}` : ''} params (got ${ps.length})`)
        ps.forEach((x, i) => param(x, `${path}.params[${i}]`, all[i]))
        return
      }
    }
  }

  const control = (c: unknown, path: string) => {
    if (!obj(c, path, ['key', 'kind', 'box', 'min', 'max', 'step', 'orientation', 'keyY', 'options', 'optionLabels', 'perTurn', 'wrap', 'gesture', 'label'], ['key', 'kind', 'box', 'label'])) return
    if ('key' in c) str(c.key, `${path}.key`, { pattern: KEY })
    if ('kind' in c) oneOf(c.kind, `${path}.kind`, CONTROL_KINDS)
    if ('box' in c) tuple(c.box, `${path}.box`, 4)
    for (const k of ['min', 'max', 'perTurn'] as const) if (k in c) num(c[k], `${path}.${k}`)
    if ('step' in c) num(c.step, `${path}.step`, { exMin: 0 })
    if ('orientation' in c) oneOf(c.orientation, `${path}.orientation`, ['horizontal', 'vertical'])
    if ('keyY' in c) str(c.keyY, `${path}.keyY`, { pattern: KEY })
    if ('options' in c) num(c.options, `${path}.options`, { int: true, min: 1, max: 64 })
    if ('optionLabels' in c && arr(c.optionLabels, `${path}.optionLabels`, { max: 64 })) c.optionLabels.forEach((s, i) => str(s, `${path}.optionLabels[${i}]`, { max: SPEC_LIMITS.text }))
    if ('wrap' in c) bool(c.wrap, `${path}.wrap`)
    if ('gesture' in c) oneOf(c.gesture, `${path}.gesture`, ['surface'])
    if ('label' in c) str(c.label, `${path}.label`, { min: 1, max: SPEC_LIMITS.text })
  }
  const transition = (x: unknown, path: string) => {
    if (!obj(x, path, ['mask', 'ease', 'duration', 'delay'], ['mask'])) return
    if ('mask' in x) oneOf(x.mask, `${path}.mask`, MASKS)
    if ('ease' in x) oneOf(x.ease, `${path}.ease`, EASES)
    for (const k of ['duration', 'delay'] as const) if (k in x) num(x[k], `${path}.${k}`, { min: 0, max: 10_000 })
  }

  // ── the card ──
  const TOP = ['version', 'id', 'name', 'group', 'grid', 'style', 'theme', 'data', 'controls', 'layers', 'states', 'initial', 'transitions', 'springKeys', 'live', 'clock', 'burst', 'chrome', 'label', 'bleed', 'media']
  const s = json
  if (!obj(s, '$', TOP, ['version', 'id', 'name', 'grid', 'style', 'layers'])) return { ok: false, errors }
  if ('version' in s && s.version !== 1) fail('$.version', `must be 1 (got ${show(s.version)}; run migrateSpec first)`)
  if ('id' in s) str(s.id, '$.id', { pattern: ID })
  if ('name' in s) str(s.name, '$.name', { min: 1, max: SPEC_LIMITS.text })
  if ('group' in s) oneOf(s.group, '$.group', GROUPS)
  if ('grid' in s && obj(s.grid, '$.grid', ['cols', 'rows', 'pitch', 'aspect'], ['cols', 'rows'])) {
    const g = s.grid as O
    if ('cols' in g) num(g.cols, '$.grid.cols', { int: true, min: 1, max: SPEC_LIMITS.grid })
    if ('rows' in g) num(g.rows, '$.grid.rows', { int: true, min: 1, max: SPEC_LIMITS.grid })
    if ('pitch' in g) num(g.pitch, '$.grid.pitch', { exMin: 0, max: 64 })
    if ('aspect' in g) num(g.aspect, '$.grid.aspect', { exMin: 0, max: 16 })
  }
  if ('style' in s && obj(s.style, '$.style', ['shape', 'sizeMin', 'sizeMax', 'cornerRoundness', 'opacityMode', 'jitter', 'quantizeSteps'], ['shape', 'sizeMin', 'sizeMax'])) {
    const st = s.style as O
    if ('shape' in st) oneOf(st.shape, '$.style.shape', ['circle', 'square', 'squircle', 'superformula'])
    const a = 'sizeMin' in st && num(st.sizeMin, '$.style.sizeMin', { min: 0, max: 8 }), b = 'sizeMax' in st && num(st.sizeMax, '$.style.sizeMax', { min: 0, max: 8 })
    if (a && b && (st.sizeMin as number) > (st.sizeMax as number)) fail('$.style.sizeMin', 'must be ≤ sizeMax')
    if ('cornerRoundness' in st) num(st.cornerRoundness, '$.style.cornerRoundness', { min: 0, max: 1 })
    if ('opacityMode' in st) oneOf(st.opacityMode, '$.style.opacityMode', ['constant', 'fromValue'])
    if ('jitter' in st) num(st.jitter, '$.style.jitter', { min: 0, max: 1 })
    if ('quantizeSteps' in st) num(st.quantizeSteps, '$.style.quantizeSteps', { int: true, min: 0, max: 64 })
  }
  if ('theme' in s && obj(s.theme, '$.theme', THEME_COLORS)) for (const [k, v] of Object.entries(s.theme as O)) if (THEME_COLORS.includes(k as never)) str(v, `$.theme.${k}`, { pattern: COLOR })
  if ('data' in s) dataMap(s.data, '$.data')
  if ('controls' in s && arr(s.controls, '$.controls', { max: SPEC_LIMITS.controls })) s.controls.forEach((c, i) => control(c, `$.controls[${i}]`))
  if ('layers' in s && arr(s.layers, '$.layers', { max: SPEC_LIMITS.layers })) s.layers.forEach((l, i) => layer(l, `$.layers[${i}]`))
  if ('states' in s && isObj(s.states)) {
    const names = Object.keys(s.states)
    if (names.length > SPEC_LIMITS.states) fail('$.states', `has ${names.length} states, more than ${SPEC_LIMITS.states}`)
    for (const k of names) { const p = `$.states.${k}`; if (str(k, p, { pattern: KEY }) && obj((s.states as O)[k], p, ['data'], ['data'])) dataMap(((s.states as O)[k] as O).data, `${p}.data`) }
  } else if ('states' in s) fail('$.states', 'expected an object')
  if ('initial' in s && str(s.initial, '$.initial', { pattern: KEY }) && !(isObj(s.states) && Object.prototype.hasOwnProperty.call(s.states, s.initial as string))) fail('$.initial', `no state named ${show(s.initial)}`)
  if ('transitions' in s && obj(s.transitions, '$.transitions', ['enter', 'change', 'exit'])) {
    const t = s.transitions as O
    if ('enter' in t) transition(t.enter, '$.transitions.enter')
    if ('change' in t && t.change !== false) transition(t.change, '$.transitions.change')
    if ('exit' in t) transition(t.exit, '$.transitions.exit')
  }
  if ('springKeys' in s && arr(s.springKeys, '$.springKeys', { max: 64 })) s.springKeys.forEach((k, i) => {
    if (str(k, `$.springKeys[${i}]`, { pattern: KEY }) && !(isObj(s.data) && Object.prototype.hasOwnProperty.call(s.data, k as string))) fail(`$.springKeys[${i}]`, `no data default for ${show(k)}`)
  })
  for (const k of ['live', 'clock', 'bleed'] as const) if (k in s) bool(s[k], `$.${k}`)
  if ('burst' in s) num(s.burst, '$.burst', { min: 0, max: 60 })
  if ('chrome' in s) oneOf(s.chrome, '$.chrome', ['dots'])
  if ('label' in s) str(s.label, '$.label', { max: SPEC_LIMITS.text })
  if ('media' in s) oneOf(s.media, '$.media', ['camera'])
  return { ok: errors.length === 0, errors }
}
