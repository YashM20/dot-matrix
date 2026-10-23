/**
 * WLED realtime over DDP (Distributed Display Protocol, UDP 4048): RGB frames from a card or an IR
 * program at the matrix resolution. WLED shows DDP immediately (realtime mode) and returns to its
 * own effects ~2.5 s after the last packet.
 *
 * Header (10 bytes): flags (0x40 = v1, 0x01 = push on the last packet of a frame), sequence (1-15),
 * data type (0x0B = RGB, 8 bits per channel), destination id (1 = default output),
 * data offset in bytes (u32 BE), data length (u16 BE). Payload ≤ 1440 bytes (480 RGB pixels).
 *
 *   npx tsx targets/wled/ddp.ts --host 192.168.1.50 --w 32 --h 8 --card home-clock [--fps 30] [--serpentine] [--seconds 60]
 *   npx tsx targets/wled/ddp.ts --host wled.local --w 16 --h 16 --ir plasma
 */
import { createSocket } from 'node:dgram'
import { pathToFileURL } from 'node:url'
import { args, frameSource, serpentine, type Frame } from '../lib/frame'

export const DDP_PORT = 4048
export const DDP_MAX_DATA = 1440
export const DDP_VER1 = 0x40, DDP_PUSH = 0x01, DDP_TYPE_RGB24 = 0x0b, DDP_ID_DISPLAY = 1

/** Split one RGB frame into DDP packets; the last one carries the push flag. `seq` 1…15 (0 = unused). */
export function ddpPackets(rgb: Uint8Array, seq: number, maxData = DDP_MAX_DATA): Buffer[] {
  const out: Buffer[] = [], step = maxData - (maxData % 3)
  for (let off = 0; off < rgb.length || off === 0; off += step) {
    const len = Math.min(step, rgb.length - off), last = off + len >= rgb.length
    const p = Buffer.alloc(10 + len)
    p[0] = DDP_VER1 | (last ? DDP_PUSH : 0); p[1] = seq & 0x0f; p[2] = DDP_TYPE_RGB24; p[3] = DDP_ID_DISPLAY
    p.writeUInt32BE(off, 4); p.writeUInt16BE(len, 8)
    p.set(rgb.subarray(off, off + len), 10)
    out.push(p)
    if (last) break
  }
  return out
}

/** Parse a DDP header (for tests and debugging). */
export const parseDDP = (p: Buffer) => ({ version: p[0] >> 6, push: (p[0] & DDP_PUSH) !== 0, seq: p[1] & 0x0f, type: p[2], id: p[3], offset: p.readUInt32BE(4), length: p.readUInt16BE(8), data: p.subarray(10) })

export interface DDPSender { send(f: Frame): Promise<void>; close(): void; readonly frames: number }
/** UDP sender; `serpentine` re-orders rows for zig-zag wired matrices when WLED's 2D mapping isn't set. */
export function ddpSender(host: string, opts: { port?: number; serpentine?: boolean } = {}): DDPSender {
  const sock = createSocket('udp4'), port = opts.port ?? DDP_PORT
  let seq = 0, frames = 0
  return {
    get frames() { return frames },
    async send(f) {
      const frame = opts.serpentine ? serpentine(f) : f
      seq = (seq % 15) + 1
      for (const p of ddpPackets(frame.rgb, seq)) await new Promise<void>((res, rej) => sock.send(p, port, host, e => (e ? rej(e) : res())))
      frames++
    },
    close: () => sock.close(),
  }
}

async function main() {
  const a = args()
  if (!a.host) { console.error('usage: ddp.ts --host <wled ip> --w 32 --h 8 (--card <id> | --ir <name|source>) [--fps 30] [--serpentine] [--seconds N]'); process.exit(2) }
  const w = +(a.w ?? 32), h = +(a.h ?? 8), fps = +(a.fps ?? 30), seconds = +(a.seconds ?? Infinity)
  const frame = frameSource(a, w, h), tx = ddpSender(a.host, { port: a.port ? +a.port : undefined, serpentine: a.serpentine === 'true' })
  const t0 = performance.now()
  console.log(`DDP → ${a.host}:${a.port ?? DDP_PORT}, ${w}×${h} @ ${fps} fps`)
  for (;;) {
    const t = (performance.now() - t0) / 1000
    if (t > seconds) break
    await tx.send(frame(t))
    const next = t0 + tx.frames * (1000 / fps)
    await new Promise(r => setTimeout(r, Math.max(0, next - performance.now())))
  }
  tx.close()
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) void main()
