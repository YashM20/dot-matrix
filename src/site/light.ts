/**
 * The light / tilt hub (docs/living-matter/F0-foundation.md §2.7): the phone's orientation as plain card
 * data. It is a `Source` (`src/data/source.ts`), so a board opts in with `sources: [lightSource]` in its
 * manifest entry and in the eager registry, and each card receives only the keys it declares in `defaults`:
 *
 *   lightSrc 0|1 · lightAz 0..63 · lightEl 0..7 · gx, gy (gravity direction, 1/32) · tx, ty (tilt, 1/16) · tilt (TiltState code)
 *
 * - `createLightHub(env)` is the pure core: orientation samples and a clock in, published numbers out
 *   (low-pass, dead zones, buckets with hysteresis, an emit gate). `scripts/light.ts` drives it with a fake clock.
 * - The browser binding below attaches `deviceorientation` only while a board is subscribed, tilt is
 *   granted and the tab is visible. Board modules also load in the sample worker, so nothing here touches
 *   `window` / `document` at module load.
 * - Tilt is not a touch: it never sets pointers, never engages a card and never blocks scroll.
 */
import type { Data, Snapshot, Source } from '../data/source'
import { bucketLight, LIGHT_EL_BANDS, type LightBucket } from '../engine/light/input'

export type TiltState = 'unsupported' | 'prompt' | 'granted' | 'denied' | 'insecure'
/** `TiltState` as the published `tilt` number. */
export const TILT_CODE: Readonly<Record<TiltState, number>> = { unsupported: 0, prompt: 1, granted: 2, denied: 3, insecure: 4 }
/** What every subscriber sees until tilt is live (and again when it stops). Physics worlds read gx 0, gy 1 as "no input". */
export const LIGHT_FIXTURE: Readonly<Data> = { lightSrc: 0, lightAz: 0, lightEl: LIGHT_EL_BANDS - 1, gx: 0, gy: 1, tx: 0, ty: 0, tilt: 0 }

// ── tuning (§2.7 "Algorithm") ────────────────────────────────────────────────────────────────────────
const DEG = Math.PI / 180
/** Low-pass time constant of the gravity vector, ms. */
export const TILT_TAU = 150
/** The rest pose re-centres onto a still phone with this time constant, ms. */
const REST_TAU = 20_000
/** Screen-plane gravity under this length = the phone lies flat: publish (0, 1). */
const FLAT = .3
/** Roll dead zone: gravity within 8° of the screen's vertical plane publishes exactly (0, 1). */
const ROLL_DEAD = Math.sin(8 * DEG)
const G_STEP = 1 / 32, T_STEP = 1 / 16
/** Tilt offset dead zone (≈ 2°) and clamp (≈ 24° → magnitude 1), as the sine of the angle from the rest pose. */
const T_DEAD = .035, T_CLAMP = .4
/** Emit gate: at most 15 emits / s, 4 under reduced motion. */
export const TILT_HZ = 15, TILT_HZ_REDUCED = 4
/** While the filter is still moving and no sample arrives, it is advanced on a timer this often (ms). */
const PUMP_MS = 1000 / TILT_HZ
/** The phone counts as still (rest pose may re-centre) while the raw and filtered gravity agree this closely. */
const STILL = .02

type V3 = [number, number, number]
const len = (v: V3) => Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
const unit = (v: V3): V3 => { const k = 1 / (len(v) || 1); return [v[0] * k, v[1] * k, v[2] * k] }
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x)
/** Quantise to `step` with ¼-step hysteresis against the previously published value. */
const stickyStep = (x: number, prev: number | undefined, step: number) => {
  if (prev !== undefined && Math.abs(x / step - prev / step) < .75) return prev
  return Math.round(x / step) * step + 0 // + 0: never publish -0
}

/**
 * Gravity in screen space (x right, y down, z toward the viewer), unit length, from a `deviceorientation`
 * sample: g_device = R(α,β,γ)ᵀ·(0,0,−1) = (sin γ·cos β, sin β, −cos γ·cos β), then rotated by the screen
 * orientation angle. Upright portrait is (0, 1, 0); right edge down is (1, 0, 0).
 */
