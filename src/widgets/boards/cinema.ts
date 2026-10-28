/**
 * Board — Cinema: the Afterlight cycle (MASTER-PLAN §4 P3 "Cinema").
 * Nine film posters from one fiction: the night the city's grid went dark. Every poster is a
 * procedural scene in card cells, baked once onto one coarse luma lattice (K = 2.5 cells, the
 * afterlight face pitch), so dot size is luminance. In each frame red is the last light left
 * (an ember, a beacon, the sun, a window, a candle, a reflection, a taillight, a lamp, a rose).
 * Titles sit on the same lattice, knocked out of the scene, and decode in on each reel; the whole
 * lattice breathes with a quantized projector flicker.
 */
import { clamp, hash01, len } from '../../engine/math'
import { decodeText } from '../../engine/motion/text'
import { textAt } from '../../engine/layout'
import { valueNoise2 } from '../../engine/noise/value'
import { latticeGrid } from '../../engine/sampler/gridSampler'
import type { Field, Layer, Tone } from '../../engine/types'
import { TILE, layer, layoutFor, tileStyle, type WidgetPreset } from '../types'

const T = layoutFor(TILE)
type Pt = [number, number]
/** Scene luminance in card cells (x, y ∈ 0..143), 0 = void. */
type Luma = (x: number, y: number) => number

// ── the poster lattice ──────────────────────────────────────────────────────────────────────────
/** One luma lattice for scene, red mark and title: 57 × 57 dots, centred on card cell 71.5. */
const K = 2.5, ORIGIN: Pt = [.75, .75]
const SUB = latticeGrid(TILE, K, ORIGIN), NX = SUB.cols, NY = SUB.rows
/** Card-cell centre of lattice column / row. */
const xOf = (c: number) => ORIGIN[0] + (c + .5) * K - .5
const yOf = (r: number) => ORIGIN[1] + (r + .5) * K - .5
const at = (u: number, v: number) => Math.round(v * (NY - 1)) * NX + Math.round(u * (NX - 1))
/** Scene rows: clear of the top caption (rows 0–7) and the bottom caption (136–143). */
const Y0 = 11, Y1 = 130
/** Lattice dots below this are left void, so negative space stays black instead of dusty. */
const FLOOR = .14
/** 3 × 3 supersample per lattice dot: edges land as smaller dots (a ~1-cell ramp), not stair steps. */
const SS = [-K / 3, 0, K / 3]
/**
 * Scene tone curve: a lit dot is never smaller than the afterlight face's dimmest digit (.25 + .75·v,
 * like its 0–9 → .3–1 map), so mid-tones read as dots and only true void is empty.
 */
const tone = (v: number) => (v < FLOOR ? 0 : .25 + .75 * v)
function bake(f: Luma): Float32Array {
  const out = new Float32Array(NX * NY)
  for (let r = 0; r < NY; r++) {
    const y = yOf(r)
    if (y < Y0 || y > Y1) continue
    for (let c = 0; c < NX; c++) {
      const x = xOf(c)
      let s = 0
      for (const dy of SS) for (const dx of SS) s += clamp(f(x + dx, y + dy))
      out[r * NX + c] = tone(s / 9)
    }
  }
  return out
}
const onLattice = (field: Field, tone: Tone): Layer => layer({ field, lattice: K, origin: ORIGIN }, tone)

// ── projector: flicker + reel ───────────────────────────────────────────────────────────────────
const FPS = 12, REEL = 16
const frac = (x: number) => x - Math.floor(x)
/**
 * Lattice gain: a slow breath plus a per-frame shutter flicker, stepped at 12 fps and quantized to
 * 1/40, with a rare dim splice frame. Pure function of t; exactly 1 at t = 0 (the still frame).
 */
function flicker(t: number, n: number): number {
  if (t <= 0) return 1
  const f = Math.floor(t * FPS), b = frac(f / FPS / 3.4 + n * .17), breathe = 4 * b * (1 - b)
  const g = 1 - .05 * breathe - .045 * hash01(f, n, 31) - (hash01(f, n, 37) < .025 ? .07 : 0)
  return Math.round(g * 40) / 40
}
/** Title decodes in at the start of every reel (staggered per poster); the still frame shows it resolved. */
const reelTitle = (title: string, t: number, n: number) => (t <= 0 ? title : decodeText('', title, t % REEL, { seed: n, lead: .15 + n * .08, stagger: .08, rate: 14 }))
/** Lattice cells within one dot of a lit title dot: the scene is cut away there so type reads on black. */
function knockout(f: Field): Uint8Array {
  const m = new Uint8Array(NX * NY), [c0, r0, c1, r1] = f.bounds ?? [0, 0, NX - 1, NY - 1]
  for (let r = Math.max(0, r0); r <= Math.min(NY - 1, r1); r++) for (let c = Math.max(0, c0); c <= Math.min(NX - 1, c1); c++) {
    if (!(f(c / (NX - 1), r / (NY - 1)) > 0)) continue
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const rr = r + j, cc = c + i
      if (rr >= 0 && cc >= 0 && rr < NY && cc < NX) m[rr * NX + cc] = 1
    }
  }
  return m
}

