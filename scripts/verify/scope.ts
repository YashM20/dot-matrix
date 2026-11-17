/**
 * SCOPE (#240) card checks for `pnpm verify`: one per bug fixed on the board.
 * Run alone: `pnpm exec tsx scripts/verify/scope.ts`.
 */
import { bandHz, demoFrame } from '../../src/audio/frame'
import { describe } from '../../src/engine/describe'
import { BAND_1K, BLOCKED, BLOCKED_HINT, TRIGGER, peakLabel, scopeMic, scopeSpectrum, scopeWave } from '../../src/widgets/boards/scope'
import { checker, type Assert } from '../lib/check'

const shows = (p: Parameters<typeof describe>[0], ctx: Parameters<typeof describe>[1] = {}) => describe(p, ctx).text.join(' | ')

export function scopeChecks(assert: Assert) {
  // wave: the trigger marker is one solid arrow, every site a lattice step from another (it was two loose dots and a tip)
  {
    const loose = TRIGGER.filter(([x, y]) => !TRIGGER.some(([u, v]) => (u !== x || v !== y) && Math.hypot(u - x, v - y) <= 2.01))
    assert('scope: the trigger marker has no loose dots', TRIGGER.length >= 4 && !loose.length, loose.map(p => p.join(',')).join(' '))
  }
  // wave: the peak carries its unit and the footer names the time across the screen
  {
    const text = shows(scopeWave)
    assert('scope: the wave footer reads the peak in % and the time in MS', /PK \d+%/.test(text) && /\bMS\b/.test(text) && peakLabel(.314) === 'PK 31%', text)
  }
  // spectrum: the axis has its unit, and 1K sits on the 1 kHz band
  {
    const text = shows(scopeSpectrum)
    assert('scope: the spectrum axis says HZ and puts 1K on the 1 kHz band', /\bHZ\b/.test(text) && Math.abs(bandHz(BAND_1K) - 1000) < 1, `${text}; 1K at band ${BAND_1K.toFixed(2)}`)
  }
  // spectrum: the demo's low bands never clip, and their held peaks fall after the hold (they sat at the top)
  {
    let clipped = 0, lo = Infinity, hi = -Infinity
    for (let t = 0; t <= 8; t += .05) {
      const f = demoFrame(t)
      for (let i = 0; i < 4; i++) { if (f.bins[i] >= .97) clipped++; lo = Math.min(lo, f.peaks[i]); hi = Math.max(hi, f.peaks[i]) }
    }
    assert('scope: the demo spectrum\'s low bands stay under the top, and their peaks fall', !clipped && hi - lo > .3, `${clipped} clipped frames, low-band peaks ${lo.toFixed(2)}..${hi.toFixed(2)}`)
  }
  // mic: blocked says what happened and where to fix it; the other states keep one line
  {
    const blocked = shows(scopeMic, { data: { micState: BLOCKED } }), idle = shows(scopeMic)
    assert('scope: the blocked mic says MIC BLOCKED and CHECK SETTINGS, idle does not', blocked.includes('MIC BLOCKED') && blocked.includes(BLOCKED_HINT) && !idle.includes(BLOCKED_HINT), `${blocked} / ${idle}`)
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('verify/scope.ts')) {
  const { assert, done } = checker('scope')
  scopeChecks(assert)
  done('scope: all checks passed')
}