export function screenGravity(beta: number, gamma: number, screenAngle: number): V3 {
  const b = beta * DEG, g = gamma * DEG, a = screenAngle * DEG
  const x = Math.sin(g) * Math.cos(b), y = Math.sin(b), z = -Math.cos(g) * Math.cos(b)
  const c = Math.cos(a), s = Math.sin(a)
  return [x * c + y * s, -x * s + y * c, z]
}

export interface LightEnv {
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
  /** The clock the timers run on (same units as `sample`'s `now`, ms). */
  now: () => number
  /** `prefers-reduced-motion`: the gate drops to 4 Hz. */
  reducedMotion?: () => boolean
}

export interface LightHub {
  /** One orientation sample (degrees) at time `now` (ms). */
  sample(beta: number, gamma: number, screenAngle: number, now: number): void
  /** What is published right now (a fresh object per emit; don't mutate it). */
  data(): Data
  /** Called after every emit. Returns the unsubscribe. */
  onEmit(cb: () => void): () => void
  /** Tilt stopped (hidden tab, last unsubscribe, turned off): back to the fixture with lightSrc 0, emitted at once. */
  stop(): void
  /** Publish a new `tilt` state code (emitted at once). */
  setTilt(code: number): void
  /** The low-passed gravity vector (screen space, not normalised), null before the first sample (checks). */
  filtered(): readonly [number, number, number] | null
  /** Emits so far. */
  readonly emits: number
}

