/**
 * Display skins (WEB-PLAN C7): the physical display a board is shown on. A skin is a post-raster stage —
 * it changes the physics of the light (persistence, bloom, lenses, ink, discs), never the palette roles:
 * VFD and LED glow in the theme's accent (the caller passes it in) and keep the accent dots exact; the CRT's
 * phosphor stays white and Nixie's neon orange, by physics (docs/LAYOUT-THEME-PLAN.md §4, owner decision 4):
 * the CRT passes every colour, Nixie only a red accent (under another accent the tube is all neon).
 * Plain data here; the canvas stage is `stage.ts`.
 */
import { DEVICES, type EinkPhysics, type FlipPhysics, type LedPhysics } from '../device/profile'
import type { SkinName } from './names'

export { SKIN_NAMES, SKINS, isSkinName, type SkinInfo, type SkinName } from './names'

/** Emissive tint for neutral light: [r, g, b] a white dot becomes (0..1, sRGB). The accent itself is kept. */
export type Phosphor = readonly [number, number, number]

export const SKIN_PHYSICS = {
  /** τ = phosphor decay (s), v′ = max(v, old·e^(−Δt/τ)); bloom = alpha per mip level (¼, ⅟₁₆); curvature k of the glass. */
  crt: { tau: .085, bloom: [.42, .24] as const, scanline: .42, curvature: .05, onS: .62 },
  /** `white` = how far the accent-tinted phosphor is lifted towards white (a white dot glows hotter than an accent dot). */
  vfd: { white: .3, bloom: [.55, .3] as const, mesh: .34, onS: .75 },
  /** LED lens radius (cells), light gain, PWM gamma, and the diffuser physics of the Glyph Matrix profile. */
  led: { ...(DEVICES['glyph-matrix-25'].physics as LedPhysics), white: .12, lens: .43, gamma: 2.2, onS: .5 },
  /** The TRMNL panel physics; `gapS` = the controller's idle time between two refreshes. */
  eink: { ...(DEVICES['trmnl-800x480'].physics as EinkPhysics), gapS: .12 },
  /** The flip-disc profile physics; a card is ~144 columns wide, so the column scan is compressed into `sweepS`. */
  flipdisc: { ...(DEVICES['flipdisc-28x14'].physics as FlipPhysics), sweepS: .34, threshold: .24, maxHz: 12 },
  nixie: { phosphor: [1, .5, .14] as Phosphor, bloom: [.7, .42, .26] as const, mesh: .3, onS: .85 },
  /**
   * Reflective LCD (squares Q2): τ = liquid-crystal response (s), symmetric (pixels lag on and off alike); `gutter` =
   * the clear grid between pixels (fraction of a cell); the pixel layer's shadow on the backplane, offset (dx, dy)
   * cells, blurred `blur` cells, at `alpha`; `paper` / `ink` = the backplane and a fully driven pixel (sRGB 0..1:
   * skin physics, not tokens, like the e-ink paper); `pigment` = how dark the accent prints on the paper.
   */
  lcd: { tau: .15, gutter: .12, shadow: { dx: .35, dy: .5, alpha: .22, blur: .5 }, paper: [.77, .81, .63] as Phosphor, ink: [.12, .16, .1] as Phosphor, pigment: .82, off: .93, onS: .4 },
  /** Mosaic (squares Q2): one tile per cell with a `gap` of grout, a 1 px bevel (`hi` lighter top-left, `lo` darker bottom-right), ± `jitter` luma per tile. */
  grout: { gap: .14, bevel: { hi: .12, lo: .18 }, jitter: .03, onS: .3 },
} as const

/** The skins whose light is the theme accent (VFD phosphor, LED die colour); every other skin keeps a physical hue. */
export type AccentLit = 'vfd' | 'led'
export const accentLit = (skin: SkinName): skin is AccentLit => skin === 'vfd' || skin === 'led'

/** '#RRGGBB' → sRGB 0..1. */
export const rgbOf = (hex: string): Phosphor => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) as unknown as Phosphor

