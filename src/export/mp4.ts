/**
 * Minimal MP4 (ISO BMFF) muxer for one H.264 track from WebCodecs chunks in `avc` (length-prefixed)
 * format: ftyp, mdat, then moov with one sample per chunk (stts run-length, stss keyframes,
 * stsz, stco). `avcC` is the encoder's `decoderConfig.description`.
 */
import { Bytes, concat, ascii } from './bytes'
import type { VideoChunk } from './webm'

const box = (type: string, ...body: Uint8Array[]) => { const data = concat(body); return concat([new Bytes().u32be(data.length + 8).done(), ascii(type), data]) }
const full = (type: string, version: number, flags: number, ...body: Uint8Array[]) => box(type, new Bytes().u8(version).u8(flags >> 16).u16be(flags & 0xffff).done(), ...body)
const u32s = (...v: number[]) => { const b = new Bytes(); v.forEach(x => b.u32be(x)); return b.done() }
const MATRIX = u32s(0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000)

export function muxMP4(chunks: VideoChunk[], o: { width: number; height: number; avcC: Uint8Array; durationMs: number }): Uint8Array<ArrayBuffer> {
  const TS = 90000, toTs = (us: number) => Math.round((us * TS) / 1e6)
  const ftyp = box('ftyp', ascii('isom'), u32s(0x200), ascii('isomiso2avc1mp41'))
  const mdatHead = 8, payload = concat(chunks.map(c => c.data))
  const mdat = concat([new Bytes().u32be(payload.length + mdatHead).done(), ascii('mdat'), payload])
  const offsets: number[] = []
  let off = ftyp.length + mdatHead
  for (const c of chunks) { offsets.push(off); off += c.data.length }

  // sample durations from timestamps (last one from its own duration), run-length coded
  const deltas = chunks.map((c, i) => i + 1 < chunks.length ? toTs(chunks[i + 1].timestampUs) - toTs(c.timestampUs) : Math.max(1, toTs(c.durationUs)))
  const stts: number[] = []
  for (const d of deltas) { if (stts.length && stts[stts.length - 1] === d) stts[stts.length - 2]++; else stts.push(1, d) }
  const mediaDur = deltas.reduce((a, b) => a + b, 0), movieDur = Math.round(o.durationMs)
  const keys = chunks.flatMap((c, i) => c.key ? [i + 1] : [])

  const avc1 = box('avc1', new Uint8Array(6), new Bytes().u16be(1).u16be(0).u16be(0).done(), new Uint8Array(12),
    new Bytes().u16be(o.width).u16be(o.height).u32be(0x480000).u32be(0x480000).u32be(0).u16be(1).done(), new Uint8Array(32),
    new Bytes().u16be(0x18).u16be(0xffff).done(), box('avcC', o.avcC))
  const stbl = box('stbl',
    full('stsd', 0, 0, u32s(1), avc1),
    full('stts', 0, 0, u32s(stts.length / 2, ...stts)),
    full('stss', 0, 0, u32s(keys.length, ...keys)),
    full('stsc', 0, 0, u32s(1, 1, 1, 1)),
    full('stsz', 0, 0, u32s(0, chunks.length, ...chunks.map(c => c.data.length))),
    full('stco', 0, 0, u32s(chunks.length, ...offsets)))
  const minf = box('minf', full('vmhd', 0, 1, new Uint8Array(8)), box('dinf', full('dref', 0, 0, u32s(1), full('url ', 0, 1))), stbl)
  const mdia = box('mdia',
    full('mdhd', 0, 0, u32s(0, 0, TS, mediaDur), new Bytes().u16be(0x55c4).u16be(0).done()),
    full('hdlr', 0, 0, u32s(0), ascii('vide'), u32s(0, 0, 0), ascii('VideoHandler\0')),
    minf)
  const tkhd = full('tkhd', 0, 3, u32s(0, 0, 1, 0, movieDur, 0, 0), new Bytes().u16be(0).u16be(0).u16be(0).u16be(0).done(), MATRIX, u32s(o.width * 0x10000, o.height * 0x10000))
  const mvhd = full('mvhd', 0, 0, u32s(0, 0, 1000, movieDur, 0x10000), new Bytes().u16be(0x100).u16be(0).done(), u32s(0, 0), MATRIX, u32s(0, 0, 0, 0, 0, 0, 2))
  const moov = box('moov', mvhd, box('trak', tkhd, mdia))
  return concat([ftyp, mdat, moov])
}
