/**
 * TRMNL (OG, 800×480 1-bit e-paper): a tiny BYOS ("bring your own server") endpoint + a polling
 * source for a Private Plugin. The card is rasterised, inverted (dark dots on white paper) and
 * blue-noise dithered to 1 bit with the engine's void-and-cluster mask.
 *
 * Device API (docs.trmnl.com › DIY › BYOS): GET /api/setup (ID header → api_key), GET /api/display
 * (ID + Access-Token → { status: 0, image_url, filename, refresh_rate, ... }), POST /api/log.
 * Images: 800×480 1-bit BMP (48 062 B) or 1-bit PNG, ≤ 90 kB. `filename` changes only when the image does.
 * Private Plugin (polling strategy): GET /plugin.json → { image_url, title, ... } used by plugin/*.liquid.
 *
 *   npx tsx targets/trmnl/server.ts --card home-clock [--port 2300] [--public http://192.168.1.20:2300] [--token secret] [--refresh 900]
 */
import { createHash } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { pathToFileURL } from 'node:url'
import { args, cardRaster, irFrame, luma, PROGRAMS, resample } from '../lib/frame'
import { bmp1, dither1, png1, type Bitmap } from '../lib/image'

export const TRMNL_W = 800, TRMNL_H = 480

/** The 1-bit screen for a card (or IR program name) at time t. */
export function trmnlBitmap(src: { card?: string; ir?: string; t: number; invert?: boolean; data?: Record<string, number> }): Bitmap {
  let lum: Float32Array
  if (src.ir) lum = luma(irFrame(PROGRAMS[src.ir] ?? src.ir, TRMNL_W, TRMNL_H, src.t, { data: src.data }))
  else {
    const raster = cardRaster(src.card ?? 'home-clock', src.t, 3, src.data)
    lum = luma(resample(raster, TRMNL_W, TRMNL_H, 'contain'))
  }
  if (src.invert ?? true) for (let i = 0; i < lum.length; i++) lum[i] = 1 - lum[i]
  return dither1(lum, TRMNL_W, TRMNL_H)
}

export interface TrmnlOptions { card?: string; ir?: string; publicUrl: string; token?: string; refresh?: number; now?: () => number; data?: Record<string, number> }

/** Request handler (exported for the fake-device test). */
export function trmnlHandler(o: TrmnlOptions) {
  const now = o.now ?? (() => Date.now() / 1000)
  let cache: { t: number; bmp: Buffer; png: Buffer; name: string } | null = null
  const image = () => {
    const t = Math.floor(now() / 60) * 60  // one image per minute is plenty for e-paper
    if (!cache || cache.t !== t) {
      const b = trmnlBitmap({ card: o.card, ir: o.ir, t, data: o.data }), bmp = bmp1(b)
      cache = { t, bmp, png: png1(b), name: `dot480-${createHash('sha1').update(bmp).digest('hex').slice(0, 12)}` }
    }
    return cache
  }
  const json = (res: ServerResponse, code: number, body: unknown) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
  return (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://x'), id = req.headers['id']
    const authed = !o.token || req.headers['access-token'] === o.token
    switch (url.pathname) {
      case '/api/setup':
        return id ? json(res, 200, { status: 200, api_key: o.token ?? 'dot480', friendly_id: 'DOT480', image_url: `${o.publicUrl}/image.bmp`, message: 'Dot/480 BYOS' }) : json(res, 404, { status: 404, message: 'missing ID header' })
      case '/api/display': {
        if (!authed) return json(res, 401, { status: 401, message: 'bad Access-Token' })
        const img = image()
        return json(res, 200, { status: 0, image_url: `${o.publicUrl}/image.bmp?v=${img.name}`, filename: img.name, refresh_rate: o.refresh ?? 900, reset_firmware: false, update_firmware: false, firmware_url: null, special_function: 'none' })
      }
      case '/api/log': req.resume(); res.writeHead(204); return res.end()
      case '/image.bmp': res.writeHead(200, { 'content-type': 'image/bmp', 'content-length': image().bmp.length }); return res.end(image().bmp)
      case '/image.png': res.writeHead(200, { 'content-type': 'image/png', 'content-length': image().png.length }); return res.end(image().png)
      case '/plugin.json': return json(res, 200, { title: o.card ?? o.ir ?? 'Dot/480', image_url: `${o.publicUrl}/image.png?v=${image().name}`, updated_at: new Date(image().t * 1000).toISOString() })
      default: return json(res, 404, { status: 404 })
    }
  }
}

function main() {
  const a = args(), port = +(a.port ?? 2300)
  const server = createServer(trmnlHandler({ card: a.card, ir: a.ir, publicUrl: a.public ?? `http://localhost:${port}`, token: a.token, refresh: a.refresh ? +a.refresh : undefined, data: a.data ? JSON.parse(a.data) : undefined }))
  server.listen(port, () => console.log(`TRMNL BYOS on :${port} — point the device's custom server at ${a.public ?? `http://<this-ip>:${port}`}`))
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
