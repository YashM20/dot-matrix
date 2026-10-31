/**
 * Mirror — live media (MASTER-PLAN P4 "webcam mirror", §8 halftone ladder + STBN).
 * `mirror-camera`: the webcam as a step-2 halftone with temporal stability (`halftoneStream`). Before the
 * user taps (and in snapshots/goldens) it shows a deterministic test portrait built from fields, so the
 * card is a pure function of ctx; the host feeds `ctx.media.camera` only after the toggle grants access.
 * `mirror-ladder`: the same portrait plus sensor noise at ladder step 1 vs step 2, side by side.
 */
import { clamp, hash01 } from '../../engine/math'
import type { Control } from '../../engine/context'
import type { Field, Tone } from '../../engine/types'
import { createRaster, type Raster } from '../../engine/raster'
import { halftone, halftoneStream, type HalftoneStream } from '../../engine/halftone'
import { TILE, layer, layoutFor, tileStyle, type WidgetContext, type WidgetPreset } from '../types'
import type { Layer } from '../../engine/types'
import { splitFlapText } from '../../engine/motion/text'
import { handAt, handPath } from '../../vision/synthetic'

const T = layoutFor(TILE)
const N = TILE.cols - 1
/**
 * Halftone cards (photo exemption: no quantization): luminance is carried by dot size and tone. A lit dot's
 * value is .7 + .3·level, so opacity stays .76–1 (the smallest dots a touch dimmer) and empty cells are skipped
 * by the sampler; `sizeCurve` maps the value back to a size fraction of .3 + .7·level.
 */
const photoStyle = { ...tileStyle, sizeMin: 0, sizeMax: 1.2, quantizeSteps: 0, opacityMode: 'fromValue' as const, sizeCurve: (v: number) => (v - .7) / .3 * .7 + .3 }
/** First card row under the dot-drawn label. */
const TOP = 11
const LEVELS = 6

export { portrait } from './portrait'
import { HX, HY, RX, RY, ell, portrait, shoulder } from './portrait'

/** The portrait rasterized on the card grid below the label row (eyes open / closed). */
function portraitRaster(eyes: number, map: (x: number, y: number) => [number, number] = (x, y) => [x, y], noise = 0, box: [number, number, number, number] = [0, TOP, N, N]): Raster {
  const r = createRaster(TILE, 'card', box)
  for (let y = box[1]; y <= box[3]; y++) for (let x = box[0]; x <= box[2]; x++) {
    const [px, py] = map(x, y)
    r.data[y * TILE.cols + x] = clamp(portrait(px, py, eyes) + (noise ? (hash01(x * 131 + y, 9) + hash01(x * 37 + y * 101, 4) - 1) * noise : 0))
  }
  return r
}

// ── halftone raster → one multi-tone layer: level sets size, the band sets tone ───────────────────
const bandOf = (v: number): Tone => (v < .79 ? 'faint' : v < .85 ? 'mid' : v < .91 ? 'idle' : 'value')
type Box = [number, number, number, number]
const holeMasks = new Map<string, Uint8Array>()
/** 1 inside any of the inclusive cell boxes, cached per box set (the prompt plates are a handful). */
function holeMask(holes: Box[]): Uint8Array {
  const key = holes.join(';')
  let m = holeMasks.get(key)
  if (!m) {
    m = new Uint8Array(TILE.cols * TILE.rows)
    for (const [c0, r0, c1, r1] of holes) for (let y = r0; y <= r1; y++) m.fill(1, y * TILE.cols + c0, y * TILE.cols + c1 + 1)
    holeMasks.set(key, m)
  }
  return m
}
/** A halftone raster (on TILE) drawn as dots; cells inside `holes` are cleared (text moats). */
function dotsLayer(r: Raster, holes: Box[] = []): Layer {
  const d = r.data, hole = holeMask(holes), { cols, rows } = TILE, kx = cols - 1, ky = rows - 1
  const field: Field = (u, v) => {
    const i = Math.round(v * ky) * cols + Math.round(u * kx), q = d[i]
    return q && !hole[i] ? .7 + .3 * q : 0
  }
  if (r.bounds) field.bounds = [...r.bounds]
  return { field, toneOf: bandOf }
}