// ── geometry helpers (card cells) ───────────────────────────────────────────────────────────────
type Box = [number, number, number, number]
const bbox = (pts: Pt[]): Box => [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))]
/** Even-odd point-in-polygon, with a bbox reject. */
function poly(pts: Pt[]): (x: number, y: number) => boolean {
  const box = bbox(pts)
  return (x, y) => {
    if (x < box[0] || x > box[2] || y < box[1] || y > box[3]) return false
    let inside = false
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j]
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
    }
    return inside
  }
}
const any = (...fs: ((x: number, y: number) => boolean)[]) => (x: number, y: number) => fs.some(f => f(x, y))
const ell = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) => len((x - cx) / rx, (y - cy) / ry)
const seg = (x: number, y: number, [ax, ay]: Pt, [bx, by]: Pt) => {
  const dx = bx - ax, dy = by - ay, k = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))
  return len(x - ax - k * dx, y - ay - k * dy)
}
const rect = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1
/** Piecewise-linear lookup through (key, value) pairs sorted by key. */
const pl = (pts: Pt[], k: number) => {
  if (k <= pts[0][0]) return pts[0][1]
  for (let i = 0; i < pts.length - 1; i++) if (k <= pts[i + 1][0]) { const [k0, v0] = pts[i], [k1, v1] = pts[i + 1]; return v0 + ((v1 - v0) * (k - k0)) / (k1 - k0) }
  return pts[pts.length - 1][1]
}
/** A star on lattice cell granularity: same value for every supersample inside one dot. */
const star = (x: number, y: number, seed: number, density: number) => {
  const c = Math.round((x - xOf(0)) / K), r = Math.round((y - yOf(0)) / K)
  return hash01(c, r, seed) < density ? .22 + .4 * hash01(c, r, seed + 1) : 0
}

// ── poster builder ──────────────────────────────────────────────────────────────────────────────
interface Spec {
  id: string; n: number; genre: string; title: string; tag: string
  /** Title anchor in lattice cells (column, row). */
  at: Pt
  scene: Luma
  /** The single red mark, 0..1, on the same lattice. */
  red: Luma
  /** Red gain over time (a blinking beacon); default steady. */
  pulse?: (t: number) => number
  /** Scene parts that move: `where` marks lattice cells re-evaluated every frame with `f(x, y, t)`. */
  live?: { where: (x: number, y: number) => boolean; f: (x: number, y: number, t: number) => number }
}
const CAP = 1.05
function poster(s: Spec): WidgetPreset {
  let scene: Float32Array | undefined, red: Float32Array | undefined, liveCells: number[] | undefined
  const prep = () => {
    scene = bake(s.scene)
    // the red mark is a light source: hard, read at the dot centre only (no partial red dots)
    red = new Float32Array(NX * NY)
    for (let r = 0; r < NY; r++) for (let c = 0; c < NX; c++) red[r * NX + c] = s.red(xOf(c), yOf(r)) > .5 ? 1 : 0
    liveCells = []
    if (s.live) for (let r = 0; r < NY; r++) for (let c = 0; c < NX; c++) if (yOf(r) >= Y0 && yOf(r) <= Y1 && s.live.where(xOf(c), yOf(r))) liveCells.push(r * NX + c)
  }
  return {
    id: s.id, name: s.title, label: '', group: 'photo', chrome: 'dots', animated: true, grid: TILE,
    style: { ...tileStyle, sizeMin: 0, sizeMax: 1.05, quantizeSteps: 0 },
    layers: ({ t }) => {
      if (!scene) prep()
      const base = scene!, mark = red!, title = textAt(SUB, reelTitle(s.title, t, s.n), s.at[0], s.at[1]), cut = knockout(title)
      const g = flicker(t, s.n), rg = s.pulse ? s.pulse(t) : 1
      let moving: Float32Array | undefined
      if (s.live && liveCells!.length) {
        // live parts step at the projector's 12 fps
        const tf = Math.floor(t * FPS) / FPS, live = s.live
        moving = new Float32Array(NX * NY)
        for (const i of liveCells!) {
          const x = xOf(i % NX), y = yOf(Math.floor(i / NX))
          let v = 0
          for (const dy of SS) for (const dx of SS) v += clamp(live.f(x + dx, y + dy, tf))
          moving[i] = tone(v / 9)
        }
      }
      const sceneField: Field = (u, v) => { const i = at(u, v); return cut[i] ? 0 : Math.max(base[i], moving?.[i] ?? 0) * g }
      const redField: Field = (u, v) => { const i = at(u, v); return cut[i] ? 0 : mark[i] * rg }
      return [
        layer(T.big('AFTERLIGHT', 0, 0, { lattice: CAP }), 'idle'),
        layer(T.big(s.genre, 143.5, 0, { lattice: CAP, align: 'right' }), 'mid'),
        onLattice(sceneField, 'value'),
        onLattice(redField, 'active'),
        onLattice(title, 'value'),
        layer(T.big(s.tag, 0, 136, { lattice: CAP }), 'idle'),
        layer(T.big(String(s.n).padStart(2, '0'), 143.5, 136, { lattice: CAP, align: 'right' }), 'mid'),
      ]
    },
  }
}
/** Title rows: top band (5) or bottom band (46), 7 lattice rows tall. */
const TOP = 5, BOTTOM = 46
/** Left column that centres `title` on the 57-dot lattice. */
const centre = (title: string) => Math.floor((NX - ([...title].length * 6 - 1)) / 2)

