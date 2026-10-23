/**
 * GIF89a encoder: hand-written LZW, one global palette built from the board's tones, looping.
 * Frames after the first store only their changed rectangle (disposal "leave in place"), and
 * identical frames extend the previous delay, so a timer clip is a few KB per second.
 */
import { Bytes, diffBox, type RGBAFrame } from './bytes'

export type RGB = [number, number, number]
export function parseColor(c: string): RGB {
  const h = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (h) { const s = h[1].length === 3 ? [...h[1]].map(x => x + x).join('') : h[1]; return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)) as RGB }
  const r = c.match(/rgba?\(([^)]+)\)/)
  if (r) return r[1].split(',').slice(0, 3).map(v => Math.round(+v)) as RGB
  return [255, 0, 255]
}

/**
 * Palette = every ground (card surface, page) plus a ramp from each ground to each dot tone:
 * dots are one tone at some opacity × edge coverage over a ground, so the ramps hold every
 * colour the renderer produces (overlaps excepted). At most 256 entries.
 */
export function paletteFromTones(tones: string[], grounds: string[], max = 256): RGB[] {
  const t = [...new Set(tones)].map(parseColor), g = [...new Set(grounds)].map(parseColor)
  const levels = Math.max(2, Math.min(64, Math.floor((max - g.length) / Math.max(1, t.length * g.length))))
  const seen = new Set<number>(), out: RGB[] = []
  const push = (c: RGB) => { const k = (c[0] << 16) | (c[1] << 8) | c[2]; if (!seen.has(k) && out.length < max) { seen.add(k); out.push(c) } }
  g.forEach(push)
  for (const gc of g) for (const tc of t) for (let k = 1; k <= levels; k++) {
    const a = k / levels
    push([0, 1, 2].map(i => Math.round(gc[i] + (tc[i] - gc[i]) * a)) as RGB)
  }
  return out
}

/** Index of the nearest palette colour, memoised per RGB value. */
function quantizer(palette: RGB[]) {
  const cache = new Map<number, number>()
  return (r: number, g: number, b: number) => {
    const key = (r << 16) | (g << 8) | b
    let idx = cache.get(key)
    if (idx === undefined) {
      let best = Infinity
      idx = 0
      for (let i = 0; i < palette.length; i++) {
        const p = palette[i], dr = p[0] - r, dg = p[1] - g, db = p[2] - b
        const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db
        if (d < best) { best = d; idx = i }
      }
      cache.set(key, idx)
    }
    return idx
  }
}

/** GIF LZW of palette indices with `minCodeSize`, as data sub-blocks (≤ 255 bytes each) + terminator. */
export function lzwEncode(indices: Uint8Array, minCodeSize: number): Uint8Array {
  const out = new Bytes(), block = new Uint8Array(255)
  let blockLen = 0, acc = 0, bits = 0
  const byte = (v: number) => { block[blockLen++] = v; if (blockLen === 255) { out.u8(255).bytes(block); blockLen = 0 } }
  const clear = 1 << minCodeSize, eoi = clear + 1
  let codeSize = minCodeSize + 1, next = eoi + 1
  let dict = new Map<number, number>()
  const emit = (code: number) => { acc |= code << bits; bits += codeSize; while (bits >= 8) { byte(acc & 0xff); acc >>>= 8; bits -= 8 } }
  emit(clear)
  let cur = indices[0]
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i], key = (cur << 8) | k, hit = dict.get(key)
    if (hit !== undefined) { cur = hit; continue }
    emit(cur)
    if (next === 4096) { emit(clear); dict = new Map(); codeSize = minCodeSize + 1; next = eoi + 1 }
    else { if (next >= 1 << codeSize) codeSize++; dict.set(key, next++) }
    cur = k
  }
  emit(cur); emit(eoi)
  if (bits > 0) byte(acc & 0xff)
  if (blockLen) out.u8(blockLen).bytes(block.subarray(0, blockLen))
  return out.u8(0).done()
}

interface StoredFrame { delayCs: number; body: Uint8Array; delayAt: number }

/** Incremental GIF: `add(frame, delayCs)` per frame (centiseconds), then `finish()`. */
export class GIFWriter {
  private frames: StoredFrame[] = []
  private prev: RGBAFrame | null = null
  private readonly bitsPer: number
  private readonly nearest: (r: number, g: number, b: number) => number
  readonly width: number
  readonly height: number
  readonly palette: RGB[]
  constructor(width: number, height: number, palette: RGB[]) {
    this.width = width; this.height = height; this.palette = palette
    this.bitsPer = Math.max(1, Math.ceil(Math.log2(Math.max(2, palette.length))))
    this.nearest = quantizer(palette)
  }
  add(f: RGBAFrame, delayCs: number) {
    const box = this.prev ? diffBox(this.prev, f) : { x: 0, y: 0, w: f.width, h: f.height }
    this.prev = { width: f.width, height: f.height, data: f.data.slice() }
    if (!box) { this.frames[this.frames.length - 1].delayCs += delayCs; return }
    const idx = new Uint8Array(box.w * box.h)
    for (let y = 0; y < box.h; y++) for (let x = 0; x < box.w; x++) {
      const i = ((box.y + y) * f.width + box.x + x) * 4
      idx[y * box.w + x] = this.nearest(f.data[i], f.data[i + 1], f.data[i + 2])
    }
    const minCode = Math.max(2, this.bitsPer)
    const b = new Bytes()
      .u8(0x21).u8(0xf9).u8(4).u8(1 << 2).u16le(0).u8(0).u8(0) // GCE: disposal 1 (leave), delay patched in finish()
      .u8(0x2c).u16le(box.x).u16le(box.y).u16le(box.w).u16le(box.h).u8(0)
      .u8(minCode).bytes(lzwEncode(idx, minCode))
    this.frames.push({ delayCs, body: b.done(), delayAt: 4 })
  }
  get count() { return this.frames.length }
  finish(): Uint8Array<ArrayBuffer> {
    const size = 1 << this.bitsPer, b = new Bytes().ascii('GIF89a').u16le(this.width).u16le(this.height).u8(0x80 | (7 << 4) | (this.bitsPer - 1)).u8(0).u8(0)
    for (let i = 0; i < size; i++) { const c = this.palette[i] ?? [0, 0, 0]; b.u8(c[0]).u8(c[1]).u8(c[2]) }
    b.u8(0x21).u8(0xff).u8(11).ascii('NETSCAPE2.0').u8(3).u8(1).u16le(0).u8(0)
    for (const f of this.frames) {
      const body = f.body.slice(), d = Math.min(65535, Math.max(0, Math.round(f.delayCs)))
      body[f.delayAt] = d & 0xff; body[f.delayAt + 1] = d >> 8
      b.bytes(body)
    }
    return b.u8(0x3b).done()
  }
}