const lazy = <V>(make: () => V) => { let v: V | undefined; return () => (v ??= make()) }
const STEP2 = { step: 2 as const, levels: LEVELS }
const stillOpen = lazy(() => halftone(portraitRaster(1), STEP2))
const stillShut = lazy(() => halftone(portraitRaster(0), STEP2))
/** One temporal-stability stream per live camera raster (the host keeps one raster per capture). */
const streams = new WeakMap<Raster, HalftoneStream>()

/** Camera states the host writes to `data.camState`. */
export const CAM = { idle: 0, starting: 1, live: 2, denied: 3 } as const
const PROMPT: Record<number, string> = { [CAM.idle]: 'TAP TO START', [CAM.starting]: 'ALLOW CAMERA', [CAM.denied]: 'NO CAMERA' }
const cameraControl: Control = { key: 'cam', kind: 'toggle', box: [0, 0, 144, 144], label: 'Camera mirror: start or stop the webcam' }

/** Live: REC + the board's one red dot, top right. */
const REC = [layer(T.text('REC', 128, 1, { align: 'right' }), 'idle'), layer(T.dots([[138.5, 4]], 2.6), 'active')]
const TEST = layer(T.text('TEST', 143, 1, { align: 'right' }), 'mid')
const prompts = new Map<string, Layer>()
const promptLayer = (s: string) => { let l = prompts.get(s); if (!l) prompts.set(s, (l = layer(T.text(s, 72, 130, { align: 'center' }), 'value'))); return l }

export const mirrorCamera: WidgetPreset = {
  id: 'mirror-camera', name: 'Mirror', group: 'photo', chrome: 'dots', bleed: true, animated: true, media: 'camera', grid: TILE, style: photoStyle,
  defaults: { cam: 0, camState: 0 },
  controls: [cameraControl],
  layers: ({ t, data, media, frame }) => {
    const cam = media?.camera
    const state = cam ? CAM.live : data.cam && !data.camState ? CAM.starting : data.camState ?? CAM.idle
    if (cam && state === CAM.live) {
      let s = streams.get(cam)
      if (!s) streams.set(cam, (s = halftoneStream({ ...STEP2 })))
      return [
        dotsLayer(s.push(cam, frame ?? Math.round(t * 30)), [[0, 0, N, TOP - 1]]),
        ...REC,
      ]
    }
    // test portrait: blinks for ~0.2 s every 4.5 s; the prompt pulses (on 0.8 s of each 1.2 s)
    const blink = (t % 4.5) > 4.3
    const prompt = PROMPT[state] ?? PROMPT[CAM.idle], [pw] = T.size(prompt)
    const showPrompt = state !== CAM.idle || t % 1.2 < .8
    const plate: Box = [Math.round(72 - pw / 2) - 4, 126, Math.round(72 + pw / 2) + 3, 140]
    return [
      dotsLayer(blink ? stillShut() : stillOpen(), [plate, [108, 0, 143, 10]]),
      TEST,
      ...(showPrompt ? [promptLayer(prompt)] : []),
    ]
  },
}

// ladder: two panels of the same noisy portrait, zoomed onto the head; step 1 left, step 2 right
const PANEL = { top: TOP + 1, bottom: 116, w: 70 }
const zoom = (pcx: number) => (x: number, y: number): [number, number] => [HX + (x - pcx) / .7, HY + 2 + (y - 64) / .7]
const NOISE = .07
const ladderLeft = lazy(() => halftone(portraitRaster(1, zoom(34.5), NOISE, [0, PANEL.top, PANEL.w - 1, PANEL.bottom]), { step: 1, levels: LEVELS }))
const ladderRight = lazy(() => halftone(portraitRaster(1, zoom(108.5), NOISE, [N - PANEL.w + 1, PANEL.top, N, PANEL.bottom]), STEP2))

export const mirrorLadder: WidgetPreset = {
  id: 'mirror-ladder', name: 'Ladder', group: 'photo', chrome: 'dots', bleed: true, grid: TILE, style: photoStyle,
  layers: () => [
    dotsLayer(ladderLeft()), dotsLayer(ladderRight()),
    layer(T.big('1', 0, 122, { lattice: 2 }), 'value'), layer(T.text('ORDERED', 14, 129), 'idle'),
    layer(T.big('2', 74, 122, { lattice: 2 }), 'value'), layer(T.text('STRUCTURE', 88, 129), 'idle'),
    layer(T.text('+NOISE', 143, 1, { align: 'right' }), 'mid'),
  ],
}