/**
 * The colour neutral light becomes on `skin`: VFD and LED take the accent's hue at full drive (max channel 1),
 * lifted a little towards white so a white dot reads hotter than an accent dot. (Nixie keeps `SKIN_PHYSICS.nixie.phosphor`.)
 */
export function skinPhosphor(skin: AccentLit, accent: Phosphor): Phosphor {
  const m = Math.max(accent[0], accent[1], accent[2], 1e-3), w = SKIN_PHYSICS[skin].white
  return accent.map(c => c / m + (1 - c / m) * w) as unknown as Phosphor
}

/**
 * feColorMatrix (sRGB) that sends neutral light to `phosphor` and passes `accent` through unchanged:
 * M·(1,1,1) = phosphor, M·accent = accent, with M = [accent phosphor]·pinv([accent 1]) (a colour between the
 * two lands between their images). Only for a phosphor of the accent's own hue (VFD, LED): with a far hue
 * (Nixie's neon under a blue accent) the projection throws off-plane tones out of gamut. Without an accent
 * (or a grey one) the red column passes: M·(1,0,0) = (1,0,0), the Nixie matrix.
 */
export function phosphorMatrix(phosphor: Phosphor, accent?: Phosphor): number[] {
  const [pr, pg, pb] = phosphor
  if (accent) {
    const aa = accent[0] ** 2 + accent[1] ** 2 + accent[2] ** 2, sa = accent[0] + accent[1] + accent[2], det = 3 * aa - sa * sa
    if (det > 1e-6) {
      const u = accent.map(c => (3 * c - sa) / det), v = accent.map(c => (aa - sa * c) / det)
      const row = (i: number) => [0, 1, 2].map(j => accent[i] * u[j] + phosphor[i] * v[j])
      return [...row(0), 0, 0, ...row(1), 0, 0, ...row(2), 0, 0, 0, 0, 0, 1, 0]
    }
  }
  const hr = (pr - 1) / 2, hg = pg / 2, hb = pb / 2
  return [
    1, hr, hr, 0, 0,
    0, hg, hg, 0, 0,
    0, hb, hb, 0, 0,
    0, 0, 0, 1, 0,
  ]
}
/**
 * feColorMatrix (sRGB) of the LCD (reflective): no light → the `paper`, full neutral light → the `ink`, and the accent
 * prints as itself darkened to `pigment` on the paper. M·1 + o = ink, M·a + o = pigment·a, o = paper, M the
 * minimum-norm solution (as `phosphorMatrix`); without a usable accent the neutrals alone.
 */
export function lcdMatrix(paper: Phosphor, ink: Phosphor, accent?: Phosphor, pigment = .82): number[] {
  const rows: number[][] = [0, 1, 2].map(i => { const d = (ink[i] - paper[i]) / 3; return [d, d, d] })
  if (accent) {
    const aa = accent[0] ** 2 + accent[1] ** 2 + accent[2] ** 2, sa = accent[0] + accent[1] + accent[2], det = 3 * aa - sa * sa
    if (det > 1e-6) {
      const u = accent.map(c => (3 * c - sa) / det), v = accent.map(c => (aa - sa * c) / det)
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) rows[i][j] = (pigment * accent[i] - paper[i]) * u[j] + (ink[i] - paper[i]) * v[j]
    }
  }
  return [...rows[0], 0, paper[0], ...rows[1], 0, paper[1], ...rows[2], 0, paper[2], 0, 0, 0, 1, 0]
}
/** Apply a 4×5 colour matrix to one sRGB colour (0..1) — the CPU reference of the SVG filter. */
export function applyMatrix(m: number[], [r, g, b]: readonly [number, number, number]): [number, number, number] {
  const c = (i: number) => Math.max(0, Math.min(1, m[i] * r + m[i + 1] * g + m[i + 2] * b + m[i + 4]))
  return [c(0), c(5), c(10)]
}
