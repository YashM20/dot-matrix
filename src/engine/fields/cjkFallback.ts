import type { Field } from '../types'
import { distanceTransform, iconField, rasterizeToMask } from './iconSDF'

/**
 * Glyphs outside the bitmap set (CJK etc.) are rasterised from a system font and sampled
 * through the icon SDF path so they share the dot grid. No web font is fetched — the engine
 * never touches the network. Prefer Noto Sans SC when installed, else the OS CJK face.
 */
export const CJK_FONT_STACK = "'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'Hiragino Sans GB', 'Source Han Sans SC', sans-serif"
const cache = new Map<string, Field>()
const RES = 48

export function glyphFieldFromFont(char: string, fontFamily = CJK_FONT_STACK): Field {
  const key = `${char}:${fontFamily}`
  const cached = cache.get(key); if (cached) return cached
  if (typeof document === 'undefined') return () => 0
  const mask = rasterizeToMask(char, RES, {}, fontFamily)
  const field = mask.some(v => v) ? iconField(distanceTransform(mask, RES, RES), RES, RES, 1) : () => 0
  cache.set(key, field)
  return field
}
/** Characters laid side by side, each in a square cell of the box. */
export function cjkTextField(text: string, fontFamily = CJK_FONT_STACK): Field {
  const chars = [...text].map(c => glyphFieldFromFont(c, fontFamily))
  const n = Math.max(1, chars.length)
  return (u, v) => { const i = Math.min(n - 1, Math.max(0, Math.floor(u * n))); return chars[i]?.((u * n) % 1, v) ?? 0 }
}
