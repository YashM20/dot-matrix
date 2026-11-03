/**
 * The scenes board's shared kit: the TILE card shell, the credit lines, the footer, and `scenePlate`, which renders
 * a marched scene (src/engine/sdf3d/render.ts) once a frame onto a lattice of big dots and maps each dot's lit luma
 * to a quantized dot size and a grey tone, with the card's one accent material in red.
 */
import { latticeGrid } from '../../engine/sampler/gridSampler'
import { lookAt, type Camera, type V3 } from '../../engine/sdf3d/march'
import { renderScene, SKY, SUN, type Frame, type Scene } from '../../engine/sdf3d/render'
import type { Layer, Tone } from '../../engine/types'
import { TILE, layer, layoutFor, tileStyle, type WidgetCredit } from '../types'

export const T = layoutFor(TILE)
/** CPU at card pitch, 12 frames a second: a scene is a few hundred thousand distance reads a frame. */
export const tile = { group: 'composite', chrome: 'dots', grid: TILE, style: tileStyle, animated: true, fps: 12 } as const

/** Body rows: below the label (0–7), above the footer text (136–142). */
export const BODY_TOP = 11, BODY_BOTTOM = 131, FOOT = 136

const iq = (title: string, slug: string): WidgetCredit => ({ by: ['Inigo Quilez'], title, source: `https://iquilezles.org/articles/${slug}/`, note: 'technique' })
export const CREDIT_SDF = iq('3D distance functions', 'distfunctions')
export const CREDIT_SHADOW = iq('Soft shadows', 'rmshadows')
export const CREDIT_FOG = iq('Better fog', 'fog')
export const CREDIT_LIGHT = iq('Outdoors lighting', 'outdoorslighting')

/** Material ids: the objects, the card's one red element, the floor and walls (darker, so the objects stand out). */
export const STONE = 0, ACCENT = 1, FLOOR = 2
/** Albedo per material: the article's 0.2 or so, a little brighter on the objects, darker on the floor. */
export const albedo = (id: number) => (id === FLOOR ? .09 : id === ACCENT ? .3 : .27)
/** The floor plane y = 0, as `Scene.planes` takes it. */
export const GROUND: [number, number, number, number] = [0, 1, 0, 0]

/** The lattice a plate of `K`-cell dots covers between card rows `top` and `bottom`. */
export function plateGeom(K: number, top = BODY_TOP, bottom = BODY_BOTTOM) {
  const cols = Math.floor(TILE.cols / K), ox = (TILE.cols - cols * K) / 2, oy = top
  const { rows: all } = latticeGrid(TILE, K, [ox, oy])
  return { K, cols, rows: Math.min(all, Math.floor((bottom + .5 - oy) / K + .5)), all, ox, oy }
}

/** A camera for a plate of `rows` dots: eye, target, focal length. */
export const camera = (eye: V3, target: V3, fl: number, rows: number): Camera => lookAt(eye, target, fl, rows)

/** Dot value to grey tone: the bigger a dot, the whiter. */
export const greyOf = (v: number): Tone => (v > .72 ? 'value' : v > .46 ? 'idle' : v > .24 ? 'mid' : 'faint')

export interface Ink { v: number; tone: Tone | undefined }
/**
 * The default dot for frame dot `k`: luma (after gamma) stretched from `black` up to `white` as the dot's size,
 * grey by size, the accent material and the sun's disc in red. Sky draws only where the fog's glow lifts it over `skyCut`.
 */
export function shade(f: Frame, k: number, ink: Ink, black = .1, white = .72, skyCut = .3): void {
  const l = f.lum[k], m = f.mat[k], v = Math.min(1, Math.max(0, (l - black) / (white - black)))
  if (m === SUN) { ink.v = 1; ink.tone = 'active'; return }
  if (m === SKY) { if (v > skyCut) { ink.v = v; ink.tone = greyOf(v) } return }
  // floors and walls (darker by albedo) may go dark (no dot); a near object starts at a quarter dot, so its outline
  // survives its own shadow and its shaded side still reads against the floor. The lift fades out by 12 units, so
  // far objects melt into the fog the way the sky does
  const lift = m === FLOOR ? 0 : .25 * Math.max(0, 1 - f.t[k] / 12), d = m === FLOOR ? v * .9 : lift + (1 - lift) * v
  ink.v = d
  ink.tone = m === ACCENT ? 'active' : greyOf(d)
}

/**
 * A plate of lattice-`K` dots showing `scene(rows)` (built per frame, for a picture `rows` dots tall), rendered once
 * on first sample. `paint` may override the default `shade` per dot (index k, row-major, frame `f`).
 */
export function scenePlate(K: number, scene: (rows: number) => Scene, paint: (f: Frame, k: number, ink: Ink) => void = shade): { layer: Layer; frame: () => Frame } {
  const { cols, rows, all, ox, oy } = plateGeom(K)
  let val: Float32Array | undefined, tone: (Tone | undefined)[] = [], frame: Frame | undefined
  const bake = () => {
    if (val) return
    frame = renderScene(scene(rows), cols, rows)
    val = new Float32Array(cols * all); tone = new Array(cols * all)
    const ink: Ink = { v: 0, tone: undefined }
    for (let k = 0; k < cols * rows; k++) { ink.v = 0; ink.tone = undefined; paint(frame, k, ink); val[k] = ink.v; tone[k] = ink.tone }
  }
  const at = (u: number, v: number) => Math.round(v * (all - 1)) * cols + Math.round(u * (cols - 1))
  return {
    layer: { field: (u, v) => { bake(); return val![at(u, v)] ?? 0 }, toneOf: (_, u, v) => { bake(); return tone[at(u, v)] }, lattice: K, origin: [ox, oy] },
    frame: () => { bake(); return frame! },
  }
}

/** Footer: a faint line of text left, one right (card row FOOT). */
export const footer = (left: string, right: string): Layer[] => [
  layer(T.text(left, 0, FOOT), 'idle'),
  layer(T.text(right, 143, FOOT, { align: 'right' }), 'faint'),
]
/** Caption tier (0.72 lattice), faint, top-right. */
export const caption = (s: string): Layer => layer(T.big(s, 143, 1, { lattice: .72, align: 'right' }), 'faint')

export const pad = (n: number, w: number) => String(Math.max(0, Math.floor(n))).padStart(w, '0').slice(-w)
/** Seconds → a looped phase in [0, 1). */
export const phase = (t: number, period: number) => { const p = (t % period) / period; return p < 0 ? p + 1 : p }
