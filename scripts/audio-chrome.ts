/**
 * C5 in a real browser: headless Chrome over CDP (Node's built-in WebSocket, no new deps) against the
 * dev server ($URL, default http://localhost:5202). Turns SOUND on through the transport's real control,
 * then checks:
 *   - scheduler timing: drum onsets measured in the rendered audio (an AudioWorklet tap before the
 *     limiter) land within 5 ms of the step grid; the timer never schedules a step late;
 *   - the analyser output is non-silent while playing, and silent after STOP;
 *   - the visual transport clock tracks the audio clock;
 *   - REC → PLAY saves a .webm with video + an audible audio track;
 *   - the scope board and the mic card (fake capture device) go live;
 *   - no exceptions or console errors.
 * Screenshots → .snapshots/c5/.
 *
 *   npx tsx scripts/audio-chrome.ts
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..'), outDir = join(root, '.snapshots', 'c5')
mkdirSync(join(outDir, 'rec'), { recursive: true })
const url = process.env.URL ?? 'http://localhost:5202/'
const chrome = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && existsSync(p))
if (!chrome) { console.log('no Chrome found (set $CHROME): skipped'); process.exit(0) }

const profile = mkdtempSync(join(tmpdir(), 'dot-c5-'))
const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  '--window-size=1400,1300', '--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', ...(process.env.CHROME_FLAGS?.split(' ').filter(Boolean) ?? []), 'about:blank'], { stdio: 'ignore' })
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
const shot = async (name: string) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(outDir, `${name}.png`), Buffer.from(r.result.data, 'base64')); console.log(`  → .snapshots/c5/${name}.png`) }
const click = (label: string) => evaluate(`(() => { const b = document.querySelector('[aria-label="${label}"]'); b?.click(); return !!b })()`)
let failures = 0
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++ }
const E = `window.dot480Audio.engine()`

try {
  await cdp('Page.enable'); await cdp('Runtime.enable')
  await cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: join(outDir, 'rec') })
  // keep the last blob handed to a download link, so the recording can be decoded in the page
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `{ const o = URL.createObjectURL; URL.createObjectURL = b => { window.__lastBlob = b; return o.call(URL, b) } }` })
  await cdp('Page.navigate', { url: `${url}?board=instrument` })
  check('instrument board loads', await until(`!!document.querySelector('[aria-label="Sound"]') && !!window.dot480Audio`, 60000))
  await sleep(1500)

  // ── sound on, a test pattern: quarter-note kicks only, short notes, no delay send ──
  check('SOUND toggle clicked', await click('Sound'))
  // the headless audio sink can start late or stall: wait until the audio clock runs at wall speed
  const rates = await evaluate(`(async () => { const out = []; for (let i = 0; i < 20; i++) { const ac = ${E}.ac; if (!ac) { await new Promise(r => setTimeout(r, 100)); continue } const a0 = ac.currentTime, w0 = performance.now(); await new Promise(r => setTimeout(r, 250)); const k = (ac.currentTime - a0) / ((performance.now() - w0) / 1000); out.push(+k.toFixed(2)); if (out.length >= 4 && out.slice(-4).every(x => Math.abs(x - 1) < .1)) break } return out })()`)
  console.log(`  audio clock rate vs wall clock (250 ms windows): ${rates.join(' ')}`)
  check('transport running after SOUND ON (mode REC → PLAY)', await until(`${E}.playing && ${E}.params.mode === 1`, 10000))
  await sleep(1200)
  await shot('instrument-sound-on')
  const timing = await evaluate(`(async () => {
    const e = ${E}, ac = e.ac, g = e.g
    const lat = { base: ac.baseLatency * 1000, output: (ac.outputLatency || 0) * 1000, sampleRate: ac.sampleRate, state: ac.state }
    // pattern: steps 0, 4, 8, 12 only (kicks), via the same params path the board uses
    const steps = Array.from({ length: 16 }, (_, i) => i % 4 === 0)
    e.setParams({ steps, attack: 0, release: 0 }); g.send.gain.value = 0
    const code = 'class Tap extends AudioWorkletProcessor { constructor() { super(); this.quiet = 0; this.on = []; this.blk = []; this.m = 0; this.n = 0; this.port.onmessage = () => this.port.postMessage({ on: this.on, blk: this.blk }) } process(inputs) { const ch = inputs[0] && inputs[0][0]; if (!ch) return true; for (let i = 0; i < ch.length; i++) { const a = Math.abs(ch[i]); this.m = Math.max(this.m, a); if (++this.n === 480) { if (this.blk.length < 300) this.blk.push(+this.m.toFixed(3)); this.m = 0; this.n = 0 } if (a > 0.04) { if (this.quiet > 0.03 * sampleRate) this.on.push((currentFrame + i) / sampleRate); this.quiet = 0 } else if (a < 0.012) this.quiet++ } return true } } registerProcessor("tap", Tap)'
    await ac.audioWorklet.addModule(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })))
    const tap = new AudioWorkletNode(ac, 'tap'); g.master.connect(tap)
    // note how early each step gets scheduled (lead) while measuring
    const leads = [], orig = e.onStep.bind(e)
    e.onStep = ev => { leads.push(ev.time - ac.currentTime); orig(ev) }
    const from = ac.currentTime + 0.6
    await new Promise(r => setTimeout(r, 4600))
    const got = await new Promise(r => { tap.port.onmessage = m => r(m.data); tap.port.postMessage(0) }), onsets = got.on
    tap.disconnect(); e.onStep = orig
    const grid = e.stepLog.filter(s => s.step % 4 === 0 && s.time > from)
    const errs = grid.map(s => { let best = Infinity; for (const o of onsets) if (Math.abs(o - s.time) < Math.abs(best)) best = o - s.time; return best * 1000 })
    // step spacing on the audio clock vs the 120 BPM sixteenth
    const all = e.stepLog.filter(s => s.time > from), gaps = all.slice(1).map((s, i) => (s.time - all[i].time - 0.125) * 1000)
    return { lat, errs, onsets: onsets.length, grid: grid.length, minLead: Math.min(...leads) * 1000, maxLead: Math.max(...leads) * 1000, maxGap: Math.max(...gaps.map(Math.abs)) }
  })()`)
  timing.errs = timing.errs.map((x: number | null) => (x === null ? 999 : x))
  const maxErr = Math.max(...timing.errs.map(Math.abs))
  check('drum onsets within 5 ms of the step grid', timing.grid >= 6 && maxErr <= 5, `${timing.grid} kicks, ${timing.onsets} onsets, max |err| ${maxErr.toFixed(2)} ms (errs ${timing.errs.map((x: number) => x.toFixed(2)).join(' ')})`)
  check('scheduler never late (lead > 0)', timing.minLead > 0, `lead ${timing.minLead.toFixed(1)}–${timing.maxLead.toFixed(1)} ms ahead; grid spacing drift max ${timing.maxGap.toFixed(4)} ms`)
  console.log(`  latency: base ${timing.lat.base.toFixed(1)} ms + output ${timing.lat.output.toFixed(1)} ms @ ${timing.lat.sampleRate} Hz (${timing.lat.state})`)

  // restore the default pattern and check the analyser + visual clock
  await evaluate(`(() => { const e = ${E}; e.setParams({ steps: [1,0,0,0,1,0,1,0,1,0,0,1,0,0,1,0].map(Boolean), attack: 5/24, release: 16/24 }); e.g.send.gain.value = .22 })()`)
  await sleep(800)
  const level = await evaluate(`(async () => {
    const { decodeFrame } = await import('/src/audio/frame.ts')
    const e = ${E}, out = []
    for (let i = 0; i < 20; i++) { const m = e.media(); const f = decodeFrame(m.audio); out.push(Math.max(...f.level)); await new Promise(r => setTimeout(r, 50)) }
    const t0 = e.transportTime(), c0 = e.ac.currentTime
    await new Promise(r => setTimeout(r, 1000))
    return { max: Math.max(...out), dt: (e.transportTime() - t0) - (e.ac.currentTime - c0) }
  })()`)
  check('analyser non-silent while playing', level.max > -40, `peak RMS ${level.max.toFixed(1)} dBFS`)
  check('visual transport clock tracks the audio clock', Math.abs(level.dt) < .02, `drift over 1 s: ${(level.dt * 1000).toFixed(1)} ms`)

  // knob change while playing: params glide (setTargetAtTime), measure the largest per-render-quantum step of filter.frequency
  const glide = await evaluate(`(async () => {
    const e = ${E}, f = e.g.filter.frequency, seen = []
    e.setParams({ cutoff: 0.95 })
    for (let i = 0; i < 30; i++) { seen.push(f.value); await new Promise(r => setTimeout(r, 5)) }
    e.setParams({ cutoff: 15 / 24 })
    return { first: seen[0], last: seen[seen.length - 1], distinct: new Set(seen.map(v => Math.round(v))).size }
  })()`)
  check('cutoff knob glides (no stepped jump)', glide.distinct >= 3, `${glide.first.toFixed(0)} → ${glide.last.toFixed(0)} Hz over ${glide.distinct} distinct values in 150 ms`)

  // ── REC → PLAY ──
  check('REC clicked', await click('Record'))
  check('recording started', await until(`${E}.recordingSeconds > 0`, 5000))
  await sleep(2500)
  await shot('instrument-rec')
  check('PLAY clicked (stops REC)', await click('Play'))
  check('recording saved', await until(`window.dot480Audio.recordings.length > 0`, 8000))
  const rec = await evaluate(`(async () => {
    const r = window.dot480Audio.recordings[0], b = window.__lastBlob
    const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(b)
    await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('video ' + v.error?.code)) })
    const buf = await b.arrayBuffer()
    let rms = -1, dur = 0
    try { const a = await new OfflineAudioContext(2, 48000, 48000).decodeAudioData(buf.slice(0)); dur = a.duration; const ch = a.getChannelData(0); let s = 0; for (const x of ch) s += x * x; rms = 20 * Math.log10(Math.sqrt(s / ch.length) + 1e-9) } catch (err) { rms = NaN }
    return { ...r, w: v.videoWidth, h: v.videoHeight, audioDur: dur, rms }
  })()`)
  check('recording is a .webm with video and audible audio', rec.kind === 'video' && rec.w > 0 && rec.rms > -45, `${rec.name} ${rec.mime} ${(rec.size / 1024).toFixed(0)} KB, ${rec.w}×${rec.h}, audio ${rec.audioDur.toFixed(2)} s @ ${rec.rms.toFixed(1)} dBFS`)

  // ── STOP → silence ──
  check('STOP clicked', await click('Stop'))
  await sleep(1200)
  const quiet = await evaluate(`(async () => { const { decodeFrame } = await import('/src/audio/frame.ts'); const f = decodeFrame(${E}.media().audio); return { lv: Math.max(...f.level), playing: ${E}.playing } })()`)
  check('STOP: scheduler stopped, output silent', !quiet.playing && quiet.lv < -50, `${quiet.lv.toFixed(1)} dBFS`)
  await click('Play')
  check('PLAY resumes', await until(`${E}.playing`, 3000))

  // ── scope board, music still going; then the mic ──
  await evaluate(`[...document.querySelectorAll('.board-tabs button')].find(b => b.textContent === 'SCOPE').click()`)
  check('scope board mounts, transport keeps playing', await until(`!!document.querySelector('[aria-label="Listen to the microphone"]')`, 8000) && await until(`${E}.playing`, 3000))
  await sleep(2500)
  check('still playing after the board switch grace period', await evaluate(`${E}.playing`))
  await shot('scope-synth')
  await click('Listen to the microphone')
  check('mic goes live (fake capture device)', await until(`${E}.micState === 'live'`, 8000), await evaluate(`${E}.micState`))
  await sleep(1500)
  const mic = await evaluate(`(async () => { const { decodeFrame } = await import('/src/audio/frame.ts'); const m = ${E}.media(); return m.mic ? Math.max(...decodeFrame(m.mic).level) : null })()`)
  check('mic analyser non-silent', mic !== null && mic > -50, `${mic?.toFixed(1)} dBFS`)
  await shot('scope-mic')
  await click('Listen to the microphone')
  check('mic off releases the device', await until(`${E}.micState === 'idle'`, 3000))

  // leaving both audio boards stops the sound
  await evaluate(`[...document.querySelectorAll('.board-tabs button')].find(b => b.textContent === 'COMPONENTS').click()`)
  check('leaving the audio boards stops the transport', await until(`!${E}.playing && !${E}.sound`, 6000))
  check('no exceptions or console errors', logs.length === 0, logs.slice(0, 5).join(' | '))
} catch (e) {
  console.error(e); failures++
} finally {
  ws.close(); proc.kill()
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall C5 browser checks passed')
process.exit(failures ? 1 : 0)
