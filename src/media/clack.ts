/**
 * Flip-disc clack (app side only, muted by default): a short filtered noise tick per column write,
 * louder the more discs flip in it. Fed by `FlipSim.events(t0, t1)` from `src/engine/device`.
 * Enabled with `?clack=1` (or localStorage `dot480:clack` = '1'); the AudioContext only starts after
 * a user gesture, as browsers require.
 */
export interface Clack { play(at: number, count: number): void; close(): void }

export const clackEnabled = (): boolean => {
  if (typeof location === 'undefined') return false
  try { return new URLSearchParams(location.search).get('clack') === '1' || localStorage.getItem('dot480:clack') === '1' } catch { return false }
}

export function createClack(): Clack | null {
  const AC = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext
  if (!AC || typeof document === 'undefined') return null
  const ac = new AC()
  const resume = () => { void ac.resume() }
  document.addEventListener('pointerdown', resume, { once: true })
  // 40 ms of decaying noise, shared by every tick
  const buf = ac.createBuffer(1, Math.round(ac.sampleRate * .04), ac.sampleRate), ch = buf.getChannelData(0)
  let seed = 0x9e3779b9
  for (let i = 0; i < ch.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; ch[i] = ((seed / 2 ** 32) * 2 - 1) * Math.exp(-i / (ac.sampleRate * .006)) }
  const out = ac.createGain(); out.gain.value = .25; out.connect(ac.destination)
  return {
    /** `at`: seconds from now. */
    play(at, count) {
      if (ac.state !== 'running') return
      const src = ac.createBufferSource(), bp = ac.createBiquadFilter(), g = ac.createGain()
      src.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 1.4
      g.gain.value = Math.min(1, .15 + count / 14)
      src.connect(bp); bp.connect(g); g.connect(out)
      src.start(ac.currentTime + Math.max(0, at))
    },
    close() { document.removeEventListener('pointerdown', resume); void ac.close() },
  }
}
