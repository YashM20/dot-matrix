/**
 * `toDevice(spec, profile)`: one card → one device frame.
 *
 *   spec (layers on its authored grid, or a curated variant for this device grid)
 *     → sampleLayers → dots → area-weighted splat onto the device grid (linear light)
 *     → per-device tone map (8-bit linear, 2-level threshold, 1-bit blue-noise dither)
 *
 * Area-weighted: each dot is its own light (area × opacity × colour luminance), spread over the device
 * cells it overlaps as an equal-area square, normalised so a solid field of full dots reads 1. The
 * single accent maps to full brightness (monochrome panels have no red: the accent is the bright thing).
 * Pure and deterministic: same spec, ctx and profile → the same bytes.
 */
import type { FrameContext } from '../context'
import { sampleLayers } from '../sampler/gridSampler'
import { squircleExponent } from '../renderer/shapePath'
import { stbn } from '../halftone/mask'
import { dot480 } from '../theme/tokens'
import type { DotInstance, DotStyle, GridConfig, Layer, ThemeTokens } from '../types'
import { deviceMask, gridKey, type DeviceProfile } from './profile'

/** A card as `toDevice` reads it. Any `WidgetPreset` fits; `variants` are curated layouts per device grid (`'25x25'`). */
export interface DeviceSpec {
  grid: GridConfig
  style: DotStyle
  layers(ctx: FrameContext): Layer[]
  variants?: Record<string, { style?: DotStyle; layers(ctx: FrameContext): Layer[] }>
}
/** Already-sampled dots on a `width × height` px canvas (exports, other renderers). */
export interface DotSource { dots: DotInstance[]; width: number; height: number; style: DotStyle; pitch: number }
export interface DeviceFrame {
  profile: DeviceProfile
  cols: number
  rows: number
  /** Area-weighted linear light per pixel, 0..1 (before the tone map). */
  level: Float32Array
  /** Tone-mapped drive value per pixel on the device's 2^bits levels, 0..1 (masked-off pixels 0). */
  out: Float32Array
  mask: Uint8Array
  /** Whether a curated variant was used (else the authored grid was resampled). */
  variant: boolean
}
export interface ToDeviceOptions { ctx?: FrameContext; theme?: ThemeTokens; fit?: 'contain' | 'cover' }

// ── colour → linear light ──────────────────────────────────────────────────
const lin = (c: number) => { c /= 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4 }
const lumCache = new Map<string, number>()
function luminance(color: string): number {
  let v = lumCache.get(color)
  if (v === undefined) {
    const m = /^#?([0-9a-f]{6})$/i.exec(color.trim())
    if (!m) v = 1
    else { const n = parseInt(m[1], 16); v = .2126 * lin(n >> 16) + .7152 * lin((n >> 8) & 255) + .0722 * lin(n & 255) }
    lumCache.set(color, v)
  }
  return v
}
/** Brightness of a dot colour relative to the theme's brightest ink; the accent counts as full. */
function brightness(color: string, theme: ThemeTokens): number {
  if (color === theme.dotActive) return 1
  if (color === theme.dotActiveDim) return .6
  return Math.min(1, luminance(color) / luminance(theme.value ?? theme.dotIdle))
}

// ── dot area (superellipse |x|^n + |y|^n ≤ r^n: 4r²Γ(1+1/n)²/Γ(1+2/n)) ─────────
const LANCZOS = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]
function gamma(z: number): number {
  if (z < .5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z))
  z -= 1; let x = .99999999999980993
  for (let i = 0; i < 8; i++) x += LANCZOS[i] / (z + i + 1)
  const t = z + 7.5
  return Math.sqrt(2 * Math.PI) * t ** (z + .5) * Math.exp(-t) * x
}
const areaK = new Map<number, number>()
/** Area of a dot of radius 1 in this shape. */
function unitArea(shape: DotStyle['shape'] | undefined, roundness = 0): number {
  if (shape === 'square') return 4
  if (shape !== 'squircle') return Math.PI
  const n = squircleExponent(roundness)
  let a = areaK.get(n)
  if (a === undefined) { a = (4 * gamma(1 + 1 / n) ** 2) / gamma(1 + 2 / n); areaK.set(n, a) }
  return a
}

