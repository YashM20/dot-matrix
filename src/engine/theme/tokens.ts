import type { ThemeTokens } from '../types'
export const dot480: ThemeTokens = { bg: '#070809', surface: '#111315', surfaceRaised: '#1B1E21', hairline: 'rgba(255,255,255,0.08)', dotIdle: '#8A8F98', dotMid: '#5B5F66', dotFaint: '#2E3033', dotActive: '#FF3B30', dotActiveDim: '#B8241A', accentAmber: '#D98A3D', gridPx: 4, cornerRadiusCard: 16 } as ThemeTokens
export const deerflowMosaic: ThemeTokens = { bg: '#0a0908', surface: '#161412', surfaceRaised: '#22201e', hairline: 'rgba(255,255,255,0.07)', dotIdle: '#9a958f', dotMid: '#6b6762', dotFaint: '#3a3835', dotActive: '#FF3B30', dotActiveDim: '#B8241A', accentAmber: '#D98A3D', gridPx: 4, cornerRadiusCard: 16 } as ThemeTokens
export const presets = { dot480, deerflowMosaic } as const
export type PresetName = keyof typeof presets
