/**
 * Tiny RGB raster + PNG/APNG encoder for the headless instruments (snap, fidelity, bench).
 * Node built-ins only; nothing here is imported by the engine or the app.
 */
import { deflateSync } from 'node:zlib'
import { glyph } from '../../src/engine/fields/bitmapFont'
import { insideJoined, insideRect } from '../../src/engine/squares/geometry'
import type { JointGeom } from '../../src/engine/types'

export function rgb(color: string): number[] {
  const m = color.match(/^#([0-9a-f]{6})$/i); if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16))
  const r = color.match(/rgba?\(([^)]+)\)/); if (r) return r[1].split(',').slice(0, 3).map(Number)
  return [255, 0, 255]
}

export class Raster {
  data: Float32Array
  constructor(public w: number, public h: number, bg: string | number[] = '#000000') {
    this.data = new Float32Array(w * h * 3)
    const [r, g, b] = typeof bg === 'string' ? rgb(bg) : bg
    for (let i = 0; i < w * h; i++) this.data.set([r, g, b], i * 3)
  }
  blend(x: number, y: number, [r, g, b]: number[], a: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return
    const i = (y * this.w + x) * 3, d = this.data
    d[i] += (r - d[i]) * a; d[i + 1] += (g - d[i + 1]) * a; d[i + 2] += (b - d[i + 2]) * a
  }
  /** Superellipse dot, 4×4 supersampled. */
  dot(cx: number, cy: number, r: number, n: number, color: string, alpha: number) {
    const c = rgb(color)
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      let hit = 0
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        const dx = Math.abs((x + (sx + .5) / 4 - cx) / r), dy = Math.abs((y + (sy + .5) / 4 - cy) / r)
        if (dx ** n + dy ** n <= 1) hit++
      }
      this.blend(x, y, c, (hit / 16) * alpha)
    }
  }
  /**
   * Coverage of a joined square cell (squares Q1), 4×4 supersampled through the CPU reference `insideJoined`, added
   * into `cov` (one value per raster pixel). Joined neighbours share a colour and opacity, so a group's coverage is
   * summed and blended once (`blendCoverage`), like Canvas's one fill per path: no seam. Raster px throughout.
   */
  coverJoined(cov: Float32Array, cx: number, cy: number, s: number, mask: number, g: JointGeom, hs = s) {
    const rx = Math.max(g.hx, s) + 1, ry = Math.max(g.hy, hs) + 1
    for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(this.h - 1, Math.ceil(cy + ry)); y++) for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(this.w - 1, Math.ceil(cx + rx)); x++) {
      let hit = 0
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) if (insideJoined(x + (sx + .5) / 4, y + (sy + .5) / 4, cx, cy, s, g, mask, hs)) hit++
      if (hit) cov[y * this.w + x] += hit / 16
    }
  }
  /** Coverage of a plain rect cell (squares Q2: half sides sx × sy, exponent n, Infinity = square), the anisotropic dot, 4×4 supersampled. */
  coverRect(cov: Float32Array, cx: number, cy: number, sx: number, sy: number, n: number) {
    for (let y = Math.max(0, Math.floor(cy - sy - 1)); y <= Math.min(this.h - 1, Math.ceil(cy + sy + 1)); y++) for (let x = Math.max(0, Math.floor(cx - sx - 1)); x <= Math.min(this.w - 1, Math.ceil(cx + sx + 1)); x++) {
      let hit = 0
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if (insideRect(x + (i + .5) / 4, y + (j + .5) / 4, cx, cy, sx, sy, n)) hit++
      if (hit) cov[y * this.w + x] += hit / 16
    }
  }
  /** Blend a coverage map (clamped to 1) in one colour at `alpha`. */
  blendCoverage(cov: Float32Array, color: string, alpha: number) {
    const c = rgb(color)
    for (let i = 0; i < cov.length; i++) if (cov[i] > 0) this.blend(i % this.w, Math.floor(i / this.w), c, Math.min(1, cov[i]) * alpha)
  }
  rect(x0: number, y0: number, w: number, h: number, color: string, radius = 0, stroke?: string) {
    const c = rgb(color), s = stroke ? rgb(stroke) : null
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const dx = Math.max(0, Math.max(x0 + radius - x - .5, x + .5 - (x0 + w - radius))), dy = Math.max(0, Math.max(y0 + radius - y - .5, y + .5 - (y0 + h - radius)))
      const d = Math.hypot(dx, dy) - radius
      if (d > .5) continue
      this.blend(x, y, c, 1)
      if (s && d > -1.5) this.blend(x, y, s, 1)
    }
  }
  paste(src: Raster, ox: number, oy: number) { for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) { const i = (y * src.w + x) * 3; this.blend(ox + x, oy + y, [src.data[i], src.data[i + 1], src.data[i + 2]], 1) } }
  /** Sub-rectangle (clamped to the raster). */
  crop(x0: number, y0: number, w: number, h: number): Raster {
    const out = new Raster(w, h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sx = Math.max(0, Math.min(this.w - 1, x0 + x)), sy = Math.max(0, Math.min(this.h - 1, y0 + y)), i = (sy * this.w + sx) * 3, o = (y * w + x) * 3
      out.data[o] = this.data[i]; out.data[o + 1] = this.data[i + 1]; out.data[o + 2] = this.data[i + 2]
    }
    return out
  }
  /**
   * Gaussian blur approximated by 3 separable box passes (Kutskir's boxes-for-gauss sizes),
   * `sigma` in output pixels — the squint test.
   */
  blur(sigma: number): Raster {
    const out = new Raster(this.w, this.h); out.data.set(this.data)
    const tmp = new Float32Array(out.data.length)
    for (const size of boxesForGauss(sigma, 3)) { const r = (size - 1) / 2; boxH(out.data, tmp, this.w, this.h, r); boxV(tmp, out.data, this.w, this.h, r) }
    return out
  }
  /** 5×7 engine glyphs, `scale` px per font pixel (labels on contact/bar sheets). */
  text(str: string, x0: number, y0: number, color = '#8A8F98', scale = 2) {
    const c = rgb(color)
    ;[...str].forEach((ch, k) => glyph(ch).forEach((row, gy) => row.forEach((on, gx) => {
      if (on) for (let y = 0; y < scale; y++) for (let x = 0; x < scale; x++) this.blend(x0 + (k * 6 + gx) * scale + x, y0 + gy * scale + y, c, 1)
    })))
  }
  /** Raw scanlines with filter byte 0, as PNG IDAT wants them. */
  scanlines(): Buffer {
    const raw = Buffer.alloc((this.w * 3 + 1) * this.h)
    for (let y = 0; y < this.h; y++) { raw[y * (this.w * 3 + 1)] = 0; for (let x = 0; x < this.w * 3; x++) raw[y * (this.w * 3 + 1) + 1 + x] = Math.max(0, Math.min(255, Math.round(this.data[y * this.w * 3 + x]))) }
    return raw
  }
  png(): Buffer { return Buffer.concat([PNG_SIG, chunk('IHDR', ihdr(this.w, this.h)), chunk('IDAT', deflateSync(this.scanlines())), chunk('IEND', Buffer.alloc(0))]) }
}