// ── 01 LAST CALL · noir ─────────────────────────────────────────────────────────────────────────
// A man in a fedora, in profile, black against venetian-blind light with one slit across his eyes;
// the cigarette ember is the last light.
const HAT = poly([[73, 40], [74, 27], [78, 21], [86, 19.5], [91, 22.5], [96, 19.5], [104, 21], [108, 27], [109, 40]])
const brim = (x: number, y: number) => ell(x, y + (x - 90) * .05, 90, 41, 31, 3.4) < 1
const HEAD = poly([[72, 42], [70, 48], [68, 52], [66.5, 55], [63, 58.5], [59.5, 63], [60.5, 65], [64, 66.5], [63.5, 69], [65.5, 71], [64, 73], [64.5, 76], [67, 80.5], [71, 84], [78, 86.5], [81, 92], [101, 92], [100, 84], [104, 74], [107, 62], [107.5, 44]])
const COAT = poly([[81, 88], [70, 95], [57, 102], [46, 110], [38, 131], [144, 131], [144, 100], [126, 93], [104, 87]])
const EMBER: Pt = [46.5, 76.5]
/** Blind slats: diagonal bands of window light falling from the upper left. */
const slat = (x: number, y: number) => (frac((y - .42 * x) / 12.5) < .45 ? 1 : 0)
const lastCall: Luma = (x, y) => {
  const lit = slat(x, y) * clamp(1.15 - x / 240)
  if (seg(x, y, [62.5, 73.6], [48, 76.4]) < .85) return .88
  if (HAT(x, y) || brim(x, y)) return brim(x, y) && !brim(x, y - 2.2) && !HAT(x, y - 2.2) ? .55 : 0 // brim edge
  if (HEAD(x, y)) {
    // one slit of light across the eyes; the rest of him is shadow with a rim on the profile
    const slit = y > 50.5 && y < 58.5 && x < 92
    if (slit) return ell(x, y, 71.5, 55, 2.4, 1.6) < 1 ? .06 : .97 * clamp(1.6 - (x - 60) / 32)
    return !HEAD(x - 2.6, y) ? .8 : 0
  }
  if (COAT(x, y)) return seg(x, y, [82, 89], [93, 131]) < .9 || seg(x, y, [103, 88], [96, 131]) < .9 ? .32 : 0 // lapels
  // smoke curls up from the ember through the slats
  let smoke = 0
  if (y < 75 && y > 18) {
    const k = (75 - y) / 57, xc = EMBER[0] + 7 * Math.sin((75 - y) * .11) * k + 3 * k
    if (Math.abs(x - xc) < 1.1 + k) smoke = .4 * (1 - k * .6)
  }
  return Math.max(x > 4 && y > 13 ? lit * .36 : 0, smoke)
}
const lastCallPoster = poster({
  id: 'cinema-last-call', n: 1, genre: 'NOIR', title: 'LAST CALL', tag: 'THE BAR NEVER CLOSED', at: [centre('LAST CALL'), BOTTOM],
  scene: lastCall, red: (x, y) => (len(x - EMBER[0], y - EMBER[1]) < 1.3 ? 1 : 0),
})

// ── 02 SIGNAL · sci-fi ──────────────────────────────────────────────────────────────────────────
// A gas giant lit from behind (a thin crescent), a small moon, and on the night side one red light
// that blinks back: someone answered.
const PC: Pt = [100, 158], PR = 92
const LIGHT = [-.72, -.6, -.35] as const
const lambert = (dx: number, dy: number, nz: number) => clamp(LIGHT[0] * dx + LIGHT[1] * dy + LIGHT[2] * nz)
const BEACON: Pt = [111.5, 101.5]
const signal: Luma = (x, y) => {
  const dx = (x - PC[0]) / PR, dy = (y - PC[1]) / PR, d2 = dx * dx + dy * dy
  if (d2 < 1) {
    const nz = Math.sqrt(1 - d2), lam = lambert(dx, dy, nz), b = dx * .3 + dy * .95
    const band = .74 + .26 * Math.sin(b * 40 + 2.2 * Math.sin(b * 11))
    return Math.pow(lam, .8) * band * 1.08
  }
  const d = Math.sqrt(d2)
  if (d < 1.035) return .55 * clamp(-LIGHT[0] * -dx / d - LIGHT[1] * -dy / d - .25) * (1 - (d - 1) / .035) // lit limb haze
  const m = ell(x, y, 34, 58, 10, 10)
  if (m < 1) { const mx = (x - 34) / 10, my = (y - 58) / 10, l = lambert(mx, my, Math.sqrt(Math.max(0, 1 - mx * mx - my * my))); return l > .05 ? .25 + .7 * l : 0 }
  return star(x, y, 11, .035)
}
const signalPoster = poster({
  id: 'cinema-signal', n: 2, genre: 'SCI-FI', title: 'SIGNAL', tag: 'SOMEONE ANSWERED', at: [2, TOP],
  scene: signal, red: (x, y) => (len(x - BEACON[0], y - BEACON[1]) < 1.3 ? 1 : 0),
  // the beacon blinks: 1.7 s on, .7 s low
  pulse: t => (t <= 0 || frac(t / 2.4) < .7 ? 1 : .4),
})

