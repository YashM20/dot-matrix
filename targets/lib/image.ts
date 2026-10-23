/**
 * Hand-written image encoders for the targets (node built-ins only): RGB / 1-bit PNG, 1-bit BMP
 * (TRMNL), lossless WebP (VP8L, still + animated, for Tronbyt/Tidbyt), and a blue-noise 1-bit dither.
 * The WebP coder is deliberately simple: no transforms, no LZ77, fixed 8-bit prefix codes per channel
 * (alpha and distance are single-symbol codes and cost 0 bits), so a pixel is exactly 24 bits.
 */
import { deflateSync } from 'node:zlib'
import { blueNoise, BLUE_NOISE_SIZE } from '../../src/engine/halftone'
import type { Frame } from './frame'

// ── PNG ──
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
export const crc32 = (buf: Uint8Array) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(w: number, h: number, depth: number, colorType: number, rows: Buffer[]): Buffer {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr.set([depth, colorType, 0, 0, 0], 8)
  const raw = Buffer.concat(rows.map(r => Buffer.concat([Buffer.from([0]), r])))
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
export const pngRGB = (f: Frame): Buffer => png(f.w, f.h, 8, 2, Array.from({ length: f.h }, (_, y) => Buffer.from(f.rgb.subarray(y * f.w * 3, (y + 1) * f.w * 3))))

/** 1 bit per pixel, 1 = white; packed MSB-first, rows padded to whole bytes. */
export interface Bitmap { w: number; h: number; stride: number; bits: Uint8Array }
export const bitmap = (w: number, h: number): Bitmap => { const stride = Math.ceil(w / 8); return { w, h, stride, bits: new Uint8Array(stride * h) } }
export const getBit = (b: Bitmap, x: number, y: number) => (b.bits[y * b.stride + (x >> 3)] >> (7 - (x & 7))) & 1
export const png1 = (b: Bitmap): Buffer => png(b.w, b.h, 1, 0, Array.from({ length: b.h }, (_, y) => Buffer.from(b.bits.subarray(y * b.stride, (y + 1) * b.stride))))

/** Monochrome BMP (BITMAPINFOHEADER, 2-entry palette black/white, bottom-up rows padded to 4 bytes). */
export function bmp1(b: Bitmap): Buffer {
  const row = Math.ceil(b.stride / 4) * 4, header = 14 + 40 + 8, size = header + row * b.h
  const out = Buffer.alloc(size)
  out.write('BM', 0, 'latin1'); out.writeUInt32LE(size, 2); out.writeUInt32LE(header, 10)
  out.writeUInt32LE(40, 14); out.writeInt32LE(b.w, 18); out.writeInt32LE(b.h, 22); out.writeUInt16LE(1, 26); out.writeUInt16LE(1, 28)
  out.writeUInt32LE(0, 30); out.writeUInt32LE(row * b.h, 34); out.writeInt32LE(2835, 38); out.writeInt32LE(2835, 42); out.writeUInt32LE(2, 46); out.writeUInt32LE(2, 50)
  out.writeUInt32LE(0x00000000, 54); out.writeUInt32LE(0x00ffffff, 58)  // palette: 0 = black, 1 = white (BGRA)
  for (let y = 0; y < b.h; y++) out.set(b.bits.subarray(y * b.stride, (y + 1) * b.stride), header + (b.h - 1 - y) * row)
  return out
}

/** Blue-noise threshold dither (the engine's 64² void-and-cluster mask, tiled) of luma in [0, 1]. */
export function dither1(lum: Float32Array, w: number, h: number): Bitmap {
  const mask = blueNoise(), N = BLUE_NOISE_SIZE, out = bitmap(w, h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (lum[y * w + x] > mask[(y % N) * N + (x % N)]) out.bits[y * out.stride + (x >> 3)] |= 0x80 >> (x & 7)
  return out
}

// ── WebP lossless (VP8L) ──
class BitWriter {
  private out: number[] = []; private cur = 0; private n = 0
  put(v: number, bits: number) { for (let i = 0; i < bits; i++) { this.cur |= ((v >>> i) & 1) << this.n; if (++this.n === 8) { this.out.push(this.cur); this.cur = 0; this.n = 0 } } }
  /** A prefix code is read MSB-first. */
  code(v: number, bits: number) { for (let i = bits - 1; i >= 0; i--) this.put((v >>> i) & 1, 1) }
  bytes() { const o = [...this.out]; if (this.n) o.push(this.cur); return Buffer.from(o) }
}
/** Normal prefix code: the first `lit` of `alphabet` symbols have length 8, the rest 0. */
function code8(bw: BitWriter, alphabet: number, lit: number) {
  bw.put(0, 1)                                     // normal code
  bw.put(12 - 4, 4)                                // 12 code-length-code lengths, order 17 18 0 1 2 3 4 5 16 6 7 8
  for (const sym of [17, 18, 0, 1, 2, 3, 4, 5, 16, 6, 7, 8]) bw.put(sym === 0 || sym === 8 ? 1 : 0, 3)
  bw.put(0, 1)                                     // max_symbol = alphabet
  for (let s = 0; s < alphabet; s++) bw.code(s < lit ? 1 : 0, 1)  // code-length symbols: '0' → 0, '1' → 8
}
const simple1 = (bw: BitWriter, sym: number) => { bw.put(1, 1); bw.put(0, 1); if (sym < 2) { bw.put(0, 1); bw.put(sym, 1) } else { bw.put(1, 1); bw.put(sym, 8) } }
/** VP8L bitstream (signature + header + image) of an RGB frame, opaque. */
export function vp8l(f: Frame): Buffer {
  if (f.w > 16384 || f.h > 16384) throw new Error('VP8L is limited to 16384²')
  const bw = new BitWriter()
  bw.put(0x2f, 8); bw.put(f.w - 1, 14); bw.put(f.h - 1, 14); bw.put(0, 1); bw.put(0, 3)
  bw.put(0, 1)                                     // no transforms
  bw.put(0, 1); bw.put(0, 1)                       // no colour cache, no meta prefix codes
  code8(bw, 256 + 24, 256); code8(bw, 256, 256); code8(bw, 256, 256); simple1(bw, 255); simple1(bw, 0)
  for (let i = 0; i < f.w * f.h; i++) { bw.code(f.rgb[i * 3 + 1], 8); bw.code(f.rgb[i * 3], 8); bw.code(f.rgb[i * 3 + 2], 8) }
  return bw.bytes()
}
const riffChunk = (type: string, data: Buffer) => {
  const h = Buffer.alloc(8); h.write(type, 0, 'latin1'); h.writeUInt32LE(data.length, 4)
  return Buffer.concat([h, data, data.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0)])
}
const riff = (body: Buffer) => { const h = Buffer.alloc(12); h.write('RIFF', 0, 'latin1'); h.writeUInt32LE(4 + body.length, 4); h.write('WEBP', 8, 'latin1'); return Buffer.concat([h, body]) }
const u24 = (b: Buffer, v: number, at: number) => { b[at] = v & 255; b[at + 1] = (v >> 8) & 255; b[at + 2] = (v >> 16) & 255 }
export const webp = (f: Frame): Buffer => riff(riffChunk('VP8L', vp8l(f)))
/** Animated lossless WebP (VP8X + ANIM + ANMF), every frame full-canvas, `delayMs` each, looping. */
export function webpAnim(frames: Frame[], delayMs: number): Buffer {
  const { w, h } = frames[0]
  const x = Buffer.alloc(10); x[0] = 0x02; u24(x, w - 1, 4); u24(x, h - 1, 7)                   // animation flag
  const anim = Buffer.alloc(6); anim.writeUInt32LE(0xff000000, 0); anim.writeUInt16LE(0, 4)    // black background, loop forever
  const parts = [riffChunk('VP8X', x), riffChunk('ANIM', anim)]
  for (const f of frames) {
    const head = Buffer.alloc(16); u24(head, 0, 0); u24(head, 0, 3); u24(head, w - 1, 6); u24(head, h - 1, 9); u24(head, Math.round(delayMs), 12); head[15] = 0x02  // no blend, no dispose
    parts.push(riffChunk('ANMF', Buffer.concat([head, riffChunk('VP8L', vp8l(f))])))
  }
  return riff(Buffer.concat(parts))
}
