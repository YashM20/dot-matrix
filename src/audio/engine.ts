/**
 * The Instrument's sound engine (browser, app-level; `src/engine/` stays audio-free).
 *
 *   voices ─► synth bus ─► resonant LPF ─┐
 *   drums ───────────────────────────────┼─► mix ─► (delay send) ─► master gain ─► limiter ─► out
 *                                         │                                                  ├─► speakers
 *   mic ─► mic gain ─► mic analyser ──────┼──────────────────────────► bus analyser ◄───────┤
 *                                                                                            ├─► L/R analysers (meter)
 *                                                                                            └─► MediaStreamDestination (REC)
 *
 * - The AudioContext is created lazily on the first `enable()`, which only ever runs after a user
 *   gesture (the transport's SOUND toggle, the scope's mic toggle).
 * - Notes come from a lookahead `Scheduler` on the audio clock at the board's `bpm`.
 * - Every continuous parameter moves with `setTargetAtTime` (~15 ms), so knobs never zipper.
 * - Analysis frames (`frame.ts`) are read at most once per ~8 ms and handed to cards via `ctx.media`.
 */
import { BINS, FLOOR_DB, WAVE, bandHz, emptyFrame, encodeFrame, type AudioFrame, type AudioSource } from './frame'
import type { Raster } from '../engine/raster'
import { Scheduler, type StepEvent } from './scheduler'
import { drum, noiseBuffer, synthNote, type Drum, type Voice, type VoiceBus } from './voices'

export interface InstrumentParams {
  bpm: number; mode: number; steps: boolean[]
  cutoff: number; resonance: number; attack: number; release: number
  x: number; y: number; crank: number; gain: number
}
export const DEFAULT_PARAMS: InstrumentParams = {
  bpm: 120, mode: 1, steps: [1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0].map(Boolean),
  cutoff: 15 / 24, resonance: 8 / 24, attack: 5 / 24, release: 16 / 24, x: .38, y: .58, crank: 16 + 5 / 24, gain: .8,
}

// ── mapping (the knob cards print the same curves) ──────────────────────────
export const cutoffHz = (v: number) => 20 * 1000 ** v
export const knobSeconds = (v: number) => 5000 ** v / 1000
/** XY pad: x = ±2 octaves on the cutoff, y scales the resonance. Returns [Hz, Q dB]. */
export function filterOf(p: Pick<InstrumentParams, 'cutoff' | 'resonance'>, x: number, y: number): [number, number] {
  const hz = Math.min(18000, Math.max(30, cutoffHz(p.cutoff) * 2 ** ((x - .5) * 4)))
  return [hz, 1 + 22 * Math.min(1, Math.max(0, p.resonance * (.35 + 1.3 * y)))]
}
/** The pad's LFO (same 2:3 Lissajous as the XY card draws), so the filter follows the dot you see. */
export const PAD_LFO = { amp: .2, wx: .7, wy: 1.05 }
export const padAt = (x: number, y: number, t: number, amp = PAD_LFO.amp): [number, number] =>
  [Math.min(1, Math.max(0, x + amp * Math.sin(PAD_LFO.wx * t))), Math.min(1, Math.max(0, y + amp * Math.sin(PAD_LFO.wy * t + .9)))]

/** A minor pentatonic riff, one note per step (Hz). */
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12)
const RIFF = [45, 45, 57, 45, 52, 45, 55, 48, 50, 45, 57, 52, 45, 43, 57, 52].map(midi)
/** Drum per position in the beat (the sequencer's column): downbeat kick, offbeat snare on 2 and 4. */
export function drumFor(step: number): Drum {
  const col = step % 4, row = Math.floor(step / 4) % 4
  return col === 0 ? 'kick' : col === 2 ? (row % 2 ? 'snare' : 'hat') : col === 1 ? 'hat' : 'perc'
}
/** Stereo spread per step (the Level card's L/R differ). */
const panOf = (i: number) => .35 * Math.sin(i * 2.3)
const POLY = 10

type Listener = () => void
export type MicState = 'idle' | 'starting' | 'live' | 'denied'