// ── 03 SUNDOWN · western ────────────────────────────────────────────────────────────────────────
// A red sun on the horizon between two mesas, a lone gunslinger standing in it, his long shadow.
const HY = 93, SUN: Pt = [72, 93], SUN_R = 32
const MESA_L = poly([[0, HY], [0, 60], [4, 58], [20, 58], [23, 63], [27, 70], [31, 80], [36, HY]])
const MESA_R = poly([[104, HY], [107, 80], [110, 71], [113, 67], [131, 67], [134, 72], [138, 74], [144, 74], [144, HY]])
const mesa = any(MESA_L, MESA_R)
/** The gunslinger: hat, duster, arms clear of the body, legs apart, boots on the horizon. */
const DUSTER = poly([[66, 70], [77, 70], [78.5, 87], [64.5, 87]])
const GS = 1.3
const rider = (X: number, Y: number) => gunslinger(71.5 + (X - 71.5) / GS, 94.5 + (Y - 94.5) / GS)
const gunslinger = (x: number, y: number) =>
  rect(x, y, 67.8, 57.2, 75.2, 61.6) || rect(x, y, 63, 61.6, 80, 63.4) || rect(x, y, 69, 63.4, 74, 68.4) || rect(x, y, 70, 68.4, 73, 70.5) ||
  DUSTER(x, y) || seg(x, y, [64.8, 71], [61, 85]) < 1.3 || seg(x, y, [78.2, 71], [82, 85]) < 1.3 ||
  seg(x, y, [68.5, 86], [64.8, 94.5]) < 1.4 || seg(x, y, [74.5, 86], [78.2, 94.5]) < 1.4 || ell(x, y, 79.8, 84.5, 1.6, 2) < 1
/** Thin lit cloud streaks: [y, x0, x1]. The low one crosses the sun. */
const STREAKS: [number, number, number][] = [[49, 92, 134], [79, 40, 104]]
const streak = (x: number, y: number) => STREAKS.some(([sy, a, b]) => Math.abs(y - sy) < 1.15 && x > a && x < b)
const inSun = (x: number, y: number) => y < HY && len(x - SUN[0], y - SUN[1]) < SUN_R && !mesa(x, y) && !rider(x, y) && !streak(x, y)
const sundown: Luma = (x, y) => {
  if (y < HY) {
    if (mesa(x, y)) return !mesa(x, y - 2.2) ? .4 : 0
    if (rider(x, y)) return 0
    const ds = len(x - SUN[0], y - SUN[1])
    if (streak(x, y)) return .45 + .45 * Math.exp(-Math.max(0, ds - SUN_R) / 26)
    if (ds < SUN_R) return 0
    return .6 * Math.exp(-(ds - SUN_R) / 11) + .3 * Math.exp(-(HY - y) / 7)
  }
  // ground: grazing light near the horizon, scrub texture, the rider's shadow running at the viewer
  const k = (y - HY) / (Y1 - HY), sx = 71.5 + (y - HY - 1) * .3
  if (Math.abs(x - sx) < 2.2 + k * 7 && x < sx + 2 + k * 4) return 0
  const scrub = hash01(Math.round(x / 2.5), Math.round(y / 2.5), 3)
  return .4 * Math.exp(-(y - HY) / 6) * (.7 + .6 * scrub) + (scrub > .9 ? .22 * (1 - k) : 0)
}
const sundownPoster = poster({
  id: 'cinema-sundown', n: 3, genre: 'WESTERN', title: 'SUNDOWN', tag: 'THE LAST LIGHT WEST', at: [centre('SUNDOWN'), BOTTOM],
  scene: sundown, red: (x, y) => (inSun(x, y) ? 1 : 0),
})

// ── 04 UPSTAIRS · horror ────────────────────────────────────────────────────────────────────────
// A black house on a hill against a full moon, fog at its feet; one upstairs window is lit red.
const MOON: Pt = [101, 40], MOON_R = 21
const HOUSE = any(
  poly([[24, 66], [94, 66], [94, 108], [24, 108]]), // body
  poly([[18, 68], [46, 41], [74, 68]]), // gable
  poly([[70, 40], [86, 40], [86, 108], [70, 108]]), // tower
  poly([[67.5, 41.5], [78, 15], [88.5, 41.5]]), // spire
  poly([[30, 43], [35, 43], [35, 60], [30, 60]]), // chimney
  poly([[84, 68], [97, 57], [110, 68], [108, 68], [108, 108], [86, 108]]), // wing
)
const WINDOWS: Box[] = [[43.5, 50, 48.5, 58], [29, 71, 35, 78], [41, 71, 47, 78], [55, 71, 61, 78], [29, 84, 35, 93], [41, 84, 47, 93], [55, 84, 61, 93], [75.5, 70, 80.5, 78], [93, 73, 101, 80]]
const RED_WINDOW: Box = [75.3, 45.4, 80.3, 52.6]
const hillY = (x: number) => 104 - 9 * Math.exp(-(((x - 62) / 46) ** 2))
const upstairs: Luma = (x, y) => {
  const fog = .3 * valueNoise2(x / 9, y / 3.2, 5) * Math.exp(-(((y - 106) / 7) ** 2))
  if (y > hillY(x)) return Math.max(0, fog - .02)
  if (HOUSE(x, y)) {
    if (WINDOWS.some(([a, b, c, d]) => rect(x, y, a, b, c, d))) return Math.max(.26, fog)
    const dm = len(x - MOON[0], y - MOON[1])
    // moonlit rim on the edges that face the moon
    if (dm < MOON_R + 22 && !HOUSE(x + 2.2 * (MOON[0] - x) / dm, y + 2.2 * (MOON[1] - y) / dm)) return Math.max(.46, fog)
    return fog
  }
  const dm = len(x - MOON[0], y - MOON[1])
  if (dm < MOON_R) {
    const maria = valueNoise2(x / 6.5, y / 6.5, 9), limb = Math.sqrt(1 - (dm / MOON_R) ** 2)
    return .7 + .28 * limb - .18 * clamp((maria - .45) / .25)
  }
  // moonlit cloud sky behind the house, falling off to black at the edges
  const sky = (.16 + .26 * Math.exp(-(dm - MOON_R) / 26)) * (.6 + .6 * valueNoise2(x / 14, y / 7, 6)) * clamp(1.3 - y / 120)
  return Math.max(fog, sky)
}
const upstairsPoster = poster({
  id: 'cinema-upstairs', n: 4, genre: 'HORROR', title: 'UPSTAIRS', tag: 'SOMEONE LEFT IT ON', at: [centre('UPSTAIRS'), BOTTOM],
  scene: upstairs, red: (x, y) => (rect(x, y, ...RED_WINDOW) ? 1 : 0),
})

