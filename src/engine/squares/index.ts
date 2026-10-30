/**
 * Squares (docs/living-matter/Q-squares.md): spaced and joined square cells. A lazy engine module, not re-exported
 * from the engine barrel: the first-load core only carries inert hook points (`samplerExt`, `shapeExt`), and a board
 * that draws joined squares calls `installSquares()` (idempotent) at the top of its chunk. Static imports here are
 * only what sampling and the Canvas / SVG paths need (the worker carries them too). The WebGL hook is a separate
 * chunk that DotGL fetches on the main thread (`shapeExt.glLoad`, set in src/components/DotCanvas.tsx).
 */
import { samplerExt } from '../sampler/ext'
import { shapeExt } from '../renderer/ext'
import { joinPass } from './sampler'
import { bufferDot, canvasDot } from './canvas'
import { svgDots } from './svg'
import { attach, decode, formOf, grow, push, rect, stamp } from './buffer'

export { ALL_FULL, CONVEX, DIAG, EDGE_H, EDGE_V, FULL, INNER, LUT4, NO_JOIN, joinMasks, maskOf, quadrant, quadrantCode } from './mask'
export { inkRadius, insideJoined, insideRect, joinArea, joinOutline, rectOutline, superellipseArea, type OutlineSink } from './geometry'
export { defaultOuter, joinPass } from './sampler'
export { svgBleed, svgDots, svgJoin } from './svg'
export { bufferDot, canvasDot, canvasJoin } from './canvas'

/** Install the join pass, the per-dot form, aspect and buffer channels, and the Canvas / SVG join and rect renderers. Idempotent. */
export function installSquares(): void {
  Object.assign(samplerExt, { join: joinPass, form: formOf, rect, stamp, push, attach, grow, decode })
  Object.assign(shapeExt, { canvas: canvasDot, bufferDot, svg: svgDots })
}
/** Remove the squares hooks (checks: the missing-hook path draws plain dots). The GL hook stays if it loaded. */
export function uninstallSquares(): void {
  for (const k of ['join', 'form', 'rect', 'stamp', 'push', 'attach', 'grow', 'decode'] as const) delete samplerExt[k]
  for (const k of ['canvas', 'bufferDot', 'svg'] as const) delete shapeExt[k]
}
