/**
 * Dot Studio document model (P6-D), React-free so `scripts/studio.ts` can test it in Node.
 *
 * A card = grid + style + layers + data defaults + controls + bindings + states/machine + transitions.
 * Every layer becomes an ordinary engine `Layer` (field + tone, on a lattice or sites) and the whole
 * card is sampled through Field → Grid Sampler → Renderer like any preset. The document is plain JSON:
 * it saves to localStorage / a file as is, and `adapter.ts` maps it to spec v0 now and spec v1 later.
 */
import { contextEnv, IRError, IR_LIMITS, irProgram, type IRProgram } from '../../engine/ir'
import { textAt } from '../../engine/layout'
import type { Control } from '../../engine/context'
import type { DotStyle, Field, GridConfig, Layer, Tone } from '../../engine/types'
import { ease, masks, type EaseName, type MaskName } from '../../engine/motion'
import { SHARE_GRIDS, type SharedProgram } from '../../lib/share'
import { layoutFor, tileStyle, TILE, widgetById, withChrome, type WidgetContext, type WidgetPreset } from '../../widgets'

export const STUDIO_VERSION = 1
export type LayerKind = 'ir' | 'text' | 'sites' | 'preset-layer'
/**
 * How a layer meets the layer below it (in z order). `normal`: its own layer, the sampler's max-value
 * composite (later wins ties). The others fold this layer's field into the one below and draw in the
 * lower layer's tone and lattice: `add` = clamp(a + b), `multiply` = a·b (a mask), `subtract` = a − b
 * (a knockout), `max` = max(a, b). Both fields are read at the lower layer's u/v.
 */
export type Blend = 'normal' | 'add' | 'multiply' | 'subtract' | 'max'
export const BLENDS: Blend[] = ['normal', 'add', 'multiply', 'subtract', 'max']
/** Tone choices; `preset` keeps a reference layer's own tone. */
export type LayerTone = Tone | 'preset'
export const TONES: Tone[] = ['auto', 'value', 'mid', 'idle', 'faint', 'active', 'activeDim']
/** Lattice ladder (MASTER-PLAN §2.2 G3): the only pitches the inspector offers. */
export const LATTICES = [1, 1.3, 1.6, 2, 2.5, 3, 4]
export const SITE_SIZES = [1, 1.3, 1.6, 2, 2.5, 3, 4]

interface LayerBase { id: string; name: string; tone: LayerTone; z: number; blend: Blend; visible: boolean }
export interface IRLayer extends LayerBase { kind: 'ir'; src: string; lattice: number }
export interface TextLayer extends LayerBase {
  kind: 'text'
  params: { text: string; col: number; row: number; align: 'left' | 'center' | 'right'; scale: number; smooth: boolean }
  /** > 1: hero text on its own lattice (`T.big`), else 5×7 card text (`textAt`). */
  lattice: number
}
export interface SitesLayer extends LayerBase {
  kind: 'sites'
  params: { shape: 'ring' | 'line' | 'disc'; cx: number; cy: number; r: number; x1: number; y1: number; spacing: number; start: number; sweep: number }
  /** Field IR read at each site's card u/v (default `1`). */
  src: string
  size: number
}
/** A read-only layer of an existing preset: `withChrome(preset)(ctx)[index]`, live with the card's t and data. */
export interface PresetLayer extends LayerBase { kind: 'preset-layer'; params: { preset: string; index: number } }
export type StudioLayer = IRLayer | TextLayer | SitesLayer | PresetLayer

export interface Motion { mask: MaskName; ease: EaseName; ms: number }
export interface StudioState { name: string; data: Record<string, number> }
/** One edge of the state machine (same shape as the MASTER-PLAN §3.6 TS API). */
export interface MachineEdge { from: string; to: string; on: string; mask: MaskName; ease: EaseName; ms: number }
export type SourceId = 'lfo' | 'clock.sec' | 'clock.min' | 'pointer.x' | 'pointer.y' | 'weather.temp' | 'github.today'
export interface Binding { key: string; kind: 'slider' | 'source'; min: number; max: number; step: number; source?: SourceId }

