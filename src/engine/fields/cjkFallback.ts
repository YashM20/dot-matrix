import type { Field } from '../types'
import { distanceTransform, iconField, rasterizeToMask } from './iconSDF'
let notoLoaded = false
function ensureNotoSansSC() {
  if (notoLoaded || typeof document === 'undefined') return
  notoLoaded = true
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700&display=swap'
  document.head.appendChild(link)
  if ('fonts' in document) (document as unknown as { fonts: { load: (s: string) => Promise<unknown> } }).fonts.load('108px Noto Sans SC').catch(() => {})
}
export function glyphFieldFromFont(char: string, fontFamily: string): Field {
  if (fontFamily === 'Noto Sans SC') ensureNotoSansSC()
  const cacheKey = `cjk:${char}:${fontFamily}`
  const g = (globalThis as unknown as { __cjkCache?: Map<string, Field> }).__cjkCache ?? ((globalThis as unknown as { __cjkCache: Map<string, Field> }).__cjkCache = new Map())
  const cached = g.get(cacheKey)
  if (cached) return cached
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d'); if (!ctx) return () => 0
  ctx.fillStyle = '#fff'; ctx.font = `108px ${fontFamily}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.fillText(char, 64, 68)
  const mask = rasterizeToMask(char, 64)
  let field: Field
  if (mask.some(v => v)) {
    const dist = distanceTransform(mask, 64, 64)
    field = iconField(dist, 64, 64)
  } else {
    const data = ctx.getImageData(0, 0, 128, 128).data
    field = (u, v) => data[(Math.min(127, Math.floor(v * 128)) * 128 + Math.min(127, Math.floor(u * 128))) * 4 + 3] / 255
  }
  g.set(cacheKey, field); return field
}
export function cjkTextField(text: string, fontFamily = 'Noto Sans SC'): Field {
  const chars = [...text].map(c => glyphFieldFromFont(c, fontFamily))
  const n = chars.length
  return (u, v) => { const i = Math.min(n - 1, Math.max(0, Math.floor(u * n))); const inner = chars[i]; const uu = (u * n) % 1; return inner(uu, v) }
}
