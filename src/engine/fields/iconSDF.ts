import type { Field } from '../types'
import { rasterizePath } from './svgPath'
const cache = new Map<string, Float32Array>()
/** Icon outlines in a 32×32 box. Reference boards draw icons as dotted *outlines*, so the default is stroke-only. */
export const iconPaths = {
  cloud: 'M9 24h15a6 6 0 0 0 0-12 8 8 0 0 0-15 2 5 5 0 0 0 0 10Z',
  car: 'M4 20h24M6 20l3-7h14l3 7M6 20v4h3M26 20v4h-3M9 24a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM23 24a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  leaf: 'M6 26C7 12 15 6 28 5c-1 13-7 21-21 21Zm1-1c5-5 10-9 16-13',
  sun: 'M16 4v3M16 25v3M4 16h3M25 16h3M8 8l2 2M22 22l2 2M24 8l-2 2M10 22l-2 2M21 16a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z',
  cube: 'M16 3 29 10v12L16 29 3 22V10ZM3 10l13 7 13-7M16 17v12',
  wifi: 'M3 12a19 19 0 0 1 26 0M7 16a13 13 0 0 1 18 0M11 20a7 7 0 0 1 10 0M16 25h.01',
  bluetooth: 'M8 10l16 12-8 6V4l8 6L8 22',
  brightness: 'M16 10a6 6 0 1 0 0 12 6 6 0 0 0 0-12ZM16 2v4M16 26v4M2 16h4M26 16h4M6 6l3 3M23 23l3 3M26 6l-3 3M9 23l-3 3',
  sound: 'M4 12h6l8-7v22l-8-7H4ZM22 11a7 7 0 0 1 0 10M25 7a12 12 0 0 1 0 18',
  info: 'M16 3a13 13 0 1 0 0 26 13 13 0 0 0 0-26ZM16 14v9M16 9h.01',
  gear: 'M16 11a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM16 2v5M16 25v5M2 16h5M25 16h5M6 6l3.5 3.5M22.5 22.5 26 26M26 6l-3.5 3.5M9.5 22.5 6 26',
  heart: 'M16 27S3 18 3 10a6 6 0 0 1 13-3 6 6 0 0 1 13 3c0 8-13 17-13 17Z',
  plus: 'M16 6v20M6 16h20',
  more: 'M7 16h.01M16 16h.01M25 16h.01',
  play: 'M9 5l18 11-18 11Z',
  pause: 'M9 5h5v22H9ZM18 5h5v22h-5Z',
  stop: 'M7 7h18v18H7Z',
  next: 'M5 5l14 11L5 27ZM23 5v22',
  prev: 'M27 5 13 16l14 11ZM9 5v22',
  lock: 'M8 14h16v14H8ZM11 14V9a5 5 0 0 1 10 0v5',
  chevron: 'M11 5l11 11-11 11',
  check: 'M5 17l7 7L27 8',
  cross: 'M7 7l18 18M25 7 7 25',
  mic: 'M16 3a4 4 0 0 1 4 4v9a4 4 0 0 1-8 0V7a4 4 0 0 1 4-4ZM7 15a9 9 0 0 0 18 0M16 24v5M11 29h10',
  terminal: 'M5 5h22v22H5ZM10 11l5 5-5 5M17 21h6',
  globe: 'M16 3a13 13 0 1 0 0 26 13 13 0 0 0 0-26ZM3 16h26M16 3c-5 5-5 21 0 26M16 3c5 5 5 21 0 26',
  list: 'M5 8h3M12 8h15M5 16h3M12 16h15M5 24h3M12 24h15',
  code: 'M11 8l-7 8 7 8M21 8l7 8-7 8',
  undo: 'M11 7 5 13l6 6M5 13h14a8 8 0 0 1 0 16h-5',
  redo: 'M21 7l6 6-6 6M27 13H13a8 8 0 0 0 0 16h5',
  arrowUp: 'M16 27V5M7 14l9-9 9 9',
  arrowDown: 'M16 5v22M7 18l9 9 9-9',
  node: 'M16 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM7 29a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM25 29a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16 7v8M16 15l-9 8M16 15l9 8',
  flame: 'M16 3c2 6 8 9 8 16a8 8 0 0 1-16 0c0-4 2-6 3-8 0 3 1 4 3 5-1-5 1-9 2-13Z',
  shoe: 'M3 22h26v4H3ZM3 22l5-8 5 3 6-6 10 11',
  dumbbell: 'M4 12v8M8 9v14M24 9v14M28 12v8M8 16h16',
  monitor: 'M3 5h26v17H3ZM12 27h8M16 22v5',
  chart: 'M5 27h22M8 24V14M14 24V8M20 24v-9M26 24V11',
  camera: 'M3 9h7l3-4h6l3 4h7v18H3ZM16 22a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z',
  pulse: 'M3 16h6l3-9 5 18 4-13 2 4h8',
  calendar: 'M4 7h24v22H4ZM4 13h24M10 3v6M22 3v6',
  mountain: 'M3 27l9-14 5 7 4-5 8 12Z',
  document: 'M7 3h12l6 6v20H7ZM19 3v6h6M11 16h10M11 21h10',
  skull: 'M16 3a10 10 0 0 0-7 17v6h14v-6a10 10 0 0 0-7-17ZM12 14a2 2 0 1 0 0 1M20 14a2 2 0 1 0 0 1M13 26v3M19 26v3',
  target: 'M16 3a13 13 0 1 0 0 26 13 13 0 0 0 0-26ZM16 10a6 6 0 1 0 0 12 6 6 0 0 0 0-12ZM16 1v6M16 25v6M1 16h6M25 16h6',
  volume: 'M4 12h6l8-7v22l-8-7H4ZM22 11a7 7 0 0 1 0 10',
  bolt: 'M18 3 6 18h9l-2 11 12-15h-9Z',
  deer: 'M9 3c0 5 2 8 5 9h4c3-1 5-4 5-9M11 7h3M18 7h3M12 12v4a4 4 0 0 0 8 0v-4M12 20l-2 9M20 20l2 9M14 22v7M18 22v7',
  pill: 'M9 23 23 9a5 5 0 0 1 0 7L16 23a5 5 0 0 1-7-7ZM12 13l7 7',
  rocket: 'M16 2c5 5 6 13 4 20h-8c-2-7-1-15 4-20ZM12 22l-4 6h16l-4-6M16 26v4M16 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
  drop: 'M16 3c6 8 9 12 9 17a9 9 0 0 1-18 0c0-5 3-9 9-17Z',
  eye: 'M2 16s5-9 14-9 14 9 14 9-5 9-14 9S2 16 2 16ZM16 20a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
}
export interface RasterOptions { stroke?: number; fill?: boolean }
/**
 * Rasterize an SVG path (32-unit box) or a single character to a bitmask.
 * Paths are stroked by default (`stroke` is the width in 32-unit space); pass `fill:true` for solid glyphs.
 * Paths use the pure-TS rasterizer (identical everywhere, works headlessly); single characters need a
 * browser canvas for the system font and return an empty mask outside one.
 */
