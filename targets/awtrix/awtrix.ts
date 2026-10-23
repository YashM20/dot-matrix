/**
 * AWTRIX NG (default) and AWTRIX 3 (archived, `--api 3`) on the Ulanzi TC001 and other 32×8 ESP32
 * clocks: a card or IR program as a pushed custom app. AWTRIX NG is PolyForm Noncommercial 1.0.0.
 *
 * NG (blueforcer.github.io/awtrix-ng › esp32 › reference/payload, migrating-from-awtrix3):
 *   `PUT /api/v1/apps/pushed/<app>` or MQTT `<prefix>/cmd/apps/pushed/<app>`, body
 *   `{ "draw": [["bitmap", x, y, w, h, "<base64 RGB888>"]], "lifetimeMs", "durationMs" }`, ≤ 8192 bytes
 *   (413 otherwise), `Content-Type: application/json`, app names [A-Za-z0-9_-]{1,32}.
 * AWTRIX 3: `POST /api/custom?name=<app>` or MQTT `<prefix>/custom/<app>`, `{ "draw": [{ "db": [x, y, w, h, [RGB888 ints]] }] }`.
 * MQTT is a hand-written 3.1.1 client (CONNECT / CONNACK / PUBLISH QoS 0 / PINGREQ / DISCONNECT).
 *
 *   npx tsx targets/awtrix/awtrix.ts --host 192.168.1.60 --card home-clock [--app dot480] [--fps 4] [--api 3]
 *   npx tsx targets/awtrix/awtrix.ts --mqtt 192.168.1.10 --prefix awtrix_abc123 --ir plasma [--user u --pass p]
 */
import { request } from 'node:http'
import { connect, type Socket } from 'node:net'
import { pathToFileURL } from 'node:url'
import { args, frameSource, type Frame } from '../lib/frame'

export const AWTRIX_W = 32, AWTRIX_H = 8, AWTRIX_MAX_BODY = 8192
export type AwtrixAPI = 'ng' | '3'
const APP_NAME = /^[A-Za-z0-9_-]{1,32}$/

/** Pushed-app JSON for one frame. `lifetime` (s): the clock drops the app this long after the last update. */
export function awtrixPayload(f: Frame, opts: { lifetime?: number; duration?: number; api?: AwtrixAPI } = {}): string {
  const lifetime = opts.lifetime ?? 30, duration = opts.duration ?? 10
  if ((opts.api ?? 'ng') === 'ng') {
    const body = JSON.stringify({ draw: [['bitmap', 0, 0, f.w, f.h, Buffer.from(f.rgb).toString('base64')]], lifetimeMs: lifetime * 1000, durationMs: duration * 1000 })
    if (body.length > AWTRIX_MAX_BODY) throw new Error(`AWTRIX NG body ${body.length} B > ${AWTRIX_MAX_BODY}`)
    return body
  }
  const px: number[] = []
  for (let i = 0; i < f.w * f.h; i++) px.push((f.rgb[i * 3] << 16) | (f.rgb[i * 3 + 1] << 8) | f.rgb[i * 3 + 2])
  return JSON.stringify({ draw: [{ db: [0, 0, f.w, f.h, px] }], lifetime, duration })
}

export const awtrixTopic = (prefix: string, app: string, api: AwtrixAPI = 'ng') => (api === 'ng' ? `${prefix}/cmd/apps/pushed/${app}` : `${prefix}/custom/${app}`)

