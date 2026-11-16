import type { DotInstance, DotStyle, GridConfig, JointGeom, Layer, ThemeTokens } from '../types'
import { reserve, type DotBuffer } from '../buffer/dotBuffer'
import { samplerExt } from './ext'

/**
 * Frame repeat: a card whose frame did not change hands the sampler the same `Layer[]` it returned last frame, and the
 * sampler draws the dots it kept from that array instead of sampling every cell again (a clock card at rest, a knob
 * nobody touches). Speed only: the dots are the ones a fresh sample would give.
 *
 * The promise is the card's. A marked array (`frameMemo`, `stableLayers`) must give the same values from every field
 * for as long as it is handed out again; a changed frame gets a new array. `forgetFrames()` drops every kept frame
 * (the bench's cold mount, a theme swap is already covered by the key).
 */
const marked = new WeakSet<Layer[]>()
let generation = 0

/** Mark `layers` as a frame that repeats while the same array comes back (see above). */
export function stableLayers(layers: Layer[]): Layer[] { marked.add(layers); return layers }
export const isStable = (layers: Layer[]) => marked.has(layers)
/** Drop every kept frame: the next sample of a marked array starts cold (frame memos rebuild too). */
export function forgetFrames(): void { generation++ }

/**
 * One card's frame memo: the same marked array while `key` holds, else `make()` marked. The key must name every input
 * the layers read (data, light, pointer state, the minute); a card's scratch rasters may be rewritten only by `make`.
 */
export function frameMemo(): (key: string, make: () => Layer[]) => Layer[] {
  let last: Layer[] | undefined, lastKey = '', at = -1
  return (key, make) => {
    if (!last || key !== lastKey || at !== generation) { last = stableLayers(make()); lastKey = key; at = generation }
    return last
  }
}

const sameStyle = (a: DotStyle, b: DotStyle) => {
  if (a === b) return true
  const ka = Object.keys(a) as (keyof DotStyle)[]
  if (ka.length !== Object.keys(b).length) return false
  for (const k of ka) if (a[k] !== b[k]) return false
  return true
}
/** A kept buffer frame; a squares frame also keeps its channels and joint table (`ext`). */
interface KeptBuf {
  n: number; x: Float32Array; y: Float32Array; r: Float32Array; opacity: Float32Array; tone: Uint8Array
  ext?: { aspect: Float32Array; join: Uint16Array; form: Uint8Array; joints: JointGeom[] | undefined }
}
interface Kept { at: number; grid: GridConfig; style: DotStyle; theme: ThemeTokens; dots?: DotInstance[]; buf?: KeptBuf }
const kept = new WeakMap<Layer[], Kept>()
const keptFor = (layers: Layer[], grid: GridConfig, style: DotStyle, theme: ThemeTokens): Kept | undefined => {
  const k = marked.has(layers) ? kept.get(layers) : undefined
  return k && k.at === generation && k.theme === theme && k.grid.cols === grid.cols && k.grid.rows === grid.rows && k.grid.pitch === grid.pitch && sameStyle(k.style, style) ? k : undefined
}
const entry = (layers: Layer[], grid: GridConfig, style: DotStyle, theme: ThemeTokens): Kept => {
  let k = kept.get(layers)
  if (!k || k.at !== generation || k.theme !== theme || k.grid.cols !== grid.cols || k.grid.rows !== grid.rows || k.grid.pitch !== grid.pitch || !sameStyle(k.style, style)) kept.set(layers, (k = { at: generation, grid: { ...grid }, style: { ...style }, theme }))
  return k
}

/** The kept `DotInstance[]` of a marked frame (a fresh array over the same dots), or undefined. */
export function repeatDots(layers: Layer[], grid: GridConfig, style: DotStyle, theme: ThemeTokens): DotInstance[] | undefined {
  return keptFor(layers, grid, style, theme)?.dots?.slice()
}
export function keepDots(layers: Layer[], grid: GridConfig, style: DotStyle, theme: ThemeTokens, dots: DotInstance[]): void {
  if (marked.has(layers)) entry(layers, grid, style, theme).dots = dots.slice()
}

/**
 * Copy a marked frame's kept buffer into `buf` (grown to fit) and say so; false when there is none. `buf`'s squares
 * channels arrive reset to plain (`sampleLayersInto`); a squares frame writes its own back, with its joint table
 * (#340: `sq-hat` holds its floor for 3 s of every 12).
 */
export function repeatInto(layers: Layer[], grid: GridConfig, style: DotStyle, theme: ThemeTokens, buf: DotBuffer): boolean {
  const k = keptFor(layers, grid, style, theme)?.buf
  if (!k) return false
  reserve(buf, k.n)
  if (k.ext) {
    // a buffer without squares channels gets a plain store first (the squares hooks are installed: they kept this frame)
    if (!buf.join) samplerExt.grow?.(buf, 0)
    if (!buf.join) return false
    buf.aspect!.set(k.ext.aspect); buf.join.set(k.ext.join); buf.form!.set(k.ext.form); buf.joints = k.ext.joints
  }
  buf.x.set(k.x); buf.y.set(k.y); buf.r.set(k.r); buf.opacity.set(k.opacity); buf.tone.set(k.tone); buf.n = k.n
  return true
}
export function keepInto(layers: Layer[], grid: GridConfig, style: DotStyle, theme: ThemeTokens, buf: DotBuffer): void {
  if (!marked.has(layers)) return
  const n = buf.n
  entry(layers, grid, style, theme).buf = {
    n, x: buf.x.slice(0, n), y: buf.y.slice(0, n), r: buf.r.slice(0, n), opacity: buf.opacity.slice(0, n), tone: buf.tone.slice(0, n),
    ...(buf.join ? { ext: { aspect: buf.aspect!.slice(0, n), join: buf.join.slice(0, n), form: buf.form!.slice(0, n), joints: buf.joints?.slice() } } : {}),
  }
}
