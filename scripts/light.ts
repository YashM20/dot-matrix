/**
 * Checks for the light / tilt hub (docs/living-matter/F0-foundation.md §2.7, F0.7): the pure core
 * (`createLightHub`) under a fake clock and timers, the engine half (`src/engine/light/input.ts`), and the
 * browser binding (`lightSource`, `tiltState`, `requestTilt`) against a fake window.
 * Called from verify.ts (`await lightChecks(assert)`, the light slot); also runnable alone: `npx tsx scripts/light.ts`.
 */
import { bucketLight, LIGHT_AZ_BUCKETS, LIGHT_EL_BANDS, lightOfBucket, sceneLight, stickyRound } from '../src/engine/light/input'
import { sunAt } from '../src/engine/light/material'
import { createWorld, worldAt } from '../src/engine/physics'

type Assert = (name: string, cond: boolean, detail?: string) => void
type V3 = [number, number, number]
const DEG = Math.PI / 180
const unit = (v: V3): V3 => { const k = 1 / Math.hypot(...v); return [v[0] * k, v[1] * k, v[2] * k] }
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
/** Device-frame gravity (screen angle 0) → the (β, γ) a phone would report for it. */
const euler = (n: V3): [number, number] => [Math.asin(Math.max(-1, Math.min(1, n[1]))) / DEG, Math.atan2(n[0], -n[2]) / DEG]
const gravityOf = (beta: number, gamma: number): V3 => [Math.sin(gamma * DEG) * Math.cos(beta * DEG), Math.sin(beta * DEG), -Math.cos(gamma * DEG) * Math.cos(beta * DEG)]
/** The rest pose's tangent basis (screen right, screen down), as the hub builds it. */
function basis(r: V3): [V3, V3] {
  const ex = unit(cross(cross(r, [1, 0, 0]), r)); let ey = unit(cross(r, ex))
  if (ey[1] < 0) ey = [-ey[0], -ey[1], -ey[2]]
  return [ex, ey]
}
/** Gravity tipped by `deg` from `r` toward tangent direction (cos a·ex + sin a·ey). */
const tipped = (r: V3, deg: number, a = 0): V3 => {
  const [ex, ey] = basis(r), t = deg * DEG, c = Math.cos(a * DEG), s = Math.sin(a * DEG)
  return unit([0, 1, 2].map(i => r[i] * Math.cos(t) + (ex[i] * c + ey[i] * s) * Math.sin(t)) as V3)
}
const isStep = (x: number, step: number) => Math.abs(x / step - Math.round(x / step)) < 1e-9

/** A fake clock with a timer queue: `at(t)` runs every timer due by t, in order, then sets the clock to t. */
function fakeEnv(reducedMotion = false) {
  let now = 0, seq = 0
  const timers = new Map<number, { at: number; fn: () => void }>()
  const env = {
    now: () => now,
    setTimeout: (fn: () => void, ms: number) => { const id = ++seq; timers.set(id, { at: now + ms, fn }); return id },
    clearTimeout: (h: unknown) => { timers.delete(h as number) },
    reducedMotion: () => reducedMotion,
  }
  const at = (t: number) => {
    for (;;) {
      let next: [number, { at: number; fn: () => void }] | undefined
      for (const e of timers) if (e[1].at <= t && (!next || e[1].at < next[1].at)) next = e
      if (!next) break
      timers.delete(next[0]); now = next[1].at; next[1].fn()
    }
    now = t
  }
  return { env, at, pending: () => timers.size }
}