export interface StudioCard {
  kind: 'dot480.studio'
  v: number
  id: string
  name: string
  grid: GridConfig
  style: DotStyle
  layers: StudioLayer[]
  /** Data defaults (`data.*` the layers read). */
  data: Record<string, number>
  controls: Control[]
  bindings: Binding[]
  states: StudioState[]
  machine: MachineEdge[]
  transitions: { enter: Motion; change: Motion; exit: Motion }
  /** Timeline length and where the change track starts, seconds. */
  timeline: { length: number; changeAt: number }
  /** Set when the card was imported from a preset (its layers are a read-only reference stack). */
  reference?: string
  /** Re-sample every frame (any layer reads `t`, or a reference preset is animated). */
  animated: boolean
}

// ── construction ───────────────────────────────────────────────────────────
let seq = 0
export const newId = (prefix = 'l') => `${prefix}${Date.now().toString(36).slice(-4)}${(seq++).toString(36)}`
const base = (name: string, z: number): LayerBase => ({ id: newId(), name, tone: 'auto', z, blend: 'normal', visible: true })
export const irLayer = (src: string, o: Partial<IRLayer> = {}): IRLayer => ({ ...base('field', 0), kind: 'ir', src, lattice: 1, ...o })
export const textLayer = (text: string, o: Partial<Omit<TextLayer, 'params'>> & { params?: Partial<TextLayer['params']> } = {}): TextLayer => {
  const { params, ...rest } = o
  return { ...base('text', 0), tone: 'value', kind: 'text', lattice: 1, ...rest, params: { text, col: 8, row: 8, align: 'left', scale: 1, smooth: false, ...params } }
}
export const sitesLayer = (o: Partial<Omit<SitesLayer, 'params'>> & { params?: Partial<SitesLayer['params']> } = {}): SitesLayer => {
  const { params, ...rest } = o
  return { ...base('sites', 0), tone: 'idle', kind: 'sites', src: '1', size: 2, ...rest, params: { shape: 'ring', cx: 72, cy: 76, r: 44, x1: 120, y1: 76, spacing: 4.5, start: 0, sweep: Math.PI * 2, ...params } }
}

export const DEFAULT_TRANSITIONS: StudioCard['transitions'] = {
  enter: { mask: 'bayer', ease: 'decelerate', ms: 420 },
  change: { mask: 'diagonal', ease: 'emphasized', ms: 360 },
  exit: { mask: 'bayer', ease: 'accelerate', ms: 220 },
}

export function newCard(name = 'untitled'): StudioCard {
  return {
    kind: 'dot480.studio', v: STUDIO_VERSION, id: newId('c'), name,
    grid: { ...TILE }, style: { ...tileStyle }, layers: [], data: {}, controls: [], bindings: [],
    states: [{ name: 'idle', data: {} }], machine: [], transitions: structuredClone(DEFAULT_TRANSITIONS),
    timeline: { length: 3, changeAt: 1.2 }, animated: true,
  }
}

/** Re-number `z` to the array order (index 0 = bottom). */
export const normalizeZ = (layers: StudioLayer[]): StudioLayer[] => layers.map((l, i) => (l.z === i ? l : { ...l, z: i }))
/** Layers bottom → top: by `z`, ties by array order. */
export const stackOrder = (layers: StudioLayer[]): StudioLayer[] => layers.map((l, i) => [l, i] as const).sort((a, b) => a[0].z - b[0].z || a[1] - b[1]).map(([l]) => l)