/** The hub's pure core: orientation samples and a clock in, published numbers out. */
export function createLightHub(env: LightEnv): LightHub {
  const cbs = new Set<() => void>()
  let pub: Data = { ...LIGHT_FIXTURE }, cur: Data = pub
  let raw: V3 | null = null, g: V3 | null = null, rest: V3 | null = null, t = 0
  let lastEmit = -Infinity, timer: unknown = null, emits = 0, bucket: LightBucket | undefined

  const interval = () => 1000 / (env.reducedMotion?.() ? TILT_HZ_REDUCED : TILT_HZ)
  const same = (a: Data, b: Data) => { for (const k in a) if (a[k] !== b[k]) return false; return true }
  /** `gated`: a sample-driven emit, counted by the rate gate (state changes and stops go out at once and aren't). */
  const emit = (now: number, gated = true) => { pub = cur; if (gated) lastEmit = now; emits++; for (const cb of [...cbs]) cb() }

  /** Zero-order hold: the filter moves toward the last raw sample for the time since the previous step. */
  function advance(now: number) {
    if (!g || !raw || !rest) return
    const dt = now - t
    if (!(dt > 0)) return
    t = now
    const k = 1 - Math.exp(-dt / TILT_TAU)
    g = [g[0] + (raw[0] - g[0]) * k, g[1] + (raw[1] - g[1]) * k, g[2] + (raw[2] - g[2]) * k]
    const n = unit(g), d: V3 = [raw[0] - n[0], raw[1] - n[1], raw[2] - n[2]]
    if (len(d) < STILL) {
      const r = 1 - Math.exp(-dt / REST_TAU)
      rest = unit([rest[0] + (n[0] - rest[0]) * r, rest[1] + (n[1] - rest[1]) * r, rest[2] + (n[2] - rest[2]) * r])
    }
  }

  /** The numbers the current filter state publishes. */
  function compute(): Data {
    if (!g || !rest) return { ...LIGHT_FIXTURE, tilt: cur.tilt }
    const n = unit(g), was = cur.lightSrc === 1 // hysteresis against the last computed values
    // 3. physics gravity: direction only, exact (0, 1) when flat or within the roll dead zone
    let gx = 0, gy = 1
    const m = Math.sqrt(n[0] * n[0] + n[1] * n[1])
    if (m >= FLAT && !(n[1] > 0 && Math.abs(n[0]) < ROLL_DEAD)) {
      gx = stickyStep(n[0] / m, was ? cur.gx : undefined, G_STEP)
      gy = stickyStep(n[1] / m, was ? cur.gy : undefined, G_STEP)
      if (gx === 0 && gy === 1) gx = n[0] > 0 ? G_STEP : -G_STEP // outside the dead zone never reads as "no input"
    }
    // 4. tilt offset from the rest pose, in the rest pose's tangent plane (screen right / down)
    let ex = cross(cross(rest, [1, 0, 0]), rest)
    let ey: V3
    if (len(ex) > .3) { ex = unit(ex); ey = unit(cross(rest, ex)); if (ey[1] < 0) ey = [-ey[0], -ey[1], -ey[2]] }
    else { ey = unit(cross(cross(rest, [0, 1, 0]), rest)); ex = unit(cross(ey, rest)); if (ex[0] < 0) ex = [-ex[0], -ex[1], -ex[2]] }
    let dx = dot(n, ex), dy = dot(n, ey), dl = Math.sqrt(dx * dx + dy * dy)
    if (dot(n, rest) < 0) { const k = 1 / (dl || 1); dx *= k; dy *= k; dl = 1 } // past 90°: fully tilted
    let tx = 0, ty = 0
    if (dl >= T_DEAD) {
      const k = clamp((dl - T_DEAD) / (T_CLAMP - T_DEAD), 0, 1) / dl
      tx = stickyStep(dx * k, was ? cur.tx : undefined, T_STEP)
      ty = stickyStep(dy * k, was ? cur.ty : undefined, T_STEP)
    }
    // 5. light from tilt: azimuth along −d (a fixed lamp slides the other way), elevation 80° → 20°
    const el = (80 - 60 * Math.min(1, dl / T_CLAMP)) * DEG, ce = Math.cos(el)
    const dir: V3 = dl >= T_DEAD ? [-dx / dl * ce, -dy / dl * ce, Math.sin(el)] : [0, 0, 1]
    bucket = bucketLight(dir, was ? bucket : undefined)
    return { lightSrc: 1, lightAz: bucket.az, lightEl: bucket.el, gx, gy, tx, ty, tilt: cur.tilt }
  }

  function flush(now: number) {
    if (same(cur, pub)) return
    if (now - lastEmit >= interval()) emit(now)
  }
  function schedule(now: number) {
    if (timer !== null) return
    const pending = !same(cur, pub)
    const moving = !!(g && raw) && len([raw[0] - g[0], raw[1] - g[1], raw[2] - g[2]]) > 1e-3
    if (!pending && !moving) return
    const at = Math.min(pending ? lastEmit + interval() : Infinity, moving ? now + PUMP_MS : Infinity)
    timer = env.setTimeout(wake, Math.max(1, at - now))
  }
  function wake() {
    timer = null
    const now = env.now()
    advance(now)
    if (g) cur = compute()
    flush(now)
    schedule(now)
  }
  function cancel() { if (timer !== null) { env.clearTimeout(timer); timer = null } }

  return {
    sample(beta, gamma, screenAngle, now) {
      if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return
      const r = screenGravity(beta, gamma, Number.isFinite(screenAngle) ? screenAngle : 0)
      if (!g) { g = r; rest = r; t = now } // the first sample is the rest pose
      else advance(now)
      raw = r
      cur = compute()
      flush(now)
      schedule(now)
    },
    data: () => pub,
    onEmit(cb) { cbs.add(cb); return () => { cbs.delete(cb) } },
    stop() {
      cancel()
      raw = g = rest = null; bucket = undefined
      cur = { ...LIGHT_FIXTURE, tilt: cur.tilt }
      if (!same(cur, pub)) emit(env.now(), false)
    },
    setTilt(code) {
      if (cur.tilt === code && pub.tilt === code) return
      cur = { ...cur, tilt: code }
      emit(env.now(), false)
    },
    filtered: () => g,
    get emits() { return emits },
  }
}

// ── the browser binding ──────────────────────────────────────────────────────────────────────────────
// Nothing below runs at import: the sample worker imports board modules, and it has no window.

