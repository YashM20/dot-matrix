/**
 * C6 HAND mode end to end in headless Chrome (CDP over Node's built-in WebSocket, no deps).
 *
 *   npx tsx scripts/c6-browser.ts [--url http://localhost:5205]
 *
 * The page's camera is a synthetic video: `__dotTestCamera` (src/media/stream.ts) returns a canvas
 * `captureStream()` drawing `synthFrame` (src/vision/synthetic.ts) — a hand moving over a still scene.
 *  1. ?board=mirror: start the SHADOW card's camera and HAND mode on CONDUCT with real (CDP) mouse clicks,
 *     track ~10 s of the scripted path: pointer error vs the drawn palm centre (best latency shift and at 0),
 *     pinch agreement, tracker fps and ms per frame.
 *  2. Switch to the INSTRUMENT board by mouse, steer the synthetic hand (closed loop on the on-screen cursor)
 *     onto the first knob, pinch, drag up, release: the knob's value must change (hand = a pointer for any card).
 * Screenshots → .snapshots/c6/. Needs the dev server running.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d }
const URL0 = arg('url', 'http://localhost:5205'), OUT = '.snapshots/c6'
mkdirSync(OUT, { recursive: true })
const chrome = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && existsSync(p))
if (!chrome) { console.log('no Chrome found (set $CHROME)'); process.exit(0) }
const profile = mkdtempSync(join(tmpdir(), 'dot-c6-'))
const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1400,1000',
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
let port = ''
for (let i = 0; i < 200 && !port; i++) { await sleep(100); try { port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0] } catch { /* not yet */ } }
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as { type: string; webSocketDebuggerUrl: string }[]
const ws = new WebSocket(targets.find(t => t.type === 'page')!.webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r, { once: true }))
let seq = 0
const calls = new Map<number, (m: any) => void>() // eslint-disable-line @typescript-eslint/no-explicit-any
const logs = new Set<string>()
ws.addEventListener('message', e => {
  const m = JSON.parse(String(e.data))
  if (m.id && calls.has(m.id)) { calls.get(m.id)!(m); calls.delete(m.id) }
  if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'warning' || m.params.type === 'error')) logs.add(m.params.args.map((a: { value?: unknown; description?: string }) => a.value ?? a.description).join(' ').slice(0, 200))
  if (m.method === 'Runtime.exceptionThrown') logs.add(String(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text).slice(0, 200))
})
const cdp = (method: string, params: Record<string, unknown> = {}) => new Promise<any>(r => { const id = ++seq; calls.set(id, r); ws.send(JSON.stringify({ id, method, params })) }) // eslint-disable-line @typescript-eslint/no-explicit-any
const evaluate = async <T>(expr: string): Promise<T> => (await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value as T
const click = async (x: number, y: number) => {
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 })
}
const shot = async (name: string) => { const { result } = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(result.data, 'base64')); console.log(`${OUT}/${name}.png`) }
type Rect = { x: number; y: number; w: number; h: number }
const rectOf = (sel: string) => evaluate<Rect | null>(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } })()`)

// the synthetic camera + logs, installed before any app code runs
const INIT = `
window.__c6 = { truth: [], obs: [], steer: null };
window.__dotTestCamera = async () => {
  const m = await import('/src/vision/synthetic.ts');
  const W = 160, H = 120, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H), t0 = performance.now();
  let f = 0;
  const draw = () => {
    const now = performance.now(), t = (now - t0) / 1000, noHand = t < 1;
    const pose = window.__c6.steer ? window.__c6.steer.pose : undefined;
    const p = m.synthFrame(img.data, W, H, t, { mirrored: false, frame: f++, noHand, pose });
    g.putImageData(img, 0, 0);
    if (!noHand) window.__c6.truth.push([now, p.x, p.y, p.pinch]);
    setTimeout(draw, 16);
  };
  draw();
  return c.captureStream(30);
};
window.__dotHandLog = (o, ms) => window.__c6.obs.push([performance.now(), o.present ? 1 : 0, o.x, o.y, o.pinch ? 1 : 0, ms]);
`
await cdp('Page.enable'); await cdp('Runtime.enable')
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: INIT })
const report: Record<string, unknown> = {}
let ok = true
try {
  await cdp('Page.navigate', { url: `${URL0}/?board=mirror` })
  for (let i = 0; i < 60 && !(await rectOf('.dot-card[aria-label="Conduct"]')); i++) await sleep(500)
  await sleep(2500)
  // shadow (row 1, right) and conduct (row 2) both in view
  await evaluate(`window.scrollTo(0, document.querySelector('.dot-card[aria-label="Shadow"]').getBoundingClientRect().top + scrollY - 20)`)
  await sleep(300)
  const shadow =await rectOf('.dot-card[aria-label="Shadow"]'), conduct = await rectOf('.dot-card[aria-label="Conduct"]')
  if (!shadow || !conduct) throw new Error(`mirror board cards not found: ${await evaluate<string>("[...document.querySelectorAll('.dot-card')].map(e => e.getAttribute('aria-label')).join(',') + ' ' + document.body.innerText.slice(0, 200)")}`)
  await click(shadow.x + shadow.w / 2, shadow.y + shadow.h / 2)
  await sleep(400)
  // the conduct card's bottom plate (the HAND toggle) into view
  await evaluate(`window.scrollBy(0, document.querySelector('.dot-card[aria-label="Conduct"]').getBoundingClientRect().bottom - innerHeight + 12)`)
  await sleep(300)
  const cd = (await rectOf('.dot-card[aria-label="Conduct"]'))!
  await click(cd.x + cd.w / 2, cd.y + cd.h * .93)
  // 5 s on the (heavy: three live camera cards) mirror board, then the tracking run on the instrument board
  await sleep(5000); await shot('mirror-board-hand')
  const m0 = await evaluate<number[][]>('window.__c6.obs'), mirrorFps = m0.length > 30 ? (m0.length - 31) / ((m0[m0.length - 1][0] - m0[30][0]) / 1000) : 0
  report.mirrorBoardTrackerFps = +mirrorFps.toFixed(1)
  await evaluate('window.scrollTo(0, 0)'); await sleep(300)
  const tab = await evaluate<Rect | null>(`(() => { const b = [...document.querySelectorAll('.board-tabs button')].find(b => b.textContent === 'INSTRUMENT'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } })()`)
  if (!tab) throw new Error('INSTRUMENT tab not found')
  await click(tab.x + tab.w / 2, tab.y + tab.h / 2)
  await sleep(2000)
  await evaluate('(window.__c6.obs = [], window.__c6.truth = [], 0)')
  await sleep(10000)
  const { truth, obs } = await evaluate<{ truth: number[][]; obs: number[][] }>('({ truth: window.__c6.truth, obs: window.__c6.obs })')
  const live = obs.filter(o => o[1]), secs = obs.length > 1 ? (obs[obs.length - 1][0] - obs[0][0]) / 1000 : 1
  const at = (t: number) => { let lo = 0, hi = truth.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (truth[mid][0] <= t) lo = mid; else hi = mid - 1 } return truth[lo] }
  const errAt = (lag: number) => {
    const ds = live.slice(15).filter(o => o[0] - lag > truth[0]?.[0]).map(o => { const g = at(o[0] - lag); return [o[2] - g[1], (o[3] - g[2]) * .75, g[1]] })
    const clear = ds.filter(d => d[2] >= .44), n = clear.length || 1, mx = clear.reduce((s, d) => s + d[0], 0) / n, my = clear.reduce((s, d) => s + d[1], 0) / n
    const e = clear.map(d => Math.hypot(d[0] - mx, d[1] - my)).sort((a, b) => a - b)
    return { lag, mean: e.reduce((s, v) => s + v, 0) / n, p95: e[Math.floor(n * .95)] ?? 1, n: clear.length }
  }
  const lags = [0, 50, 100, 150, 200, 250, 300, 400, 500, 600].map(errAt), best = lags.reduce((a, b) => (b.mean < a.mean ? b : a))
  const pinchOk = live.slice(15).filter(o => { const g = at(o[0] - best.lag), ph = 0; void ph; return (o[4] === 1) === (g[3] > .5) }).length / Math.max(1, live.length - 15)
  const ms = obs.map(o => o[5]).sort((a, b) => a - b)
  const videoFps = truth.length > 1 ? +((truth.length - 1) / ((truth[truth.length - 1][0] - truth[0][0]) / 1000)).toFixed(1) : 0
  Object.assign(report, { videoFps, trackerFps: +(obs.length / secs).toFixed(1), presentShare: +(live.length / Math.max(1, obs.length)).toFixed(3), msMedian: +ms[ms.length >> 1]?.toFixed(3), msP95: +ms[Math.floor(ms.length * .95)]?.toFixed(3),
    errAtLag0: +(lags[0].mean * 100).toFixed(2), bestLagMs: best.lag, errBest: +(best.mean * 100).toFixed(2), p95Best: +(best.p95 * 100).toFixed(2), pinchAgree: +pinchOk.toFixed(3) })
  console.log('tracking', JSON.stringify(report))

  // 2) a knob, by hand (the hand pointer drives any card's controls)
  for (let i = 0; i < 20 && !(await evaluate<boolean>("!!document.querySelector('.dot-card input[type=range]')")); i++) await sleep(500)
  const knob = await evaluate<{ x: number; y: number; key: string; v: number } | null>(`(() => {
    // the knob nearest the middle of the screen (the synthetic face sits at the left: a hand over a face is a known weak spot)
    const mid = e => { const r = e.getBoundingClientRect(); return Math.abs(r.left + r.width / 2 - innerWidth / 2) + (r.top < 0 || r.bottom > innerHeight ? 1e4 : 0) }
    const e = [...document.querySelectorAll('.dot-card input[type=range]')].sort((a, b) => mid(a) - mid(b))[0]
    if (!e) return null; const r = e.getBoundingClientRect(); window.__c6.knob = e
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, key: e.getAttribute('aria-label'), v: +e.getAttribute('aria-valuenow') } })()`)
  if (!knob) throw new Error('no knob / slider found on the instrument board')
  // closed-loop steering: move the synthetic palm until the on-screen hand cursor sits on the target, then pinch + drag
  const steer = (x: number, y: number, pinch: number) => evaluate<number>(`new Promise(done => {
    const s = window.__c6.steer ??= { pose: { x: .5, y: .5, pinch: 0 } }; s.pose.pinch = ${pinch}
    let n = 0, settled = 0
    const tick = () => {
      const c = document.querySelector('.hand-cursor'), m = c && /translate\\(([-\\d.]+)px, ([-\\d.]+)px\\)/.exec(c.style.transform)
      if (m) {
        const ex = ${x} - +m[1], ey = ${y} - +m[2]
        s.pose.x = Math.min(.95, Math.max(.05, s.pose.x + ex / innerWidth * .7 * .3))
        s.pose.y = Math.min(.9, Math.max(.1, s.pose.y + ey / innerHeight * .66 * .3))
        settled = Math.hypot(ex, ey) < 12 ? settled + 1 : 0
      }
      if (settled > 8 || ++n > 160) done(settled > 8 ? n : -1); else setTimeout(tick, 50)
    }
    tick()
  })`)
  const o0 = await evaluate<number[]>("[window.__c6.obs.length, performance.now(), window.__c6.truth.length]")
  const reach = await steer(knob.x, knob.y, 0)
  await steer(knob.x, knob.y, 1)
  for (let k = 1; k <= 4; k++) await steer(knob.x, knob.y - 20 * k, 1)
  await shot('instrument-hand-drag')
  await steer(knob.x, knob.y - 80, 0)
  await sleep(400)
  const after = await evaluate<number>('+window.__c6.knob.getAttribute("aria-valuenow")')
  const o1 = await evaluate<number[]>("[window.__c6.obs.length, performance.now(), window.__c6.truth.length]"), dt2 = (o1[1] - o0[1]) / 1000
  Object.assign(report, { instrumentTrackerFps: +((o1[0] - o0[0]) / dt2).toFixed(1), instrumentVideoFps: +((o1[2] - o0[2]) / dt2).toFixed(1), knob: knob.key, reachSteps: reach, knobBefore: knob.v, knobAfter: after })
  console.log('knob', JSON.stringify(report))
  ok = after !== knob.v && (report.trackerFps as number) >= 25 && (report.errBest as number) <= 4
} catch (e) { console.error(e); ok = false }
finally {
  if (logs.size) console.log('page warnings / errors:\n ' + [...logs].join('\n '))
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1) + '\n')
  ws.close(); proc.kill(); await sleep(300); try { rmSync(profile, { recursive: true, force: true }) } catch { /* locked */ }
}
console.log(ok ? 'C6 browser: PASS' : 'C6 browser: FAIL')
process.exit(ok ? 0 : 1)
