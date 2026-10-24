/**
 * PNG / APNG encoder: the port of `scripts/lib/raster.ts` `apng()` to `Uint8Array` + async deflate,
 * so the playground and the scripts share it. Opaque RGB (colour type 2). After the first frame only
 * the changed rectangle is stored (`fcTL` offset, dispose none, blend source); identical frames
 * extend the previous frame's delay instead of being stored again.
 */
import { Bytes, concat, crc32, diffBox, zlibDeflate, ascii, type RGBAFrame } from './bytes'

export const PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)

export function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const td = concat([ascii(type), data])
  return new Bytes().u32be(data.length).bytes(td).u32be(crc32(td)).done()
}
const ihdr = (w: number, h: number) => new Bytes().u32be(w).u32be(h).bytes([8, 2, 0, 0, 0]).done()

/** RGB scanlines (filter byte 0) of a sub-rectangle of an RGBA frame. */
function scanlines(f: RGBAFrame, x0 = 0, y0 = 0, w = f.width, h = f.height): Uint8Array {
  const out = new Uint8Array((w * 3 + 1) * h)
  let o = 0
  for (let y = 0; y < h; y++) {
    out[o++] = 0
    let i = ((y0 + y) * f.width + x0) * 4
    for (let x = 0; x < w; x++, i += 4) { out[o++] = f.data[i]; out[o++] = f.data[i + 1]; out[o++] = f.data[i + 2] }
  }
  return out
}

export async function encodePNG(f: RGBAFrame): Promise<Uint8Array> {
  return concat([PNG_SIGNATURE, pngChunk('IHDR', ihdr(f.width, f.height)), pngChunk('IDAT', await zlibDeflate(scanlines(f))), pngChunk('IEND', new Uint8Array(0))])
}

interface StoredFrame { x: number; y: number; w: number; h: number; delayMs: number; z: Uint8Array }

/** Incremental APNG: `add(frame, delayMs)` per frame, then `finish()`. Loops forever. */
export class APNGWriter {
  private frames: StoredFrame[] = []
  private prev: RGBAFrame | null = null
  readonly width: number
  readonly height: number
  constructor(width: number, height: number) { this.width = width; this.height = height }
  async add(f: RGBAFrame, delayMs: number) {
    const prev = this.prev
    const box = prev ? diffBox(prev, f) : { x: 0, y: 0, w: f.width, h: f.height }
    this.prev = { width: f.width, height: f.height, data: f.data.slice() }
    if (!box) { this.frames[this.frames.length - 1].delayMs += delayMs; return }
    this.frames.push({ ...box, delayMs, z: await zlibDeflate(scanlines(f, box.x, box.y, box.w, box.h)) })
  }
  /** Stored frame count (identical frames merged). */
  get count() { return this.frames.length }
  finish(): Uint8Array<ArrayBuffer> {
    const parts: Uint8Array[] = [PNG_SIGNATURE, pngChunk('IHDR', ihdr(this.width, this.height)), pngChunk('acTL', new Bytes().u32be(this.frames.length).u32be(0).done())]
    let seq = 0
    this.frames.forEach((f, i) => {
      // delays above 65.535 s would overflow u16 at 1/1000; drop to 1/100 resolution there
      const [num, den] = f.delayMs > 65535 ? [Math.round(f.delayMs / 10), 100] : [Math.round(f.delayMs), 1000]
      parts.push(pngChunk('fcTL', new Bytes().u32be(seq++).u32be(f.w).u32be(f.h).u32be(f.x).u32be(f.y).u16be(num).u16be(den).u8(0).u8(0).done()))
      parts.push(i === 0 ? pngChunk('IDAT', f.z) : pngChunk('fdAT', concat([new Bytes().u32be(seq++).done(), f.z])))
    })
    parts.push(pngChunk('IEND', new Uint8Array(0)))
    return concat(parts)
  }
}
