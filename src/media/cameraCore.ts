/**
 * The camera's capture and the silhouette / motion model over it: their own chunk, loaded by `useCamera` when a
 * camera card mounts (the feed itself starts only on a user's tap, later), so first load leaves them out.
 */
import type { Raster } from '../engine/raster'
import { createCamera } from './camera'
import { createSilhouette } from '../vision/silhouette'

export { createCamera }

/**
 * Silhouette / motion over a camera's luma: a background model fed once per new camera frame, read through
 * getters (outside the hook: the React Compiler can't compile getters in an object literal).
 */
export function visionOf(cam: NonNullable<ReturnType<typeof createCamera>>, cols: number, rows: number) {
  const n = cols * rows, sil = createSilhouette(n), bounds = cam.raster.bounds
  let fed = -1, first = 0
  // the first half second re-learns the room every frame (auto-exposure is still settling)
  const feed = () => {
    if (fed === cam.frame) return
    if (fed < 0 || cam.frame < fed) first = cam.frame
    if (cam.frame - first < 15) sil.reset()
    fed = cam.frame; sil.push(cam.raster.data)
  }
  const silhouette: Raster = { grid: cam.raster.grid, space: 'card', data: sil.fg, bounds }
  const motion: Raster = { grid: cam.raster.grid, space: 'card', data: sil.motion, bounds }
  const media = {
    camera: cam.raster,
    get silhouette() { feed(); return silhouette },
    get motion() { feed(); return motion },
  }
  return { media, reset: () => { fed = -1 } }
}
