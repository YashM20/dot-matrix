/**
 * Display skins (WEB-PLAN C7): the physical display a board is shown on. A skin is a post-raster stage —
 * it changes the physics of the light (persistence, bloom, lenses, ink, discs), never the palette roles:
 * the board's one accent keeps its hue on every skin. Plain data here; the canvas stage is `stage.ts`.
 */
import { DEVICES, type EinkPhysics, type FlipPhysics, type LedPhysics } from '../device/profile'

export const SKIN_NAMES = ['oled', 'crt', 'vfd', 'led', 'eink', 'flipdisc', 'nixie'] as const
export type SkinName = typeof SKIN_NAMES[number]
export const isSkinName = (s: unknown): s is SkinName => typeof s === 'string' && (SKIN_NAMES as readonly string[]).includes(s)

export interface SkinInfo {
  name: SkinName
  /** Short label for the switcher (≤ 5 chars). */
  label: string
  title: string
  /** How the overlay composites over the card: emissive skins add light (`screen`), reflective ones cover it. */
  blend: 'none' | 'screen' | 'normal'
}
export const SKINS: Record<SkinName, SkinInfo> = {
  oled: { name: 'oled', label: 'OLED', title: 'OLED: the card as sampled (default)', blend: 'none' },
  crt: { name: 'crt', label: 'CRT', title: 'CRT: phosphor persistence, scanlines, bloom, curved glass', blend: 'screen' },
  vfd: { name: 'vfd', label: 'VFD', title: 'Vacuum fluorescent: cyan-green phosphor glow behind a grid mesh', blend: 'screen' },
  led: { name: 'led', label: 'LED', title: 'LED matrix: round lenses, bleed, unlit lenses still visible', blend: 'screen' },
  eink: { name: 'eink', label: 'INK', title: 'E-ink: 1-bit dither, ghosting, full-refresh flash', blend: 'normal' },
  flipdisc: { name: 'flipdisc', label: 'FLIP', title: 'Flip-disc: two-faced discs with inertia (clack optional)', blend: 'normal' },
  nixie: { name: 'nixie', label: 'NIXIE', title: 'Nixie-ish: warm neon glow behind a hex anode mesh', blend: 'screen' },
}

/** Emissive tint for neutral light: [r, g, b] a white dot becomes (0..1, sRGB). The accent column is kept. */
export type Phosphor = readonly [number, number, number]

export const SKIN_PHYSICS = {
  /** τ = phosphor decay (s), v′ = max(v, old·e^(−Δt/τ)); bloom = alpha per mip level (¼, ⅟₁₆); curvature k of the glass. */
  crt: { tau: .085, bloom: [.42, .24] as const, scanline: .42, curvature: .05, onS: .62 },
  vfd: { phosphor: [.30, 1, .86] as Phosphor, bloom: [.55, .3] as const, mesh: .34, onS: .75 },
  /** LED lens radius (cells), light gain, PWM gamma, and the diffuser physics of the Glyph Matrix profile. */
  led: { ...(DEVICES['glyph-matrix-25'].physics as LedPhysics), lens: .43, gamma: 2.2, onS: .5 },
  /** The TRMNL panel physics; `gapS` = the controller's idle time between two refreshes. */
  eink: { ...(DEVICES['trmnl-800x480'].physics as EinkPhysics), gapS: .12 },
  /** The flip-disc profile physics; a card is ~144 columns wide, so the column scan is compressed into `sweepS`. */
  flipdisc: { ...(DEVICES['flipdisc-28x14'].physics as FlipPhysics), sweepS: .34, threshold: .42, maxHz: 12 },
  nixie: { phosphor: [1, .5, .14] as Phosphor, bloom: [.7, .42, .26] as const, mesh: .3, onS: .85 },
} as const

/**
 * feColorMatrix (sRGB) that sends neutral light to `phosphor` while the red column passes through, so a
 * red accent stays red (it only loses a little green/blue) and greys/whites take the phosphor's colour:
 * M·(1,1,1) = phosphor, M·(1,0,0) = (1,0,0).
 */
export function phosphorMatrix(phosphor: Phosphor): number[] {
  const [pr, pg, pb] = phosphor, hr = (pr - 1) / 2, hg = pg / 2, hb = pb / 2
  return [
    1, hr, hr, 0, 0,
    0, hg, hg, 0, 0,
    0, hb, hb, 0, 0,
    0, 0, 0, 1, 0,
  ]
}
/** Apply a 4×5 colour matrix to one sRGB colour (0..1) — the CPU reference of the SVG filter. */
export function applyMatrix(m: number[], [r, g, b]: readonly [number, number, number]): [number, number, number] {
  const c = (i: number) => Math.max(0, Math.min(1, m[i] * r + m[i + 1] * g + m[i + 2] * b + m[i + 4]))
  return [c(0), c(5), c(10)]
}
