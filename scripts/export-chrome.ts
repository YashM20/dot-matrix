/**
 * P5-D in a real browser: headless Chrome over CDP (Node's built-in WebSocket, no new deps)
 * against a Vite dev server started here. Records a 2 s `timer` clip (progress swept 0 → 1) in
 * every format with `recordClip` (WebCodecs for WebM / MP4), checks each file with the readers in
 * scripts/lib/decode.ts and the browser's own decoders (<img>, <video>.duration), checks cancel,
 * then drives the playground ExportPanel (RECORD + plotter PREVIEW). Files → .snapshots/p5d/.
 *
 *   npx tsx scripts/export-chrome.ts        (Chrome path: $CHROME, else the usual install paths)
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'vite'
import { readAPNG, readGIF, readMP4, readWebM } from './lib/decode'

const root = resolve(import.meta.dirname, '..'), outDir = join(root, '.snapshots', 'p5d')
mkdirSync(join(outDir, 'ui'), { recursive: true })
const chrome = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && existsSync(p))
if (!chrome) { console.log('no Chrome found (set $CHROME): skipped'); process.exit(0) }

const server = await createServer({ root, configFile: join(root, 'vite.config.ts'), logLevel: 'error', server: { port: 0, strictPort: false } })
await server.listen()
const url = server.resolvedUrls!.local[0]
const profile = mkdtempSync(join(tmpdir(), 'dot-p5d-'))
const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--window-size=1400,1000', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
let port = ''
for (let i = 0; i < 100 && !port; i++) { await sleep(100); try { port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0] } catch { /* not yet */ } }
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as { type: string; webSocketDebuggerUrl: string }[]
const ws = new WebSocket(targets.find(t => t.type === 'page')!.webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r, { once: true }))
let seq = 0
const calls = new Map<number, (m: any) => void>(), logs: string[] = []
ws.addEventListener('message', e => {
  const m = JSON.parse(String(e.data))
  if (m.id && calls.has(m.id)) { calls.get(m.id)!(m); calls.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') logs.push(`exception: ${m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text}`)
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push(`console.error: ${m.params.args.map((a: any) => a.value ?? a.description).join(' ')}`)
})
const cdp = (method: string, params: Record<string, unknown> = {}) => new Promise<any>(r => { const id = ++seq; calls.set(id, r); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async (expression: string) => {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval failed')
  return r.result?.result?.value
}
const until = async (expression: string, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await evaluate(expression)) return true; await sleep(100) } return false }
let failures = 0
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++ }

