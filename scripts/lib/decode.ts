/**
 * Minimal readers for the export formats (test side only): APNG, GIF, WebM, MP4.
 * Enough to check structure, frame counts, durations and (APNG/GIF) pixels.
 */
import { inflateSync } from 'node:zlib'
import { crc32 } from '../../src/export/bytes'

export interface APNGInfo { width: number; height: number; frames: number; durationMs: number; crcOk: boolean; numPlays: number; first: Uint8Array /** RGB of the default image */ }
export function readAPNG(b: Uint8Array): APNGInfo {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  if (![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v)) throw new Error('not a PNG')
  let o = 8, width = 0, height = 0, frames = 0, durationMs = 0, crcOk = true, numPlays = -1
  const idat: Uint8Array[] = []
  while (o < b.length) {
    const len = dv.getUint32(o), type = String.fromCharCode(...b.subarray(o + 4, o + 8)), data = b.subarray(o + 8, o + 8 + len)
    if (crc32(b.subarray(o + 4, o + 8 + len)) !== dv.getUint32(o + 8 + len)) crcOk = false
    const d = new DataView(data.buffer, data.byteOffset, data.byteLength)
    if (type === 'IHDR') { width = d.getUint32(0); height = d.getUint32(4) }
    if (type === 'acTL') { frames = d.getUint32(0); numPlays = d.getUint32(4) }
    if (type === 'fcTL') { const num = d.getUint16(20), den = d.getUint16(22) || 100; durationMs += (num / den) * 1000 }
    if (type === 'IDAT') idat.push(data)
    o += 12 + len
    if (type === 'IEND') break
  }
  const raw = inflateSync(Buffer.concat(idat)), first = new Uint8Array(width * height * 3)
  for (let y = 0; y < height; y++) first.set(raw.subarray(y * (width * 3 + 1) + 1, (y + 1) * (width * 3 + 1)), y * width * 3)
  return { width, height, frames, durationMs, crcOk, numPlays, first }
}

export interface GIFInfo { width: number; height: number; frames: number; durationMs: number; loops: boolean; palette: number[][]; /** composited RGB of each frame */ pixels: Uint8Array[] }
export function readGIF(b: Uint8Array): GIFInfo {
  if (String.fromCharCode(...b.subarray(0, 6)) !== 'GIF89a') throw new Error('not GIF89a')
  const u16 = (o: number) => b[o] | (b[o + 1] << 8)
  const width = u16(6), height = u16(8), packed = b[10], palette: number[][] = []
  let o = 13
  if (packed & 0x80) { const n = 1 << ((packed & 7) + 1); for (let i = 0; i < n; i++) palette.push([b[o + i * 3], b[o + i * 3 + 1], b[o + i * 3 + 2]]); o += n * 3 }
  const canvas = new Uint8Array(width * height * 3), pixels: Uint8Array[] = []
  let frames = 0, durationMs = 0, loops = false
  const subBlocks = () => { const parts: number[] = []; while (b[o]) { parts.push(...b.subarray(o + 1, o + 1 + b[o])); o += b[o] + 1 } o++; return Uint8Array.from(parts) }
  for (;;) {
    const tag = b[o++]
    if (tag === 0x3b || tag === undefined) break
    if (tag === 0x21) {
      const label = b[o++]
      if (label === 0xf9) { durationMs += u16(o + 2) * 10; o += 6 }
      else { const data = subBlocks(); if (label === 0xff && String.fromCharCode(...data.subarray(0, 11)) === 'NETSCAPE2.0') loops = true }
      continue
    }
    if (tag !== 0x2c) throw new Error(`bad GIF block 0x${tag.toString(16)} at ${o - 1}`)
    const x = u16(o), y = u16(o + 2), w = u16(o + 4), h = u16(o + 6); o += 9
    const minCode = b[o++], idx = lzwDecode(subBlocks(), minCode, w * h)
    for (let i = 0; i < w * h; i++) { const c = palette[idx[i]], p = ((y + Math.floor(i / w)) * width + x + (i % w)) * 3; canvas[p] = c[0]; canvas[p + 1] = c[1]; canvas[p + 2] = c[2] }
    pixels.push(canvas.slice()); frames++
  }
  return { width, height, frames, durationMs, loops, palette, pixels }
}

