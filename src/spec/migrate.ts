/**
 * `migrateSpec(json)` — bring an older card document up to spec v1 (unvalidated; `loadSpec` validates).
 * v0 is the P3 draft card JSON: `{ spec: 0, id, title, cols, rows, pitch?, style?, defaults?, layers:
 * [{ type: 'ir', program, rect?, at?, lattice?, tone? } | { type: 'text', value, x, y, align?, lattice?, tone? }
 * | { type: 'dots', points, size?, tone? }] }` — flat grid, `title` for `name`, lattice text anchored in card cells.
 */
import { baseStyle } from '../widgets/types'
import { SpecError, type CardSpec, type LayerSpec } from './types'

type O = Record<string, unknown>
const isObj = (x: unknown): x is O => typeof x === 'object' && x !== null && !Array.isArray(x)

/** Spec version of a document: `version`, else the v0 `spec` marker; undefined if it is neither. */
export function specVersion(json: unknown): number | undefined {
  if (!isObj(json)) return undefined
  if (typeof json.version === 'number') return json.version
  return json.spec === 0 ? 0 : undefined
}

function layerV0(l: unknown, i: number): LayerSpec {
  if (!isObj(l)) throw new SpecError([{ path: `$.layers[${i}]`, message: 'expected an object' }])
  const tone = l.tone !== undefined ? { tone: l.tone } : {}, lattice = typeof l.lattice === 'number' && l.lattice !== 1 ? l.lattice : undefined
  const align = l.align !== undefined ? { align: l.align } : {}
  switch (l.type) {
    case 'ir': return { kind: 'ir', src: l.program, ...tone, ...(lattice !== undefined && { lattice }), ...(l.at !== undefined && { origin: l.at }), ...(l.rect !== undefined && { bounds: l.rect }) } as LayerSpec
    case 'text': return (lattice !== undefined
      ? { kind: 'text', text: l.value, at: [0, 0], lattice, origin: [l.x, l.y], ...tone, ...align }
      : { kind: 'text', text: l.value, at: [l.x, l.y], ...tone, ...align }) as LayerSpec
    case 'dots': return { kind: 'sites', points: l.points, ...(l.size !== undefined && { size: l.size }), ...tone } as LayerSpec
    default: throw new SpecError([{ path: `$.layers[${i}].type`, message: `unknown v0 layer type ${JSON.stringify(l.type)}` }])
  }
}

export function migrateSpec(input: unknown): CardSpec {
  const json = typeof input === 'string' ? JSON.parse(input) as unknown : input
  const v = specVersion(json)
  if (v === 1) return json as CardSpec
  if (v !== 0 || !isObj(json)) throw new SpecError([{ path: '$.version', message: `unknown spec version ${JSON.stringify(isObj(json) ? json.version ?? json.spec : json)}` }])
  const { shape, sizeMin, sizeMax, cornerRoundness, opacityMode, quantizeSteps } = baseStyle
  const out: CardSpec = {
    version: 1, id: json.id as string, name: (json.title ?? json.id) as string,
    grid: { cols: json.cols as number, rows: json.rows as number, ...(json.pitch !== undefined && { pitch: json.pitch as number }) },
    style: (isObj(json.style) ? json.style : { shape, sizeMin, sizeMax, cornerRoundness, opacityMode, quantizeSteps }) as unknown as CardSpec['style'],
    layers: Array.isArray(json.layers) ? json.layers.map(layerV0) : [],
  }
  if (isObj(json.defaults)) out.data = json.defaults as Record<string, number>
  return out
}
