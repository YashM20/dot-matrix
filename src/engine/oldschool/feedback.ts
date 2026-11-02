/**
 * The feedback effect from Inigo Quilez's "Feedback effect" article (a camera filming its own TV, as a 1990s demo
 * effect): each frame draws the previous frame's texture rotated and scaled, darkened by a fade, and copies the
 * result back into the texture's centre, leaving a border that is never overwritten. Whatever sits in that border
 * is repeated inward as a fading spiral of copies.
 *
 * The texture is a `Sim` (src/engine/sim): one fixed-dt step is one frame of the article's loop, the starting
 * texture is known, and checkpoints plus an optional loop make any t a pure function (replays give the same bits).
 * Rotation and scale come from `dmath` trig and bilinear reads use floor, so the steps are bit-identical in every
 * JS engine. Pure TS, framework-free; import by path (not in the engine barrel).
 *
 * Texture layout: `size × size` floats, row-major, row 0 at the bottom as in OpenGL; texture coordinates
 * (s, t) ∈ [0, 1)² wrap (the GL default, REPEAT).
 */
import { dcos, dsin } from '../noise/dmath'
import { createSim, simStep, simView, type Sim } from '../sim/sim'
import type { Field } from '../types'

export interface FeedbackSpec {
  /** Texture side in texels (the article uses 512). */
  size: number
  /** Texels on each side the copy never writes (the article: 64 of 512). */
  border: number
  /** The `glColor3f` modulation that darkens each copy (the article: .75). */
  fade?: number
  /** Seconds per frame of the loop. */
  dt: number
  /** Quad rotation at time t (the article: 0.4t). */
  spin?: (t: number) => number
  /** Quad scale at time t (the article: 0.8 + 0.3·sin 0.2t). */
  zoom?: (t: number) => number
  /** Reads outside the texture (default 'repeat', the article's GL default; 'clear' keeps the copies from tiling). */
  wrap?: FeedbackWrap
  /** Fill the starting texture (zeroed when called); the border keeps it unless `source` draws over it. */
  init: (tex: Float32Array, size: number) => void
  /** Optional: draw into the texture after each frame's copy (a moving source in the border). `n` is the step index. */
  source?: (tex: Float32Array, size: number, n: number) => void
  lead?: number
  period?: number
  every?: number
  maxSteps?: number
}

// after Inigo Quilez, https://iquilezles.org/articles/feedbackfx/ (MIT)
/** The article's quad rotation: 0.4t. */
export const feedbackSpin = (t: number) => .4 * t
// after Inigo Quilez, https://iquilezles.org/articles/feedbackfx/ (MIT)
/** The article's quad scale: 0.8 + 0.3·sin(0.2t). */
export const feedbackZoom = (t: number) => .8 + .3 * dsin(.2 * t)

// after Inigo Quilez, https://iquilezles.org/articles/feedbackfx/ (MIT)
/**
 * `renderQuad`'s texture coordinate for screen point (x, y) ∈ [−1, 1]² (y up): the corners (−1, 1), (−1, −1), (1, −1)
 * read 0.5 + s·(cos(a + φ), sin(a + φ)) for φ = 0, π/2, π. The article's fourth corner lists φ = 2.3562 (3π/4); the
 * rotation the other three describe puts it at 3π/2, which this affine map does.
 */
export function feedbackQuad(x: number, y: number, a: number, s: number, out: [number, number]): [number, number] {
  const m = quadMatrix(a, s)
  out[0] = .5 + x * m[0] + y * m[1]; out[1] = .5 + x * m[2] + y * m[3]
  return out
}
// after Inigo Quilez, https://iquilezles.org/articles/feedbackfx/ (MIT)
/**
 * The quad's linear part, row-major [xx, xy, yx, yy]: texture = 0.5 + M·(x, y). Its columns are −s(c0 + c1)/2 and
 * s(c0 − c1)/2, with c0 = (cos a, sin a), c1 = (−sin a, cos a) the first two corners. Compute once per frame.
 */
export function quadMatrix(a: number, s: number): [number, number, number, number] {
  const c = dcos(a), n = dsin(a), h = s * .5
  return [-(c - n) * h, (c + n) * h, -(n + c) * h, (n - c) * h]
}