// ── imports ────────────────────────────────────────────────────────────────
const pitchOf = (g: GridConfig) => g.pitch ?? 4
/** A preset as a read-only reference stack: one `preset-layer` per layer it draws at t = 0 with its defaults. */
export function importPreset(id: string): StudioCard {
  const p = widgetById(id)
  if (!p) throw new Error(`no preset "${id}"`)
  const layers = withChrome(p)({ t: 0, data: { ...p.defaults } })
  const card = newCard(p.name.toLowerCase())
  card.grid = { ...p.grid, pitch: pitchOf(p.grid) }
  card.style = { ...p.style }
  card.data = { ...p.defaults }
  card.states = [{ name: 'default', data: { ...p.defaults } }]
  card.controls = p.controls ? structuredClone(p.controls) : []
  card.reference = id
  card.animated = !!p.animated
  card.layers = layers.map((l, i): PresetLayer => ({
    id: newId(), name: `${id} #${i}${l.field.text ? ` "${l.field.text}"` : l.sites ? ' sites' : l.lattice ? ` ${l.lattice}×` : ''}`,
    kind: 'preset-layer', params: { preset: id, index: i }, tone: 'preset', z: i, blend: 'normal', visible: true,
  }))
  card.bindings = Object.entries(p.defaults ?? {}).slice(0, 8).map(([key, v]) => ({ key, kind: 'slider', min: Math.min(0, v), max: Math.max(1, v * 2 || 1), step: Number.isInteger(v) && Math.abs(v) > 1 ? 1 : .01 }))
  return card
}

/** A DOTS program (`src/lib/share.ts`) as a one-layer card on its grid, lattice and tone. */
export function importDots(p: SharedProgram): StudioCard {
  const card = newCard(programTitle(p.src))
  card.grid = { ...SHARE_GRIDS[p.grid] }
  card.layers = [irLayer(p.src, { name: 'dots program', tone: p.tone, lattice: p.lattice })]
  card.animated = /\bt\b/.test(p.src)
  return card
}
const programTitle = (src: string) => (/^\s*\/\/\s*([A-Za-z0-9][\w -]{0,23})/.exec(src)?.[1].split(/[:—-]/)[0].trim() || 'dots').toLowerCase()

// ── compile: card → layer function ─────────────────────────────────────────
export interface CompiledCard {
  layers: (ctx: WidgetContext) => Layer[]
  /** IR errors by layer id (that layer draws its last good program, or nothing). */
  errors: Map<string, IRError>
  /** `data.*` keys read by the IR layers, plus the card's data defaults. */
  keys: string[]
  /** Any layer reads t. */
  usesT: boolean
}
export type ProgramCache = Map<string, IRProgram>
const ONE: Field = () => 1

function compileIR(id: string, src: string, errors: Map<string, IRError>, good: ProgramCache): IRProgram | undefined {
  try {
    const p = irProgram(src, { mode: 'function' })
    good.set(id, p)
    return p
  } catch (e) {
    errors.set(id, e instanceof IRError ? e : new IRError(String((e as Error)?.message ?? e)))
    return good.get(id)
  }
}

function blendFields(a: Field, b: Field, mode: Blend): Field {
  const op = mode === 'add' ? (x: number, y: number) => Math.min(1, x + y)
    : mode === 'multiply' ? (x: number, y: number) => x * y
      : mode === 'subtract' ? (x: number, y: number) => Math.max(0, x - y)
        : (x: number, y: number) => Math.max(x, y)
  const f: Field = (u, v) => op(a(u, v), b(u, v))
  // multiply / subtract can only shrink the lower layer; add / max can grow it (no bounds then)
  if ((mode === 'multiply' || mode === 'subtract') && a.bounds) f.bounds = a.bounds
  return f
}

