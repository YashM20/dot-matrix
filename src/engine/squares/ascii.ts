/**
 * ASCII glyph tiles (docs/living-matter/Q-squares.md Q3.10, #36): the `sq-ascii` card's screen. A slow plasma is
 * typed onto a screen of 5 × 7 glyph tiles by a cursor, one tile at a time in reading order; each tile holds the
 * glyph for the plasma's level at the moment the cursor last passed it.
 *
 * The glyphs are the 5 × 7 font's own bitmaps (`fields/bitmapFont`), so a glyph pixel is one card cell and the
 * square dots stay on the card grid. `@` is not in the font and is drawn here, so the font and every golden that
 * uses it stay untouched. The alphabet is built with L's `defineAlphabet` (life/glyphTiles.ts, read only).
 *
 * The ramp is ordered by ink: 0, 1, 2, 5, 9, 10, 15, 17, 20 and 21 lit pixels of 35. In this font `+` (9) has less
 * ink than `=` (10), so the ramp is ` .:-+=%*#@`.
 *
 * The loop: write counts are reduced mod (tiles × redraws) before they become a phase, and every time term turns a
 * whole number of times per loop, so the screen after the last write of a loop is the one the first write follows.
 * Deterministic (inside the determinism lint): `tsin`, sqrt and integer counts only.
 */
import { RAMP_GLYPHS, glyph } from '../fields/bitmapFont'
import { defineAlphabet, type Alphabet } from '../life/glyphTiles'
import { TAU, tsin } from '../noise/trig'

/** Light to dark, in the font's ink order. */
export const ASCII_RAMP = ' .:-+=%*#@'
/** Glyphs the font lacks (5 × 7, '#' = lit). `@` has 21 pixels, one more than `#`; `%` and `*` are the font's dense ramp forms. */
const LOCAL: Record<string, string> = {
  '@': '.###./#...#/#.###/#.#.#/#.###/#..../.####',
  ...Object.fromEntries(Object.entries(RAMP_GLYPHS).map(([c, g]) => [c, g.map(r => r.replace(/1/g, '#').replace(/0/g, '.')).join('/')])),
}
const source = (ch: string) => LOCAL[ch] ?? glyph(ch).map(r => r.map(b => (b ? '#' : '.')).join('')).join('/')
/** The ten ramp glyphs as 5 × 7 bitmaps; `ramp` is the density order. */
export const ASCII57: Alphabet = defineAlphabet('ASCII57', 5, 7, Object.fromEntries([...ASCII_RAMP].map(c => [c, source(c)])), [...ASCII_RAMP])

export interface AsciiScreen {
  /** Tiles across and down. */
  cols: number; rows: number
  /** Card cells per tile across and down (glyph + a one-cell gutter). */
  pitch: number; pitchY: number
  /** Tiles the cursor writes per second. */
  rate: number
  /** Full redraws per loop. */
  redraws: number
}
/** 24 × 14 tiles of 6 × 8 cells, 24 tiles a second: a redraw every 14 s, four redraws to the 56 s loop. */
export const ASCII_SCREEN: AsciiScreen = { cols: 24, rows: 14, pitch: 6, pitchY: 8, rate: 24, redraws: 4 }

export const asciiTiles = (s: AsciiScreen) => s.cols * s.rows
/** Writes per loop. */
export const asciiPeriod = (s: AsciiScreen) => asciiTiles(s) * s.redraws
/** Seconds per loop. */
export const asciiLoop = (s: AsciiScreen) => asciiPeriod(s) / s.rate
const mod = (x: number, m: number) => ((x % m) + m) % m
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

/**
 * The plasma at a point, 0..1. `x` runs 0..1 across the screen and `y` down it in the same units (the tile's
 * 6 × 8 aspect is applied by the caller); `a` is the loop phase in radians. Four waves, the last a ring around a
 * centre that drifts once per loop, eased through one more sine so the screen reaches both ends of the ramp.
 */
export function plasma(x: number, y: number, a: number): number {
  const cx = .5 + .3 * tsin(a + .6), cy = .4 + .18 * tsin(a + 2.2 + TAU / 4)
  const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy))
  const p = tsin(TAU * 1.1 * x + a) + tsin(TAU * .9 * y - a + 1.7) + tsin(TAU * .6 * (x + y) + a + 4.1) + tsin(TAU * 1.5 * d - a)
  return clamp01(.5 + .5 * tsin(p * .2 * Math.PI))
}

/** Ramp index for a level 0..1 (round to the nearest of the ten steps). */
export const rampIndex = (level: number) => Math.round(clamp01(level) * (ASCII_RAMP.length - 1))

export interface AsciiFrame {
  /** Ramp index per tile, row-major. */
  glyph: Uint8Array
  /** Tile under the cursor (it is written next). */
  cursor: number
  /** Write count reduced into one loop, and the redraw it belongs to (0-based). */
  count: number; redraw: number
}

/**
 * The screen after `count` writes (any integer; it is reduced into one loop). Write k goes to tile k mod tiles, so
 * the cursor sits on tile count mod tiles and every other tile i shows the plasma at its last write
 * w = count − 1 − ((count − 1 − i) mod tiles), whose phase is 2π (w mod period) / period.
 */
export function asciiFrame(s: AsciiScreen, count: number, out = new Uint8Array(asciiTiles(s))): AsciiFrame {
  const n = asciiTiles(s), period = asciiPeriod(s), c = mod(count, period), aspect = s.pitchY / s.pitch
  for (let i = 0; i < n; i++) {
    const w = mod(c - 1 - mod(c - 1 - i, n), period), tx = i % s.cols, ty = (i - tx) / s.cols
    out[i] = rampIndex(plasma((tx + .5) / s.cols, (ty + .5) * aspect / s.cols, TAU * w / period))
  }
  return { glyph: out, cursor: c % n, count: c, redraw: Math.floor(c / n) }
}

/** Write count at card time t (seconds), with the loop's start offset. */
export const asciiCount = (s: AsciiScreen, t: number, offset = 0) => Math.floor((t + offset) * s.rate)
