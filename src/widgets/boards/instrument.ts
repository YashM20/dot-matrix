/**
 * Board 10 — Instrument: the Phase 2 flagship. A Teenage Engineering-style device spread over a
 * 3×3 board of TILE cards: four detented knobs, a stereo meter, an XY pad, transport, a 16-step
 * sequencer and a crank. Every card declares `controls` bound to its `data` keys and renders
 * purely from the frame context (`data`, `hover`, `pressed`, `focus`, `t`); the input layer only
 * edits data, so goldens stay deterministic.
 *
 * Interaction grammar: the components kit's (`../dot-controls`, #358), the same on every card:
 * - hover: two `value` halos round the part under the pointer (never the accent);
 * - press: the pressed part drops one quantize step (1 → .75 on the 5-step ladder);
 * - focus: the marching `idle` ring, still under reduced motion.
 * Each card picks the outline and the ring's distance; where a neighbour sits closer than a halo reaches, the halo's
 * sites give way (`clear`).
 * Red (`active`) is only ever the sequencer playhead, the record light and the XY pad's live dot.
 *
 * Sound (C5, `src/audio/`): the transport's SOUND toggle starts the WebAudio engine; the board store
 * then drives a synth + drum kit from these same keys. While it runs the host passes the live analysis
 * in `ctx.media.audio` (the meter reads real levels) and `t` on the audio clock; without it (node,
 * goldens, sound off) every card renders exactly as before.
 */
import { TEENAGE_ENGINEERING } from '../creditSources'
import type { Control } from '../../engine/context'
import type { Tone } from '../../engine/types'
import { audioOf, meterSegment } from '../../audio/frame'
import { polar } from '../dials'
import { PRESS, circle, clear, clock, dimmed, glow, marching, rr, states, transportGlyph, ui } from '../dot-controls'
import { TAU, TILE, layer, layoutFor, tileCircleStyle, type LatticeField, type WidgetPreset } from '../types'

const T = layoutFor(TILE)
type Pt = [number, number]
/** Knobs, handles and step LEDs are true circles, like the components board. */
const style = tileCircleStyle
const device = { group: 'composite', chrome: 'dots', grid: TILE, style, animated: true } as const
const deg = (d: number) => (d / 360) * TAU
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const pad = (n: number, w: number) => String(Math.max(0, Math.round(n))).padStart(w, '0')
/** Footer baseline shared by every card, so captions line up across the device. */
const FOOT = 126

const spots = (pts: Pt[], size: number, v = 1): LatticeField => ({ field: () => v, sites: pts, size })
/** Sites round a circle, about `spacing` cells apart (button rings, the crank's wheel). */
const ring = (cx: number, cy: number, r: number, spacing: number): Pt[] => {
  const n = Math.max(6, Math.round((TAU * r) / spacing))
  return Array.from({ length: n }, (_, i) => polar(cx, cy, r, (i / n) * TAU))
}

