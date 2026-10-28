/**
 * Squares (docs/living-matter/Q-squares.md): spaced and joined square cells. A lazy engine module, not re-exported
 * from the engine barrel: the first-load core only carries inert hook points (`samplerExt`, `shapeExt`), and a board
 * that draws joined squares calls `installSquares()` (idempotent) at the top of its chunk. Static imports here are
 * only what sampling and the Canvas / SVG paths need (the worker carries them too); the GL hook loads on demand.
 */
import { samplerExt } from '../sampler/ext'
import { shapeExt } from '../renderer/ext'
import { joinPass } from './sampler'
import { canvasJoin } from './canvas'
import { svgJoin } from './svg'

export { ALL_FULL, CONVEX, DIAG, EDGE_H, EDGE_V, FULL, INNER, LUT4, NO_JOIN, joinMasks, maskOf, quadrant, quadrantCode } from './mask'
export { inkRadius, insideJoined, joinArea, joinOutline, superellipseArea, type OutlineSink } from './geometry'
export { defaultOuter, joinPass } from './sampler'
export { svgBleed, svgJoin } from './svg'
export { canvasJoin } from './canvas'

let gl: Promise<unknown> | undefined
/** Install the join pass and the Canvas / SVG / (lazy) WebGL join renderers. Idempotent. */
export function installSquares(): void {
  samplerExt.join = joinPass
  shapeExt.canvas = canvasJoin
  shapeExt.svg = svgJoin
  shapeExt.glLoad ??= () => (gl ??= import('./gl').then(m => { shapeExt.gl = m.glJoin }, () => { gl = undefined }))
}
/** Remove every squares hook (checks: the missing-hook path draws plain dots). */
export function uninstallSquares(): void {
  delete samplerExt.join; delete shapeExt.canvas; delete shapeExt.svg; delete shapeExt.gl; delete shapeExt.glLoad
  gl = undefined
}