export async function lightChecks(assert: Assert): Promise<void> {
  // worker safety first, before any fake window exists
  const hadWindow = typeof (globalThis as { window?: unknown }).window !== 'undefined'
  let mod: typeof import('../src/site/light') | null = null, err = ''
  try {
    mod = await import('../src/site/light')
    const off = mod.lightSource.subscribe(() => {}); off()
    if (mod.tiltState() !== 'unsupported') err = `tiltState ${mod.tiltState()} without a window`
  } catch (e) { err = String(e) }
  assert('light: importing src/site/light.ts with no window defined doesn\'t throw (worker safety)', !hadWindow && !!mod && !err, hadWindow ? 'a window was already defined' : err)
  if (!mod) return
  const { createLightHub, screenGravity, LIGHT_FIXTURE, TILT_TAU } = mod

  /** A hub under a fake clock, with a sampler at 60 Hz. */
  const rig = (reduced = false) => {
    const f = fakeEnv(reduced), hub = createLightHub(f.env), log: { t: number; d: Record<string, number> }[] = []
    let seed = 12345
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32)
    hub.onEmit(() => log.push({ t: f.env.now(), d: hub.data() }))
    let t = 0
    /** Hold (β, γ) for `ms` at 60 Hz (optional jitter in degrees). */
    const hold = (beta: number, gamma: number, ms: number, jitter = 0, angle = 0) => {
      const end = t + ms
      for (; t < end; t += 1000 / 60) { f.at(t); hub.sample(beta + jitter * (rnd() * 2 - 1), gamma + jitter * (rnd() * 2 - 1), angle, t) }
      f.at(t)
    }
    const holdG = (n: V3, ms: number) => { const [b, g] = euler(n); hold(b, g, ms) }
    return { hub, f, log, hold, holdG, get t() { return t }, set t(v) { t = v } }
  }

  // ── gravity ────────────────────────────────────────────────────────────────────────────────────────
  {
    const near = (a: number[], b: number[]) => a.every((x, i) => Math.abs(x - b[i]) < 1e-9)
    const up = screenGravity(90, 0, 0), side = screenGravity(0, 90, 0), rot = screenGravity(0, -90, 90), rotUp = screenGravity(90, 0, 90)
    const a = rig(); a.hold(0, 90, 400)
    const b = rig(); b.hold(0, -90, 400, 0, 90)
    assert('light: gravity (β90,γ0)→(0,1); (β0,γ90)→(1,0); screen angle 90° rotates',
      near(up.slice(0, 2), [0, 1]) && near(side.slice(0, 2), [1, 0]) && near(rot.slice(0, 2), [0, 1]) && near(rotUp.slice(0, 2), [1, 0])
        && a.hub.data().gx === 1 && a.hub.data().gy === 0 && b.hub.data().gx === 0 && b.hub.data().gy === 1,
      `hub (β0,γ90) → (${a.hub.data().gx}, ${a.hub.data().gy}); landscape (β0,γ−90, 90°) → (${b.hub.data().gx}, ${b.hub.data().gy})`)
  }
  // a phone held normally reads as "no input": exactly (0, 1), and a world stays pristine
  {
    const bad: string[] = []
    let poses = 0
    for (let beta = 25; beta <= 70; beta += 5) for (const gamma of [-4.5, -2, 0, 2, 4.5]) {
      const r = rig(); r.hold(beta, gamma, 1500, .4)
      poses++
      for (const e of r.log) if (e.d.gx !== 0 || e.d.gy !== 1) { bad.push(`β${beta} γ${gamma} → (${e.d.gx}, ${e.d.gy})`); break }
      if (r.hub.data().gx !== 0 || r.hub.data().gy !== 1) bad.push(`β${beta} γ${gamma} final (${r.hub.data().gx}, ${r.hub.data().gy})`)
    }
    const world = () => createWorld({ size: 1, dt: 1 / 60, init: s => { s[0] = 0 }, step: (s, _n, inp) => { s[0] += inp.gx } })
    const still = world(), tilted = world()
    for (let i = 1; i <= 30; i++) { worldAt(still, i / 30, { gx: 0, gy: 1 }); worldAt(tilted, i / 30, { gx: 1 / 32, gy: 1 }) }
    assert('light: held phone β∈[25°,70°], |γ|<5° publishes exactly gx 0, gy 1 (world stays pristine)', !bad.length && still.mode === 'pristine' && tilted.mode === 'live',
      bad.slice(0, 3).join('; ') || `${poses} poses with ±0.4° jitter; worldAt engaged: (0,1) ${still.mode}, (1/32,1) ${tilted.mode}`)
  }
  // ── tilt offset ────────────────────────────────────────────────────────────────────────────────────
  {
    const out: string[] = [], rows: string[] = []
    const per: Record<string, string[]> = {}
    for (const beta of [30, 45, 60]) {
      const rest = gravityOf(beta, 0)
      const at = (deg: number, a: number) => { const r = rig(); r.hold(beta, 0, 200); r.holdG(tipped(rest, deg, a), 1000); return r.hub.data() }
      const still = rig(); still.hold(beta, 0, 1500, .3)
      if (still.hub.data().tx !== 0 || still.hub.data().ty !== 0 || still.log.some(e => e.d.tx !== 0 || e.d.ty !== 0)) out.push(`β${beta} rest moved`)
      for (const a of [0, 90, 180, 270]) {
        const dz = at(1.5, a)
        if (dz.tx !== 0 || dz.ty !== 0) out.push(`β${beta} 1.5°@${a} → (${dz.tx}, ${dz.ty})`)
        const full = at(30, a), want = [[1, 0], [0, 1], [-1, 0], [0, -1]][a / 90]
        if (full.tx !== want[0] || full.ty !== want[1]) out.push(`β${beta} 30°@${a} → (${full.tx}, ${full.ty})`)
      }
      for (const deg of [5, 10, 15]) for (const a of [0, 90, 45]) {
        const d = at(deg, a)
        if (!isStep(d.tx, 1 / 16) || !isStep(d.ty, 1 / 16)) out.push(`β${beta} ${deg}° not 1/16: ${d.tx}, ${d.ty}`)
        ;(per[`${deg}@${a}`] ??= []).push(`${d.tx},${d.ty}`)
      }
    }
    for (const [k, v] of Object.entries(per)) { rows.push(`${k}: ${v[0]}`); if (new Set(v).size !== 1) out.push(`${k} depends on rest β: ${v.join(' | ')}`) }
    assert('light: tx, ty = 0 at rest and inside the 2° dead zone; ±1 at ≥ 24° offset; 1/16 steps; independent of the rest pose\'s β', !out.length, out.slice(0, 4).join('; ') || rows.slice(0, 4).join(', '))
    // sign convention: right edge down → tx > 0; and a held tilt re-centres to rest (τ 20 s)
    const r = rig(); r.hold(45, 0, 200); r.hold(45, 20, 1500)
    const tx0 = r.hub.data().tx
    r.hold(45, 20, 120_000)
    assert('light: tx > 0 when the right edge tips down; a held tilt re-centres to (0, 0)', tx0 > 0 && r.hub.data().tx === 0 && r.hub.data().ty === 0, `tx ${tx0} → ${r.hub.data().tx} after 2 min`)
  }
  // ── low-pass ───────────────────────────────────────────────────────────────────────────────────────
  {
    const r = rig()
    r.hold(90, 0, 100) // rest: upright, (0, 1, 0)
    const t0 = r.t
    // the step at t0 (right edge straight down, (1, 0, 0)), then 60 Hz samples up to t0 + τ
    for (let k = 0; k <= 9; k++) { r.f.at(t0 + k * TILT_TAU / 9); r.hub.sample(0, 90, 0, t0 + k * TILT_TAU / 9) }
    const frac = r.hub.filtered()![0]
    // no more events after the step (an emulator sends one): the hub's own timer finishes the move
    const p = rig(); p.hold(90, 0, 100); const p0 = p.t
    p.hub.sample(0, 90, 0, p0); p.f.at(p0 + 2000)
    const pump = p.hub.filtered()![0], pumped = p.hub.data().gx === 1 && p.f.pending() === 0
    assert('light: low-pass reaches 63% ± 3% at τ = 150 ms', Math.abs(frac - (1 - Math.exp(-1))) <= .03 && pump > .99 && pumped,
      `${(frac * 100).toFixed(1)}% at τ; with no further samples ${(pump * 100).toFixed(1)}% after 2 s, gx ${p.hub.data().gx}, timers left ${p.f.pending()}`)
  }
  // ── az hysteresis ──────────────────────────────────────────────────────────────────────────────────
  {
    let changes = 0, prev: { az: number; el: number } | undefined, seed = 7
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32)
    const boundary = 12.5 // between buckets 12 and 13
    for (let i = 0; i < 400; i++) {
      const az = ((boundary + (rnd() * 2 - 1) * .2) / LIGHT_AZ_BUCKETS) * 2 * Math.PI, el = 45 * DEG
      const b = bucketLight([Math.sin(az) * Math.cos(el), -Math.cos(az) * Math.cos(el), Math.sin(el)], prev)
      if (prev && b.az !== prev.az) changes++
      prev = b
    }
    // the wrap: 63.6 → 0 is one step, not 63
    const wrap = stickyRound(63.6, 63, .25, 64) === 63 && stickyRound(63.8, 63, .25, 64) === 0 && stickyRound(63.7, 0, .25, 64) === 0
      && stickyRound(63.2, 0, .25, 64) === 63 && stickyRound(.2, 63, .25, 64) === 0
    // through the hub: tilt direction jittering ±0.2 bucket around a boundary
    const h = rig(); h.hold(45, 0, 200)
    const rest = gravityOf(45, 0), seen = new Set<number>()
    let hubChanges = 0, last: number | undefined
    for (let i = -30; i < 300; i++) { // the first 30 frames bring the light onto the boundary
      // light azimuth is along −d: aim d so the light sits on the 12|13 boundary, ± .2 bucket
      const lightAz = ((boundary + (rnd() * 2 - 1) * .2) / LIGHT_AZ_BUCKETS) * 360
      const dAng = Math.atan2(Math.cos(lightAz * DEG), -Math.sin(lightAz * DEG)) / DEG // d̂ = −(sin az, −cos az) in (ex, ey)
      h.holdG(tipped(rest, 12, dAng), 1000 / 60)
      const az = h.hub.data().lightAz
      if (i < 0) continue
      seen.add(az)
      if (last !== undefined && az !== last) hubChanges++
      last = az
    }
    assert('light: az bucket hysteresis, ±0.2 bucket jitter around a boundary → ≤ 1 change', changes <= 1 && hubChanges <= 1 && wrap && [...seen].every(a => a === 12 || a === 13),
      `bucketLight ${changes}, hub ${hubChanges} (buckets ${[...seen].join(', ')}), wrap ${wrap}`)
  }
  // ── emit rate ──────────────────────────────────────────────────────────────────────────────────────
  {
    const r = rig()
    r.hold(45, 0, 300)
    const n0 = r.log.length, t0 = r.t
    for (let i = 0; i < 240; i++) r.hold(45 + 20 * Math.sin(i / 9), 35 * Math.sin(i / 7), 1000 / 60) // 4 s sweep
    const sweep = r.log.slice(n0), secs = (r.t - t0) / 1000
    const gap = Math.min(...sweep.slice(1).map((e, i) => e.t - sweep[i].t))
    r.hold(45, 0, 2000) // settle
    const n1 = r.log.length
    r.hold(45, 0, 10_000, .25)
    const still = r.log.length - n1
    r.hold(45, 25, 120_000); const n2 = r.log.length; r.hold(45, 25, 10_000, .25) // a tilted pose, after the rest pose caught up
    const stillTilted = r.log.length - n2
    assert('light: emits ≤ 15 Hz; still phone emits 0 after settling', sweep.length <= 15 * secs + 1 && gap >= 1000 / 15 - 1e-6 && still === 0 && stillTilted === 0,
      `${sweep.length} emits in ${secs.toFixed(1)} s of sweep (min gap ${gap.toFixed(1)} ms); still: ${still}, still tilted: ${stillTilted}`)
  }
  // ── reduced motion (core) ──────────────────────────────────────────────────────────────────────────
  let reducedCore = ''
  {
    const r = rig(true)
    r.hold(45, 0, 300)
    const n0 = r.log.length, t0 = r.t
    for (let i = 0; i < 240; i++) r.hold(45 + 20 * Math.sin(i / 9), 35 * Math.sin(i / 7), 1000 / 60)
    const sweep = r.log.slice(n0), secs = (r.t - t0) / 1000, gap = Math.min(...sweep.slice(1).map((e, i) => e.t - sweep[i].t))
    if (!(sweep.length <= 4 * secs + 1 && gap >= 250 - 1e-6 && sweep.length > 0)) reducedCore = `${sweep.length} emits in ${secs.toFixed(1)} s, min gap ${gap.toFixed(0)} ms`
    else reducedCore = `ok: ${sweep.length} emits / ${secs.toFixed(1)} s`
  }
  // ── the browser binding, against a fake window ─────────────────────────────────────────────────────
  const g = globalThis as Record<string, unknown>
  const saved = { window: g.window }
  const fakeWindow = (o: { ios?: 'granted' | 'denied'; reduced?: boolean; coarse?: boolean; secure?: boolean } = {}) => {
    const on: Record<string, Set<(e: unknown) => void>> = {}, docOn: Record<string, Set<(e: unknown) => void>> = {}
    const store = new Map<string, string>()
    let asked = 0
    const doc = {
      visibilityState: 'visible' as 'visible' | 'hidden',
      addEventListener: (k: string, f: (e: unknown) => void) => { (docOn[k] ??= new Set()).add(f) },
      removeEventListener: (k: string, f: (e: unknown) => void) => { docOn[k]?.delete(f) },
    }
    const DOE: { requestPermission?: () => Promise<string> } = {}
    if (o.ios) DOE.requestPermission = () => { asked++; return Promise.resolve(o.ios!) }
    const w = {
      DeviceOrientationEvent: DOE, document: doc, isSecureContext: o.secure ?? true, screen: { orientation: { angle: 0 } },
      sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) } },
      matchMedia: (q: string) => ({ matches: q.includes('reduced-motion') ? !!o.reduced : q.includes('coarse') ? o.coarse ?? true : false }),
      addEventListener: (k: string, f: (e: unknown) => void) => { (on[k] ??= new Set()).add(f) },
      removeEventListener: (k: string, f: (e: unknown) => void) => { on[k]?.delete(f) },
    }
    g.window = w
    return {
      w, store, asked: () => asked, listening: () => on.deviceorientation?.size ?? 0,
      hide(hidden: boolean) { doc.visibilityState = hidden ? 'hidden' : 'visible'; for (const f of docOn.visibilitychange ?? []) f({}) },
      click() { for (const f of [...(docOn.click ?? [])]) f({}) },
      orient(beta: number | null, gamma: number | null) { for (const f of on.deviceorientation ?? []) f({ beta, gamma }) },
    }
  }
  try {
    const { lightSource, tiltState, requestTilt, resetTilt, tiltListening } = mod
    // Android-like: granted without a prompt, auto-starts while subscribed and visible
    {
      resetTilt(); const fw = fakeWindow()
      const state = tiltState()
      const off = lightSource.subscribe(() => {})
      const a = fw.listening(), a1 = tiltListening()
      fw.hide(true); const hidden = fw.listening()
      fw.hide(false); const back = fw.listening()
      off(); const after = fw.listening()
      assert('light: hidden tab detaches listeners; last unsubscribe detaches', state === 'granted' && a === 1 && a1 && hidden === 0 && back === 1 && after === 0 && !tiltListening(),
        `state ${state}; subscribed ${a}, hidden ${hidden}, visible ${back}, unsubscribed ${after}`)
      // a sample goes out to subscribers and is undone on stop; a sensorless desktop turns unsupported
      const seen: Record<string, number>[] = []
      const off2 = lightSource.subscribe(s => seen.push(s.data))
      fw.orient(45, 30)
      const live = lightSource.snapshot().data.lightSrc === 1 && lightSource.snapshot().status === 'live'
      off2()
      const reset = lightSource.snapshot().data.lightSrc === 0 && lightSource.snapshot().data.gx === 0 && lightSource.snapshot().data.gy === 1
      resetTilt(); const desk = fakeWindow()
      const off3 = lightSource.subscribe(() => {}); desk.orient(null, null)
      const nullState = tiltState(); off3()
      assert('light: a sample reaches subscribers (lightSrc 1, live); stop restores the fixture; an all-null event → unsupported', live && reset && nullState === 'unsupported', `live ${live}, reset ${reset}, after null event ${nullState}`)
    }
    // reduced motion: no auto-start; an explicit grant still works (and the core gates at 4 Hz)
    {
      resetTilt(); const fw = fakeWindow({ reduced: true })
      const off = lightSource.subscribe(() => {})
      const auto = fw.listening()
      const s = await requestTilt()
      const granted = fw.listening()
      off()
      assert('light: reduced motion, no auto-start; granted → ≤ 4 Hz', auto === 0 && s === 'granted' && granted === 1 && reducedCore.startsWith('ok'), `auto ${auto}, after TILT ${granted} (${s}); core ${reducedCore}`)
    }
    // iOS: a requestPermission function → prompt; 'granted' attaches, 'denied' leaves no listener
    {
      resetTilt(); let fw = fakeWindow({ ios: 'granted' })
      const off = lightSource.subscribe(() => {})
      const before = tiltState(), idle = fw.listening()
      const s = await requestTilt()
      const yes = fw.listening(), stored = fw.store.get('dot480:tilt')
      off()
      // after a reload in the same session: the next click re-asks once, without a new prompt
      resetTilt(); const store = fw.store; fw = fakeWindow({ ios: 'granted' }); for (const [k, v] of store) fw.store.set(k, v)
      const off2 = lightSource.subscribe(() => {})
      const reloaded = fw.listening()
      fw.click(); await Promise.resolve(); await Promise.resolve()
      const rearmed = fw.listening(), asks = fw.asked()
      fw.click(); await Promise.resolve()
      const clicked2 = fw.asked()
      off2()
      resetTilt(); fw = fakeWindow({ ios: 'denied' })
      const off3 = lightSource.subscribe(() => {})
      const no = await requestTilt(), none = fw.listening()
      off3()
      assert('light: iOS fake requestPermission \'granted\' attaches, \'denied\' → state denied, no listener',
        before === 'prompt' && idle === 0 && s === 'granted' && yes === 1 && stored === 'granted' && no === 'denied' && none === 0 && tiltState() === 'denied',
        `prompt → ${s} (${yes} listener, session ${stored}); denied → ${no} (${none} listeners)`)
      assert('light: iOS reload, the next click re-asks once (session grant) and attaches', reloaded === 0 && rearmed === 1 && asks === 1 && clicked2 === 1,
        `before click ${reloaded}, after ${rearmed}, requestPermission calls ${asks}`)
    }
    // no coarse pointer → unsupported; not a secure context → insecure
    {
      resetTilt(); fakeWindow({ coarse: false }); const a = tiltState()
      resetTilt(); fakeWindow({ secure: false }); const b = tiltState()
      assert('light: fine pointer → unsupported, insecure context → insecure (TILT hidden)', a === 'unsupported' && b === 'insecure', `${a}, ${b}`)
    }
  } finally {
    if (saved.window === undefined) delete g.window; else g.window = saved.window
    mod.resetTilt()
  }
  // ── sceneLight + buckets ───────────────────────────────────────────────────────────────────────────
  {
    const tilt = { lightSrc: 1, lightAz: 20, lightEl: 3 }, sun = { lightSrc: 0, lightAz: 20, lightEl: 3 }
    const torchL = sceneLight({ pointer: { x: 10, y: 12 }, data: tilt, hour: 9 }) as { at: number[] }
    const tiltL = sceneLight({ pointer: null, data: tilt, hour: 9 }) as number[], sunL = sceneLight({ data: sun, hour: 9 }) as number[]
    const prec = !Array.isArray(torchL) && torchL.at[0] === 10 && torchL.at[1] === 12
      && tiltL.every((x, i) => x === lightOfBucket(20, 3)[i]) && sunL.every((x, i) => x === sunAt(9)[i])
    let trips = 0, bad = ''
    for (let el = 0; el < LIGHT_EL_BANDS; el++) for (let az = 0; az < LIGHT_AZ_BUCKETS; az++) {
      const b = bucketLight(lightOfBucket(az, el))
      if (b.az === az && b.el === el) trips++; else if (!bad) bad = `${az},${el} → ${b.az},${b.el}`
      const d = lightOfBucket(az, el), n = Math.hypot(...d)
      if (Math.abs(n - 1) > 1e-9 && !bad) bad = `|${az},${el}| = ${n}`
    }
    const fixture = sceneLight({ data: { ...LIGHT_FIXTURE }, hour: 14 }) as number[]
    assert('light: sceneLight precedence pointer > tilt > sun; lightOfBucket∘bucketLight round-trips the bucket',
      prec && trips === LIGHT_AZ_BUCKETS * LIGHT_EL_BANDS && fixture.every((x, i) => x === sunAt(14)[i]) && dot(lightOfBucket(0, 7) as V3, [0, -1, 0]) > 0,
      bad || `${trips}/${LIGHT_AZ_BUCKETS * LIGHT_EL_BANDS} buckets; the fixture lights by the sun`)
  }
}

const self = process.argv[1]?.replace(/\\/g, '/')
if (self && import.meta.url.endsWith(self.split('/').slice(-2).join('/'))) {
  let failures = 0, n = 0
  await lightChecks((name, cond, detail = '') => { n++; if (!cond) failures++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) })
  console.log(`${n - failures}/${n} light checks passed`)
  if (failures) process.exit(1)
}