// ── 01 · 02 · 04 · 05 KNOBS ─────────────────────────────────────────────────
// One huge site for the knob body with a pointer dot on it, inside a detent scale open at the
// bottom (7:30 → 4:30); the readout sits in the scale's mouth.
const KNOB = { cx: 72, cy: 66, r: 46, detents: 25, body: 44, bodyR: 19, tip: 11.5, start: deg(225), sweep: deg(270) }
const STEPS = KNOB.detents - 1
interface KnobSpec { id: string; name: string; index: string; key: string; detent: number; read: (v: number) => [string, string] }
const hz = (v: number): [string, string] => {
  const f = 20 * 1000 ** v
  return [f < 1000 ? `${Math.round(f)}` : f < 10000 ? `${(f / 1000).toFixed(1)}K` : `${Math.round(f / 1000)}K`, 'HZ']
}
const time = (v: number): [string, string] => { const ms = 5000 ** v; return ms < 1000 ? [`${Math.round(ms)}`, 'MS'] : [(ms / 1000).toFixed(1), 'SEC'] }
/** A knob's reading as a screen reader should say it: "1.5 kHz", "120 ms", "2.4 seconds", "33%". */
const spoken = ([n, unit]: [string, string]) => unit === '%' ? `${n}%` : unit === 'HZ' ? (n.endsWith('K') ? `${n.slice(0, -1)} kHz` : `${n} Hz`) : unit === 'MS' ? `${n} ms` : `${n} seconds`
function knob(spec: KnobSpec): WidgetPreset {
  const { cx, cy, r, body, bodyR, tip, start, sweep } = KNOB
  const scale = Array.from({ length: KNOB.detents }, (_, i) => polar(cx, cy, r, start + (i / STEPS) * sweep))
  const controls: Control[] = [{ key: spec.key, kind: 'knob', box: [cx - r, cy - r, 2 * r, 2 * r], min: 0, max: 1, step: 1 / STEPS, label: spec.name,
    valueText: v => spoken(spec.read(Math.round(clamp01(v) * STEPS) / STEPS)) }]
  return {
    id: spec.id, name: spec.name, label: `${spec.index}  ${spec.name.toUpperCase()}`, ...device,
    credit: TEENAGE_ENGINEERING,
    defaults: { [spec.key]: spec.detent / STEPS }, controls,
    layers: ctx => {
      const k = Math.round(clamp01(ctx.data[spec.key] ?? 0) * STEPS), s = ui(ctx, spec.key), v = s.pressed ? PRESS : 1
      const [num, unit] = spec.read(k / STEPS)
      return [
        layer(spots(scale.slice(k + 1), 2.4), 'mid'),
        layer(spots(scale.slice(0, k + 1), 3.6)),
        layer(spots([[cx, cy]], body, v), 'mid'),
        layer(spots([polar(cx, cy, tip, start + (k / STEPS) * sweep)], 7, v)),
        // the focus ring sits inside the detent scale (the components knob's goes outside): the readout fills the mouth
        ...states(s, ctx.t, circle(cx, cy, bodyR), circle(cx, cy, bodyR), 10),
        layer(T.big(num, cx, 101, { lattice: 2, align: 'center' })),
        layer(T.text(unit, cx, FOOT, { align: 'center' }), 'idle'),
      ]
    },
  }
}
export const cutoff = knob({ id: 'inst-cutoff', name: 'Cutoff', index: '01', key: 'cutoff', detent: 15, read: hz })
export const resonance = knob({ id: 'inst-resonance', name: 'Resonance', index: '02', key: 'resonance', detent: 8, read: v => [`${Math.round(v * 100)}`, '%'] })
export const attack = knob({ id: 'inst-attack', name: 'Attack', index: '04', key: 'attack', detent: 5, read: time })
export const release = knob({ id: 'inst-release', name: 'Release', index: '05', key: 'release', detent: 16, read: time })

// ── shared clock: the sequencer's pattern drives the meter ──────────────────
/** The default 16-step pattern (kick on the beats, off-beat ghosts). */
const PATTERN = [1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0]
const BPM = 120
/** Sixteenth-note index at `t` — pure in t, tempo from data. */
const stepAt = (t: number, bpm: number) => Math.floor((Math.max(0, t) * bpm) / 15)
const stepKey = (i: number) => `s${i}`
/** Transport `mode` 2 = stop: the meter goes silent and the playhead parks. */
const runningOf = (data: Record<string, number>) => Math.round(data.mode ?? 1) !== 2
/**
 * Board-shared data keys (`BoardDef.shared`): tempo, transport mode and the 16 steps live in one
 * board store, so sequencer edits, stop and tempo reach the meter and the playhead. A card alone
 * (gallery, goldens) falls back to the defaults below, so its resting frame is unchanged.
 */
export const instrumentShared = ['bpm', 'mode', 'sound', 'cutoff', 'resonance', 'attack', 'release', 'gain', 'x', 'y', 'crank', ...PATTERN.map((_, i) => stepKey(i))]

