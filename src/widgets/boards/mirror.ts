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
import { TILE, layer, layoutFor, tileStyle, type WidgetPreset } from '../types'
import type { Layer } from '../../engine/types'

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

// ── test portrait: a head-and-shoulders study in card cells. Soft key light from the upper left (wrapped
// lambert), the backdrop brighter on the shadow side so both cheeks separate from it, spanning void →
// mid → highlight like a real webcam frame ─────────────────────────────────────────────────────────────
const HX = 72, HY = 64, RX = 30, RY = 38
const L = (() => { const x = -.45, y = -.4, z = .8, n = Math.hypot(x, y, z); return [x / n, y / n, z / n] })()
const H = (() => { const x = L[0], y = L[1], z = L[2] + 1, n = Math.hypot(x, y, z); return [x / n, y / n, z / n] })()
const ell = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
/** Shoulder line: high at the neck, falling off to both sides. */
const shoulder = (x: number) => 114 + 20 * (1 - Math.exp(-(((x - HX) / 40) ** 2)))
/** Wrapped lambert (soft studio light): the terminator falls past 90°, so the shadow side keeps some form. */
const wrapLit = (nx: number, ny: number, nz: number) => Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2] + .35) / 1.35)

/** Luma of the test portrait at card cell (x, y). `eyes` 1 = open, 0 = closed (blink). */
export function portrait(x: number, y: number, eyes = 1): number {
  // backdrop: dark behind the lit cheek, a soft glow behind the shadow side, a little lighter at the top
  let lum = .02 + .34 * Math.exp(-((x - 116) ** 2 + (y - 46) ** 2) / (2 * 34 ** 2)) + .04 * clamp(1 - y / 110)
  // torso: knit lit from the left, a V-neck of skin
  const st = shoulder(x)
  if (y >= st) {
    const lit = clamp(1 - (x - 10) / 130)
    lum = .14 + .34 * lit * lit + .03 * Math.sin(x * 1.4 + y * .5)
    if (y - st < 1.5 && x < HX - 10) lum += .2
    if (Math.abs(x - HX) < 10 - (y - st) * .12 - Math.max(0, y - st - 16) && y - st < 26) lum = .3 + .2 * clamp((HX + 8 - x) / 20)
  }
  // neck: skin in the jaw's shadow, the right side darker
  if (Math.abs(x - HX) < 12.5 && y > HY + RY * .5 && y < st + 3) {
    const shade = clamp((y - (HY + RY * .8)) / 9)
    lum = (.16 + .3 * shade) * (x < HX + 2 ? 1 : .7)
  }
  // ears
  for (const s of [-1, 1]) if (ell(x, y, HX + s * RX * .98, HY + 4, 4, 7) < 1) lum = s < 0 ? .5 : .22
  // head: a jaw-tapered ellipsoid
  const Y = (y - HY) / RY, rx = RX * (Y > 0 ? 1 - .25 * Y * Y : 1 - .05 * Y * Y), X = (x - HX) / rx, q = X * X + Y * Y
  // hair: a volume over the skull's top and sides, side-swept (lower on the right)
  const hq = ell(x, y, HX + 1, HY - 4, RX + 4, RY + 4), inHead = q < 1
  if (hq < 1 && Y < .05 && (!inHead || Y < -.5 + .3 * X * X + .08 * X)) {
    const nx = (x - HX - 1) / (RX + 4), ny = (y - HY + 4) / (RY + 4), nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
    const lam = wrapLit(nx, ny, nz)
    // strands: a fine sweep across the crown, brighter where lit
    return clamp(.1 + .32 * lam * lam + .07 * lam * Math.sin(x * .8 - y * .45 + 2 * Math.sin(y * .15)))
  }
  if (!inHead) return lum
  const nz = Math.sqrt(Math.max(0, 1 - q)), nx = X, ny = Y * .85, nn = Math.hypot(nx, ny, nz) || 1
  const lam = wrapLit(nx / nn, ny / nn, nz / nn), spec = Math.max(0, (nx * H[0] + ny * H[1] + nz * H[2]) / nn) ** 30
  lum = .12 + .7 * lam + .2 * spec
  // cheekbone highlight on the lit side
  lum += .06 * Math.exp(-(((X + .45) / .2) ** 2 + ((Y - .12) / .16) ** 2))
  const ax = Math.abs(X), side = X < 0 ? 1 : .75
  // brows
  // brows: arched, thinning toward the temples
  if (ax > .14 && ax < .62 && Math.abs(Y + .31 - 1.1 * (ax - .36) ** 2) < .036 * (1 - .5 * clamp((ax - .36) / .26))) lum *= .3
  // eye sockets, then the eyes
  const sock = ((ax - .36) / .26) ** 2 + ((Y + .12) / .14) ** 2
  if (sock < 1) lum *= .6 + .4 * sock
  if (eyes > .5) {
    const white = ((ax - .36) / .16) ** 2 + ((Y + .12) / .062) ** 2, iris = ((ax - .35) / .07) ** 2 + ((Y + .118) / .07) ** 2
    if (white < 1) lum = .62 * side
    if (iris < 1) lum = .05
    // one catch-light per eye, up and left of the pupil
    if (Math.abs(X - (Math.sign(X) * .35 - .03)) < .03 && Math.abs(Y + .14) < .022) lum = .9
  } else if (Math.abs(Y + .1) < .02 && ax > .22 && ax < .5) lum = .06
  // nose: shadow down the right of the bridge, a lit tip, nostrils, the shadow under it
  if (X > .04 && X < .16 && Y > -.04 && Y < .34) lum *= .6
  if (((X + .02) / .08) ** 2 + ((Y - .3) / .05) ** 2 < 1) lum = Math.min(1, lum + .14)
  if (((ax - .09) / .045) ** 2 + ((Y - .38) / .025) ** 2 < 1) lum = .08
  if (Y > .4 && Y < .45 && ax < .12) lum *= .7
  // mouth: a dark parting line, a shaded upper lip and a lit lower lip, the chin's shadow under it
  const ym = .6 + .14 * X * X
  if (ax < .28 && Math.abs(Y - ym) < .022) lum = .08
  else if (ax < .25 && Y < ym && Y > ym - .06) lum *= .78
  else if (ax < .2 && Y > ym && Y < ym + .07) lum = Math.min(1, lum * 1.1)
  if (ax < .24 && Y > ym + .1 && Y < ym + .14) lum *= .82
  return clamp(lum)
}

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

export const mirrorBoard: WidgetPreset[] = [mirrorCamera, mirrorLadder]
/** The test portrait rasterized below the label row, optionally with deterministic sensor noise (tests, bench). */
export const mirrorPortrait = (eyes = 1, noise = 0): Raster => portraitRaster(eyes, undefined, noise)
