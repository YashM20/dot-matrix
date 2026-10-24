/**
 * Scope — the Instrument's sound as dots (C5). Three TILE cards read one audio frame from
 * `ctx.media` (`src/audio/frame.ts`): the output bus (synth, or the mic when sound is off) as an
 * oscilloscope and an FFT spectrum with peak hold, and the microphone as a ring visualizer.
 * Without live audio (node, goldens, before any tap) each card draws `demoFrame(t)`, a deterministic
 * bass line, so it is a pure function of ctx. The mic only starts on the user's tap and never leaves
 * the page (analysers only, nothing reaches the speakers or the network).
 * Red is the "live" dot top-right, only while a real signal is on screen.
 */
import type { Control } from '../../engine/context'
import type { Tone } from '../../engine/types'
import { BINS, FLOOR_DB, WAVE, audioOf, demoFrame, type AudioFrame } from '../../audio/frame'
import { TAU, TILE, layer, layoutFor, tileStyle, type LatticeField, type WidgetContext, type WidgetPreset } from '../types'

const T = layoutFor(TILE)
type Pt = [number, number]
const style = { ...tileStyle, cornerRoundness: 0 }
const card = { group: 'chart', chrome: 'dots', grid: TILE, style, animated: true } as const
const FOOT = 126
const spots = (pts: Pt[], size: number, v = 1): LatticeField => ({ field: () => v, sites: pts, size })
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const SOURCE_LABEL = { demo: 'DEMO', synth: 'SYNTH', mic: 'MIC' } as const

/** The bus frame for this context: live when the host supplies one, else the stand-in. */
const busOf = (ctx: WidgetContext): AudioFrame => audioOf(ctx) ?? demoFrame(ctx.t)
const liveDot = (f: AudioFrame) => (f.source === 'demo' ? [] : [layer(T.dots([[TILE.cols - 4, 3]], 7), 'active')])

// ── 01 SCOPE ────────────────────────────────────────────────────────────────
// A trigger-aligned trace over an 8×6 graticule. The trace is dot sites along the waveform's
// polyline (~2 cells apart), so steep edges stay continuous instead of breaking into dashes.
const SC = { x: 8, y: 18, w: 128, h: 90, divX: 8, divY: 6 }
const MID = SC.y + SC.h / 2, AMP = SC.h / 2 - 3
const GRAT: Pt[] = []
for (let j = 0; j <= SC.divY; j++) for (let i = 0; i <= SC.divX; i++) GRAT.push([SC.x + (i * SC.w) / SC.divX, SC.y + (j * SC.h) / SC.divY])
// centre cross: finer ticks on the axes
const AXES: Pt[] = []
for (let i = 0; i <= SC.divX * 4; i++) AXES.push([SC.x + (i * SC.w) / (SC.divX * 4), MID])
for (let j = 0; j <= SC.divY * 4; j++) AXES.push([SC.x + SC.w / 2, SC.y + (j * SC.h) / (SC.divY * 4)])

function trace(wave: ArrayLike<number>, spacing = 2.1): Pt[] {
  const pts: Pt[] = [], at = (j: number): Pt => [SC.x + (j * SC.w) / (WAVE - 1), MID - Math.max(-1, Math.min(1, wave[j])) * AMP]
  let carry = 0
  for (let j = 0; j < WAVE - 1; j++) {
    const [x0, y0] = at(j), [x1, y1] = at(j + 1), len = Math.hypot(x1 - x0, y1 - y0)
    let d = carry
    for (; d < len; d += spacing) pts.push([x0 + ((x1 - x0) * d) / len, y0 + ((y1 - y0) * d) / len])
    carry = d - len
  }
  pts.push(at(WAVE - 1))
  return pts
}

export const scopeWave: WidgetPreset = {
  id: 'scope-wave', name: 'Scope', label: '01  SCOPE', ...card,
  layers: ctx => {
    const f = busOf(ctx)
    let pk = 0
    for (let j = 0; j < WAVE; j++) pk = Math.max(pk, Math.abs(f.wave[j]))
    return [
      ...liveDot(f),
      layer(spots(GRAT, 1.6), 'mid'),
      layer(spots(AXES, 1), 'faint'),
      // trigger marker on the left edge of the centre line
      layer(spots([[SC.x - 4, MID - 2], [SC.x - 4, MID + 2], [SC.x - 2, MID]], 1.6), 'idle'),
      layer(spots(trace(f.wave), 2.3)),
      layer(T.text(SOURCE_LABEL[f.source], SC.x, FOOT), 'idle'),
      layer(T.text(`PK ${Math.round(pk * 100)}`, SC.x + SC.w, FOOT, { align: 'right' }), 'idle'),
    ]
  },
}

// ── 02 SPECTRUM ─────────────────────────────────────────────────────────────
// 32 log-spaced bands, each a column of lattice dots (4-cell pitch); held peaks hang above in grey
// and fall after a beat. Unlit lattice sites stay as faint dots so the grid reads at rest.
const SP = { x0: 10, base: 108, gap: 4, pitch: 4, n: 22, size: 3.1 }
const siteAt = (i: number, k: number): Pt => [SP.x0 + i * SP.gap, SP.base - k * SP.pitch]
const LATTICE: Pt[][] = Array.from({ length: BINS }, (_, i) => Array.from({ length: SP.n }, (_, k) => siteAt(i, k)))

