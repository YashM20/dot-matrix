export type Field = (u: number, v: number) => number

export interface GridConfig { cols: number; rows: number; pitch?: number; aspect?: number }
export interface DotStyle {
  shape: 'circle' | 'square' | 'squircle' | 'superformula'
  sizeMin: number; sizeMax: number; sizeCurve?: (t: number) => number
  cornerRoundness?: number; opacityMode?: 'constant' | 'fromValue'; jitter?: number; quantizeSteps?: number
}
export interface ThemeTokens { bg: string; surface: string; surfaceRaised?: string; hairline?: string; dotIdle: string; dotMid?: string; dotFaint?: string; dotActive: string; dotActiveDim?: string; accentAmber?: string; gridPx: number; cornerRadiusCard: number }
export interface DotInstance { x: number; y: number; r: number; opacity: number; color: string; shape?: DotStyle['shape']; roundness?: number }
