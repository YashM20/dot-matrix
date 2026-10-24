/**
 * Voices for the Instrument (browser WebAudio, app-level). Every voice is a short-lived node chain
 * scheduled at an exact audio time; nothing here touches the DOM.
 *
 * - `synthNote`: 2 oscillators (saw + detuned square an octave down) + a breath of noise → ADSR amp
 *   → the shared resonant filter. Each note also kicks the filter envelope (a ConstantSource feeding
 *   the filter's detune), so knob changes and note plucks never fight over one automation timeline.
 * - Drums: kick (pitch-swept sine), snare (noise + body), hat (high-passed noise), perc (rim click).
 * All pitched/noise sources take the tape-scrub `bend` (cents) on their `detune` input.
 */
export interface VoiceBus {
  ac: AudioContext
  /** Synth voices land here (→ resonant filter). */
  synth: AudioNode
  /** Drums land here (dry of the filter). */
  drums: AudioNode
  /** Cents, summed into every source's detune. */
  bend: AudioNode
  /** Filter envelope (cents into filter.detune): offset param of a ConstantSource. */
  filterEnv: AudioParam
  noise: AudioBuffer
}
export interface Envelope { attack: number; decay: number; sustain: number; release: number }

/** Deterministic white noise, 1 s. */
export function noiseBuffer(ac: BaseAudioContext): AudioBuffer {
  const buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), ch = buf.getChannelData(0)
  let seed = 0x9e3779b9
  for (let i = 0; i < ch.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; ch[i] = (seed / 2 ** 32) * 2 - 1 }
  return buf
}

/** Unhook the bend from a source once it has ended (otherwise the ConstantSource keeps it alive). */
const bendInto = (bus: VoiceBus, src: AudioScheduledSourceNode & { detune: AudioParam }) => {
  bus.bend.connect(src.detune)
  src.addEventListener('ended', () => { try { bus.bend.disconnect(src.detune) } catch { /* already gone */ } }, { once: true })
}
const panner = (bus: VoiceBus, pan: number, into: AudioNode) => {
  const p = bus.ac.createStereoPanner(); p.pan.value = pan; p.connect(into); return p
}

export interface Voice { end: number; kill(at: number): void }

/** One synth note at `t` for `gate` s. Returns its end time and a quick-fade kill (voice stealing). */
export function synthNote(bus: VoiceBus, t: number, hz: number, gate: number, e: Envelope, vel: number, pan: number): Voice {
  const { ac } = bus
  const amp = ac.createGain(), out = panner(bus, pan, bus.synth)
  amp.gain.value = 0; amp.connect(out)
  const o1 = ac.createOscillator(), o2 = ac.createOscillator(), n = ac.createBufferSource()
  const g1 = ac.createGain(), g2 = ac.createGain(), gn = ac.createGain()
  o1.type = 'sawtooth'; o1.frequency.value = hz
  o2.type = 'square'; o2.frequency.value = hz / 2; o2.detune.value = 7
  n.buffer = bus.noise; n.loop = true; n.loopStart = (hz * 7.3) % .5
  g1.gain.value = .32; g2.gain.value = .22; gn.gain.value = .035
  o1.connect(g1).connect(amp); o2.connect(g2).connect(amp); n.connect(gn).connect(amp)
  for (const s of [o1, o2, n]) bendInto(bus, s)

  // ADSR on setTargetAtTime: each segment starts from wherever the last one is, so nothing steps.
  const peak = .5 * vel, a = Math.max(.002, e.attack), off = t + Math.max(gate, .01), r = Math.max(.005, e.release)
  amp.gain.setValueAtTime(0, t)
  amp.gain.setTargetAtTime(peak, t, a / 3)
  if (t + a < off) amp.gain.setTargetAtTime(peak * e.sustain, t + a, Math.max(.005, e.decay / 3))
  amp.gain.setTargetAtTime(0, off, r / 3)
  const end = off + r * 2.2
  for (const s of [o1, o2, n]) { s.start(t); s.stop(end) }

  // filter pluck: up to +2.4 octaves, decaying with the note
  bus.filterEnv.setTargetAtTime(2900 * vel, t, .002)
  bus.filterEnv.setTargetAtTime(0, t + .012, Math.max(.04, Math.min(.5, gate * .9)))
  return {
    end,
    kill(at) {
      if (at >= end) return
      amp.gain.cancelScheduledValues(at); amp.gain.setTargetAtTime(0, at, .006)
      for (const s of [o1, o2, n]) { try { s.stop(at + .05) } catch { /* stopped */ } }
    },
  }
}

export type Drum = 'kick' | 'snare' | 'hat' | 'perc'

export function drum(bus: VoiceBus, kind: Drum, t: number, vel: number, pan: number) {
  const { ac } = bus, out = panner(bus, pan, bus.drums)
  if (kind === 'kick') {
    const o = ac.createOscillator(), g = ac.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + .12)
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.95 * vel, t + .002); g.gain.setTargetAtTime(0, t + .01, .09)
    o.connect(g).connect(out); bendInto(bus, o); o.start(t); o.stop(t + .6)
    // a little click on the front so it reads on small speakers
    noiseHit(bus, out, t, .006, 3000, 'bandpass', .25 * vel)
    return
  }
  if (kind === 'snare') {
    const o = ac.createOscillator(), g = ac.createGain()
    o.type = 'triangle'; o.frequency.setValueAtTime(240, t); o.frequency.exponentialRampToValueAtTime(160, t + .08)
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.35 * vel, t + .002); g.gain.setTargetAtTime(0, t + .005, .05)
    o.connect(g).connect(out); bendInto(bus, o); o.start(t); o.stop(t + .4)
    noiseHit(bus, out, t, .07, 1800, 'highpass', .5 * vel)
    return
  }
  if (kind === 'hat') { noiseHit(bus, out, t, .022, 7500, 'highpass', .28 * vel); return }
  // perc: a short resonant rim click
  noiseHit(bus, out, t, .012, 1200, 'bandpass', .5 * vel, 8)
}

function noiseHit(bus: VoiceBus, out: AudioNode, t: number, tc: number, hz: number, type: BiquadFilterType, level: number, q = .8) {
  const { ac } = bus, n = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain()
  n.buffer = bus.noise; n.loopStart = 0
  f.type = type; f.frequency.value = hz; f.Q.value = q
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + .001); g.gain.setTargetAtTime(0, t + .002, tc)
  n.connect(f).connect(g).connect(out); bendInto(bus, n)
  n.start(t, (t * 7919) % .8); n.stop(t + tc * 8 + .01)
}