export function rasterizeToMask(svgPathOrGlyph: string, resolution: number, opts: RasterOptions = {}, fontFamily = 'sans-serif'): Uint8ClampedArray {
  if ([...svgPathOrGlyph].length > 1) return rasterizePath(svgPathOrGlyph, resolution, { stroke: opts.stroke ?? 2.2, fill: opts.fill ?? false })
  const empty = new Uint8ClampedArray(resolution * resolution)
  if (typeof document === 'undefined') return empty
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = resolution
  const context = canvas.getContext('2d'); if (!context) return empty
  context.fillStyle = '#fff'
  context.font = `${resolution * .78}px ${fontFamily}`; context.textAlign = 'center'; context.textBaseline = 'middle'
  context.fillText(svgPathOrGlyph, resolution / 2, resolution * .54)
  const data = context.getImageData(0, 0, resolution, resolution).data
  return Uint8ClampedArray.from({ length: resolution * resolution }, (_, i) => (data[i * 4 + 3] > 100 ? 1 : 0))
}
/** Chamfer 3-4 distance transform (~6% error vs Euclidean, linear time) — used above 64×64. */
function chamferDistanceTransform(mask: Uint8ClampedArray, width: number, height: number): Float32Array {
  const INF = width * height
  const dist = new Float32Array(width * height)
  for (let i = 0; i < mask.length; i++) dist[i] = mask[i] ? 0 : INF
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x; if (dist[index] === 0) continue
    let best = dist[index]
    if (x > 0) best = Math.min(best, dist[index - 1] + 3)
    if (y > 0) best = Math.min(best, dist[index - width] + 3)
    if (x > 0 && y > 0) best = Math.min(best, dist[index - width - 1] + 4)
    if (x + 1 < width && y > 0) best = Math.min(best, dist[index - width + 1] + 4)
    dist[index] = best
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const index = y * width + x; if (dist[index] === 0) continue
    let best = dist[index]
    if (x + 1 < width) best = Math.min(best, dist[index + 1] + 3)
    if (y + 1 < height) best = Math.min(best, dist[index + width] + 3)
    if (x + 1 < width && y + 1 < height) best = Math.min(best, dist[index + width + 1] + 4)
    if (x > 0 && y + 1 < height) best = Math.min(best, dist[index + width - 1] + 4)
    dist[index] = best
  }
  for (let i = 0; i < dist.length; i++) dist[i] /= 3
  return dist
}
export function distanceTransform(mask: Uint8ClampedArray, width: number, height: number): Float32Array {
  if (width * height > 4096) return chamferDistanceTransform(mask, width, height)
  const output = new Float32Array(width * height); const points: number[] = []; for (let i = 0; i < mask.length; i++) if (mask[i]) points.push(i)
  if (points.length === 0) { output.fill(Math.hypot(width, height)); return output }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x; if (mask[index]) { output[index] = 0; continue }
    let nearest = Infinity; for (const point of points) { const px = point % width, py = Math.floor(point / width); const d = (x - px) ** 2 + (y - py) ** 2; if (d < nearest) nearest = d; if (nearest === 1) break } output[index] = Math.sqrt(nearest)
  } return output
}
/** 1 inside the shape, falling to 0 over `falloff` raster pixels outside it. */
export function iconField(distanceField: Float32Array, width: number, height: number, falloff = 1.5): Field { return (u, v) => { const x = Math.min(width - 1, Math.max(0, Math.floor(u * width))), y = Math.min(height - 1, Math.max(0, Math.floor(v * height))); return Math.max(0, 1 - distanceField[y * width + x] / falloff) } }
export function cachedIconField(iconId: string, path: string, resolution: number, opts: RasterOptions = {}): Field {
  const key = `${iconId}:${resolution}:${opts.stroke ?? 'd'}:${opts.fill ? 'f' : 's'}`; let distance = cache.get(key)
  if (!distance) { distance = distanceTransform(rasterizeToMask(path, resolution, opts), resolution, resolution); cache.set(key, distance) }
  return iconField(distance, resolution, resolution)
}