// ── 03 LEVEL ────────────────────────────────────────────────────────────────
// A stereo LED ladder fed by the sequencer's pattern at the transport tempo (board-shared data,
// defaults when alone): each hit kicks both channels (panned per step), decays, and leaves a held
// peak that falls after a beat. Stopped transport = silence.
const METER = { xs: [52, 92], base: 114, n: 13, pitch: 7.3, size: 6 }
/** The gain handle's sites, in cells out from each meter's centre (clear of the 6-cell meter dots). */
const GAIN_CAP = [8, 11, 14]
const DECAY = .28, HOLD = .5, FALL = .9, LOOK = 1.4
interface Song { bpm: number; pattern: boolean[] }
const songOf = (data: Record<string, number>): Song => ({ bpm: Math.max(1, data.bpm ?? BPM), pattern: PATTERN.map((on, i) => (data[stepKey(i)] ?? on) >= .5) })
const hit = (t: number, side: number, { bpm, pattern }: Song) => {
  const dur = 15 / bpm, now = stepAt(t, bpm)
  let e = .1 + .04 * Math.sin(5.3 * t + side * 1.7)
  for (let j = now; j > now - 8 && j >= 0; j--) {
    const i = j % 16
    if (!pattern[i]) continue
    const vel = (i % 4 ? .72 : .96) * (1 + .1 * Math.sin(i * 2.3 + side * Math.PI))
    e = Math.max(e, vel * Math.exp(-(t - j * dur) / DECAY))
  }
  return e
}
const peakOf = (t: number, side: number, song: Song) => {
  let p = 0
  for (let k = 0; k <= 28; k++) { const back = (k / 28) * LOOK; if (t - back < 0) break; p = Math.max(p, hit(t - back, side, song) - FALL * Math.max(0, back - HOLD)) }
  return p
}
export const meter: WidgetPreset = {
  id: 'inst-level', name: 'Level', label: '03  LEVEL', ...device,
  credit: TEENAGE_ENGINEERING,
  defaults: { gain: .8 },
  controls: [{ key: 'gain', kind: 'slider', orientation: 'vertical', box: [36, 20, 72, 100], min: 0, max: 1, step: 1 / 20, label: 'Output gain' }],
  layers: ctx => {
    const { xs, base, n, pitch, size } = METER, s = ui(ctx, 'gain'), v = s.pressed ? PRESS : 1, gain = clamp01(ctx.data.gain ?? .8) * 1.15
    const y = (i: number) => base - i * pitch, song = songOf(ctx.data), running = runningOf(ctx.data), live = audioOf(ctx)
    const out = METER.xs.flatMap((x, side) => {
      // live: RMS and held peak in dBFS on the printed scale (gain is already in the signal); else the simulation
      const lit = live ? meterSegment(live.level[side]) + 1 : running ? Math.round(clamp01(hit(ctx.t, side, song) * gain) * n) : 0
      const peak = live ? meterSegment(live.peak[side]) : running ? Math.round(clamp01(peakOf(ctx.t, side, song) * gain) * n) - 1 : -1
      const seg = Array.from({ length: n }, (_, i): Pt => [x, y(i)])
      return [
        layer(spots(seg.slice(lit).filter((_, i) => i + lit !== peak), size), 'faint'),
        layer(spots(seg.slice(0, lit), size, v)),
        ...(peak >= lit ? [layer(spots([seg[peak]], size), 'idle')] : []),
        layer(T.text(side ? 'R' : 'L', x, FOOT, { align: 'center' }), 'idle'),
      ]
    })
    const g = y(Math.round(clamp01(ctx.data.gain ?? .8) * (n - 1)))
    // the gain handle: a short bar outside each meter at the gain row, like a fader cap
    const cap = GAIN_CAP.flatMap((dx): Pt[] => [[xs[0] - dx, g], [xs[1] + dx, g]])
    return [
      ...out,
      ...[[12, '0'], [9, '-6'], [6, '-12'], [3, '-24'], [0, '-48']].map(([i, s]) => layer(T.text(String(s), 72, Math.round(y(+i) - 3), { align: 'center' }), 'mid')),
      layer(T.text('DB', 72, FOOT, { align: 'center' }), 'idle'),
      // hover haloes each cap; the outer halo gives way to its meter column
      ...(s.hover ? xs.flatMap((x, side) => glow(clear(rr(side ? x + GAIN_CAP[0] : x - GAIN_CAP[2], g, GAIN_CAP[2] - GAIN_CAP[0], 0, 0), p => Math.abs(p[0] - x) > 4.2))) : []),
      layer(spots(cap, 2.4, v), 'value'),
      ...(s.focus ? [marching(rr(32, 18, 80, 104, 4), clock(s, ctx.t), 0)] : []),
    ]
  },
}

