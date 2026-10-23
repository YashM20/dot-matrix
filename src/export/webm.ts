/**
 * Minimal WebM (Matroska subset) muxer for one VP8/VP9 video track from WebCodecs chunks.
 * Everything is in memory, so every element size is exact: EBML header, Segment { Info (with
 * Duration), Tracks, Clusters of SimpleBlocks }. A cluster starts at each keyframe (and before the
 * int16 block timecode would overflow).
 */
import { Bytes, concat, ascii } from './bytes'

/** An encoded frame, independent of WebCodecs so the muxers run in Node too. */
export interface VideoChunk { data: Uint8Array; timestampUs: number; durationUs: number; key: boolean }

const idBytes = (id: number) => { const b: number[] = []; for (let v = id; v > 0; v = Math.floor(v / 256)) b.unshift(v & 0xff); return Uint8Array.from(b) }
/** EBML variable-size integer (data size), shortest form. */
function vint(n: number): Uint8Array {
  for (let len = 1; len <= 8; len++) if (n < 2 ** (7 * len) - 1) {
    const out = new Uint8Array(len)
    let v = n
    for (let i = len - 1; i >= 0; i--) { out[i] = v & 0xff; v = Math.floor(v / 256) }
    out[0] |= 1 << (8 - len)
    return out
  }
  throw new Error('EBML size too large')
}
const el = (id: number, data: Uint8Array) => concat([idBytes(id), vint(data.length), data])
const master = (id: number, ...children: Uint8Array[]) => el(id, concat(children))
const uint = (id: number, v: number) => { const b: number[] = []; let x = v; do { b.unshift(x & 0xff); x = Math.floor(x / 256) } while (x > 0); return el(id, Uint8Array.from(b)) }
const str = (id: number, s: string) => el(id, ascii(s))
const f64 = (id: number, v: number) => { const d = new DataView(new ArrayBuffer(8)); d.setFloat64(0, v); return el(id, new Uint8Array(d.buffer)) }

export const WEBM_IDS = { EBML: 0x1a45dfa3, Segment: 0x18538067, Info: 0x1549a966, Duration: 0x4489, TimecodeScale: 0x2ad7b1, Tracks: 0x1654ae6b, Cluster: 0x1f43b675, Timecode: 0xe7, SimpleBlock: 0xa3 }

export function muxWebM(chunks: VideoChunk[], o: { width: number; height: number; codec: 'V_VP8' | 'V_VP9'; durationMs: number }): Uint8Array<ArrayBuffer> {
  const header = master(WEBM_IDS.EBML, uint(0x4286, 1), uint(0x42f7, 1), uint(0x42f2, 4), uint(0x42f3, 8), str(0x4282, 'webm'), uint(0x4287, 4), uint(0x4285, 2))
  const info = master(WEBM_IDS.Info, uint(WEBM_IDS.TimecodeScale, 1_000_000), str(0x4d80, 'dot480'), str(0x5741, 'dot480'), f64(WEBM_IDS.Duration, o.durationMs))
  const tracks = master(WEBM_IDS.Tracks, master(0xae, uint(0xd7, 1), uint(0x73c5, 1), uint(0x83, 1), uint(0x9c, 0), str(0x86, o.codec), master(0xe0, uint(0xb0, o.width), uint(0xba, o.height))))
  const clusters: Uint8Array[] = []
  let blocks: Uint8Array[] = [], clusterMs = -1
  const flush = () => { if (blocks.length) clusters.push(master(WEBM_IDS.Cluster, uint(WEBM_IDS.Timecode, clusterMs), ...blocks)); blocks = [] }
  for (const c of chunks) {
    const ms = Math.round(c.timestampUs / 1000)
    if (clusterMs < 0 || c.key || ms - clusterMs > 30000) { flush(); clusterMs = ms }
    const head = new Bytes().u8(0x81).u16be((ms - clusterMs) & 0xffff).u8(c.key ? 0x80 : 0).done()
    blocks.push(el(WEBM_IDS.SimpleBlock, concat([head, c.data])))
  }
  flush()
  return concat([header, master(WEBM_IDS.Segment, info, tracks, ...clusters)])
}