export class AudioEngine {
  ac: AudioContext | null = null
  params: InstrumentParams = { ...DEFAULT_PARAMS }
  sound = false
  micState: MicState = 'idle'
  /** Steps scheduled since start (tests read `stepLog` to check the grid). */
  readonly stepLog: StepEvent[] = []
  private listeners = new Set<Listener>()
  private g: {
    bus: VoiceBus; filter: BiquadFilterNode; lfoX: ConstantSourceNode; lfoQ: ConstantSourceNode; bend: ConstantSourceNode; master: GainNode
    out: GainNode; delay: DelayNode; send: GainNode; analyserL: AnalyserNode; analyserR: AnalyserNode; busA: AnalyserNode; micA: AnalyserNode; rec: MediaStreamAudioDestinationNode
  } | null = null
  private sched: Scheduler | null = null
  private voices: Voice[] = []
  private mic: { stream: MediaStream; node: MediaStreamAudioSourceNode; gain: GainNode } | null = null
  private lastPad = -1e9
  private lastCrank: { v: number; at: number } | null = null
  private recordStart = -1
  private cache: { at: number; audio?: Raster; mic?: Raster } = { at: -1 }
  private holds = { audio: new Hold(BINS + 2), mic: new Hold(BINS + 2) }

  /** Stable identity (React's useSyncExternalStore). */
  subscribe = (cb: Listener) => { this.listeners.add(cb); return () => { this.listeners.delete(cb) } }
  private emit() { for (const cb of this.listeners) cb() }

  get playing() { return !!this.sched?.running }
  /** Live analysis is worth wiring into cards (sound on or mic live). */
  get active() { return this.sound || this.micState === 'live' }
  /** Base + output latency, s (what the visuals lag the scheduler by). */
  get latency() { const ac = this.ac; return ac ? (ac.baseLatency || 0) + ((ac as AudioContext & { outputLatency?: number }).outputLatency || 0) : 0 }

  /** Create (first time) and resume the context. Call from a user gesture's consequences only. */
  async enable(): Promise<AudioContext | null> {
    if (!this.ac) {
      const AC = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext
      if (!AC) return null
      this.ac = new AC({ latencyHint: 'interactive' })
      this.build(this.ac)
    }
    if (this.ac.state !== 'running') await this.ac.resume().catch(() => {})
    return this.ac
  }

  private build(ac: AudioContext) {
    const filter = ac.createBiquadFilter(); filter.type = 'lowpass'
    const synth = ac.createGain(), drums = ac.createGain(), mix = ac.createGain(), master = ac.createGain(), out = ac.createGain()
    synth.gain.value = .9; drums.gain.value = .85; master.gain.value = 0
    const constant = (v = 0) => { const c = ac.createConstantSource(); c.offset.value = v; c.start(); return c }
    const filterEnv = constant(), lfoX = constant(), lfoQ = constant(), bend = constant()
    filterEnv.connect(filter.detune); lfoX.connect(filter.detune); lfoQ.connect(filter.Q)
    synth.connect(filter).connect(mix); drums.connect(mix)
    // dotted-eighth delay send, darkened in the loop
    const send = ac.createGain(), delay = ac.createDelay(2), fb = ac.createGain(), tone = ac.createBiquadFilter()
    send.gain.value = .22; fb.gain.value = .38; tone.type = 'lowpass'; tone.frequency.value = 2600
    mix.connect(send).connect(delay).connect(tone).connect(fb).connect(delay); tone.connect(master)
    mix.connect(master)
    const limiter = ac.createDynamicsCompressor()
    limiter.threshold.value = -6; limiter.knee.value = 6; limiter.ratio.value = 12; limiter.attack.value = .003; limiter.release.value = .12
    master.connect(limiter).connect(out)
    out.connect(ac.destination)
    const rec = ac.createMediaStreamDestination(); out.connect(rec)
    const split = ac.createChannelSplitter(2), analyserL = ac.createAnalyser(), analyserR = ac.createAnalyser()
    for (const a of [analyserL, analyserR]) { a.fftSize = 1024; a.smoothingTimeConstant = 0 }
    out.connect(split); split.connect(analyserL, 0); split.connect(analyserR, 1)
    const busA = ac.createAnalyser(); busA.fftSize = 4096; busA.smoothingTimeConstant = .55; out.connect(busA)
    const micA = ac.createAnalyser(); micA.fftSize = 4096; micA.smoothingTimeConstant = .55
    this.g = {
      bus: { ac, synth, drums, bend, filterEnv: filterEnv.offset, noise: noiseBuffer(ac) },
      filter, lfoX, lfoQ, bend, master, out, delay, send, analyserL, analyserR, busA, micA, rec,
    }
    this.applyParams(true)
  }

