/** Raster asset codec: little-endian Float64 / Float32 / Uint8 samples ⇄ strict base64 (no host `atob`/`btoa`). */
import type { RasterLayerSpec } from './types'

const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const INDEX = new Int16Array(128).fill(-1)
for (let i = 0; i < 64; i++) INDEX[ABC.charCodeAt(i)] = i
/** Canonical padded base64: length a multiple of 4, alphabet only, `=` only at the end. */
export const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

export function toBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2], n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += ABC[n >> 18] + ABC[(n >> 12) & 63] + (b === undefined ? '=' : ABC[(n >> 6) & 63]) + (c === undefined ? '=' : ABC[n & 63])
  }
  return out
}
/** Decoded byte count of a canonical base64 string. */
export const base64Bytes = (s: string) => (s.length / 4) * 3 - (s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0)
export function fromBase64(s: string): Uint8Array {
  if (!BASE64.test(s)) throw new Error('not canonical base64')
  const out = new Uint8Array(base64Bytes(s))
  let j = 0
  for (let i = 0; i < s.length; i += 4) {
    const n = (INDEX[s.charCodeAt(i)] << 18) | (INDEX[s.charCodeAt(i + 1)] << 12) | (Math.max(0, INDEX[s.charCodeAt(i + 2)]) << 6) | Math.max(0, INDEX[s.charCodeAt(i + 3)])
    out[j++] = n >> 16
    if (j < out.length) out[j++] = (n >> 8) & 255
    if (j < out.length) out[j++] = n & 255
  }
  return out
}

export const BYTES_PER_SAMPLE = { f64: 8, f32: 4, u8: 1 } as const
/** Samples → asset string in `format` (u8 stores round(clamp(x)·255)). */
export function encodeSamples(values: ArrayLike<number>, format: RasterLayerSpec['format']): string {
  const n = values.length, bytes = new Uint8Array(n * BYTES_PER_SAMPLE[format]), view = new DataView(bytes.buffer)
  for (let i = 0; i < n; i++) {
    const x = values[i]
    if (format === 'f64') view.setFloat64(i * 8, x, true)
    else if (format === 'f32') view.setFloat32(i * 4, x, true)
    else bytes[i] = Math.round(Math.max(0, Math.min(1, x)) * 255)
  }
  return toBase64(bytes)
}
export function decodeSamples(asset: string, format: RasterLayerSpec['format']): Float64Array {
  const bytes = fromBase64(asset), k = BYTES_PER_SAMPLE[format], n = Math.floor(bytes.length / k), out = new Float64Array(n), view = new DataView(bytes.buffer)
  for (let i = 0; i < n; i++) out[i] = format === 'f64' ? view.getFloat64(i * 8, true) : format === 'f32' ? view.getFloat32(i * 4, true) : bytes[i] / 255
  return out
}
