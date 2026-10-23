/**
 * Device-target checks against local fakes only (127.0.0.1): a UDP DDP receiver, fake AWTRIX NG / 3
 * HTTP endpoints, a fake MQTT broker, a fake TRMNL device polling the BYOS server, a fake Tronbyt push
 * endpoint, the ESP32 sketch's HTTP API and the Glyph frame export. Nothing reaches a real device or service.
 * WebP output is decoded with ffmpeg when it is on PATH (independent decoder), else that check is skipped.
 *
 *   npx tsx targets/test/targets.ts
 */
import { spawnSync } from 'node:child_process'
import { createSocket } from 'node:dgram'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, request, type IncomingMessage, type Server } from 'node:http'
import { createServer as createTcp, type AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { compileBytecode, loadBytecode, parse, verifyBytecode } from '../../src/engine/ir'
import { awtrixPayload, awtrixTopic, mqttClient, postCustom, AWTRIX_H, AWTRIX_W } from '../awtrix/awtrix'
import { programBytes, sendHTTP, serialLines } from '../esp32/send'
import { glyphFrames } from '../glyph-toy/export'
import { cardFrame, irFrame, PROGRAMS, type Frame } from '../lib/frame'
import { webp, webpAnim } from '../lib/image'
import { TRMNL_H, TRMNL_W, trmnlHandler } from '../trmnl/server'
import { pushWebp, tronbytWebp, TRONBYT_H, TRONBYT_W } from '../tronbyt/tronbyt'
import { ddpPackets, ddpSender, parseDDP, DDP_MAX_DATA, DDP_TYPE_RGB24 } from '../wled/ddp'

type Assert = (name: string, cond: boolean, detail?: string) => void
const LOCAL = '127.0.0.1'
const port = (s: Server | ReturnType<typeof createTcp>) => (s.address() as AddressInfo).port
const listen = <S extends Server | ReturnType<typeof createTcp>>(s: S) => new Promise<S>(r => s.listen(0, LOCAL, () => r(s)))
const close = (s: Server | ReturnType<typeof createTcp>) => new Promise<void>(r => s.close(() => r()))
const body = (req: IncomingMessage) => new Promise<Buffer>(r => { const c: Buffer[] = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c))) })
interface Seen { method: string; url: string; headers: IncomingMessage['headers']; body: Buffer }
/** Fake HTTP endpoint that records every request and answers `status`. */
async function fakeHTTP(status = 200) {
  const seen: Seen[] = []
  const server = await listen(createServer(async (req, res) => { seen.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body: await body(req) }); res.writeHead(status); res.end('OK') }))
  return { seen, port: port(server), close: () => close(server) }
}
const get = (p: number, path: string, headers: Record<string, string> = {}) => new Promise<{ status: number; type: string; body: Buffer }>((res, rej) => {
  request({ host: LOCAL, port: p, path, headers }, r => { const c: Buffer[] = []; r.on('data', d => c.push(d)); r.on('end', () => res({ status: r.statusCode ?? 0, type: String(r.headers['content-type'] ?? ''), body: Buffer.concat(c) })) }).on('error', rej).end()
})
const gradient = (w: number, h: number): Frame => { const rgb = new Uint8Array(w * h * 3); for (let i = 0; i < w * h; i++) rgb.set([(i * 7) & 255, (i * 13) & 255, (i * 29) & 255], i * 3); return { w, h, rgb } }

