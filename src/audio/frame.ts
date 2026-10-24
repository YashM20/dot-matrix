/**
 * Audio analysis frames, carried into cards through `ctx.media` (the same channel the camera uses).
 * Pure TypeScript, no WebAudio: cards, goldens and snapshots import this, and the browser engine
 * (`engine.ts`) fills it from real `AnalyserNode`s.
 *
 * A frame is a `Raster` on a WAVE×4 grid:
 *   row 0  waveform, trigger-aligned, −1..1
 *   row 1  spectrum, BINS log-spaced bands, 0..1
 *   row 2  spectrum peak hold, 0..1
 *   row 3  [levelL dB, levelR dB, peakL dB, peakR dB, source, recording seconds (−1 = not), latency ms, playing]
 * Without a frame (node, before the user turns sound on) cards draw `demoFrame(t)`, pure in t.
 */
import type { FrameContext } from '../engine/context'
import type { Raster } from '../engine/raster'

export const WAVE = 96
export const BINS = 32
/** Meter floor: anything below reads as silence. */
export const FLOOR_DB = -60
export type AudioSource = 'demo' | 'synth' | 'mic'
const SOURCES: AudioSource[] = ['demo', 'synth', 'mic']

export interface AudioFrame {
  wave: Float32Array
  bins: Float32Array
  peaks: Float32Array
  /** RMS level per channel, dBFS. */
  level: [number, number]
  /** Held peak per channel, dBFS. */
  peak: [number, number]
  source: AudioSource
  /** Seconds recorded so far, or −1 when not recording. */
  rec: number
  /** Output latency (base + output) in ms, 0 when unknown. */
  latencyMs: number
  playing: boolean
}

export function emptyFrame(source: AudioSource = 'demo'): AudioFrame {
  return { wave: new Float32Array(WAVE), bins: new Float32Array(BINS), peaks: new Float32Array(BINS), level: [FLOOR_DB, FLOOR_DB], peak: [FLOOR_DB, FLOOR_DB], source, rec: -1, latencyMs: 0, playing: false }
}

/** Frame → raster (into `into` when given, so the engine allocates once). */
export function encodeFrame(f: AudioFrame, into?: Raster): Raster {
  const r = into ?? { grid: { cols: WAVE, rows: 4 }, space: 'card' as const, data: new Float32Array(WAVE * 4) }
  const d = r.data
  d.set(f.wave.subarray(0, WAVE), 0)
  d.set(f.bins.subarray(0, BINS), WAVE)
  d.set(f.peaks.subarray(0, BINS), WAVE * 2)
  const m = WAVE * 3
  d[m] = f.level[0]; d[m + 1] = f.level[1]; d[m + 2] = f.peak[0]; d[m + 3] = f.peak[1]
  d[m + 4] = SOURCES.indexOf(f.source); d[m + 5] = f.rec; d[m + 6] = f.latencyMs; d[m + 7] = f.playing ? 1 : 0
  return r
}

export function decodeFrame(r: Raster): AudioFrame {
  const d = r.data, m = WAVE * 3
  return {
    wave: d.subarray(0, WAVE), bins: d.subarray(WAVE, WAVE + BINS), peaks: d.subarray(WAVE * 2, WAVE * 2 + BINS),
    level: [d[m], d[m + 1]], peak: [d[m + 2], d[m + 3]], source: SOURCES[d[m + 4]] ?? 'demo', rec: d[m + 5], latencyMs: d[m + 6], playing: d[m + 7] >= .5,
  }
}

/** The live frame named `key` in this frame's media (`audio` = the output bus, `mic` = the microphone), if any. */
export function audioOf(ctx: FrameContext, key: 'audio' | 'mic' = 'audio'): AudioFrame | undefined {
  const r = ctx.media?.[key]
  return r && r.grid.cols === WAVE && r.grid.rows === 4 ? decodeFrame(r) : undefined
}

// ── deterministic stand-in ──────────────────────────────────────────────────
/** A two-voice bass line at 120 BPM: root per beat, a filter sweep per note, harmonics falling as 1/k. */
const ROOTS = [55, 55, 65.41, 49]
const noteAt = (t: number) => { const beat = Math.floor(Math.max(0, t) * 2); return { f: ROOTS[beat % 4], age: Math.max(0, t) * 2 - beat } }
/** Brightness (harmonic roll-off) for a note `age` beats old: plucky, like a filter envelope. */
const bright = (age: number) => 2 + 10 * Math.exp(-age * 4)
const env = (age: number) => .25 + .75 * Math.exp(-age * 2.2)
/** Band centre for band `i` of BINS: 40 Hz … 16 kHz, log spaced. */
export const bandHz = (i: number) => 40 * 400 ** (i / (BINS - 1))
const dbOf = (amp: number) => (amp > 1e-6 ? 20 * Math.log10(amp) : FLOOR_DB)

function demoBins(t: number, out: Float32Array) {
  const { f, age } = noteAt(t), b = bright(age), e = env(age)
  for (let i = 0; i < BINS; i++) {
    // energy of harmonic k nearest the band, plus a little noise floor that breathes with t
    const k = Math.max(1, bandHz(i) / f), harmonic = Math.exp(-(k - 1) / b) / Math.sqrt(k)
    const floor = .05 + .03 * Math.sin(t * 3.1 + i * .7)
    out[i] = Math.max(0, Math.min(1, e * harmonic * 1.15 + floor * (1 - i / BINS)))
  }
}

/** The stand-in frame at `t`: deterministic, so goldens and snapshots are stable. */
export function demoFrame(t: number): AudioFrame {
  const f = emptyFrame('demo'), { age } = noteAt(t), b = bright(age), e = env(age)
  // one trigger-aligned period and a half of a band-limited saw, in phase from 0
  for (let j = 0; j < WAVE; j++) {
    const ph = (j / WAVE) * 2.5 * Math.PI * 2
    let s = 0
    for (let k = 1; k <= 12; k++) s += (Math.sin(ph * k) / k) * Math.exp(-(k - 1) / b)
    f.wave[j] = Math.max(-1, Math.min(1, s * .62 * e))
  }
  demoBins(t, f.bins)
  // peak hold: the max over the last .9 s, falling after a .4 s hold
  const tmp = new Float32Array(BINS)
  for (let k = 0; k <= 9; k++) {
    const back = k * .1
    if (t - back < 0) break
    demoBins(t - back, tmp)
    const fall = 1.2 * Math.max(0, back - .4)
    for (let i = 0; i < BINS; i++) f.peaks[i] = Math.max(f.peaks[i], tmp[i] - fall)
  }
  const amp = .5 * e
  f.level = [dbOf(amp), dbOf(amp * .9)]
  f.peak = [dbOf(.5 * env(Math.min(age, .35))), dbOf(.45 * env(Math.min(age, .35)))]
  return f
}

/**
 * Meter segment (0 … n−1, −1 = dark) for a dB level on the Level card's printed scale:
 * segment 12 = 0 dB, 9 = −6, 6 = −12, 3 = −24, 0 = −48 (piecewise linear in dB between labels).
 */
export function meterSegment(db: number): number {
  const marks: [number, number][] = [[-48, 0], [-24, 3], [-12, 6], [-6, 9], [0, 12]]
  if (db < -54) return -1
  if (db <= marks[0][0]) return 0
  for (let i = 1; i < marks.length; i++) {
    const [d0, s0] = marks[i - 1], [d1, s1] = marks[i]
    if (db <= d1) return Math.round(s0 + ((db - d0) / (d1 - d0)) * (s1 - s0))
  }
  return 12
}