// ── tone maps ──────────────────────────────────────────────────────────────
/** One pixel's drive value: `level` (linear light) → 2^bits levels by the profile's tone map. */
export function toneMap(level: number, profile: DeviceProfile, col: number, row: number): number {
  const L = 2 ** Math.max(1, profile.bits) - 1, x = Math.max(0, Math.min(1, level))
  switch (profile.tones.map) {
    case 'threshold': return x >= (profile.tones.threshold ?? .5) ? 1 : 0
    case 'blueNoise': return Math.min(L, Math.floor(x * L + stbn(col, row, 0))) / L
    default: return Math.round(x * L) / L
  }
}

/** Splat dots onto a cols×rows grid of linear light. `scale` maps source px → device cells, after (ox, oy). */
function splat(dots: DotInstance[], fill: number, theme: ThemeTokens, cols: number, rows: number, scale: number, ox: number, oy: number): Float32Array {
  const acc = new Float32Array(cols * rows)
  for (const d of dots) {
    if (!(d.r > 0) || !(d.opacity > 0)) continue
    const light = d.opacity * brightness(d.color, theme)
    if (light <= 0) continue
    const half = (Math.sqrt(unitArea(d.shape, d.roundness)) * d.r * scale) / 2, x = d.x * scale + ox, y = d.y * scale + oy
    const x0 = x - half, x1 = x + half, y0 = y - half, y1 = y + half
    for (let r = Math.max(0, Math.floor(y0)); r <= Math.min(rows - 1, Math.floor(y1)); r++) {
      const hy = Math.min(y1, r + 1) - Math.max(y0, r)
      if (hy <= 0) continue
      for (let c = Math.max(0, Math.floor(x0)); c <= Math.min(cols - 1, Math.floor(x1)); c++) {
        const hx = Math.min(x1, c + 1) - Math.max(x0, c)
        if (hx > 0) acc[r * cols + c] += light * hx * hy
      }
    }
  }
  for (let i = 0; i < acc.length; i++) acc[i] = Math.min(1, acc[i] / fill)
  return acc
}

/** Coverage of one cell by a full-size dot (a solid field of full dots splats to this; it is normalised to 1). */
const fullFill = (style: DotStyle, pitch: number) => Math.min(1, (unitArea(style.shape, style.cornerRoundness) * style.sizeMax ** 2) / pitch ** 2)
/** Variant grids: one dot per device pixel, every dot one full square cell, value as opacity. */
const PIXEL: DotStyle = { shape: 'square', sizeMin: .5, sizeMax: .5, opacityMode: 'fromValue' }

const isDots = (s: DeviceSpec | DotSource): s is DotSource => 'dots' in s

export function toDevice(src: DeviceSpec | DotSource, profile: DeviceProfile, opts: ToDeviceOptions = {}): DeviceFrame {
  const theme = opts.theme ?? dot480, ctx = opts.ctx ?? { t: 0, data: {} }, { cols, rows } = profile
  const mask = deviceMask(profile)
  let level: Float32Array, variant = false
  const v = !isDots(src) ? src.variants?.[gridKey(profile)] : undefined
  if (v) {
    // curated layout on the device grid itself: each cell is one pixel
    variant = true
    const dots = sampleLayers(v.layers(ctx), { cols, rows, pitch: 1 }, v.style ?? PIXEL, theme)
    level = splat(dots, v.style ? fullFill(v.style, 1) : 1, theme, cols, rows, 1, 0, 0)
  } else {
    const s: DotSource = isDots(src) ? src : (() => {
      const pitch = src.grid.pitch ?? theme.gridPx
      return { dots: sampleLayers(src.layers(ctx), src.grid, src.style, theme), width: src.grid.cols * pitch, height: src.grid.rows * pitch, style: src.style, pitch }
    })()
    const k = opts.fit === 'cover' ? Math.max(cols / s.width, rows / s.height) : Math.min(cols / s.width, rows / s.height)
    level = splat(s.dots, fullFill(s.style, s.pitch), theme, cols, rows, k, (cols - s.width * k) / 2, (rows - s.height * k) / 2)
  }
  const out = new Float32Array(cols * rows)
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c
    if (!mask[i]) { level[i] = 0; continue }
    out[i] = toneMap(level[i], profile, c, r)
  }
  return { profile, cols, rows, level, out, mask, variant }
}

/** Mean drive value over the pixels that exist (e-ink dither check: ≈ mean level). */
export function frameMean(f: DeviceFrame, which: 'out' | 'level' = 'out'): number {
  let s = 0, n = 0
  for (let i = 0; i < f.out.length; i++) if (f.mask[i]) { s += f[which][i]; n++ }
  return n ? s / n : 0
}
