/**
 * Board ↔ audio bridge (app-level React). The Instrument and Scope boards keep their controls in the
 * board's shared store; this hook pushes that store into the engine, writes engine state back
 * (`micState`, `mode` when sound starts), and wraps the board's presets so each frame's context gets
 * the live analysis (`ctx.media.audio` / `.mic`) and, while the transport runs, `t` on the audio clock,
 * so the playhead, beat lights and pad LFO are locked to what you hear. With nothing live the
 * original presets go through untouched (worker sampling, goldens' code path).
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import type { ControlPatch } from '../engine/interaction/controls'
import type { WidgetPreset } from '../widgets/types'
import { DEFAULT_PARAMS, audioEngine, type InstrumentParams, type MicState } from './engine'
import { download, startRecording, type Recorder, type Recording } from './record'

type Role = 'instrument' | 'scope'
const roleOf = (id: string): Role | null => (id === 'instrument' || id === 'scope' ? id : null)
export const MIC_CODE: Record<MicState, number> = { idle: 0, starting: 1, live: 2, denied: 3 }

const num = (d: ControlPatch, k: string, fallback: number) => (typeof d[k] === 'number' ? d[k] : fallback)
export function paramsOf(d: ControlPatch): InstrumentParams {
  const p = DEFAULT_PARAMS
  return {
    bpm: num(d, 'bpm', p.bpm), mode: Math.round(num(d, 'mode', 0)), steps: p.steps.map((on, i) => num(d, `s${i}`, on ? 1 : 0) >= .5),
    cutoff: num(d, 'cutoff', p.cutoff), resonance: num(d, 'resonance', p.resonance), attack: num(d, 'attack', p.attack), release: num(d, 'release', p.release),
    x: num(d, 'x', p.x), y: num(d, 'y', p.y), crank: num(d, 'crank', p.crank), gain: num(d, 'gain', p.gain),
  }
}
const snapshot = (p: InstrumentParams): ControlPatch => ({
  sound: 1, bpm: p.bpm, mode: p.mode, cutoff: p.cutoff, resonance: p.resonance, attack: p.attack, release: p.release,
  x: p.x, y: p.y, crank: p.crank, gain: p.gain, ...Object.fromEntries(p.steps.map((on, i) => [`s${i}`, on ? 1 : 0])),
})

// ── page-level state: survives a board switch between Instrument and Scope ──
let holders = 0, releaseTimer = 0
let recorder: Recorder | null = null
/** Saved clips this page session (tests and the console read `window.dot480Audio`). */
const recordings: (Pick<Recording, 'kind' | 'mime' | 'seconds' | 'name'> & { size: number })[] = []
if (typeof window !== 'undefined') (window as unknown as { dot480Audio?: unknown }).dot480Audio = { engine: audioEngine, recordings }
let gestureHooked = false
const hookGesture = () => {
  if (gestureHooked || typeof document === 'undefined') return
  gestureHooked = true
  // a suspended context (autoplay policy, tab restore) wakes on the next gesture
  const wake = () => { const e = audioEngine(); if (e.active && e.ac?.state === 'suspended') void e.ac.resume() }
  document.addEventListener('pointerdown', wake, true); document.addEventListener('keydown', wake, true)
}

async function stopRecording() {
  const r = recorder
  recorder = null
  audioEngine().markRecording(false)
  const clip = await r?.stop()
  if (!clip) return
  recordings.push({ kind: clip.kind, mime: clip.mime, seconds: clip.seconds, name: clip.name, size: clip.blob.size })
  if (clip.kind === 'audio') console.info('dot480: this browser cannot capture the board as video; saved the jam as audio-only .webm')
  download(clip)
}

const wrapped = new WeakMap<WidgetPreset, WidgetPreset>()
function live(p: WidgetPreset): WidgetPreset {
  let w = wrapped.get(p)
  if (!w) {
    const eng = audioEngine()
    w = {
      ...p,
      layers: ctx => {
        const media = eng.media(), t = eng.transportTime()
        if (!media && t === undefined) return p.layers(ctx)
        return p.layers({ ...ctx, ...(t !== undefined && { t }), ...(media && { media: { ...ctx.media, ...media } }) })
      },
    }
    wrapped.set(p, w)
  }
  return w
}

/**
 * Drive the audio engine from the board store of the `instrument` / `scope` boards (no-op elsewhere).
 * Returns the preset mapper for the board's cards. `titleId` locates the board for REC.
 */
export function useAudio(boardId: string, shared: ControlPatch, onShared: (patch: ControlPatch) => void, titleId: string): (p: WidgetPreset) => WidgetPreset {
  const role = roleOf(boardId), eng = audioEngine()
  const latest = useRef(shared)
  useEffect(() => { latest.current = shared }, [shared])
  const skip = useRef(false)

  // hold the engine while mounted; a short grace period lets Instrument → Scope keep the music going
  useEffect(() => {
    if (!role) return
    holders++; clearTimeout(releaseTimer); hookGesture()
    if (role === 'instrument' && eng.sound) { skip.current = true; onShared(snapshot(eng.params)) }
    const off = eng.subscribe(() => {
      const code = MIC_CODE[eng.micState]
      if (role === 'scope' && latest.current.micState !== code) onShared({ micState: code, ...(eng.micState === 'idle' && { mic: 0 }) })
    })
    return () => {
      off()
      if (role === 'scope') void eng.setMic(false)
      if (--holders > 0) return
      releaseTimer = window.setTimeout(() => {
        if (holders > 0) return
        void stopRecording(); void eng.setSound(false); void eng.setMic(false)
      }, 1200)
    }
  }, [role]) // eslint-disable-line react-hooks/exhaustive-deps

  // store → engine
  useEffect(() => {
    if (!role) return
    if (skip.current) { skip.current = false; return }
    if (role === 'scope') { void eng.setMic((shared.mic ?? 0) >= .5); return }
    const sound = (shared.sound ?? 0) >= .5, p = paramsOf(shared)
    // turning sound on never starts a recording: the transport's resting REC becomes PLAY
    if (sound && !eng.sound && p.mode === 0) { p.mode = 1; onShared({ mode: 1 }) }
    eng.setParams(p)
    void eng.setSound(sound).then(() => eng.syncTransport())
    eng.syncTransport()
    const rec = sound && p.mode === 0 && !!eng.stream
    if (rec && !recorder) {
      const root = document.getElementById(titleId)?.closest('section') ?? null
      recorder = startRecording(eng.stream!, root)
      eng.markRecording(!!recorder)
    } else if (!rec && recorder) void stopRecording()
  }, [role, shared]) // eslint-disable-line react-hooks/exhaustive-deps

  const active = useSyncExternalStore(eng.subscribe, () => eng.active, () => false)
  return useCallback((p: WidgetPreset) => (role && active ? live(p) : p), [role, active])
}