// ── 06 XY PAD ───────────────────────────────────────────────────────────────
// The pad's set point (x, y; y up) is orbited by an LFO on a 2:3 Lissajous path, so the live dot
// leaves a fading trail that is a pure function of t. Dragging (pressed) pins it to the finger.
const XY = { x: 22, y: 16, s: 100, grid: 10 }
const ORBIT = .2, WX = .7, WY = 1.05, TRAIL = 7, DT = .26
const xyAt = (x: number, y: number, t: number, amp: number): [number, number] => [clamp01(x + amp * Math.sin(WX * t)), clamp01(y + amp * Math.sin(WY * t + .9))]
const toPad = ([x, y]: [number, number]): Pt => [XY.x + x * XY.s, XY.y + (1 - y) * XY.s]
const SURFACE: Pt[] = Array.from({ length: 121 }, (_, i) => [XY.x + (i % 11) * XY.grid, XY.y + Math.floor(i / 11) * XY.grid])
export const xyPad: WidgetPreset = {
  id: 'inst-xy', name: 'XY Pad', label: '06  XY PAD', ...device,
  credit: TEENAGE_ENGINEERING,
  defaults: { x: .38, y: .58 },
  controls: [{ key: 'x', keyY: 'y', kind: 'xy', box: [XY.x, XY.y, XY.s, XY.s], min: 0, max: 1, label: 'Filter XY pad' }],
  layers: ctx => {
    const s = ui(ctx, 'x'), amp = s.pressed ? 0 : ORBIT, x = ctx.data.x ?? .5, y = ctx.data.y ?? .5
    const now = xyAt(x, y, ctx.t, amp), live = toPad(now)
    const trail = Array.from({ length: TRAIL }, (_, k) => toPad(xyAt(x, y, ctx.t - (k + 1) * DT, amp)))
    const moat = (p: Pt) => Math.hypot(p[0] - live[0], p[1] - live[1]) > 8
    return [
      // hover lifts the pad's own surface: the edge markers sit where a halo would go
      layer(spots(SURFACE.filter(moat), 1.4), s.hover ? 'mid' : 'faint'),
      // a trail dot that would touch the puck is left out: the red sits in clear air
      ...trail.map((p, k) => layer(spots(Math.hypot(p[0] - live[0], p[1] - live[1]) > .42 * (10 + 6.4 - k * .6) + .6 ? [p] : [], 6.4 - k * .6, k < 2 ? .75 : k < 5 ? .5 : .25), 'value')),
      // edge markers: where the live dot projects onto the pad's rulers
      layer(spots([[live[0], XY.y - 6], [live[0], XY.y + XY.s + 6], [XY.x - 6, live[1]], [XY.x + XY.s + 6, live[1]]], 3), 'idle'),
      layer(spots([live], 10, s.pressed ? PRESS : 1), 'active'),
      ...(s.focus ? [marching(rr(XY.x, XY.y, XY.s, XY.s, 0), clock(s, ctx.t), 3)] : []),
      layer(T.text(`X ${pad(now[0] * 100, 2)}`, XY.x, FOOT), 'idle'),
      layer(T.text(`Y ${pad(now[1] * 100, 2)}`, XY.x + XY.s, FOOT, { align: 'right' }), 'idle'),
    ]
  },
}