// ── 05 CLOSER · romance ─────────────────────────────────────────────────────────────────────────
// Two profiles almost touching, lit only by the one flame between their lips: each face is bright
// where it turns to the flame and falls into the dark behind the cheek, so the faces (not the gap)
// are the figure.
/** Face profile: how far the front edge reaches toward the other face, by row (forehead → neck). */
const PROFILE: Pt[] = [[16, -16], [20, -9], [26, -4.5], [34, -1.5], [44, 0], [49, 1], [52, -.2], [55, .6], [58, 3], [62.5, 7.2], [64.5, 6], [66, 2], [68, 2.6], [70, 3.6], [71.5, 2], [73, 3], [75, 1], [78, .2], [81, 1.6], [84, -1], [87, -7], [93, -10.5], [131, -11.5]]
const FLAME: Pt = [72, 71.25], PK = 1.7
const leftEdge = (y: number) => 58 + PK * pl(PROFILE, y)
const rightEdge = (y: number) => 86 - PK * pl(PROFILE, y - 1.5)
const inLeft = (x: number, y: number) => x < leftEdge(y) && y > 15 && (ell(x, y, 40, 50, 23, 36) < 1 || (y > 78 && x > leftEdge(y) - 20 - Math.max(0, y - 98) * 1.6))
const inRight = (x: number, y: number) => x > rightEdge(y) && y > 16.5 && (ell(x, y, 104, 51.5, 23, 36) < 1 || (y > 79.5 && x < rightEdge(y) + 20 + Math.max(0, y - 99.5) * 1.6))
/** Closed eyes: a short dark lash line a cheek's width behind the brow. */
const lash = (x: number, y: number, ex: number, ey: number) => Math.abs(y - ey - .1 * (x - ex) ** 2) < .9 && Math.abs(x - ex) < 3.2
const face = (d: number, y: number, dx: number) => {
  // lit by the flame: bright on the profile, ~8 cells of falloff into the cheek, dimmer with height off the flame
  const fromFlame = len(dx * .6, y - FLAME[1]), key = .35 + .65 * Math.exp(-((fromFlame / 34) ** 2))
  return key * (.2 + .8 * Math.exp(-d / 14)) * (d < 1.2 ? .8 : 1)
}
const closer: Luma = (x, y) => {
  const df = len((x - FLAME[0]) * 1.3, y - FLAME[1])
  if (inLeft(x, y)) {
    const d = leftEdge(y) - x
    if (lash(x, y, leftEdge(50) - 8, 50.5) || (Math.abs(y - 71.5) < .7 && d < 3.5)) return .04
    return face(d, y, leftEdge(y) - FLAME[0])
  }
  if (inRight(x, y)) {
    const d = x - rightEdge(y)
    if (lash(x, y, rightEdge(52) + 8, 52) || (Math.abs(y - 73) < .7 && d < 3.5)) return .04
    // her hair falls over the back of her head: only the strands nearest the flame catch it
    const hair = x > rightEdge(y) + 16 && y > 26 ? .35 + .3 * Math.sin(x * .9 + y * .25) : 1
    return face(d, y, rightEdge(y) - FLAME[0]) * hair
  }
  // between them: only the flame's own small halo, the rest is night
  return .95 * Math.exp(-((df / 7) ** 2))
}
const closerPoster = poster({
  id: 'cinema-closer', n: 5, genre: 'ROMANCE', title: 'CLOSER', tag: 'NO LIGHTS. JUST US.', at: [centre('CLOSER'), BOTTOM],
  scene: closer, red: (x, y) => (ell(x, y, FLAME[0], FLAME[1], 1.4, 2.9) < 1 ? 1 : 0),
})