// ── C6 camera magic: shared bits ─────────────────────────────────────────────────────────────────────
const tileUi = tileStyle
/** Two centred lines on the bottom plate: the call to action (pulsing when idle) and the privacy line. */
const PRIVACY = layer(T.text('VIDEO STAYS LOCAL', 72, 136, { align: 'center' }), 'mid')
const ctaCache = new Map<string, Layer>()
const cta = (s: string) => { let l = ctaCache.get(s); if (!l) ctaCache.set(s, (l = layer(T.text(s, 72, 126, { align: 'center' }), 'value'))); return l }
/** The scripted hand (synthetic camera path) in card cells: x across the card, y over the area below the label. */
const scriptedHand = (t: number) => { const p = handPath(t); return { x: 8 + p.x * 128, y: TOP + 4 + p.y * 112, down: p.pinch > .5 } }
/** The live pointer over the card (mouse, touch or the HAND-mode hand), if any. */
const livePointer = (ctx: WidgetContext) => ctx.pointers?.find(q => q.inside && !q.up)

// ── mirror-shadow: your silhouette as a shadow puppet on a lit wall, with depth parallax ─────────────
// A spotlight on the wall (far plane) and the silhouette's shadow (near plane) move against each other with
// device tilt, the pointer over the card, or a slow sway in the fixture. Live: the camera's foreground
// (`media.silhouette`: what differs from the room as first seen). Fixture: the test portrait's outline in the
// front row plus a scripted hand puppet moving through the light. Wall on a 2× lattice (bigger single dots).
const WALL_TOP = TOP + 1, WALL = { cols: 72, rows: Math.floor((TILE.rows - WALL_TOP) / 2) }
/** The test portrait's outline (head + hair + ears + neck + shoulders), 1 inside, in portrait cells. */
const inPortrait = (x: number, y: number) => {
  if (ell(x, y, HX + 1, HY - 4, RX + 4, RY + 4) < 1 || y >= shoulder(x)) return true
  if (Math.abs(x - HX) < 12.5 && y > HY + RY * .5) return true
  for (const s of [-1, 1]) if (ell(x, y, HX + s * RX * .98, HY + 4, 4, 7) < 1) return true
  const Y = (y - HY) / RY, rx = RX * (Y > 0 ? 1 - .25 * Y * Y : 1 - .05 * Y * Y)
  return ((x - HX) / rx) ** 2 + Y * Y < 1
}
/** The fixture's front row: the portrait outline at .75× with its head low on the left (an audience member). */
const audience = lazy(() => {
  const m = new Float32Array(TILE.cols * TILE.rows)
  for (let y = 0; y < TILE.rows; y++) for (let x = 0; x < TILE.cols; x++) m[y * TILE.cols + x] = inPortrait(HX + (x - 34) / .75, HY + (y - 118) / .75) ? 1 : 0
  return m
})
const HAND_S = 30
const shadowTone = (v: number): Tone => (v >= .8 ? 'value' : v >= .55 ? 'idle' : v >= .3 ? 'mid' : 'faint')
const shadowControl: Control = { key: 'cam', kind: 'toggle', box: [0, 0, 144, 144], label: 'Shadow puppet: start or stop the webcam (video stays on this device)' }

/** Parallax in -1..1: device tilt, else the pointer over the card, else (fixture) a slow sway. */
function parallax(ctx: WidgetContext): [number, number] {
  const { data } = ctx
  if (data.tiltX !== undefined && data.tiltY !== undefined) return [data.tiltX, data.tiltY]
  const p = livePointer(ctx)
  if (p) return [clamp((p.x - 72) / 72, -1, 1), clamp((p.y - 78) / 66, -1, 1)]
  return [.7 * Math.sin(ctx.t * .9), .3 * Math.sin(ctx.t * .6 + 1)]
}