// ── 07 TRANSPORT ────────────────────────────────────────────────────────────
// Tempo on top (a stepper), four beat lights, and REC / PLAY / STOP as one segmented control
// (`mode`: 0 record, 1 play, 2 stop). The card opens in Play, so the record light turns red only when pressed.
// The footer is the SOUND toggle (`sound`): it starts the audio engine on the user's tap; while recording it reads REC m:ss.
const SEG = { x: 13, y: 86, w: 118, h: 36 }, SEG_W = SEG.w / 3, BTN_Y = SEG.y + SEG.h / 2, BTN_R = 16
const segX = (i: number) => SEG.x + SEG_W * (i + .5)
const BPM_BOX: [number, number, number, number] = [38, 18, 68, 48]
/** The tempo's outline: the number and BPM (rows 50 to 57); its halo stops short of the beat lights. */
const TEMPO = rr(38, 18, 68, 40, 6), TEMPO_HALO = clear(TEMPO, p => p[1] < 62)
/**
 * Play and stop on one lattice (offsets in cells from the button centre): play a hex-packed triangle 4 sites tall,
 * stop a 3×3 square of the same sites, so the two read as shapes beside the record light.
 */
const GLYPH = { k: 4.4, size: 3.5 }
const PLAY: Pt[] = transportGlyph('play', 6.2, 0, 4, GLYPH.k).sites ?? []
const STOP: Pt[] = transportGlyph('stop', 0, 0, 3, GLYPH.k).sites ?? []
const icon = (pts: Pt[], cx: number, cy: number, v: number) => spots(pts.map(([x, y]): Pt => [cx + x, cy + y]), GLYPH.size, v)
/** Tempo hint on hover and focus: an up and a down chevron beside the number (vertical drag or arrows). */
const CARET_X = 116, CARETS: Pt[][] = [[[-3, 27], [0, 24], [3, 27]], [[-3, 39], [0, 42], [3, 39]]]
const SOUND_BOX: [number, number, number, number] = [30, 123, 84, 14]
/** SOUND's outline round the speaker and its widest word (SOUND OFF, REC 10:00: x 55 to 108); the halo gives way to the mode buttons. */
const SOUND = rr(42, 125, 67, 9, 4.5)
const offButtons = (p: Pt) => [0, 1, 2].every(i => Math.hypot(p[0] - segX(i), p[1] - BTN_Y) > BTN_R + 2.2)
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
export const transport: WidgetPreset = {
  id: 'inst-transport', name: 'Transport', label: '07  TRANSPORT', ...device,
  credit: TEENAGE_ENGINEERING,
  defaults: { bpm: BPM, mode: 1, sound: 0 },
  controls: [
    { key: 'bpm', kind: 'stepper', orientation: 'vertical', box: BPM_BOX, min: 40, max: 240, step: 1, label: 'Tempo', valueText: v => `${Math.round(v)} BPM` },
    { key: 'mode', kind: 'segmented', box: [SEG.x, SEG.y, SEG.w, SEG.h], options: 3, optionLabels: ['Record', 'Play', 'Stop'], label: 'Transport' },
    { key: 'sound', kind: 'toggle', box: SOUND_BOX, label: 'Sound' },
  ],
  layers: ctx => {
    const bpm = Math.round(ctx.data.bpm ?? BPM), mode = Math.round(ctx.data.mode ?? 1), running = mode !== 2
    const tempo = ui(ctx, 'bpm'), seg = ui(ctx, 'mode'), snd = ui(ctx, 'sound'), sound = (ctx.data.sound ?? 0) >= .5
    const rec = audioOf(ctx)?.rec ?? -1, spk = 46, cy = FOOT + 3, sv = snd.pressed ? PRESS : 1
    // which segment the pointer is over (falls back to the selected one)
    const p = ctx.pointers?.find(q => q.inside), under = p ? Math.max(0, Math.min(2, Math.floor((p.x - SEG.x) / SEG_W))) : mode
    const beat = Math.floor((Math.max(0, ctx.t) * bpm) / 60) % 4
    const vOf = (i: number) => (seg.pressed && i === under ? PRESS : 1)
    const tone = (i: number): Tone => (i === mode ? 'value' : 'mid')
    return [
      layer(dimmed(T.big(String(bpm), 72, 22, { lattice: 3, align: 'center' }), tempo.pressed ? PRESS : 1)),
      layer(T.text('BPM', 72, 50, { align: 'center' }), 'idle'),
      ...[0, 1, 2, 3].map(i => layer(spots([[54 + i * 12, 66]], running && i === beat ? 5 : 3.4), running && i === beat ? 'value' : 'mid')),
      // the hover and focus outlines stop above the beat lights
      ...states(tempo, ctx.t, TEMPO_HALO, TEMPO, 2),
      ...(tempo.hover || tempo.focus ? CARETS.map(c => layer(spots(c.map(([x, y]): Pt => [CARET_X + x, y]), 2), 'value')) : []),
      ...[0, 1, 2].map(i => layer(spots(ring(segX(i), BTN_Y, BTN_R, 3), 1.4, vOf(i)), tone(i))),
      layer(spots([[segX(0), BTN_Y]], 15, vOf(0)), mode === 0 ? 'active' : 'mid'),
      layer(icon(PLAY, segX(1), BTN_Y, vOf(1)), tone(1)),
      layer(icon(STOP, segX(2), BTN_Y, vOf(2)), tone(2)),
      // the hover halo stops short of the SOUND row; the focus ring marks the selected mode
      ...(seg.hover ? glow(clear(circle(segX(under), BTN_Y, BTN_R), p => p[1] < 123)) : []),
      ...(seg.focus ? [marching(circle(segX(mode), BTN_Y, BTN_R), clock(seg, ctx.t), 4)] : []),
      // SOUND: a hollow ring when off, a lit dot when on (the red stays with REC)
      layer(sound ? spots([[spk, cy]], 6, sv) : spots(ring(spk, cy, 3, 2.4), 1.3, sv), sound ? 'value' : 'mid'),
      layer(dimmed({ field: T.text(rec >= 0 ? `REC ${mmss(rec)}` : sound ? 'SOUND ON' : 'SOUND OFF', spk + 9, FOOT) }, sv), sound ? 'value' : 'idle'),
      ...states(snd, ctx.t, clear(SOUND, offButtons), SOUND, 2),
    ]
  },
}

