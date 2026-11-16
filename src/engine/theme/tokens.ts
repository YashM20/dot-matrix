import type { ThemeTokens } from '../types'
export const dot480: ThemeTokens = { bg: '#070809', surface: '#111315', surfaceRaised: '#1B1E21', hairline: 'rgba(255,255,255,0.08)', dotIdle: '#8A8F98', dotMid: '#5B5F66', dotFaint: '#2E3033', dotActive: '#FF3B30', dotActiveDim: '#B8241A', accentAmber: '#D98A3D', value: '#F2F3F5', gridPx: 4, cornerRadiusCard: 12 }
export const deerflowMosaic: ThemeTokens = { bg: '#0a0908', surface: '#161412', surfaceRaised: '#22201e', hairline: 'rgba(255,255,255,0.07)', dotIdle: '#9a958f', dotMid: '#6b6762', dotFaint: '#3a3835', dotActive: '#FF3B30', dotActiveDim: '#B8241A', accentAmber: '#D98A3D', value: '#F4F1EC', gridPx: 4, cornerRadiusCard: 12 }
export const presets = { dot480, deerflowMosaic } as const

/**
 * The card frame (DESIGN.md › Cards › dot-card): the card surface, a 1 px hairline and the card radius. The site draws
 * it in CSS (`--surface`, `--line`, `--radius-card`, the same values: `scripts/site/theme.ts` checks they match); the
 * card exports (PNG, SVG, HTML) and the registry's card host draw it from here.
 */
export interface CardFrameStyle { background: string; border: string; radius: number }
export const cardFrame = (t: ThemeTokens): CardFrameStyle =>
  ({ background: t.surface, border: t.hairline ?? dot480.hairline!, radius: t.cornerRadiusCard })
export type PresetName = keyof typeof presets
