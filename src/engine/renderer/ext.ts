import type { DotInstance, JointGeom } from '../types'
import type { PathSink } from './canvasRenderer'

/** The parts of `DotGL` a lazy GL extension draws with (programs cached and dropped with the context). */
export interface GLJoinApi {
  gl: WebGL2RenderingContext
  program(key: string, vs: string, fs: string): { p: WebGLProgram } | null
  loc(p: { p: WebGLProgram }, name: string): WebGLUniformLocation | null
  /** Use `p` and set the shared uniforms (uView, uScale, uAlpha, uPalette). */
  common(p: { p: WebGLProgram }, alpha: number): void
  /** Palette index of a colour already used in this frame. */
  color(c: string): number
}

/**
 * Optional renderer extensions, installed by lazy engine modules (`installSquares()`, src/engine/squares).
 * Absent hooks degrade, never throw: Canvas and SVG draw a join dot as its plain shape, and `DotGL.render`
 * returns false for a frame with join dots (the caller draws it on Canvas) until `gl` has loaded via `glLoad`.
 */
export const shapeExt: {
  /** Append a joined cell's outline (clockwise) to a Canvas path. */
  canvas?: (p: PathSink, x: number, y: number, s: number, mask: number, g: JointGeom) => void
  /** Path data of a joined cell centred at (0, 0), with SVG's seam bleed. */
  svg?: (s: number, mask: number, g: JointGeom) => string
  /** Draw a frame's join dots after the classic dots; false = not possible (the frame falls back to Canvas). */
  gl?: { draw(api: GLJoinApi, dots: DotInstance[]): boolean }
  /** Load the GL hook (a separate chunk, so its GLSL ships in neither the worker nor the board chunk). */
  glLoad?: () => Promise<unknown>
} = {}