// ── 08 SEQUENCER ────────────────────────────────────────────────────────────
// Sixteen step LEDs on a 4×4 grid (rows are bars' beats); the playhead walks them at `bpm`
// sixteenths (tempo and transport shared with the board). A lit step under the playhead fires red at
// full size; an empty one shows a small red. Stopped transport parks the playhead (no red, 00/16).
const SEQ = { x0: 33, y0: 28, pitch: 26, on: 13, off: 4.4 }
const stepPos = (i: number): Pt => [SEQ.x0 + (i % 4) * SEQ.pitch, SEQ.y0 + Math.floor(i / 4) * SEQ.pitch]
export const sequencer: WidgetPreset = {
  id: 'inst-sequencer', name: 'Sequencer', label: '08  SEQUENCER', ...device,
  credit: TEENAGE_ENGINEERING,
  defaults: { bpm: BPM, ...Object.fromEntries(PATTERN.map((on, i) => [stepKey(i), on])) },
  controls: PATTERN.map((_, i): Control => {
    const [x, y] = stepPos(i)
    return { key: stepKey(i), kind: 'toggle', box: [x - 12, y - 12, 24, 24], label: `Step ${i + 1}` }
  }),
  layers: ctx => {
    const bpm = ctx.data.bpm ?? BPM, head = runningOf(ctx.data) ? stepAt(ctx.t, bpm) % 16 : -1
    return [
      ...PATTERN.flatMap((_, i) => {
        const p = stepPos(i), on = (ctx.data[stepKey(i)] ?? 0) >= .5, s = ui(ctx, stepKey(i)), here = i === head
        const tone: Tone = here ? 'active' : on ? 'value' : i % 4 ? 'mid' : 'idle'
        return [
          layer(spots([p], on ? SEQ.on : here ? 7 : SEQ.off, s.pressed ? PRESS : 1), tone),
          ...states(s, ctx.t, circle(p[0], p[1], 6.5)),
        ]
      }),
      layer(T.text('STEP', 27, FOOT), 'idle'),
      layer(T.text(`${pad(head + 1, 2)}/16`, 117, FOOT, { align: 'right' })),
    ]
  },
}