export const mirrorShadow: WidgetPreset = {
  id: 'mirror-shadow', name: 'Shadow', group: 'photo', chrome: 'dots', animated: true, media: 'camera', grid: TILE, style: tileUi,
  defaults: { cam: 0, camState: 0 },
  controls: [shadowControl],
  layers: ctx => {
    const { t, data, media } = ctx, sil = media?.silhouette
    const live = !!sil, [px, py] = parallax(ctx)
    // far plane (wall + spot) shifts against the near plane (the shadow): depth from relative motion
    const lx = 72 - px * 4, ly = 72 - py * 3, sx = px * 9, sy = py * 6, R = 62
    const cols = TILE.cols, fixture = live ? null : audience(), hand = live ? null : handPath(t)
    const hx = hand ? 30 + hand.x * 90 : 0, hy = hand ? 40 + hand.y * 36 : 0
    // text plates stay clear (lattice dots would hide the label / prompt): rows under the label, the bottom two lines
    const plateTop = live ? 144 : 122
    /** Occlusion 0..1 at card cell (x, y) of the object plane. */
    const occ = (x: number, y: number) => {
      const c = Math.round(x), r = Math.round(y)
      if (c < 0 || r < 0 || c >= cols || r >= TILE.rows) return 0
      if (sil) return sil.data[r * cols + c]
      return fixture![r * cols + c] || (hand && handAt(x, y, hx, hy, HAND_S, hand.pinch) ? 1 : 0)
    }
    const field: Field = (u, v) => {
      const x = Math.round(u * (WALL.cols - 1)) * 2 + .5, y = WALL_TOP + Math.round(v * (WALL.rows - 1)) * 2 + .5
      if (y >= plateTop) return 0
      const d =Math.hypot(x - lx, y - ly), spot = d >= R ? 0 : d <= R - 14 ? 1 : (R - d) / 14
      const wall = .14 + .02 * Math.sin(x * .7 + y * .3)
      if (!spot) return wall
      // the shadow grows away from the lamp (×1.12 about the light) and blurs at its edge (penumbra)
      const ox = lx + (x - lx) / 1.12 - sx, oy = ly + (y - ly) / 1.12 - sy
      const o = (occ(ox, oy) * 2 + occ(ox - 2, oy) + occ(ox + 2, oy) + occ(ox, oy - 2) + occ(ox, oy + 2)) / 6
      const light = .36 + .64 * spot * (1 - .25 * (d / R) ** 2)
      return Math.max(wall, light * (1 - o) + .1 * o * spot)
    }
    const wall: Layer = { ...T.lattice(2, 0, WALL_TOP).at(field), toneOf: shadowTone }
    const state = live ? CAM.live : data.cam && !data.camState ? CAM.starting : data.camState ?? CAM.idle
    if (live) return [wall, layer(T.text('LIVE', 128, 1, { align: 'right' }), 'idle'), layer(T.dots([[138.5, 4]], 2.6), 'active')]
    const prompt = state === CAM.starting ? 'ALLOW CAMERA' : state === CAM.denied ? 'NO CAMERA' : 'TAP FOR YOUR SHADOW'
    const showPrompt = state !== CAM.idle || t % 1.2 < .8
    return [wall, TEST, ...(showPrompt ? [cta(prompt)] : []), PRIVACY]
  },
}

// ── mirror-conduct: wave to flip a split-flap word, pinch to grab the dots; HAND mode lives here ──────
// Any pointer conducts (mouse, touch, or the hand once HAND mode is on): a fast horizontal wave that changes
// direction flips the word; hovering scatters the dot field, pressing / pinching gathers it. The bottom plate
// toggles HAND mode for the whole page (the camera hand becomes a pointer for every card). With no pointer
// (snapshots, goldens, idle) a scripted hand conducts: a flip every 2.6 s, a pinch every 3 s.
const WORDS = ['HELLO', 'WAVES', 'PINCH', 'LOCAL', 'HANDS', 'MAGIC'], FLIP_EVERY = 2.6
const handControl: Control = { key: 'hand', kind: 'toggle', box: [0, 122, 144, 22], label: 'Hand mode: control every card with your hand (uses the camera; video stays on this device)' }
interface Conductor { word: number; prev: number; at: number; dir: number; lastT: number; seen: number }
/** Wave state for the live card (the scripted demo is a pure function of t). */
const conductor: Conductor = { word: 0, prev: 0, at: -99, dir: 0, lastT: -1, seen: -99 }
/** Cells per second of horizontal speed that count as a wave. */
const WAVE_SPEED = 110
const FIELD = { x0: 8, x1: 136, y0: 64, y1: 116, step: 4 }
const fieldSites: [number, number][] = []
for (let y = FIELD.y0; y <= FIELD.y1; y += FIELD.step) for (let x = FIELD.x0; x <= FIELD.x1; x += FIELD.step) fieldSites.push([x, y])
const FLAP = { flip: .045, stagger: .06 }