/** Compile a card once per document change; the returned `layers(ctx)` is cheap per frame. */
export function compileCard(card: StudioCard, good: ProgramCache = new Map()): CompiledCard {
  const errors = new Map<string, IRError>(), keys = new Set(Object.keys(card.data))
  let usesT = false
  const L = layoutFor(card.grid)
  type Builder = (ctx: WidgetContext, presetFrames: Map<string, Layer[]>) => Layer | undefined
  const builders: { layer: StudioLayer; build: Builder }[] = []
  for (const l of stackOrder(card.layers)) {
    if (!l.visible) continue
    const tone = (t: Tone | undefined): Tone | undefined => (l.tone === 'preset' ? t : l.tone)
    if (l.kind === 'ir' || l.kind === 'sites') {
      const prog = compileIR(l.id, l.src || '1', errors, good)
      if (prog) { prog.info.data.forEach(k => keys.add(k)); usesT ||= prog.info.t }
      if (l.kind === 'ir') {
        const lattice = l.lattice > 1 ? l.lattice : undefined
        builders.push({ layer: l, build: ctx => prog && { field: prog(contextEnv(ctx, card.grid)), tone: tone('auto'), ...(lattice && { lattice }) } })
      } else {
        const { shape, cx, cy, r, x1, y1, spacing, start, sweep } = l.params
        const geo = shape === 'line' ? L.dotLine(cx, cy, x1, y1, { spacing, size: l.size }) : shape === 'disc' ? L.dotDisc(cx, cy, r, { spacing, size: l.size }) : L.dotRing(cx, cy, r, { spacing, size: l.size, start, sweep })
        const isOne = (l.src || '1').trim() === '1'
        builders.push({ layer: l, build: ctx => prog && { ...geo, field: isOne ? ONE : prog(contextEnv(ctx, card.grid)), tone: tone('idle') } })
      }
    } else if (l.kind === 'text') {
      const { text, col, row, align, scale, smooth } = l.params
      const s = text.slice(0, 64)
      const built: Layer = l.lattice > 1
        ? { ...L.big(s, col, row, { lattice: l.lattice, smooth, align, scale }), tone: tone('value') }
        : { field: textAt(card.grid, s, col, row, { align, scale, smooth }), tone: tone('value') }
      builders.push({ layer: l, build: () => built })
    } else {
      const p = widgetById(l.params.preset)
      if (!p) { errors.set(l.id, new IRError(`no preset "${l.params.preset}"`)); continue }
      usesT ||= !!p.animated
      const lf = withChrome(p)
      builders.push({
        layer: l, build: (ctx, frames) => {
          let ls = frames.get(p.id)
          if (!ls) frames.set(p.id, (ls = lf(ctx)))
          const src = ls[l.params.index]
          return src && { ...src, tone: tone(src.tone) }
        },
      })
    }
  }
  const layers = (ctx: WidgetContext): Layer[] => {
    const out: Layer[] = [], frames = new Map<string, Layer[]>()
    for (const { layer, build } of builders) {
      const x = build(ctx, frames)
      if (!x) continue
      const below = out[out.length - 1]
      if (layer.blend !== 'normal' && below) out[out.length - 1] = { ...below, field: blendFields(below.field, x.field, layer.blend) }
      else out.push(x)
    }
    return out
  }
  return { layers, errors, keys: [...keys].sort(), usesT }
}

/** The card as an ordinary preset (exports, `toDevice`, the fidelity gates, the bar sheet). */
export function cardPreset(card: StudioCard, compiled: CompiledCard = compileCard(card)): WidgetPreset {
  return {
    id: card.reference ? `${card.reference}` : `studio-${card.id}`, name: card.name, group: 'composite',
    grid: { ...card.grid, pitch: pitchOf(card.grid) }, style: card.style, defaults: { ...card.data },
    controls: card.controls.length ? card.controls : undefined, animated: card.animated || compiled.usesT, layers: compiled.layers,
  }
}