/** HTTP transport: NG `PUT /api/v1/apps/pushed/<app>`, AWTRIX 3 `POST /api/custom?name=<app>`. Resolves with the status code. */
export function postCustom(host: string, app: string, body: string, port = 80, api: AwtrixAPI = 'ng'): Promise<number> {
  if (!APP_NAME.test(app)) return Promise.reject(new Error(`bad app name "${app}"`))
  return new Promise((res, rej) => {
    const req = request({ host, port, method: api === 'ng' ? 'PUT' : 'POST', path: api === 'ng' ? `/api/v1/apps/pushed/${app}` : `/api/custom?name=${app}`, headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, r => { r.resume(); r.on('end', () => res(r.statusCode ?? 0)) })
    req.on('error', rej); req.setTimeout(5000, () => req.destroy(new Error('timeout')))
    req.end(body)
  })
}

// ── minimal MQTT 3.1.1 (publish only) ──
const varint = (n: number) => { const o: number[] = []; do { let b = n % 128; n = Math.floor(n / 128); if (n > 0) b |= 128; o.push(b) } while (n > 0); return Buffer.from(o) }
const str = (s: string) => { const b = Buffer.from(s, 'utf8'), h = Buffer.alloc(2); h.writeUInt16BE(b.length); return Buffer.concat([h, b]) }
const packet = (type: number, body: Buffer) => Buffer.concat([Buffer.from([type]), varint(body.length), body])
export const mqttConnect = (clientId: string, o: { user?: string; pass?: string; keepAlive?: number } = {}) => {
  const flags = 0x02 | (o.user !== undefined ? 0x80 : 0) | (o.pass !== undefined ? 0x40 : 0), ka = Buffer.alloc(2); ka.writeUInt16BE(o.keepAlive ?? 60)
  return packet(0x10, Buffer.concat([str('MQTT'), Buffer.from([4, flags]), ka, str(clientId), ...(o.user !== undefined ? [str(o.user)] : []), ...(o.pass !== undefined ? [str(o.pass)] : [])]))
}
export const mqttPublish = (topic: string, payload: Buffer | string, retain = false) => packet(0x30 | (retain ? 1 : 0), Buffer.concat([str(topic), Buffer.from(payload)]))
export const MQTT_PINGREQ = Buffer.from([0xc0, 0]), MQTT_DISCONNECT = Buffer.from([0xe0, 0])

export interface MQTTClient { publish(topic: string, payload: string | Buffer): Promise<void>; close(): Promise<void> }
/** Connect (waits for CONNACK return code 0), then publish QoS 0 messages. Pings every keepAlive/2 s. */
export function mqttClient(host: string, opts: { port?: number; clientId?: string; user?: string; pass?: string; keepAlive?: number } = {}): Promise<MQTTClient> {
  return new Promise((res, rej) => {
    const sock: Socket = connect(opts.port ?? 1883, host)
    let ping: ReturnType<typeof setInterval> | undefined
    const fail = (e: Error) => { if (ping) clearInterval(ping); sock.destroy(); rej(e) }
    sock.once('error', fail)
    sock.setTimeout(5000, () => fail(new Error('MQTT connect timeout')))
    sock.on('connect', () => sock.write(mqttConnect(opts.clientId ?? `dot480-${process.pid}`, opts)))
    sock.once('data', d => {
      sock.setTimeout(0)
      if (d[0] !== 0x20 || d[3] !== 0) return fail(new Error(`MQTT CONNACK refused (code ${d[3]})`))
      sock.off('error', fail)
      const ka = opts.keepAlive ?? 60
      ping = setInterval(() => sock.write(MQTT_PINGREQ), (ka * 1000) / 2); ping.unref()
      res({
        publish: (topic, payload) => new Promise((ok, no) => sock.write(mqttPublish(topic, payload), e => (e ? no(e) : ok()))),
        close: () => new Promise(ok => { if (ping) clearInterval(ping); sock.end(MQTT_DISCONNECT, () => ok()) }),
      })
    })
  })
}

async function main() {
  const a = args(), app = a.app ?? 'dot480', fps = +(a.fps ?? (a.mqtt ? 8 : 4)), seconds = +(a.seconds ?? Infinity), api: AwtrixAPI = a.api === '3' ? '3' : 'ng'
  if (!a.host && !a.mqtt) { console.error('usage: awtrix.ts (--host <clock ip> | --mqtt <broker> --prefix <clock prefix>) (--card <id> | --ir <name>) [--app dot480] [--fps 4] [--api ng|3]'); process.exit(2) }
  const frame = frameSource(a, AWTRIX_W, AWTRIX_H)
  const mq = a.mqtt ? await mqttClient(a.mqtt, { port: a.port ? +a.port : undefined, user: a.user, pass: a.pass }) : null
  const topic = awtrixTopic(a.prefix ?? 'awtrix', app, api)
  console.log(mq ? `MQTT → ${a.mqtt} ${topic}` : `HTTP → http://${a.host} (${api === 'ng' ? 'AWTRIX NG' : 'AWTRIX 3'})`, `@ ${fps} fps`)
  const t0 = performance.now()
  for (let n = 0; ; n++) {
    const t = (performance.now() - t0) / 1000
    if (t > seconds) break
    const body = awtrixPayload(frame(t), { api })
    if (mq) await mq.publish(topic, body); else await postCustom(a.host, app, body, a.port ? +a.port : 80, api)
    await new Promise(r => setTimeout(r, Math.max(0, t0 + (n + 1) * (1000 / fps) - performance.now())))
  }
  await mq?.close()
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) void main()