// ── 09 CRANK ────────────────────────────────────────────────────────────────
// A wheel with a handle on its rim and 24 detent ticks per turn; `crank` is accumulated turns
// (the input layer integrates atan2 deltas), the counter shows total ticks.
const CRANK = { cx: 72, cy: 60, wheel: 28, tickR: 37, handle: 15, ticks: 24 }
/** The arm's first and last dot radius: 1.5 cells of air from the hub dot (size 8) and from the handle (size 15). */
const ARM = [.42 * 8 + .42 * 2.6 + 1.5, CRANK.wheel - .42 * CRANK.handle - .42 * 2.6 - 1.5]
const TICKS = Array.from({ length: CRANK.ticks }, (_, i) => polar(CRANK.cx, CRANK.cy, CRANK.tickR, (i / CRANK.ticks) * TAU))
export const crank: WidgetPreset = {
  id: 'inst-crank', name: 'Crank', label: '09  CRANK', ...device,
  credit: TEENAGE_ENGINEERING,
  defaults: { crank: 16 + 5 / 24 },
  controls: [{ key: 'crank', kind: 'crank', box: [CRANK.cx - CRANK.tickR, CRANK.cy - CRANK.tickR, 2 * CRANK.tickR, 2 * CRANK.tickR], min: 0, max: 416, step: 1 / 24, label: 'Crank', valueText: v => `${Math.round(v * CRANK.ticks)} ticks` }],
  layers: ctx => {
    const { cx, cy, wheel } = CRANK, s = ui(ctx, 'crank'), ticks = Math.round((ctx.data.crank ?? 0) * CRANK.ticks)
    const at = ((ticks % CRANK.ticks) + CRANK.ticks) % CRANK.ticks, a = (at / CRANK.ticks) * TAU, handle = polar(cx, cy, wheel, a)
    return [
      layer(spots(TICKS.slice(1), 2.2), 'mid'),
      layer(spots(TICKS.slice(0, 1), 3.4), 'idle'),
      // the wheel's ring clears the handle; the arm runs from the hub's rim to the handle's with the same gap at each end
      layer(T.knockout(spots(ring(cx, cy, wheel, 3.3), 1.5), [handle], .42 * (CRANK.handle + 1.5) + .8), 'mid'),
      layer(T.dotLine(...polar(cx, cy, ARM[0], a), ...polar(cx, cy, ARM[1], a), { spacing: (ARM[1] - ARM[0]) / 3, size: 2.6 }), 'mid'),
      layer(spots([[cx, cy]], 8)),
      layer(spots([handle], CRANK.handle, s.pressed ? PRESS : 1)),
      // hover haloes the handle you turn, focus rings the whole crank outside its ticks
      ...states(s, ctx.t, circle(handle[0], handle[1], 7), circle(cx, cy, CRANK.tickR), 6),
      layer(T.big(pad(ticks, 4), cx, 107, { lattice: 2, align: 'center' })),
      layer(T.text('TICKS', cx, FOOT, { align: 'center' }), 'idle'),
    ]
  },
}

/** 2×2 knob block top-left, meter and XY pad down the right, transport / sequencer / crank along the bottom. */
export const instrumentBoard: WidgetPreset[] = [cutoff, resonance, meter, attack, release, xyPad, transport, sequencer, crank]