// ── 06 WITNESS · documentary ────────────────────────────────────────────────────────────────────
// An eye in extreme close-up; the catchlight in the pupil is the fire it saw.
const EC: Pt = [72, 64], EW = 60, IRIS: Pt = [72, 61], IRIS_R = 21, PUPIL_R = 8.5
const CATCH: Pt = [76.5, 56.5]
const lidUp = (x: number) => { const q = 1 - ((x - EC[0]) / EW) ** 2; return q <= 0 ? EC[1] : EC[1] - 25 * Math.pow(q, .85) + (x - EC[0]) * .04 }
const lidLo = (x: number) => { const q = 1 - ((x - EC[0]) / EW) ** 2; return q <= 0 ? EC[1] : EC[1] + 14 * Math.pow(q, 1.1) + (x - EC[0]) * .04 }
const witness: Luma = (x, y) => {
  const up = lidUp(x), lo = lidLo(x), open = Math.abs(x - EC[0]) < EW && y > up && y < lo
  if (open) {
    if (y < up + 1.6) return 0 // lash line
    const di = len(x - IRIS[0], y - IRIS[1]), shade = .45 + .55 * clamp((y - up) / 11)
    if (di < PUPIL_R) return 0
    if (di < IRIS_R) {
      const a = Math.atan2(y - IRIS[1], x - IRIS[0]), fibre = .5 + .5 * Math.sin(a * 31 + 2.6 * Math.sin(a * 6 + di * .35))
      const ring = Math.abs(di - 12.2) < 1.1 ? .25 : 0, limbus = di > IRIS_R - 2.6 ? .5 : 1
      return clamp((.28 + .5 * fibre * (.5 + .5 * clamp((di - PUPIL_R) / 6)) + ring) * limbus * shade)
    }
    const corner = Math.abs(x - EC[0]) / EW
    if (x < EC[0] - EW + 9 && y > EC[1] - 3) return .5 // tear duct
    return (.9 - .55 * corner * corner) * shade * (y > lo - 1.4 ? .6 : 1)
  }
  // skin: lashes, lid crease, brow
  const above = up - y, below = y - lo
  if (y < up && above < 9 && Math.abs(x - EC[0]) < EW - 4 && frac((x + above * (x < EC[0] ? -.55 : .55)) / 3.3) < .3) return .02
  const crease = Math.abs(above - 11 - 3 * (1 - ((x - EC[0]) / EW) ** 2)) < 1.4 && Math.abs(x - EC[0]) < EW - 6
  if (crease) return .12
  const brow = Math.abs(y - (24 - 10 * (1 - ((x - 76) / 64) ** 2))) < 5 && x > 14 && x < 136
  if (brow && frac((x * .9 + y * 1.6) / 3) < .5) return .3
  const skin = (.3 + .14 * (x / 143) + .08 * (valueNoise2(x / 5, y / 5, 21) - .5)) * clamp(1.35 - ell(x, y, EC[0], EC[1], 80, 62))
  return below > 0 ? skin * (below < 3 ? .55 : 1) : skin * (above < 9 ? .9 : 1)
}
const witnessPoster = poster({
  id: 'cinema-witness', n: 6, genre: 'DOCUMENTARY', title: 'WITNESS', tag: 'SHE SAW THE FIRE', at: [centre('WITNESS'), BOTTOM],
  scene: witness, red: (x, y) => (len(x - CATCH[0], y - CATCH[1]) < 1.3 ? 1 : 0),
})