  /** The stream REC records (the limiter's output). */
  get stream(): MediaStream | null { return this.g?.rec.stream ?? null }

  // ── parameters ────────────────────────────────────────────────────────────
  setParams(next: Partial<InstrumentParams>) {
    const prev = this.params
    this.params = { ...prev, ...next }
    if (!this.ac) return
    const now = this.ac.currentTime
    if (next.x !== undefined && next.x !== prev.x || next.y !== undefined && next.y !== prev.y) this.lastPad = now
    if (next.crank !== undefined && next.crank !== prev.crank) this.scrub(next.crank, now)
    this.applyParams(false)
    // tempo: the delay stays a dotted eighth
    this.glide(this.g!.delay.delayTime, (45 / this.params.bpm), .05)
  }

  private glide(p: AudioParam, v: number, tc = .015) { if (this.ac) p.setTargetAtTime(v, this.ac.currentTime, tc) }

  private applyParams(instant: boolean) {
    const g = this.g
    if (!g || !this.ac) return
    const p = this.params, [hz, q] = filterOf(p, p.x, p.y), gain = this.sound && p.mode !== 2 ? p.gain * p.gain * 1.25 : 0
    if (instant) { g.filter.frequency.value = hz; g.filter.Q.value = q; g.delay.delayTime.value = 45 / p.bpm; return }
    this.glide(g.filter.frequency, hz)
    this.glide(g.filter.Q, q)
    this.glide(g.master.gain, gain, p.mode === 2 ? .14 : .02)
  }

  /** Crank = tape scrub: turn speed bends everything (1 turn/s = +1 octave), then it settles back. */
  private scrub(v: number, now: number) {
    const last = this.lastCrank, g = this.g
    this.lastCrank = { v, at: now }
    if (!last || !g) return
    const dt = Math.max(.016, now - last.at), cents = Math.max(-2400, Math.min(2400, ((v - last.v) / dt) * 1200))
    const p = g.bend.offset
    p.cancelScheduledValues(now); p.setValueAtTime(p.value, now)
    p.setTargetAtTime(cents, now, .025)
    p.setTargetAtTime(0, now + .09, .14)
  }

  // ── transport ─────────────────────────────────────────────────────────────
  /** Sound on/off (the SOUND toggle). Off fades out and suspends the context. */
  async setSound(on: boolean) {
    if (on === this.sound) return
    this.sound = on
    if (on) { await this.enable(); this.applyParams(false) }
    else {
      this.stopTransport(false); this.applyParams(false)
      // after the fade, let the context sleep (unless the mic still needs it)
      setTimeout(() => { if (!this.active && this.ac?.state === 'running') void this.ac.suspend() }, 400)
    }
    this.syncTransport()
    this.emit()
  }

  /** Start/stop the scheduler to match sound + mode. */
  syncTransport() {
    const want = this.sound && this.params.mode !== 2 && !!this.ac
    if (want && !this.playing) this.startTransport()
    else if (!want && this.playing) this.stopTransport(true)
  }

  private startTransport() {
    const ac = this.ac!, g = this.g!
    g.bend.offset.cancelScheduledValues(ac.currentTime); g.bend.offset.setTargetAtTime(0, ac.currentTime, .01)
    this.stepLog.length = 0
    // 200 ms ahead (not the classic 100): the timer's tick runs on the main thread, which also samples cards
    this.sched = new Scheduler({ now: () => ac.currentTime, bpm: () => this.params.bpm, onStep: e => this.onStep(e), ahead: .2 })
    this.sched.start(ac.currentTime + .06)
    this.emit()
  }