const SESSION_KEY = 'dot480:tilt'
type PermissionFn = () => Promise<'granted' | 'denied' | 'default' | string>
interface BrowserBits { win: Window & typeof globalThis; DOE: { requestPermission?: PermissionFn } }
const browser = (): BrowserBits | null => {
  const w = (globalThis as { window?: Window & typeof globalThis }).window
  if (!w || typeof w.addEventListener !== 'function' || !('DeviceOrientationEvent' in w)) return null
  return { win: w, DOE: (w as unknown as { DeviceOrientationEvent: { requestPermission?: PermissionFn } }).DeviceOrientationEvent }
}
const session = {
  get(): string | null { try { return browser()?.win.sessionStorage?.getItem(SESSION_KEY) ?? null } catch { return null } },
  set(v: string) { try { browser()?.win.sessionStorage?.setItem(SESSION_KEY, v) } catch { /* storage blocked */ } },
}
const reduced = () => { try { return !!browser()?.win.matchMedia?.('(prefers-reduced-motion: reduce)').matches } catch { return false } }

/** iOS's answer this page (`requestPermission` resolves it), and a sensorless desktop's all-null event. */
let permission: 'granted' | 'denied' | null = null, sensorless = false
/** The owner's TILT choice this session: null = default (auto-start where no prompt is needed, unless reduced motion). */
let choice: boolean | null = null
let hub: LightHub | null = null, attached = false, unVisibility: (() => void) | null = null, unRearm: (() => void) | null = null
const listeners = new Set<(s: Snapshot) => void>()
const stateListeners = new Set<() => void>()
let snap: Snapshot = { data: { ...LIGHT_FIXTURE }, status: 'offline', updatedAt: null, error: null, retryInMs: null }

/**
 * Where tilt stands on this device: no orientation events or no coarse pointer → `unsupported`; not a secure
 * context → `insecure`; an iOS-style `requestPermission` → `prompt` until it answers; otherwise `granted`
 * (Android fires without a prompt). A desktop that sends one all-null event becomes `unsupported`.
 */
export function tiltState(): TiltState {
  const b = browser()
  if (!b || sensorless) return 'unsupported'
  try { if (!b.win.matchMedia?.('(pointer: coarse)').matches) return 'unsupported' } catch { return 'unsupported' }
  if (!b.win.isSecureContext) return 'insecure'
  if (typeof b.DOE?.requestPermission === 'function') return permission ?? 'prompt'
  return 'granted'
}
/** Is tilt on: granted, and not turned off (and, under reduced motion, explicitly turned on)? */
export function tiltOn(): boolean {
  return tiltState() === 'granted' && (choice ?? (session.get() === 'off' ? false : session.get() === 'granted' || !reduced()))
}
/** Hear `tiltState()` / `tiltOn()` change (the TILT button). Returns the unsubscribe. */
export function onTiltChange(cb: () => void): () => void { stateListeners.add(cb); return () => { stateListeners.delete(cb) } }

function changed() {
  hub?.setTilt(TILT_CODE[tiltState()])
  sync()
  for (const cb of [...stateListeners]) cb()
}

/**
 * Ask for tilt. iOS 13+: this must run synchronously inside a click handler (no await before it), so it
 * calls `DeviceOrientationEvent.requestPermission()` first thing. Android / desktop: resolves at once.
 * A grant turns tilt on and is remembered for the session (`sessionStorage['dot480:tilt']`).
 */
export function requestTilt(): Promise<TiltState> {
  const b = browser(), s = tiltState()
  if (!b || s === 'unsupported' || s === 'insecure') return Promise.resolve(s)
  const ask = b.DOE?.requestPermission
  const done = (answer: 'granted' | 'denied') => {
    if (typeof ask === 'function') permission = answer
    if (answer === 'granted') { choice = true; session.set('granted') }
    changed()
    return tiltState()
  }
  if (typeof ask !== 'function' || permission === 'granted') return Promise.resolve(done('granted'))
  let p: Promise<string>
  try { p = ask.call(b.DOE) } catch { p = Promise.resolve('denied') }
  return p.then(r => done(r === 'granted' ? 'granted' : 'denied'), () => done('denied'))
}
/** Turn tilt off (or back on) for this session without asking again. */
export function setTiltOn(on: boolean): void {
  choice = on
  session.set(on ? 'granted' : 'off')
  changed()
}