// ── validation + JSON ──────────────────────────────────────────────────────
const MAX_LAYERS = 24
const num = (x: unknown, lo: number, hi: number, what: string) => { if (typeof x !== 'number' || !Number.isFinite(x) || x < lo || x > hi) throw new Error(`studio card: ${what} must be a number in ${lo}..${hi}`); return x }
const str = (x: unknown, max: number, what: string) => { if (typeof x !== 'string' || x.length > max) throw new Error(`studio card: ${what} must be a string of ≤ ${max} chars`); return x }
const oneOf = <T extends string>(x: unknown, list: readonly T[], what: string): T => { if (!list.includes(x as T)) throw new Error(`studio card: ${what} must be one of ${list.join(', ')}`); return x as T }
const dataOf = (x: unknown, what: string) => {
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw new Error(`studio card: ${what} must be an object of numbers`)
  for (const [k, v] of Object.entries(x)) { str(k, 32, `${what} key`); num(v, -1e9, 1e9, `${what}.${k}`) }
  return x as Record<string, number>
}
const MASKS = Object.keys(masks) as MaskName[], EASES = Object.keys(ease) as EaseName[]
const motionOf = (m: unknown, what: string): Motion => {
  const o = m as Motion
  if (!o || typeof o !== 'object') throw new Error(`studio card: ${what} missing`)
  oneOf(o.mask, MASKS, `${what}.mask`); oneOf(o.ease, EASES, `${what}.ease`); num(o.ms, 0, 10000, `${what}.ms`)
  return o
}

/** Check a parsed document; throws an `Error` naming the first bad field. Returns the same object. */
export function validateCard(x: unknown): StudioCard {
  const c = x as StudioCard
  if (!c || typeof c !== 'object') throw new Error('studio card: expected an object')
  if (c.kind !== 'dot480.studio') throw new Error('studio card: not a Dot Studio document (kind)')
  num(c.v, 1, STUDIO_VERSION, 'v')
  str(c.id, 64, 'id'); str(c.name, 64, 'name')
  if (!c.grid) throw new Error('studio card: grid missing')
  num(c.grid.cols, 1, 512, 'grid.cols'); num(c.grid.rows, 1, 512, 'grid.rows')
  if (c.grid.pitch !== undefined) num(c.grid.pitch, .25, 32, 'grid.pitch')
  if (!c.style || typeof c.style !== 'object') throw new Error('studio card: style missing')
  num(c.style.sizeMin, 0, 64, 'style.sizeMin'); num(c.style.sizeMax, 0, 64, 'style.sizeMax')
  if (!Array.isArray(c.layers) || c.layers.length > MAX_LAYERS) throw new Error(`studio card: layers must be an array of ≤ ${MAX_LAYERS}`)
  const ids = new Set<string>()
  c.layers.forEach((l, i) => {
    const w = `layers[${i}]`
    str(l.id, 64, `${w}.id`); if (ids.has(l.id)) throw new Error(`studio card: duplicate layer id ${l.id}`); ids.add(l.id)
    str(l.name, 64, `${w}.name`)
    oneOf(l.kind, ['ir', 'text', 'sites', 'preset-layer'] as const, `${w}.kind`)
    oneOf(l.tone, [...TONES, 'preset'] as LayerTone[], `${w}.tone`)
    oneOf(l.blend, BLENDS, `${w}.blend`)
    num(l.z, -1e6, 1e6, `${w}.z`)
    if (typeof l.visible !== 'boolean') throw new Error(`studio card: ${w}.visible must be a boolean`)
    if (l.kind === 'ir') { str(l.src, IR_LIMITS.source, `${w}.src`); num(l.lattice, 1, 16, `${w}.lattice`) }
    if (l.kind === 'sites') { str(l.src, IR_LIMITS.source, `${w}.src`); num(l.size, .25, 16, `${w}.size`); oneOf(l.params?.shape, ['ring', 'line', 'disc'] as const, `${w}.params.shape`) }
    if (l.kind === 'text') { str(l.params?.text, 64, `${w}.params.text`); num(l.params.col, -512, 512, `${w}.params.col`); num(l.params.row, -512, 512, `${w}.params.row`); num(l.lattice, 1, 16, `${w}.lattice`) }
    if (l.kind === 'preset-layer') { str(l.params?.preset, 64, `${w}.params.preset`); num(l.params.index, 0, 256, `${w}.params.index`) }
  })
  dataOf(c.data, 'data')
  if (!Array.isArray(c.controls)) throw new Error('studio card: controls must be an array')
  if (!Array.isArray(c.bindings)) throw new Error('studio card: bindings must be an array')
  if (!Array.isArray(c.states) || !c.states.length) throw new Error('studio card: needs at least one state')
  c.states.forEach((s, i) => { str(s.name, 32, `states[${i}].name`); dataOf(s.data, `states[${i}].data`) })
  if (!Array.isArray(c.machine)) throw new Error('studio card: machine must be an array')
  c.machine.forEach((e, i) => { str(e.from, 32, `machine[${i}].from`); str(e.to, 32, `machine[${i}].to`); motionOf(e, `machine[${i}]`) })
  if (!c.transitions) throw new Error('studio card: transitions missing')
  motionOf(c.transitions.enter, 'transitions.enter'); motionOf(c.transitions.change, 'transitions.change'); motionOf(c.transitions.exit, 'transitions.exit')
  num(c.timeline?.length, .5, 60, 'timeline.length'); num(c.timeline.changeAt, 0, 60, 'timeline.changeAt')
  if (c.reference !== undefined) str(c.reference, 64, 'reference')
  return c
}
export const cardToJSON = (c: StudioCard) => JSON.stringify(c, null, 2)
export const cardFromJSON = (json: string): StudioCard => {
  if (json.length > 512 * 1024) throw new Error('studio card: file too large')
  let x: unknown
  try { x = JSON.parse(json) } catch (e) { throw new Error(`studio card: not JSON (${(e as Error).message})`) }
  return validateCard(x)
}