export const scopeSpectrum: WidgetPreset = {
  id: 'scope-spectrum', name: 'Spectrum', label: '02  SPECTRUM', ...card,
  layers: ctx => {
    const f = busOf(ctx), lit: Pt[] = [], dark: Pt[] = [], caps: Pt[] = []
    for (let i = 0; i < BINS; i++) {
      const h = Math.round(clamp01(f.bins[i]) * SP.n), p = Math.min(SP.n - 1, Math.round(clamp01(f.peaks[i]) * SP.n))
      LATTICE[i].forEach((pt, k) => (k < h ? lit : k === p && p >= h && p > 0 ? caps : dark).push(pt))
    }
    return [
      ...liveDot(f),
      layer(spots(dark, 1.3), 'faint'),
      layer(spots(lit, SP.size)),
      layer(spots(caps, SP.size), 'idle'),
      layer(T.text('40', SP.x0 - 2, FOOT), 'idle'),
      layer(T.text('1K', SP.x0 + 17.5 * SP.gap, FOOT, { align: 'center' }), 'idle'),
      layer(T.text('16K', SP.x0 + (BINS - 1) * SP.gap + 2, FOOT, { align: 'right' }), 'idle'),
    ]
  },
}

// ── 03 MIC ──────────────────────────────────────────────────────────────────
// The microphone as a ring: 32 bands mirrored left/right into 64 rays around a base circle, dots
// marching outward with energy. Centre: the level in dB once listening, a mic glyph before.
// The whole card is one toggle (`mic`); `micState` (0 idle, 1 asking, 2 live, 3 blocked) comes back
// from the host. Idle, the ring breathes on the stand-in at low gain.
const RING = { cx: 72, cy: 64, r: 24, len: 32, pitch: 3.4, rays: BINS * 2 }
const ray = (j: number) => { const b = j < BINS ? j : RING.rays - 1 - j; return { b, a: ((j + .5) / RING.rays) * TAU } }
const BASE: Pt[] = Array.from({ length: RING.rays }, (_, j) => { const { a } = ray(j); return [RING.cx + RING.r * Math.sin(a), RING.cy - RING.r * Math.cos(a)] })
/** Mic glyph: capsule, cradle and stem, as sites (cells from the centre). */
const MIC_GLYPH: Pt[] = [
  ...[-6, -3, 0, 3].flatMap((y): Pt[] => [[-3, y], [3, y]]), [0, -8.5], [-2, -8], [2, -8], [0, 5.5], [-2, 5], [2, 5],
  [-6.5, 0], [6.5, 0], [-6, 3.5], [6, 3.5], [-4, 7], [4, 7], [0, 11], [-3, 12], [3, 12],
]
const MIC_STATE = ['TAP TO LISTEN', 'ASKING', 'LOCAL ONLY', 'MIC BLOCKED']

export const scopeMic: WidgetPreset = {
  id: 'scope-mic', name: 'Mic', label: '03  MIC', ...card,
  defaults: { mic: 0, micState: 0 },
  controls: [{ key: 'mic', kind: 'toggle', box: [8, 12, 128, 128], label: 'Listen to the microphone' } satisfies Control],
  layers: ctx => {
    const live = audioOf(ctx, 'mic'), f = live ?? demoFrame(ctx.t), gain = live ? 1 : .35
    const state = Math.round(ctx.data.micState ?? 0), hover = ctx.hover === 'mic', press = ctx.pressed === 'mic', focus = ctx.focus === 'mic'
    const tips: Pt[] = [], body: Pt[] = []
    for (let j = 0; j < RING.rays; j++) {
      const { b, a } = ray(j), n = Math.round(clamp01(f.bins[b] * gain) * (RING.len / RING.pitch))
      for (let k = 1; k <= n; k++) {
        const r = RING.r + k * RING.pitch, pt: Pt = [RING.cx + r * Math.sin(a), RING.cy - r * Math.cos(a)]
        ;(k === n ? tips : body).push(pt)
      }
    }
    const db = Math.max(f.level[0], f.level[1])
    const tone: Tone = live ? 'value' : 'mid'
    return [
      ...(live ? [layer(T.dots([[TILE.cols - 4, 3]], 7), 'active')] : []),
      layer(spots(BASE, hover ? 2.6 : 2, press ? .75 : 1), hover ? 'idle' : 'mid'),
      layer(spots(body, 2.2), live ? 'idle' : 'faint'),
      layer(spots(tips, 2.6), tone),
      ...(focus ? [layer(spots(BASE.filter((_, i) => (i + Math.floor(ctx.t * 6)) % 3 !== 0), 1.4), 'value')] : []),
      live
        ? layer(T.big(db <= FLOOR_DB ? '--' : String(Math.round(db)), RING.cx, RING.cy - 7, { lattice: 2, align: 'center' }))
        : layer(spots(MIC_GLYPH.map(([x, y]): Pt => [RING.cx + x, RING.cy - 2 + y]), 2.4, press ? .75 : 1), hover ? 'value' : 'idle'),
      ...(live ? [layer(T.text('DB', RING.cx, RING.cy + 9, { align: 'center' }), 'idle')] : []),
      layer(T.text(MIC_STATE[live ? 2 : state] ?? MIC_STATE[0], RING.cx, FOOT, { align: 'center' }), state === 3 ? 'mid' : 'idle'),
    ]
  },
}

export const scopeBoard: WidgetPreset[] = [scopeWave, scopeSpectrum, scopeMic]
/** Board-shared keys: the mic toggle and its state round-trip through the board store to `src/audio`. */
export const scopeShared = ['mic', 'micState']