  /** Stop; with `tape`, the pitch dives like a tape machine spinning down. */
  private stopTransport(tape: boolean) {
    const s = this.sched
    if (!s) return
    s.stop(); this.sched = null
    const ac = this.ac, g = this.g
    if (ac && g && tape) {
      const now = ac.currentTime, p = g.bend.offset
      p.cancelScheduledValues(now); p.setValueAtTime(p.value, now); p.linearRampToValueAtTime(-2400, now + .45)
    }
    this.emit()
  }

  private onStep(e: StepEvent) {
    if (this.stepLog.length < 4096) this.stepLog.push(e)
    const g = this.g!, p = this.params, i = e.step % 16, tTransport = e.step * e.dur
    // the pad's LFO, ramped step to step (sample accurate, no zipper); it rests while the pad is being dragged
    const amp = e.time - this.lastPad < .4 ? 0 : PAD_LFO.amp
    const [lx, ly] = padAt(p.x, p.y, tTransport, amp), [hz0, q0] = filterOf(p, p.x, p.y), [hz1, q1] = filterOf(p, lx, ly)
    g.lfoX.offset.linearRampToValueAtTime(1200 * Math.log2(hz1 / hz0), e.time)
    g.lfoQ.offset.linearRampToValueAtTime(q1 - q0, e.time)
    if (!p.steps[i]) return
    const accent = i % 4 === 0 ? 1 : .78
    drum(g.bus, drumFor(i), e.time, accent, panOf(i))
    // voice stealing: keep at most POLY voices sounding
    this.voices = this.voices.filter(v => v.end > e.time)
    while (this.voices.length >= POLY) this.voices.shift()!.kill(e.time)
    const env = { attack: knobSeconds(p.attack), decay: .18, sustain: .55, release: knobSeconds(p.release) }
    this.voices.push(synthNote(g.bus, e.time, RIFF[i], e.dur * .85, env, accent, panOf(i) * .6))
  }

  /** Transport seconds of what is heard now (steps × sixteenth at the current tempo), while playing. */
  transportTime(): number | undefined {
    if (!this.sched?.running || !this.ac) return undefined
    return this.sched.position(this.ac.currentTime - this.latency) * (15 / this.params.bpm)
  }

  // ── recording clock (the recorder itself lives in record.ts) ──────────────
  markRecording(on: boolean) { this.recordStart = on && this.ac ? this.ac.currentTime : -1; this.emit() }
  get recordingSeconds() { return this.recordStart >= 0 && this.ac ? this.ac.currentTime - this.recordStart : -1 }