export async function targetsChecks(assert: Assert) {
  // ── WLED DDP: fake UDP receiver ──
  {
    const rx = createSocket('udp4'), got: Buffer[] = []
    rx.on('message', m => got.push(m))
    await new Promise<void>(r => rx.bind(0, LOCAL, () => r()))
    const tx = ddpSender(LOCAL, { port: rx.address().port })
    const small = cardFrame('home-clock', 0, 32, 8), big = gradient(40, 40)
    await tx.send(small); await tx.send(big)
    for (let i = 0; i < 50 && got.length < 5; i++) await new Promise(r => setTimeout(r, 10))
    tx.close(); rx.close()
    const h = got.map(parseDDP), f1 = h.slice(0, 1), f2 = h.slice(1)
    const headerOK = h.every(p => p.version === 1 && p.type === DDP_TYPE_RGB24 && p.id === 1 && p.length === p.data.length && p.length % 3 === 0 && p.length <= DDP_MAX_DATA)
    const push = f1[0]?.push && f2.map(p => p.push).join() === 'false,false,false,true'
    const offsets = f2.map(p => p.offset).join() === '0,1440,2880,4320' && f2.reduce((s, p) => s + p.length, 0) === 40 * 40 * 3
    const data = Buffer.concat(f2.map(p => p.data)).equals(Buffer.from(big.rgb)) && f1[0]?.data.equals(Buffer.from(small.rgb))
    const seq = f1[0]?.seq === 1 && f2.every(p => p.seq === 2)
    assert('targets/wled: DDP to a fake UDP receiver — v1 header, RGB24 type, id 1, offsets, push only on the last packet, pixel count, seq', got.length === 5 && headerOK && !!push && offsets && !!data && seq,
      `${got.length} packets; 32×8 = 1 packet (256 px), 40×40 = 4 packets (1600 px); ${Math.max(...got.map(p => p.length))} B max datagram`)
    const empty = ddpPackets(new Uint8Array(0), 3)
    assert('targets/wled: an empty frame is one zero-length push packet', empty.length === 1 && parseDDP(empty[0]).push && parseDDP(empty[0]).length === 0)
  }

  // ── AWTRIX NG + AWTRIX 3 over HTTP, NG over MQTT (fake broker) ──
  {
    const f = cardFrame('home-clock', 0, AWTRIX_W, AWTRIX_H)
    const http = await fakeHTTP()
    const st = await postCustom(LOCAL, 'dot480', awtrixPayload(f), http.port)
    const st3 = await postCustom(LOCAL, 'dot480', awtrixPayload(f, { api: '3' }), http.port, '3')
    await http.close()
    const [ng, v3] = http.seen, ngBody = JSON.parse(ng.body.toString()), cmd = ngBody.draw[0]
    const ngOK = st === 200 && ng.method === 'PUT' && ng.url === '/api/v1/apps/pushed/dot480' && ng.headers['content-type'] === 'application/json' && ng.body.length <= 8192
      && cmd[0] === 'bitmap' && cmd.slice(1, 5).join() === `0,0,${AWTRIX_W},${AWTRIX_H}` && Buffer.from(cmd[5], 'base64').equals(Buffer.from(f.rgb)) && ngBody.lifetimeMs === 30000
    const db = JSON.parse(v3.body.toString()).draw[0].db
    const v3OK = st3 === 200 && v3.method === 'POST' && v3.url === '/api/custom?name=dot480' && db[4].length === 256 && db[4][5] === ((f.rgb[15] << 16) | (f.rgb[16] << 8) | f.rgb[17])
    let badName = ''
    try { await postCustom(LOCAL, 'no spaces', '{}', 1) } catch (e) { badName = (e as Error).message }
    assert('targets/awtrix: NG `PUT /api/v1/apps/pushed/<app>` with a base64 RGB888 `bitmap` draw command (≤ 8192 B); AWTRIX 3 `db` fallback; app names validated', ngOK && v3OK && /bad app name/.test(badName), `NG body ${ng.body.length} B, AWTRIX 3 body ${v3.body.length} B`)

    let connect: Buffer | null = null, publish: Buffer | null = null, disconnected = false
    const broker = await listen(createTcp(sock => sock.on('data', d => {
      for (let i = 0; i < d.length;) {
        let len = 0, mul = 1, j = i + 1
        for (;; j++) { len += (d[j] & 127) * mul; mul *= 128; if (!(d[j] & 128)) break }
        const pkt = d.subarray(i, j + 1 + len), type = pkt[0] >> 4
        if (type === 1) { connect = pkt; sock.write(Buffer.from([0x20, 2, 0, 0])) }
        if (type === 3) publish = pkt.subarray(j + 1 - i)
        if (type === 14) disconnected = true
        i = j + 1 + len
      }
    })))
    const mq = await mqttClient(LOCAL, { port: port(broker), clientId: 'dot480-test', user: 'u', pass: 'p' })
    const topic = awtrixTopic('awtrix_test', 'dot480'), payload = awtrixPayload(f)
    await mq.publish(topic, payload); await mq.close()
    for (let i = 0; i < 50 && !disconnected; i++) await new Promise(r => setTimeout(r, 10))
    await close(broker)
    const c = connect as Buffer | null, p = publish as Buffer | null
    const cOK = !!c && c.includes(Buffer.from('MQTT')) && c[c.indexOf('MQTT') + 4] === 4 && (c[c.indexOf('MQTT') + 5] & 0xc2) === 0xc2 && c.includes(Buffer.from('dot480-test'))
    const tlen = p ? p.readUInt16BE(0) : 0, pTopic = p?.subarray(2, 2 + tlen).toString(), pBody = p?.subarray(2 + tlen).toString()
    assert('targets/awtrix: MQTT 3.1.1 to a fake broker — CONNECT (MQTT v4, clean, user+pass), PUBLISH QoS 0 on `<prefix>/cmd/apps/pushed/<app>`, DISCONNECT', cOK && pTopic === 'awtrix_test/cmd/apps/pushed/dot480' && pBody === payload && disconnected,
      `publish ${p?.length ?? 0} B (payload ${payload.length} B > 127, so a 2-byte remaining length)`)
  }

  // ── TRMNL: fake device polling the BYOS server ──
  {
    let clock = 1_700_000_000
    const server = await listen(createServer(trmnlHandler({ card: 'home-clock', publicUrl: 'http://fake', token: 'tok', refresh: 600, now: () => clock })))
    const p = port(server), dev = { ID: 'AA:BB:CC:DD:EE:FF', 'FW-Version': '1.5.0', Model: 'og' }
    const setup = JSON.parse((await get(p, '/api/setup', dev)).body.toString())
    const denied = (await get(p, '/api/display', dev)).status
    const d1 = JSON.parse((await get(p, '/api/display', { ...dev, 'Access-Token': setup.api_key })).body.toString())
    clock += 20
    const d2 = JSON.parse((await get(p, '/api/display', { ...dev, 'Access-Token': 'tok' })).body.toString())
    const bmp = await get(p, new URL(d1.image_url).pathname, dev), png = await get(p, '/image.png'), plugin = JSON.parse((await get(p, '/plugin.json')).body.toString())
    await close(server)
    const b = bmp.body, rowBytes = 100
    let ones = 0
    for (let i = 62; i < b.length; i++) { let x = b[i]; while (x) { ones += x & 1; x >>= 1 } }
    const white = ones / (TRMNL_W * TRMNL_H)
    const bmpOK = bmp.type === 'image/bmp' && b.toString('latin1', 0, 2) === 'BM' && b.length === 62 + rowBytes * 480 && b.readInt32LE(18) === TRMNL_W && b.readInt32LE(22) === TRMNL_H && b.readUInt16LE(28) === 1 && b.length <= 90_000
    const pngOK = png.type === 'image/png' && png.body.readUInt32BE(16) === 800 && png.body.readUInt32BE(20) === 480 && png.body[24] === 1 && png.body[25] === 0
    const apiOK = setup.status === 200 && denied === 401 && d1.status === 0 && typeof d1.refresh_rate === 'number' && d1.refresh_rate === 600 && d1.filename === d2.filename && /^dot480-/.test(d1.filename) && plugin.image_url.includes(d1.filename)
    assert('targets/trmnl: fake device — /api/setup, Access-Token gate, /api/display JSON, stable filename, 800×480 1-bit BMP + PNG ≤ 90 kB', apiOK && bmpOK && pngOK && white > .5 && white < .999,
      `BMP ${b.length} B, PNG ${png.body.length} B, ${(white * 100).toFixed(1)}% white (dark dots on paper)`)
  }

  // ── Tronbyt: WebP (decoded by ffmpeg when present) + fake push endpoint ──
  {
    const still = gradient(TRONBYT_W, TRONBYT_H), w1 = webp(still)
    const anim = tronbytWebp(t => irFrame(PROGRAMS.plasma, TRONBYT_W, TRONBYT_H, t), .5, 10)
    const riffOK = w1.toString('latin1', 0, 4) === 'RIFF' && w1.readUInt32LE(4) === w1.length - 8 && w1.toString('latin1', 8, 16) === 'WEBPVP8L' && anim.includes(Buffer.from('ANMF')) && anim.readUInt32LE(4) === anim.length - 8
    const ff = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }).status === 0
    let decoded = 'skipped (no ffmpeg on PATH)'
    if (ff) {
      const dir = mkdtempSync(join(tmpdir(), 'dot480-webp-')), file = join(dir, 'still.webp')
      writeFileSync(file, w1)
      const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 24 })
      const af = join(dir, 'anim.webp'), other = irFrame(PROGRAMS.plasma, TRONBYT_W, TRONBYT_H, 0)
      writeFileSync(af, webpAnim([still, other], 100))
      // animated WebP: older ffmpeg can't demux ANMF, so try Pillow (python -I) as a second independent decoder
      const both = Buffer.concat([Buffer.from(still.rgb), Buffer.from(other.rgb)])
      const ra = spawnSync('ffmpeg', ['-v', 'error', '-i', af, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 24 })
      const PIL = 'import sys\nfrom PIL import Image, ImageSequence\nim = Image.open(sys.argv[1])\nsys.stdout.buffer.write(b"".join(f.convert("RGB").tobytes() for f in ImageSequence.Iterator(im)))'
      // cwd = the fresh temp dir holding only our two files (Pillow is often a user-site install, so no -I)
      const rp = ra.status === 0 ? null : spawnSync('python', ['-c', PIL, 'anim.webp'], { cwd: dir, maxBuffer: 1 << 24 })
      rmSync(dir, { recursive: true, force: true })
      const anim = ra.status === 0 ? (Buffer.from(ra.stdout).equals(both) ? 'both frames bit-exact (ffmpeg)' : 'ffmpeg mismatch')
        : rp && rp.status === 0 ? (Buffer.from(rp.stdout).equals(both) ? 'both frames bit-exact (Pillow)' : 'Pillow mismatch') : 'not checked (no animated-WebP decoder)'
      decoded = r.status === 0 && Buffer.from(r.stdout).equals(Buffer.from(still.rgb)) && !/mismatch/.test(anim) ? `ffmpeg decodes the still bit-exact; animated: ${anim}` : `decode failed: ${r.status} ${anim} ${String(r.stderr).slice(0, 200)}`
    }
    const http = await fakeHTTP()
    const st = await pushWebp(`http://${LOCAL}:${http.port}`, 'dev123', 'key456', anim, { installationID: 'dot480' })
    await http.close()
    const s = http.seen[0], j = JSON.parse(s.body.toString())
    const pushOK = st === 200 && s.method === 'POST' && s.url === '/v0/devices/dev123/push' && s.headers.authorization === 'Bearer key456' && Buffer.from(j.image, 'base64').equals(anim) && j.installationID === 'dot480'
    assert('targets/tronbyt: 64×32 lossless WebP (VP8L, still + animated) and Tidbyt-style push to a fake endpoint', riffOK && pushOK && (!ff || decoded.startsWith('ffmpeg decodes')), `${decoded}; still ${w1.length} B, 5-frame plasma ${anim.length} B`)
  }

  // ── ESP32 sketch API (fake) + bytecode transport ──
  {
    const http = await fakeHTTP(), code = programBytes('dial')
    const st = await sendHTTP(LOCAL, code, { value: .6 }, http.port)
    await http.close()
    const [prog, data] = http.seen, sent = Buffer.from(prog.body.toString(), 'hex')
    const lines = serialLines(code, { value: .6 })
    const ok = st.join() === '200,200' && prog.url === '/program' && sent.equals(Buffer.from(code)) && verifyBytecode(new Uint8Array(sent)).data.join() === 'value' && data.url === '/data?value=0.6'
      && lines === `P ${Buffer.from(code).toString('hex')}\nD value 0.6\n`
    assert('targets/esp32: program (hex) + data keys to a fake sketch HTTP API; serial line format', ok, `dial = ${code.length} B`)
  }

  // ── frames: IR at device res = VM; card resample; Glyph export ──
  {
    const f = irFrame(PROGRAMS.ripple, 16, 16, 1.5), vm = loadBytecode(compileBytecode(parse(PROGRAMS.ripple)))
    const v = vm.run(Math.fround(5 / 15), Math.fround(9 / 15), Math.fround(1.5)), k = Math.max(0, Math.min(1, v))
    const card = cardFrame('home-clock', 0, 32, 8), lit = card.rgb.some(x => x > 40)
    const g = glyphFrames({ card: 'home-clock', seconds: '.3', fps: '10' }), first = g.frames[0]
    const glyphOK = g.w === 25 && g.frames.length === 3 && first.length === 625 && first.every(x => Number.isInteger(x) && x >= 0 && x <= 255) && first[0] === 0 && first[624] === 0 && first.some(x => x > 0)
    assert('targets/frames: IR frame = bytecode VM per pixel; card → 32×8 lights LEDs; Glyph export 25×25 levels 0…255, dark corners', f.rgb[(9 * 16 + 5) * 3] === Math.round(0xf2 * k) && lit && glyphOK,
      `glyph ${g.frames.length} frames, ${first.filter(x => x > 0).length}/625 LEDs lit in frame 0`)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let failures = 0
  await targetsChecks((name, cond, detail = '') => { if (cond) console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`); else { console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`); failures++ } })
  if (failures) process.exit(1)
}