function conduct(ctx: WidgetContext) {
  const { t } = ctx, c = conductor, p = livePointer(ctx)
  if (t < c.lastT - .5) Object.assign(c, { word: 0, prev: 0, at: -99, dir: 0, seen: -99 }) // another clock (snapshot): start over
  c.lastT = t
  if (p) {
    c.seen = t
    const dir = Math.sign(p.vx)
    if (Math.abs(p.vx) > WAVE_SPEED && dir !== c.dir && t - c.at > .4) { c.prev = c.word; c.word = (c.word + 1) % WORDS.length; c.at = t; c.dir = dir }
    return { word: c.word, prev: c.prev, tau: t - c.at, p: { x: p.x, y: p.y, down: p.down, speed: Math.hypot(p.vx, p.vy) }, mode: p.id === 'hand' ? 'HAND' : 'POINTER' }
  }
  if (t - c.seen < 6) return { word: c.word, prev: c.prev, tau: t - c.at, p: null, mode: 'POINTER' }
  const k = Math.floor(t / FLIP_EVERY), s = scriptedHand(t)
  return { word: k % WORDS.length, prev: (k + WORDS.length - 1) % WORDS.length, tau: k ? t - k * FLIP_EVERY : 99, p: { ...s, speed: 0 }, mode: 'DEMO' }
}

export const mirrorConduct: WidgetPreset = {
  id: 'mirror-conduct', name: 'Conduct', group: 'composite', chrome: 'dots', animated: true, grid: TILE, style: tileUi,
  defaults: { hand: 0, handState: 0, handSeen: 0 },
  controls: [handControl],
  layers: ctx => {
    const { t, data } = ctx, { word, prev, tau, p, mode } = conduct(ctx)
    const text = splitFlapText(WORDS[prev], WORDS[word], tau, FLAP).text
    // the dot field: scattered away from a hovering pointer, gathered toward a pressing one
    const calm: [number, number][] = [], stirred: [number, number][] = []
    for (const [x0, y0] of fieldSites) {
      let x = x0, y = y0 + .6 * Math.sin(t * 1.6 + x0 * .21)
      if (p) {
        const dx = x - p.x, dy = y - p.y, r2 = dx * dx + dy * dy, r = Math.sqrt(r2) || 1
        if (p.down) { const k = .8 * Math.exp(-r2 / (2 * 20 * 20)); x -= dx * k; y -= dy * k }
        else { const push = (10 + Math.min(10, p.speed / 30)) * Math.exp(-r2 / (2 * 16 * 16)); x += dx / r * push; y += dy / r * push }
      }
      x = clamp(x, 1, 142); y = clamp(y, FIELD.y0 - 6, FIELD.y1 + 4)
      ;(Math.abs(x - x0) + Math.abs(y - y0) > 3 ? stirred : calm).push([x, y])
    }
    const on = data.hand >= .5, hs = data.handState ?? 0
    const status = on ? (hs === 1 ? 'ALLOW CAMERA' : hs === 3 ? 'NO CAMERA' : data.handSeen ? 'HAND ON · TRACKING' : 'HAND ON · SHOW A HAND') : 'TAP FOR HAND MODE'
    const pulse = on || t % 1.2 < .8
    return [
      layer(T.big(text, 72, 20, { lattice: 3, align: 'center' }), 'value'),
      layer(T.text('WAVE: FLIP', 4, 50), 'idle'), layer(T.text('PINCH: GRAB', 140, 50, { align: 'right' }), 'idle'),
      layer(T.dots(calm, 1.3), 'mid'),
      layer(T.dots(stirred, 1.5), 'value'),
      ...(p && p.y > FIELD.y0 - 12 ? [layer(T.dotRing(p.x, p.y, p.down ? 4 : 7, { spacing: 3, size: 1 }), p.down ? 'value' : 'idle')] : []),
      ...(on && hs === 2 ? [layer(T.text(mode === 'HAND' ? 'HAND' : 'LIVE', 128, 1, { align: 'right' }), 'idle'), layer(T.dots([[138.5, 4]], 2.6), 'active')] : [layer(T.text(mode, 143, 1, { align: 'right' }), 'mid')]),
      ...(pulse ? [cta(status)] : []),
      PRIVACY,
    ]
  },
}

export const mirrorBoard: WidgetPreset[] = [mirrorCamera, mirrorLadder, mirrorShadow, mirrorConduct]
/** The test portrait rasterized below the label row, optionally with deterministic sensor noise (tests, bench). */
export const mirrorPortrait = (eyes = 1, noise = 0): Raster => portraitRaster(eyes, undefined, noise)
