/**
 * Tronbyt / Tidbyt (64×32 HUB75): a card or IR program as an animated lossless WebP (hand-written
 * VP8L encoder in ../lib/image.ts, no deps), written to a file and/or pushed with the Tidbyt-style push
 * API that Tronbyt server also serves: `POST <base>/v0/devices/<id>/push` with
 * `{ image: <base64 webp>, installationID, background }` and `Authorization: Bearer <key>`.
 * Tidbyt itself was acquihired (no new hardware): treat it as a frozen installed base; Tronbyt is the live path.
 *
 *   npx tsx targets/tronbyt/tronbyt.ts --card home-clock --out clock.webp [--seconds 4 --fps 10]
 *   npx tsx targets/tronbyt/tronbyt.ts --ir plasma --base http://tronbyt.local:8000 --device <id> --key <api key> [--install dot480]
 */
import { writeFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { pathToFileURL } from 'node:url'
import { args, frameSource, type Frame } from '../lib/frame'
import { webpAnim } from '../lib/image'

export const TRONBYT_W = 64, TRONBYT_H = 32

/** Frames t = 0, 1/fps, … < seconds, encoded as one looping animated WebP. */
export function tronbytWebp(frame: (t: number) => Frame, seconds = 3, fps = 10): Buffer {
  const n = Math.max(1, Math.round(seconds * fps))
  return webpAnim(Array.from({ length: n }, (_, i) => frame(i / fps)), 1000 / fps)
}

/** Push one WebP. Resolves with the HTTP status. */
export function pushWebp(base: string, device: string, key: string, image: Buffer, opts: { installationID?: string; background?: boolean } = {}): Promise<number> {
  const url = new URL(`/v0/devices/${encodeURIComponent(device)}/push`, base)
  const body = JSON.stringify({ image: image.toString('base64'), installationID: opts.installationID ?? 'dot480', background: opts.background ?? false })
  const req = url.protocol === 'https:' ? httpsRequest : httpRequest
  return new Promise((res, rej) => {
    const r = req(url, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, s => { s.resume(); s.on('end', () => res(s.statusCode ?? 0)) })
    r.on('error', rej); r.setTimeout(10000, () => r.destroy(new Error('timeout')))
    r.end(body)
  })
}

async function main() {
  const a = args()
  if (!a.out && !(a.base && a.device && a.key)) { console.error('usage: tronbyt.ts (--card <id> | --ir <name>) [--out file.webp] [--base <url> --device <id> --key <key>] [--seconds 3 --fps 10]'); process.exit(2) }
  const img = tronbytWebp(frameSource(a, TRONBYT_W, TRONBYT_H), +(a.seconds ?? 3), +(a.fps ?? 10))
  if (a.out) { writeFileSync(a.out, img); console.log(`${a.out}: ${img.length} B`) }
  if (a.base) console.log(`push → ${a.base}: HTTP ${await pushWebp(a.base, a.device, a.key, img, { installationID: a.install, background: a.background === 'true' })}`)
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) void main()