/** Reference GIF LZW decoder (dictionary as prefix/suffix arrays). */
export function lzwDecode(data: Uint8Array, minCode: number, count: number): Uint8Array {
  const out = new Uint8Array(count), prefix = new Int16Array(4096), suffix = new Uint8Array(4096), len = new Uint16Array(4096)
  const clear = 1 << minCode, eoi = clear + 1
  for (let i = 0; i < clear; i++) { prefix[i] = -1; suffix[i] = i; len[i] = 1 }
  let size = minCode + 1, next = eoi + 1, prev = -1, pos = 0, acc = 0, bits = 0, p = 0
  const first = (code: number) => { while (prefix[code] >= 0) code = prefix[code]; return suffix[code] }
  const write = (code: number) => { const l = len[code]; for (let c = code, i = l - 1; i >= 0; i--, c = prefix[c]) out[pos + i] = suffix[c]; pos += l }
  while (pos < count) {
    while (bits < size) { acc |= (data[p++] ?? 0) << bits; bits += 8 }
    const code = acc & ((1 << size) - 1); acc >>>= size; bits -= size
    if (code === clear) { size = minCode + 1; next = eoi + 1; prev = -1; continue }
    if (code === eoi) break
    if (prev < 0) { write(code); prev = code; continue }
    const k = code < next ? first(code) : first(prev)
    if (next < 4096) { prefix[next] = prev; suffix[next] = k; len[next] = len[prev] + 1; next++ }
    write(code)
    prev = code
    if (next === 1 << size && size < 12) size++
  }
  if (pos !== count) throw new Error(`LZW decoded ${pos} of ${count} pixels`)
  return out
}

/** Walk EBML: Segment → Info.Duration (ms at TimecodeScale 1e6) and SimpleBlock count / keyframes. */
export function readWebM(b: Uint8Array): { durationMs: number; blocks: number; keys: number; codec: string; width: number; height: number } {
  const readId = (o: number) => { const l = Math.clz32(b[o]) - 23; let v = 0; for (let i = 0; i < l; i++) v = v * 256 + b[o + i]; return [v, l] }
  const readSize = (o: number) => { const l = Math.clz32(b[o]) - 23; let v = b[o] & (0xff >> l); for (let i = 1; i < l; i++) v = v * 256 + b[o + i]; return [v, l] }
  let durationMs = NaN, blocks = 0, keys = 0, codec = '', width = 0, height = 0
  const MASTERS = new Set([0x18538067, 0x1549a966, 0x1654ae6b, 0xae, 0xe0, 0x1f43b675])
  const walk = (o: number, end: number) => {
    while (o < end) {
      const [id, il] = readId(o), [size, sl] = readSize(o + il), d = o + il + sl
      if (MASTERS.has(id)) walk(d, d + size)
      else if (id === 0x4489) durationMs = size === 8 ? new DataView(b.buffer, b.byteOffset + d, 8).getFloat64(0) : new DataView(b.buffer, b.byteOffset + d, 4).getFloat32(0)
      else if (id === 0xa3) { blocks++; if (b[d + 3] & 0x80) keys++ }
      else if (id === 0x86) codec = String.fromCharCode(...b.subarray(d, d + size))
      else if (id === 0xb0 || id === 0xba) { let v = 0; for (let i = 0; i < size; i++) v = v * 256 + b[d + i]; if (id === 0xb0) width = v; else height = v }
      o = d + size
    }
  }
  walk(0, b.length)
  return { durationMs, blocks, keys, codec, width, height }
}

/** Walk ISO BMFF boxes: mvhd duration, stsz sample count, stss keyframes, avc1 size. */
export function readMP4(b: Uint8Array): { durationMs: number; samples: number; keys: number; width: number; height: number; boxes: string[] } {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), boxes: string[] = []
  let durationMs = NaN, samples = 0, keys = 0, width = 0, height = 0
  const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl'])
  const walk = (o: number, end: number) => {
    while (o + 8 <= end) {
      const size = dv.getUint32(o), type = String.fromCharCode(...b.subarray(o + 4, o + 8)), d = o + 8
      boxes.push(type)
      if (CONTAINERS.has(type)) walk(d, o + size)
      if (type === 'mvhd') durationMs = (dv.getUint32(d + 16) / dv.getUint32(d + 12)) * 1000
      if (type === 'stsz') samples = dv.getUint32(d + 8)
      if (type === 'stss') keys = dv.getUint32(d + 4)
      if (type === 'stsd') { width = dv.getUint16(d + 8 + 8 + 24); height = dv.getUint16(d + 8 + 8 + 26); boxes.push(String.fromCharCode(...b.subarray(d + 12, d + 16))) }
      if (size < 8) break
      o += size
    }
  }
  walk(0, b.length)
  return { durationMs, samples, keys, width, height, boxes }
}