/** How reads outside [0, 1)² behave: 'repeat' tiles the texture (the GL default the article relies on), 'clear' reads 0. */
export type FeedbackWrap = 'repeat' | 'clear'
/** Bilinear read of a size × size texture at (s, t) ∈ ℝ², texel centres at (i + .5)/size. */
export function sampleTexture(tex: Float32Array, size: number, s: number, t: number, wrap: FeedbackWrap = 'repeat'): number {
  const x = s * size - .5, y = t * size - .5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0
  if (wrap === 'clear') {
    if (x0 < -1 || y0 < -1 || x0 >= size || y0 >= size) return 0
    const inX0 = x0 >= 0, inX1 = x0 + 1 < size, r0 = y0 >= 0 ? y0 * size : -1, r1 = y0 + 1 < size ? (y0 + 1) * size : -1
    const a = r0 >= 0 && inX0 ? tex[r0 + x0] : 0, b = r0 >= 0 && inX1 ? tex[r0 + x0 + 1] : 0
    const c = r1 >= 0 && inX0 ? tex[r1 + x0] : 0, d = r1 >= 0 && inX1 ? tex[r1 + x0 + 1] : 0
    const ab = a + (b - a) * fx, cd = c + (d - c) * fx
    return ab + (cd - ab) * fy
  }
  const i0 = ((x0 % size) + size) % size, j0 = ((y0 % size) + size) % size
  const i1 = i0 + 1 === size ? 0 : i0 + 1, j1 = j0 + 1 === size ? 0 : j0 + 1
  const a = tex[j0 * size + i0], b = tex[j0 * size + i1], c = tex[j1 * size + i0], d = tex[j1 * size + i1]
  const ab = a + (b - a) * fx, cd = c + (d - c) * fx
  return ab + (cd - ab) * fy
}

// after Inigo Quilez, https://iquilezles.org/articles/feedbackfx/ (MIT)
/**
 * One frame of `renderFeedBackEffect` into the texture: render the quad of `src` at time t (rotation a, scale s, ×fade)
 * into a size × size frame, then `copyTexture`: the frame's (size − 2·border)² lower-left block lands at
 * (border, border) of `dst`. Everything else in `dst` keeps `src`.
 */
export function feedbackFrame(src: Float32Array, dst: Float32Array, size: number, border: number, a: number, s: number, fade: number, wrap: FeedbackWrap = 'repeat'): void {
  dst.set(src)
  const inner = size - 2 * border, k = 2 / size, m = quadMatrix(a, s)
  for (let j = 0; j < inner; j++) {
    const y = -1 + (j + .5) * k
    for (let i = 0; i < inner; i++) {
      const x = -1 + (i + .5) * k
      dst[(j + border) * size + i + border] = fade * sampleTexture(src, size, .5 + x * m[0] + y * m[1], .5 + x * m[2] + y * m[3], wrap)
    }
  }
}

/** The texture as a fixed-dt `Sim`: step n renders the frame at t = n·dt. */
export function feedbackSim(spec: FeedbackSpec): Sim {
  const { size, border, fade = .75, dt, spin = feedbackSpin, zoom = feedbackZoom, source, wrap = 'repeat' } = spec
  return createSim({
    w: size, h: size, dt, every: spec.every ?? 30, lead: spec.lead, period: spec.period, maxSteps: spec.maxSteps,
    init: g => spec.init(g, size),
    step: (src, dst, _w, _h, n) => {
      const t = n * dt
      feedbackFrame(src, dst, size, border, spin(t), zoom(t), fade, wrap)
      source?.(dst, size, n + 1)
    },
  })
}

// after Inigo Quilez, https://iquilezles.org/articles/feedbackfx/ (MIT)
/**
 * The texture `tex` shown at full screen with the quad at (a, s), as a Field over u, v ∈ [0, 1] (v down): the
 * article's final `renderQuad` with GL_REPLACE (no fade).
 */
export function feedbackScreen(tex: Float32Array, size: number, a: number, s: number, wrap: FeedbackWrap = 'repeat'): Field {
  const m = quadMatrix(a, s)
  return (u, v) => { const x = 2 * u - 1, y = 1 - 2 * v; return sampleTexture(tex, size, .5 + x * m[0] + y * m[1], .5 + x * m[2] + y * m[3], wrap) }
}

/** The effect at time t: the sim's texture at t, shown through the quad at t. */
export function feedbackField(sim: Sim, spec: Pick<FeedbackSpec, 'spin' | 'zoom' | 'wrap'>, t: number): Field {
  // the quad shown is the one of the step t lands on (folded into the loop), so it matches the frame that drew it
  const tex = simView(sim, t), tt = simStep(sim, t) * sim.dt, { spin = feedbackSpin, zoom = feedbackZoom } = spec
  return feedbackScreen(tex, sim.w, spin(tt), zoom(tt), spec.wrap)
}
