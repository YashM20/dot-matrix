/**
 * Device frames for the targets: a card (Field → Grid Sampler → dots) rasterised on black and
 * box-filtered down to the device resolution, or a Field IR program evaluated per device pixel by
 * the bytecode VM (the same thing the ESP32 runs). Node only; nothing here is imported by the app.
 */
import { sampleCard, visible } from '../../scripts/lib/cards'
import { Raster, rgb } from '../../scripts/lib/raster'
import { compileBytecode, loadBytecode, parse } from '../../src/engine/ir'
import { squircleExponent } from '../../src/engine/renderer/shapePath'
import { cellU } from '../../src/engine/sampler/gridSampler'
import { dot480 } from '../../src/engine/theme/tokens'
import { widgetById, type WidgetPreset } from '../../src/widgets'

/** Row-major RGB888, (0, 0) top-left. */
export interface Frame { w: number; h: number; rgb: Uint8Array }
export type Fit = 'contain' | 'cover' | 'stretch'

/** Built-in IR programs for device demos (same grammar as `src/engine/ir`). */
export const PROGRAMS: Record<string, string> = {
  ripple: 'let x = (u - .5) * 1.08; let y = v - .5; let d = length(x, y); (.5 + .5 * sin(d * 30 - t * 5)) * smoothstep(.6, .04, d)',
  plasma: 'let x = u * 6; let y = v * 6; (sin(x + t) + sin(y * 1.3 - t * .7) + sin((x + y) * .7 + t * .5) + sin(length(x - 3, y - 3) * 1.5 - t)) / 8 + .5',
  dial: 'let a = fract(atan(u - .5, .5 - v) / TAU); let r = length(u - .5, v - .5); (a < data.value) * smoothstep(.08, .03, abs(r - .36))',
  sparkle: 'step(.93, hash(floor(u * 32), floor(v * 32) + floor(t * 8)))',
}

export function preset(id: string): WidgetPreset {
  const p = widgetById(id)
  if (!p) throw new Error(`unknown card "${id}"`)
  return p
}

/** A card's dots on black (no card chrome: an LED that is off is black), `px` output px per card px. */
export function cardRaster(id: string, t: number, px = 1, data?: Record<string, number>): Raster {
  const p = preset(id), pitch = (p.grid.pitch ?? dot480.gridPx) * px
  const out = new Raster(Math.round(p.grid.cols * pitch), Math.round(p.grid.rows * pitch), '#000000')
  const n = squircleExponent(p.style.cornerRoundness ?? 0)
  for (const d of sampleCard(p, t, p.style, undefined, data ? { data } : {})) if (visible(d)) {
    out.dot(d.x * px, d.y * px, d.r * px, d.shape === 'circle' ? 2 : d.shape === 'square' ? 40 : n, d.color, d.opacity)
  }
  return out
}

/** Area-average `src` into w×h (`contain` letterboxes on black). */
export function resample(src: Raster, w: number, h: number, fit: Fit = 'contain'): Frame {
  const sx = w / src.w, sy = h / src.h
  const kx = fit === 'stretch' ? sx : fit === 'contain' ? Math.min(sx, sy) : Math.max(sx, sy), ky = fit === 'stretch' ? sy : kx
  const ox = (w - src.w * kx) / 2, oy = (h - src.h * ky) / 2
  const out = new Uint8Array(w * h * 3), acc = [0, 0, 0]
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // source box of this device pixel
    const x0 = (x - ox) / kx, x1 = (x + 1 - ox) / kx, y0 = (y - oy) / ky, y1 = (y + 1 - oy) / ky
    acc[0] = acc[1] = acc[2] = 0
    for (let j = Math.max(0, Math.floor(y0)); j < Math.min(src.h, Math.ceil(y1)); j++) {
      const wy = Math.min(y1, j + 1) - Math.max(y0, j)
      for (let i = Math.max(0, Math.floor(x0)); i < Math.min(src.w, Math.ceil(x1)); i++) {
        const wgt = (Math.min(x1, i + 1) - Math.max(x0, i)) * wy, s = (j * src.w + i) * 3
        acc[0] += src.data[s] * wgt; acc[1] += src.data[s + 1] * wgt; acc[2] += src.data[s + 2] * wgt
      }
    }
    const area = (x1 - x0) * (y1 - y0), o = (y * w + x) * 3
    for (let c = 0; c < 3; c++) out[o + c] = Math.max(0, Math.min(255, Math.round(acc[c] / area)))
  }
  return { w, h, rgb: out }
}

/** A card at device resolution. `px` = render scale before the box filter (higher = smoother). */
export function cardFrame(id: string, t: number, w: number, h: number, opts: { fit?: Fit; px?: number; data?: Record<string, number> } = {}): Frame {
  return resample(cardRaster(id, t, opts.px ?? Math.max(1, Math.ceil(Math.max(w, h) / 64)), opts.data), w, h, opts.fit ?? 'contain')
}

/** A Field IR program (source or bytecode) evaluated at each device pixel; value → `color` brightness. */
export function irFrame(program: string | Uint8Array, w: number, h: number, t: number, opts: { data?: Record<string, number>; color?: string } = {}): Frame {
  const code = typeof program === 'string' ? compileBytecode(parse(PROGRAMS[program] ?? program)) : program
  const vm = loadBytecode(code), [r, g, b] = rgb(opts.color ?? dot480.value), out = new Uint8Array(w * h * 3)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = vm.run(Math.fround(cellU(x, w)), Math.fround(cellU(y, h)), Math.fround(t), opts.data)
    const k = v > 0 ? (v < 1 ? v : 1) : 0, o = (y * w + x) * 3
    out[o] = Math.round(r * k); out[o + 1] = Math.round(g * k); out[o + 2] = Math.round(b * k)
  }
  return { w, h, rgb: out }
}

/** Serpentine (zig-zag) LED order: odd rows reversed. Most WS2812 matrices are wired this way. */
export function serpentine(f: Frame): Frame {
  const out = new Uint8Array(f.rgb.length)
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
    const sx = y % 2 ? f.w - 1 - x : x
    out.set(f.rgb.subarray((y * f.w + sx) * 3, (y * f.w + sx) * 3 + 3), (y * f.w + x) * 3)
  }
  return { ...f, rgb: out }
}

/** Rec. 709 luma in [0, 1] per pixel (sRGB values used directly, as the halftone ladder expects). */
export function luma(f: Frame): Float32Array {
  const out = new Float32Array(f.w * f.h)
  for (let i = 0; i < out.length; i++) out[i] = (.2126 * f.rgb[i * 3] + .7152 * f.rgb[i * 3 + 1] + .0722 * f.rgb[i * 3 + 2]) / 255
  return out
}

/** `--key value` / `--flag` argv parser for the target CLIs. */
export function args(argv = process.argv.slice(2)): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) { const k = argv[i].slice(2), v = argv[i + 1]; if (v === undefined || v.startsWith('--')) out[k] = 'true'; else { out[k] = v; i++ } }
  return out
}
/** Frame source from CLI flags: `--card <id>` or `--ir <program name | source>`. */
export function frameSource(a: Record<string, string>, w: number, h: number): (t: number) => Frame {
  const data = a.data ? JSON.parse(a.data) as Record<string, number> : undefined
  if (a.ir) { const code = compileBytecode(parse(PROGRAMS[a.ir] ?? a.ir)); return t => irFrame(code, w, h, t, { data, color: a.color }) }
  const id = a.card ?? 'home-clock'
  return t => cardFrame(id, t, w, h, { fit: (a.fit as Fit) ?? 'contain', data })
}