// ── 07 EXIT 14 · thriller ───────────────────────────────────────────────────────────────────────
// Night highway to the vanishing point under a sign gantry; one car ahead, its taillight bar red.
const VP: Pt = [72, 62], SLOPE = 1.37
const LAMPS = [1.3, 1.9, 2.8, 4.1, 6.2, 9.5].map(d => 1 / d)
/** Overhead sign plate (lattice-aligned outline around the title) and its hangers. */
const SIGN: Box = [xOf(6), yOf(3), xOf(50), yOf(13)]
const car = poly([[84, 113], [84, 99], [89.5, 89.5], [114.5, 89.5], [120, 99], [120, 113]])
const TAIL: Box = [86.5, 100.4, 117.5, 102.6]
const exit14: Luma = (x, y) => {
  const [a, b, c, d] = SIGN
  if ((Math.abs(y - b) < 1 || Math.abs(y - d) < 1) && x > a - 1 && x < c + 1) return .55
  if ((Math.abs(x - a) < 1 || Math.abs(x - c) < 1) && y > b - 1 && y < d + 1) return .55
  if ((Math.abs(x - xOf(14)) < .9 || Math.abs(x - xOf(42)) < .9) && y < b) return .3
  if (y > b - 1 && y < d + 1 && x > a && x < c) return 0
  if (car(x, y)) {
    if (y < 91.5) return .8 // roof line catching the lamps
    if (y < 98) return x > 90 + (98 - y) * .5 && x < 114 - (98 - y) * .5 ? .12 : .45 // rear glass, pillars
    if (y < 99.5) return .55 // boot lid edge
    if (y > 107.5 && y < 110) return .6 // bumper
    if (y >= 110) return 0
    if (rect(x, y, 97.5, 104, 106.5, 107)) return .75 // plate
    return .4
  }
  if (y > 112 && y < 116 && x > 82 && x < 122) return 0 // shadow under the car
  // poles and lamp heads, both sides
  for (const s of LAMPS) for (const side of [-1, 1]) {
    const bx = VP[0] + side * (SLOPE * 60 * s + 4 * s), top = VP[1] - 44 * s, hx = bx - side * 12 * s
    if (Math.abs(y - top) < .5 + .5 * s && (x - hx) * side > 0 && (bx - x) * side > 0) return .22 // arm
    if (len(x - hx, y - top - 1) < .9 + 1.8 * s) return .96
  }
  if (y <= VP[1]) {
    // skyline on the horizon with a few lit windows, and city glow
    const bw = Math.floor(x / 5), h = 3 + 11 * hash01(bw, 0, 41) * Math.exp(-(((x - 72) / 50) ** 2))
    if (y > VP[1] - h) return hash01(Math.round(x / 2.5), Math.round(y / 2.5), 43) > .86 ? .3 : 0
    return .3 * Math.exp(-(VP[1] - y) / 5)
  }
  const half = (y - VP[1]) * SLOPE, dx = x - VP[0]
  if (Math.abs(dx) > half) return .03
  if (Math.abs(Math.abs(dx) - half * .93) < .5 + (y - VP[1]) * .03) return .7 // road edges
  return 0
}
/** The centre dashes rush at the viewer (mechanical, stepped at 12 fps). */
const dash = (x: number, y: number, t: number) => {
  if (car(x, y)) return 0
  if (y <= VP[1] + 1 || Math.abs(x - VP[0]) > .4 + (y - VP[1]) * .035) return 0
  const z = 30 / (y - VP[1])
  return frac(z * .9 + t * 1.3) < .42 ? .88 : 0
}
const exit14Poster = poster({
  id: 'cinema-exit-14', n: 7, genre: 'THRILLER', title: 'EXIT 14', tag: "DON'T LOOK BACK", at: [centre('EXIT 14'), 5],
  scene: exit14, red: (x, y) => (rect(x, y, ...TAIL) ? 1 : 0),
  live: { where: (x, y) => y > VP[1] + 1 && Math.abs(x - VP[0]) < 2 + (y - VP[1]) * .04 && !car(x, y), f: dash },
})

// ── 08 KEEPER · drama ───────────────────────────────────────────────────────────────────────────
// A lighthouse on its rock at night, the beam across the sky; the lamp itself is red.
const LX = 97.75, LAMP: Pt = [LX, 36.5], SEA_Y = 92
const hw = (y: number) => 5.6 + (y - 44) * .12
const ROCKS = poly([[56, 106], [61, 101], [67, 97.5], [73, 93.5], [79, 90], [85, 86.5], [91, 84.5], [104, 84.5], [110, 86.5], [116, 85.5], [122, 89], [128, 93], [134, 97], [140, 101.5], [144, 103], [144, 106]])
const beam = (x: number, y: number, dx: number, dy: number, reach: number) => {
  const n = Math.hypot(dx, dy), ux = dx / n, uy = dy / n, px = x - LAMP[0], py = y - LAMP[1]
  const along = px * ux + py * uy, perp = Math.abs(px * -uy + py * ux), w = 1.6 + along * .095
  if (along < 5 || perp > w) return 0
  return .85 * clamp(1 - along / reach) * Math.pow(1 - perp / w, .6)
}
const keeper: Luma = (x, y) => {
  // lantern room, gallery and dome
  if (rect(x, y, LX - 5.5, 30, LX + 5.5, 41)) return Math.abs(x - (LX - 3)) < .5 || Math.abs(x - (LX + 3)) < .5 ? .55 : .22
  if (rect(x, y, LX - 8.5, 41, LX + 8.5, 44)) return y < 42 || frac(x / 2.5) < .5 ? .5 : .1
  if (poly([[LX - 7, 30.5], [LX, 23], [LX + 7, 30.5]])(x, y)) return .55 - .3 * clamp((x - LX + 7) / 14)
  if (Math.abs(x - LX) < .5 && y > 19 && y < 23.5) return .5
  // tower: lit from the beam side (left), two dark bands, a door
  if (y >= 44 && y <= 86 && Math.abs(x - LX) < hw(y)) {
    if (rect(x, y, LX - 2, 78, LX + 2, 86)) return .03
    const side = (x - (LX - hw(y))) / (2 * hw(y)), banded = (y > 56 && y < 65) || (y > 76 && y < 85)
    return (.95 - .6 * side) * (banded ? .3 : 1)
  }
  // the rock: a black mass, its crown lit by the lamp above, surf breaking white along its waterline
  if (ROCKS(x, y)) {
    if (!ROCKS(x, y - 2.4)) return .62 - .3 * clamp(Math.abs(x - LX) / 40)
    const facet = valueNoise2(x / 5, y / 3, 55)
    return y < 97 && facet > .62 ? .2 : 0
  }
  const sky = Math.max(beam(x, y, -1, -.3, 175), beam(x, y, 1, .14, 80))
  if (y < SEA_Y) return Math.max(sky, star(x, y, 52, .03))
  if (y < SEA_Y + 1.4) return .5 // horizon
  if (y > 113) return 0
  // surf: a broken white line hugging the rock's waterline
  if (ROCKS(x, y - 2.6) || ROCKS(x - 2.6, y - 1.2) || ROCKS(x + 2.6, y - 1.2)) return hash01(Math.round(x / 2.5), Math.round(y / 2.5), 56) > .3 ? .92 : .5
  // sea: swell lines that open up toward the viewer, brighter under the lamp (its reflection)
  // one broken swell line per lattice row; dashes lengthen toward the viewer and close up under the lamp
  const k = (y - SEA_Y) / (113 - SEA_Y), row = Math.round((y - yOf(0)) / K)
  const under = Math.exp(-(((x - LX + 2) / (6 + 16 * k)) ** 2))
  const dash = valueNoise2(x / (5 + 14 * k), row * 1.7, 53) > .52 - .3 * under
  return dash ? (.24 + .14 * (row % 2) + .55 * under) * (1 - .25 * k) : 0
}
const keeperPoster = poster({
  id: 'cinema-keeper', n: 8, genre: 'DRAMA', title: 'KEEPER', tag: 'HE KEPT IT BURNING', at: [centre('KEEPER'), BOTTOM],
  scene: keeper, red: (x, y) => (rect(x, y, LX - 2.4, LAMP[1] - 1.2, LX + 2.4, LAMP[1] + 1.2) ? 1 : 0),
})

