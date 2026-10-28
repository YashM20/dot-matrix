import type { DotBuffer } from '../buffer/dotBuffer'
import type { DotInstance, JointGeom } from '../types'
import type { PathSink } from './canvasRenderer'

/** The parts of `DotGL` a lazy GL extension draws with (its context, and programs cached and dropped with it). */
export interface GLJoinApi {
  gl: WebGL2RenderingContext
  program(key: string, vs: string, fs: string): { p: WebGLProgram } | null
  loc(p: { p: WebGLProgram }, name: string): WebGLUniformLocation | null
}
/** `common`: use a program and set the frame's shared uniforms (uView, uScale, uAlpha, uPalette); `palette.of`: a colour's index. */
export type GLJoinDraw = (api: GLJoinApi, dots: DotInstance[], common: (p: { p: WebGLProgram }, alpha: number) => void, palette: { of(c: string): number }) => boolean

/**
 * Optional renderer extensions, installed by lazy engine modules (`installSquares()`, src/engine/squares).
 * Absent hooks degrade, never throw: Canvas and SVG draw a join dot as its plain shape, and `DotGL.render`
 * returns false for a frame with join dots (the caller draws it on Canvas) until `gl` has loaded (`glLoad`).
 */
export const shapeExt: {
  /** Append a joined cell's outline (clockwise) to a Canvas path. */
  canvas?: (p: PathSink, x: number, y: number, s: number, mask: number, g: JointGeom) => void
  /** Draw buffer dot `i` when its squares channels say so (joined, or a per-dot roundness); false = a plain dot. */
  bufferDot?: (p: PathSink, buf: DotBuffer, i: number) => boolean
  /** The SVG of a dot list holding joined cells (defs per mask, seam bleed, group opacity). */
  svg?: (dots: DotInstance[], width: number, height: number) => string
  /** Draw a frame's join dots after the classic dots; false = not possible (the frame falls back to Canvas). */
  gl?: { draw: GLJoinDraw }
  /** Fetch the GL hook (its own chunk; set by main-thread code only, src/components/DotCanvas.tsx, so the GLSL never ships in the worker). */
  glLoad?: () => Promise<unknown>
} = {}