  // ── mic ───────────────────────────────────────────────────────────────────
  async setMic(on: boolean) {
    if (!on) {
      this.mic?.stream.getTracks().forEach(t => t.stop()); this.mic?.node.disconnect(); this.mic?.gain.disconnect(); this.mic = null
      if (this.micState !== 'idle') { this.micState = 'idle'; this.emit() }
      return
    }
    if (this.mic || this.micState === 'starting') return
    this.micState = 'starting'; this.emit()
    try {
      const ac = await this.enable()
      if (!ac || !navigator.mediaDevices?.getUserMedia) throw new Error('no getUserMedia')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false })
      if (this.micState !== 'starting') { stream.getTracks().forEach(t => t.stop()); return }
      const node = ac.createMediaStreamSource(stream), gain = ac.createGain()
      gain.gain.value = 1
      // analysers only: the mic never reaches the speakers (no feedback, nothing leaves the page)
      node.connect(gain); gain.connect(this.g!.micA); gain.connect(this.g!.busA)
      this.mic = { stream, node, gain }
      this.micState = 'live'
    } catch { this.micState = 'denied' }
    this.emit()
  }

  // ── analysis ─────────────────────────────────────────────────────────────
  private buf = { time: new Float32Array(4096), freq: new Float32Array(2048), lr: new Float32Array(1024) }
  private rasters = { audio: undefined as Raster | undefined, mic: undefined as Raster | undefined }

  /** `ctx.media` for this frame, or undefined when nothing is live. Cheap to call per card. */
  media(): Record<string, Raster | undefined> | undefined {
    if (!this.g || !this.ac || !this.active) return undefined
    const at = performance.now()
    if (at - this.cache.at > 8) {
      const busSource: AudioSource = this.sound ? 'synth' : 'mic'
      this.rasters.audio = encodeFrame(this.analyse(this.g.busA, busSource, this.sound), this.rasters.audio)
      this.rasters.mic = this.micState === 'live' ? encodeFrame(this.analyse(this.g.micA, 'mic', false), this.rasters.mic) : undefined
      this.cache = { at }
    }
    return { audio: this.rasters.audio, mic: this.rasters.mic }
  }

  /** One analysis frame from `a` (stereo levels from the L/R analysers when `stereo`). */
  analyse(a: AnalyserNode, source: AudioSource, stereo: boolean): AudioFrame {
    const f = emptyFrame(source), { time, freq } = this.buf, ac = this.ac!
    a.getFloatTimeDomainData(time)
    // trigger: first rising zero crossing in the first half, then WAVE samples decimated over ~20 ms
    const n = a.fftSize, span = Math.min(n / 2, Math.round(ac.sampleRate * .02)), step = span / WAVE
    let start = 0
    for (let i = 1; i < n / 2; i++) if (time[i - 1] < 0 && time[i] >= 0) { start = i; break }
    for (let j = 0; j < WAVE; j++) f.wave[j] = Math.max(-1, Math.min(1, time[start + Math.floor(j * step)] * 1.6))
    a.getFloatFrequencyData(freq.subarray(0, a.frequencyBinCount))
    const hzPerBin = ac.sampleRate / n, now = ac.currentTime, hold = this.holds[source === 'mic' && !stereo ? 'mic' : 'audio']
    for (let i = 0; i < BINS; i++) {
      const lo = Math.max(1, Math.floor(bandHz(i - .5) / hzPerBin)), hi = Math.max(lo + 1, Math.ceil(bandHz(i + .5) / hzPerBin))
      let m = -Infinity
      for (let k = lo; k < hi && k < a.frequencyBinCount; k++) m = Math.max(m, freq[k])
      // −90 … −20 dB → 0 … 1, tilted up a little so the highs read
      f.bins[i] = Math.max(0, Math.min(1, (m + 90 + i * .5) / 70))
      f.peaks[i] = hold.update(i, f.bins[i], now, .45, .9)
    }
    const levelOf = (an: AnalyserNode) => {
      const b = this.buf.lr; an.getFloatTimeDomainData(b)
      let s = 0; for (let i = 0; i < b.length; i++) s += b[i] * b[i]
      const rms = Math.sqrt(s / b.length)
      return rms > 1e-5 ? Math.max(FLOOR_DB, 20 * Math.log10(rms) + 3) : FLOOR_DB
    }
    const lv: [number, number] = stereo && this.g ? [levelOf(this.g.analyserL), levelOf(this.g.analyserR)] : (() => { const l = levelOf(a); return [l, l] as [number, number] })()
    f.level = lv
    f.peak = [hold.update(BINS, lv[0], now, .5, 24), hold.update(BINS + 1, lv[1], now, .5, 24)]
    f.rec = this.recordingSeconds; f.latencyMs = this.latency * 1000; f.playing = this.playing
    return f
  }
}

/** Peak hold per channel: holds `hold` s, then falls `fall` units/s until the signal catches it. */
class Hold {
  private v: Float32Array; private at: Float64Array
  constructor(n: number) { this.v = new Float32Array(n).fill(-1e9); this.at = new Float64Array(n) }
  update(i: number, x: number, now: number, hold: number, fall: number) {
    const age = now - this.at[i], held = age < hold ? this.v[i] : this.v[i] - fall * (age - hold)
    if (x >= held) { this.v[i] = x; this.at[i] = now; return x }
    return held
  }
}

let engine: AudioEngine | null = null
/** The page's one engine (no AudioContext until `enable()`). */
export const audioEngine = () => (engine ??= new AudioEngine())