// ── 09 ENCORE · musical ─────────────────────────────────────────────────────────────────────────
// A singer alone in the follow-spot, black against the lit curtain at a vintage mic stand: head
// thrown back to the mic, one arm flung up to the rafters, the gown flaring to the boards.
// A red rose lies at her feet.
/** The spot on the back curtain: a big disc with a 1-cell edge ramp. */
const SPOT: Pt = [72, 62], SPOT_R = 54, SPOT_Y = 1.04, STAGE_Y = 104
/** The singer as one closed silhouette (card cells), hand-placed: gown, left arm at her side, neck, raised right arm. */
const SINGER = poly([
  [44, 104.5], [52, 98], [57.5, 88], [61, 77], [62.5, 68], [63, 58], [62.5, 49], [65, 45.5], // gown → arm at her side → shoulder
  [70, 43], [70, 37], [75, 37], [75, 42.5], [82, 44], // neck, shoulder
  [94.2, 28], [102.5, 15.5], [104.5, 11.5], [107.5, 11], [110, 13.5], [110.5, 17.5], [108.8, 20.5], [99.8, 32.5], [88.5, 48.5], // raised arm, open hand
  [83, 52], [80, 58], [79, 64], [80.5, 70], [83.5, 79], [87.5, 89], [92.5, 97.5], [100, 104.5], // torso, gown
])
/** Head thrown back toward the mic: chin up-left, hair gathered behind. */
const head = (x: number, y: number) => ell(x, y, 71.5, 29.5, 6.4, 7.4) < 1 || ell(x, y, 66.6, 35, 3, 2.3) < 1 || ell(x, y, 77.5, 25.5, 3.6, 4) < 1
/** The stand: a thin pole to a round mic at her mouth. */
const stand = (x: number, y: number) => seg(x, y, [52.5, 104], [59.5, 39]) < .9 || seg(x, y, [59.5, 39], [61.8, 36]) < .9 || ell(x, y, 61.8, 33.6, 2.1, 2.6) < 1
const singer = (x: number, y: number) => SINGER(x, y) || head(x, y) || stand(x, y)
const ROSE: Box = [101.5, 102.4, 105.5, 104.9]
const encore: Luma = (x, y) => {
  if (singer(x, y)) return 0
  if (seg(x, y, [105.5, 104], [113.5, 105.4]) < .6) return .2 // rose stem
  const ds = len(x - SPOT[0], (y - SPOT[1]) * SPOT_Y)
  if (y < STAGE_Y) {
    // the curtain: vertical pleats, lit inside the spot (bright core, a fall-off to its edge), dim outside
    const pleat = .5 + .5 * Math.sin((x + 1.5 * Math.sin(y * .05)) * .62)
    if (ds < SPOT_R) {
      const core = 1 - .4 * (ds / SPOT_R) ** 2, edge = clamp(SPOT_R - ds)
      return (.72 + .28 * pleat) * core * (.55 + .45 * edge)
    }
    return .3 * Math.exp(-(ds - SPOT_R) / 3) + .2 * pleat * clamp(1 - (ds - SPOT_R) / 30) * (y > 60 ? 1 : 0)
  }
  // the boards: the spot's pool spreads out from her feet
  if (y > 113) return 0
  const e = ell(x, y, 72, 107, 46, 6.5), plank = frac((y - STAGE_Y) / 2.5) < .5 ? 1 : .8
  if (e < 1) return (.95 - .5 * e * e) * plank
  return y < STAGE_Y + 1.5 ? .5 : .16 * clamp(1.6 - e / 2) * plank
}
const encorePoster = poster({
  id: 'cinema-encore', n: 9, genre: 'MUSICAL', title: 'ENCORE', tag: 'ONE MORE SONG', at: [centre('ENCORE'), BOTTOM],
  scene: encore, red: (x, y) => (rect(x, y, ...ROSE) ? 1 : 0),
})

export const cinemaBoard = [lastCallPoster, signalPoster, sundownPoster, upstairsPoster, closerPoster, witnessPoster, exit14Poster, keeperPoster, encorePoster]