function boxesForGauss(sigma: number, n: number): number[] {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1)
  let wl = Math.floor(wIdeal); if (wl % 2 === 0) wl--
  const wu = wl + 2, m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4))
  return Array.from({ length: n }, (_, i) => (i < m ? wl : wu))
}
/** Running-sum box blur along x with edge clamping (3 channels). */
function boxH(src: Float32Array, dst: Float32Array, w: number, h: number, r: number) {
  const k = 1 / (2 * r + 1)
  for (let y = 0; y < h; y++) for (let ch = 0; ch < 3; ch++) {
    const at = (x: number) => src[(y * w + Math.max(0, Math.min(w - 1, x))) * 3 + ch]
    let acc = 0; for (let x = -r; x <= r; x++) acc += at(x)
    for (let x = 0; x < w; x++) { dst[(y * w + x) * 3 + ch] = acc * k; acc += at(x + r + 1) - at(x - r) }
  }
}
function boxV(src: Float32Array, dst: Float32Array, w: number, h: number, r: number) {
  const k = 1 / (2 * r + 1)
  for (let x = 0; x < w; x++) for (let ch = 0; ch < 3; ch++) {
    const at = (y: number) => src[(Math.max(0, Math.min(h - 1, y)) * w + x) * 3 + ch]
    let acc = 0; for (let y = -r; y <= r; y++) acc += at(y)
    for (let y = 0; y < h; y++) { dst[(y * w + x) * 3 + ch] = acc * k; acc += at(y + r + 1) - at(y - r) }
  }
}

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const ihdr = (w: number, h: number) => { const b = Buffer.alloc(13); b.writeUInt32BE(w, 0); b.writeUInt32BE(h, 4); b.set([8, 2, 0, 0, 0], 8); return b }
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc32 = (buf: Buffer) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function chunk(type: string, data: Buffer) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]) }

/** Animated PNG: every frame full-size, `delayMs` each, looping forever. Frames must share a size. */
export function apng(frames: Raster[], delayMs: number): Buffer {
  const { w, h } = frames[0], parts: Buffer[] = [PNG_SIG, chunk('IHDR', ihdr(w, h))]
  const actl = Buffer.alloc(8); actl.writeUInt32BE(frames.length, 0); actl.writeUInt32BE(0, 4); parts.push(chunk('acTL', actl))
  let seq = 0
  frames.forEach((f, i) => {
    const fc = Buffer.alloc(26)
    fc.writeUInt32BE(seq++, 0); fc.writeUInt32BE(w, 4); fc.writeUInt32BE(h, 8); fc.writeUInt32BE(0, 12); fc.writeUInt32BE(0, 16)
    fc.writeUInt16BE(Math.round(delayMs), 20); fc.writeUInt16BE(1000, 22); fc[24] = 0; fc[25] = 0
    parts.push(chunk('fcTL', fc))
    const z = deflateSync(f.scanlines())
    if (i === 0) parts.push(chunk('IDAT', z))
    else { const s = Buffer.alloc(4); s.writeUInt32BE(seq++); parts.push(chunk('fdAT', Buffer.concat([s, z]))) }
  })
  parts.push(chunk('IEND', Buffer.alloc(0)))
  return Buffer.concat(parts)
}