try {
  await cdp('Page.enable'); await cdp('Runtime.enable')
  await cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: join(outDir, 'ui') })
  await cdp('Page.navigate', { url: `${url}?make=tune` })
  check('playground loads', await until(`!!document.querySelector('.pg-export')`, 60000))

  // ── recordClip in the page, every format ──
  const results = await evaluate(`(async () => {
    const { recordClip, presetSource, plotterSVG } = await import('/src/export/index.ts')
    const { widgetById } = await import('/src/widgets/index.ts')
    const { dot480 } = await import('/src/engine/theme/tokens.ts')
    const src = presetSource(widgetById('timer'), dot480, {}, { key: 'progress', from: 0, to: 1, seconds: 2 })
    const b64 = buf => { let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return btoa(s) }
    const out = { webcodecs: typeof VideoEncoder !== 'undefined' }
    for (const format of ['apng', 'gif', 'webm', 'mp4']) {
      const t0 = performance.now()
      try {
        const clip = await recordClip(src, { format, seconds: 2, fps: 30, scale: 2 })
        const buf = new Uint8Array(await clip.blob.arrayBuffer()), objectUrl = URL.createObjectURL(clip.blob)
        let decoded = {}
        if (format === 'webm' || format === 'mp4') {
          const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.src = objectUrl
          await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('video error ' + v.error?.code)) })
          decoded = { duration: v.duration, w: v.videoWidth, h: v.videoHeight }
        } else {
          const img = new Image(); img.src = objectUrl; await img.decode()
          decoded = { w: img.naturalWidth, h: img.naturalHeight }
        }
        out[format] = { b64: b64(buf), ms: performance.now() - t0, via: clip.via, frames: clip.frames, stored: clip.stored, width: clip.width, height: clip.height, durationMs: clip.durationMs, decoded }
      } catch (e) { out[format] = { error: String(e && e.stack || e) } }
    }
    // plotter SVG of the same card, rasterised by the browser at 6 px/mm (a zoomable proof)
    const plot = plotterSVG(src.frame(1.3), src.width, src.height)
    const pimg = new Image(); pimg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(plot.svg); await pimg.decode()
    const pc = document.createElement('canvas'); pc.width = Math.round(plot.widthMm * 6); pc.height = Math.round(plot.heightMm * 6)
    const pctx = pc.getContext('2d'); pctx.fillStyle = '#fff'; pctx.fillRect(0, 0, pc.width, pc.height); pctx.drawImage(pimg, 0, 0, pc.width, pc.height)
    out.plot = { svg: plot.svg, png: pc.toDataURL('image/png').split(',')[1], strokes: plot.strokes.length, travel: plot.travelMm, naive: plot.naiveTravelMm }
    // cancel: abort after the 3rd frame
    const ac = new AbortController()
    try { await recordClip(src, { format: 'gif', seconds: 2, fps: 30, signal: ac.signal, onProgress: d => { if (d === 3) ac.abort() } }); out.cancel = 'not cancelled' }
    catch (e) { out.cancel = e.name }
    return out
  })()`)
  check('WebCodecs VideoEncoder present', results.webcodecs)
  for (const format of ['apng', 'gif', 'webm', 'mp4']) {
    const r = results[format]
    if (r.error) { check(`timer ${format}`, false, r.error.split('\n')[0]); continue }
    const bytes = new Uint8Array(Buffer.from(r.b64, 'base64')), file = join(outDir, `timer.${format === 'apng' ? 'apng' : format}`)
    writeFileSync(file, bytes)
    const size = `${(bytes.length / 1024).toFixed(1)} KB`, base = `${r.width}×${r.height}, ${size}, ${r.ms.toFixed(0)} ms, ${r.via}`
    if (format === 'apng') { const a = readAPNG(bytes); check('timer APNG 2 s', bytes.length > 0 && a.crcOk && Math.abs(a.durationMs - 2000) < 1 && a.frames > 20 && r.decoded.w === r.width, `${a.frames} frames, ${a.durationMs} ms, ${base}`) }
    if (format === 'gif') { const g = readGIF(bytes); check('timer GIF 2 s', bytes.length > 0 && g.durationMs === 2000 && g.frames > 20 && g.loops && r.decoded.w === r.width, `${g.frames} frames, ${g.durationMs} ms, ${g.palette.length} colours, ${base}`) }
    if (format === 'webm') { const w = readWebM(bytes); check('timer WebM 2 s', bytes.length > 0 && w.durationMs === 2000 && w.blocks === 60 && Math.abs(r.decoded.duration - 2) < 0.05 && r.decoded.w === r.width, `${w.codec}, ${w.blocks} blocks, ${w.keys} key, Duration ${w.durationMs} ms, <video> ${r.decoded.duration?.toFixed(3)} s, ${base}`) }
    if (format === 'mp4') { const m = readMP4(bytes); check('timer MP4 2 s', bytes.length > 0 && m.durationMs === 2000 && m.samples === 60 && Math.abs(r.decoded.duration - 2) < 0.05 && r.decoded.w === r.width, `${m.samples} samples, ${m.keys} sync, mvhd ${m.durationMs} ms, <video> ${r.decoded.duration?.toFixed(3)} s, ${base}`) }
  }
  writeFileSync(join(outDir, 'timer-plot.svg'), results.plot.svg); writeFileSync(join(outDir, 'timer-plot.png'), Buffer.from(results.plot.png, 'base64'))
  check('timer plotter SVG renders in the browser', results.plot.strokes > 100 && results.plot.png.length > 1000, `${results.plot.strokes} strokes, travel ${(results.plot.travel / 1000).toFixed(2)} m (unsorted ${(results.plot.naive / 1000).toFixed(2)} m)`)
  check('cancel aborts a running export', results.cancel === 'AbortError', results.cancel)

  // ── the panel itself: RECORD (GIF, 1 s) and plotter PREVIEW ──
  const ui = await evaluate(`(async () => {
    const panel = document.querySelector('.pg-export'), byText = t => [...panel.querySelectorAll('button')].find(b => b.textContent === t)
    const secs = panel.querySelector('input[aria-label="Seconds"]'), set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    set.call(secs, '1'); secs.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 50))
    byText('RECORD').click()
    for (let i = 0; i < 400 && !/frames|failed/.test(panel.querySelector('[role=status]')?.textContent ?? ''); i++) await new Promise(r => setTimeout(r, 50))
    const status = panel.querySelector('[role=status]')?.textContent ?? ''
    byText('PREVIEW').click()
    await new Promise(r => setTimeout(r, 300))
    const img = panel.querySelector('img[alt="Plotter preview"]')
    if (img) await img.decode()
    return { status, plot: [...panel.querySelectorAll('[role=status]')].map(e => e.textContent).join(' | '), imgW: img?.naturalWidth ?? 0 }
  })()`)
  check('panel RECORD exports a clip', /30 frames/.test(ui.status), ui.status)
  check('panel plotter PREVIEW renders', ui.imgW > 0 && /STROKES/.test(ui.plot), ui.plot.split(' | ').pop())
  const box = await evaluate(`(() => { const r = document.querySelector('.pg-export').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })()`)
  const shot = await cdp('Page.captureScreenshot', { format: 'png', clip: { ...box, scale: 1 }, captureBeyondViewport: true })
  writeFileSync(join(outDir, 'panel.png'), Buffer.from(shot.result.data, 'base64'))
  check('no page errors', logs.length === 0, logs.slice(0, 3).join(' / '))
} finally {
  ws.close(); proc.kill(); await server.close()
  await sleep(300); try { rmSync(profile, { recursive: true, force: true }) } catch { /* Chrome may still hold files */ }
}
console.log(failures ? `\n${failures} check(s) failed` : `\nall browser export checks passed → ${outDir}`)
process.exit(failures ? 1 : 0)
