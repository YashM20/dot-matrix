import { textField } from '../engine/fields/bitmapFont'
import type { WidgetPreset } from './types'
import { combine, place } from './types'

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function centeredBars(amps: number[]): import('../engine/types').Field {
  const n = amps.length
  return (u, v) => {
    const idx = Math.min(n - 1, Math.max(0, Math.floor(u * n)))
    const amp = amps[idx]
    const frac = u * n - idx
    if (frac > 0.62) return 0
    const halfH = amp * 0.42
    const d = Math.abs(v - 0.5)
    const e = 0.05
    if (d <= halfH - e) return 1
    if (d >= halfH + e) return 0
    return 1 - smoothstep(halfH - e, halfH + e, d)
  }
}

function disc(cx: number, cy: number, r: number): import('../engine/types').Field {
  return (u, v) => (Math.hypot(u - cx, v - cy) <= r ? 1 : 0)
}

// hand-traced from reference — 22 bars, loud-center taper already baked in
const REF_AMPS = [0.32,0.38,0.68,0.52,0.88,0.62,0.78,0.52,0.68,0.42,0.58,0.84,0.72,0.62,0.52,0.42,0.45,0.52,0.58,0.32,0.48,0.40]

export const recorder: WidgetPreset = {
  id: 'recorder',
  name: 'Recorder',
  group: 'composite',
  live: true,
  // integer-aligned: hero 29 cols *4 =116 → w 116/152=0.763, footer 131*1=131 → w 131/152=0.862
  grid: { cols: 152, rows: 112 },
  style: { shape: 'circle', sizeMin: 0.18, sizeMax: 1.55, cornerRoundness: 1, quantizeSteps: 0, jitter: 0 },
  field: () => combine(
    // hero — 4 dots per glyph pixel (k=4) uniform blocks, crisp
    place(textField('01:47'), 0.118, 0.14, 0.763, 0.40),
    place(centeredBars(REF_AMPS), 0.04, 0.585, 0.92, 0.15),
    disc(0.5, 0.76, 0.018),
    place(textField('BUILD THE SMALLER ONE.'), 0.069, 0.84, 0.862, 0.11),
  ),
  paint: (dots, theme) => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const d of dots) { if (d.x < minX) minX = d.x; if (d.x > maxX) maxX = d.x; if (d.y < minY) minY = d.y; if (d.y > maxY) maxY = d.y }
    const W = maxX - minX || 608, H = maxY - minY || 448
    for (const d of dots) {
      const u = (d.x - minX) / W, v = (d.y - minY) / H
      if (Math.hypot(u - 0.5, v - 0.76) < 0.028 && d.opacity > 0) {
        d.color = theme.dotActive
        d.opacity = 1
        d.r = (d.r ?? 0) * 1.6
        continue
      }
      if (d.opacity > 0.5) d.color = '#F2F3F5'
      else if (d.opacity > 0) d.color = theme.dotFaint!
    }
  },
}
