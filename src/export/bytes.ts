/**
 * Byte plumbing shared by the in-repo encoders and muxers (APNG, GIF, WebM, MP4).
 * Plain TypeScript, no Node `Buffer`, so the same code runs in the browser and in the scripts.
 */

/** Growable byte buffer with big- and little-endian writers. */
export class Bytes {
  buf = new Uint8Array(1024)
  length = 0
  private need(n: number) {
    if (this.length + n <= this.buf.length) return
    let size = this.buf.length * 2
    while (size < this.length + n) size *= 2
    const next = new Uint8Array(size); next.set(this.buf.subarray(0, this.length)); this.buf = next
  }
  u8(v: number) { this.need(1); this.buf[this.length++] = v & 0xff; return this }
  u16be(v: number) { return this.u8(v >>> 8).u8(v) }
  u16le(v: number) { return this.u8(v).u8(v >>> 8) }
  u32be(v: number) { return this.u16be(v >>> 16).u16be(v & 0xffff) }
  bytes(b: Uint8Array | readonly number[]) { this.need(b.length); this.buf.set(b, this.length); this.length += b.length; return this }
  ascii(s: string) { for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i)); return this }
  done(): Uint8Array<ArrayBuffer> { return this.buf.slice(0, this.length) }
}

export const concat = (parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}
export const ascii = (s: string) => Uint8Array.from(s, c => c.charCodeAt(0))

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
export function crc32(bytes: Uint8Array, seed = 0): number {
  let c = ~seed >>> 0
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return ~c >>> 0
}

/** zlib (RFC 1950) deflate: `CompressionStream` where available (browsers, Node ≥ 18), else stored blocks. */
export async function zlibDeflate(data: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream !== 'undefined') {
    const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream('deflate'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  }
  return zlibStored(data)
}
/** Uncompressed zlib stream (valid, large); the fallback for runtimes without `CompressionStream`. */
export function zlibStored(data: Uint8Array): Uint8Array {
  const b = new Bytes().u8(0x78).u8(0x01)
  for (let o = 0; o === 0 || o < data.length; o += 65535) {
    const n = Math.min(65535, data.length - o)
    b.u8(o + n >= data.length ? 1 : 0).u16le(n).u16le(~n & 0xffff).bytes(data.subarray(o, o + n))
  }
  let a = 1, s = 0
  for (let i = 0; i < data.length; i++) { a = (a + data[i]) % 65521; s = (s + a) % 65521 }
  return b.u32be(((s << 16) | a) >>> 0).done()
}

/** One RGBA frame (an `ImageData` fits). */
export interface RGBAFrame { width: number; height: number; data: Uint8ClampedArray | Uint8Array }

/** Bounding box of pixels that differ between two same-size frames, or null when identical. */
export function diffBox(a: RGBAFrame, b: RGBAFrame): { x: number; y: number; w: number; h: number } | null {
  const { width: w, height: h } = a
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4
    if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

/** Per-frame delays in `unit`s whose running sum stays on the exact clock (no drift at 30 fps in centiseconds). */
export const frameDelays = (frames: number, fps: number, unitsPerSecond: number) =>
  Array.from({ length: frames }, (_, i) => Math.round(((i + 1) * unitsPerSecond) / fps) - Math.round((i * unitsPerSecond) / fps))