// ── undo / redo ────────────────────────────────────────────────────────────
export interface History { past: StudioCard[]; present: StudioCard; future: StudioCard[]; tag?: string; at: number }
export const HISTORY_LIMIT = 100
/** Edits with the same `tag` within this many ms merge into one undo step (typing, dragging a slider). */
export const COALESCE_MS = 700
export const historyOf = (present: StudioCard): History => ({ past: [], present, future: [], at: 0 })
export function commit(h: History, next: StudioCard, tag?: string, now = Date.now()): History {
  if (next === h.present) return h
  if (tag && tag === h.tag && now - h.at < COALESCE_MS && h.past.length) return { ...h, present: next, future: [], at: now }
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [], tag, at: now }
}
export const undo = (h: History): History => h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], at: 0 } : h
export const redo = (h: History): History => h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), at: 0 } : h

// ── localStorage ───────────────────────────────────────────────────────────
export const STORAGE_KEY = 'dot480.studio.v1'
export const LIBRARY_KEY = 'dot480.studio.library'
type KV = Pick<Storage, 'getItem' | 'setItem'>
const store = (): KV | undefined => { try { return globalThis.localStorage } catch { return undefined } }
export function saveLocal(c: StudioCard, kv = store()) { kv?.setItem(STORAGE_KEY, JSON.stringify(c)) }
export function loadLocal(kv = store()): StudioCard | undefined {
  const s = kv?.getItem(STORAGE_KEY)
  if (!s) return undefined
  try { return cardFromJSON(s) } catch { return undefined }
}
/** Named saves (up to 24, newest first). */
export function librarySave(c: StudioCard, kv = store()): StudioCard[] {
  const list = libraryList(kv).filter(x => x.id !== c.id)
  const next = [c, ...list].slice(0, 24)
  kv?.setItem(LIBRARY_KEY, JSON.stringify(next))
  return next
}
export function libraryList(kv = store()): StudioCard[] {
  try {
    const arr = JSON.parse(kv?.getItem(LIBRARY_KEY) ?? '[]') as unknown[]
    return Array.isArray(arr) ? arr.flatMap(x => { try { return [validateCard(x)] } catch { return [] } }) : []
  } catch { return [] }
}