function publish() {
  const data = hub?.data() ?? LIGHT_FIXTURE
  const live = data.lightSrc === 1
  snap = { data: { ...data }, status: live ? 'live' : 'offline', updatedAt: live ? Date.now() : snap.updatedAt, error: null, retryInMs: null }
  for (const l of [...listeners]) l(snap)
}
function onOrientation(e: DeviceOrientationEvent) {
  if (e.beta === null && e.gamma === null) { sensorless = true; changed(); return } // a desktop without a sensor
  const w = browser()?.win
  const angle = w?.screen?.orientation?.angle ?? (w as { orientation?: number } | undefined)?.orientation ?? 0
  hub?.sample(e.beta ?? 0, e.gamma ?? 0, angle, performance.now())
}
/** Listeners follow the wish: a board subscribed, tilt on, the tab visible. */
function sync() {
  const b = browser()
  const want = !!b && listeners.size > 0 && tiltOn() && b.win.document?.visibilityState !== 'hidden'
  if (want && !attached) { b!.win.addEventListener('deviceorientation', onOrientation, { passive: true }); attached = true }
  else if (!want && attached) { b?.win.removeEventListener('deviceorientation', onOrientation); attached = false; hub?.stop() }
}
function start() {
  const b = browser()
  hub ??= createLightHub({
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms), clearTimeout: h => globalThis.clearTimeout(h as number),
    now: () => performance.now(), reducedMotion: reduced,
  })
  hub.onEmit(publish)
  hub.setTilt(TILT_CODE[tiltState()])
  if (b) {
    const doc = b.win.document
    const vis = () => sync()
    doc.addEventListener('visibilitychange', vis)
    unVisibility = () => doc.removeEventListener('visibilitychange', vis)
    // iOS after a reload: the grant is remembered for the session, but events only flow after
    // requestPermission() runs again inside a gesture. The next click anywhere re-asks, once (no prompt).
    // Passive and on `click` only, so it never claims a touch.
    if (tiltState() === 'prompt' && session.get() === 'granted') {
      const once = () => { off(); void requestTilt() }
      const off = () => { doc.removeEventListener('click', once, true); unRearm = null }
      doc.addEventListener('click', once, { capture: true, passive: true })
      unRearm = off
    }
  }
  sync()
}
function stop() {
  unVisibility?.(); unVisibility = null
  unRearm?.()
  sync()
  hub?.stop()
}

/**
 * The hub as a board `Source`. Fixture (what goldens and snapshots see):
 * `{ lightSrc: 0, lightAz: 0, lightEl: 7, gx: 0, gy: 1, tx: 0, ty: 0, tilt: 0 }`. `push({ beta, gamma, angle? })`
 * feeds one orientation sample by hand (devtools / `window.dot480Live.light`).
 */
export const lightSource: Source<{ beta: number; gamma: number; angle?: number }> = {
  id: 'light',
  keys: Object.keys(LIGHT_FIXTURE),
  fixture: LIGHT_FIXTURE as Data,
  snapshot: () => snap,
  subscribe(listener) {
    listeners.add(listener)
    if (listeners.size === 1) start()
    listener(snap)
    return () => { if (listeners.delete(listener) && listeners.size === 0) stop() }
  },
  push(p) { if (p && typeof p.beta === 'number' && typeof p.gamma === 'number') hub?.sample(p.beta, p.gamma, p.angle ?? 0, performance.now()) },
}
/** Is the `deviceorientation` listener attached right now (probes and checks)? */
export const tiltListening = () => attached
/** Tests only (`scripts/light.ts`): forget this page's permission, choice and hub, as after a reload. */
export function resetTilt(): void {
  if (listeners.size) throw new Error('resetTilt with subscribers')
  permission = null; sensorless = false; choice = null; hub = null; attached = false
  snap = { data: { ...LIGHT_FIXTURE }, status: 'offline', updatedAt: null, error: null, retryInMs: null }
}
