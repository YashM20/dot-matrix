import { create } from 'zustand'
import type { DotStyle, Field, GridConfig } from '../../engine'
import { dot480 } from '../../engine'
import { widgetById, widgetPresets } from '../../widgets'

export type ThemeName = 'dot480' | 'deerflowMosaic'
export interface PlaygroundState {
  presetId: string
  pitch: number
  shape: DotStyle['shape']
  sizeMin: number
  sizeMax: number
  cornerRoundness: number
  jitter: number
  quantizeSteps: number
  theme: ThemeName
  animated: boolean
  photoField?: Field
  photoName?: string
  photoGrid?: GridConfig
  /** Per-preset editable numbers, seeded from each preset's `defaults`. */
  widgetData: Record<string, Record<string, number>>
  /** Select a preset and adopt its own style so the preview matches the board. */
  setPreset: (id: string) => void
  setPitch: (pitch: number) => void
  setShape: (shape: DotStyle['shape']) => void
  setSizeMin: (value: number) => void
  setSizeMax: (value: number) => void
  setCornerRoundness: (value: number) => void
  setJitter: (value: number) => void
  setQuantizeSteps: (value: number) => void
  setTheme: (theme: ThemeName) => void
  setAnimated: (animated: boolean) => void
  setPhoto: (field: Field | undefined, name?: string, grid?: GridConfig) => void
  setWidgetData: (presetId: string, key: string, value: number) => void
  resetStyle: () => void
}

const styleOf = (id: string) => {
  const p = widgetById(id) ?? widgetPresets[0]
  return { pitch: p.grid.pitch ?? dot480.gridPx, shape: p.style.shape, sizeMin: p.style.sizeMin, sizeMax: p.style.sizeMax, cornerRoundness: p.style.cornerRoundness ?? 0, jitter: p.style.jitter ?? 0, quantizeSteps: p.style.quantizeSteps ?? 0, animated: !!p.animated }
}
const first = widgetPresets[0].id

export const usePlayground = create<PlaygroundState>((set, get) => ({
  presetId: first,
  ...styleOf(first),
  theme: 'dot480',
  widgetData: {},
  setPreset: presetId => set({ presetId, ...styleOf(presetId) }),
  // dot radii are in px, so keep them proportional to the pitch they were tuned for
  setPitch: pitch => set(s => ({ pitch, sizeMin: s.sizeMin * pitch / s.pitch, sizeMax: s.sizeMax * pitch / s.pitch })),
  setShape: shape => set({ shape }),
  setSizeMin: sizeMin => set({ sizeMin }),
  setSizeMax: sizeMax => set({ sizeMax }),
  setCornerRoundness: cornerRoundness => set({ cornerRoundness }),
  setJitter: jitter => set({ jitter }),
  setQuantizeSteps: quantizeSteps => set({ quantizeSteps }),
  setTheme: theme => set({ theme }),
  setAnimated: animated => set({ animated }),
  setPhoto: (photoField, photoName, photoGrid) => set({ photoField, photoName, photoGrid }),
  setWidgetData: (presetId, key, value) => set(s => ({ widgetData: { ...s.widgetData, [presetId]: { ...(s.widgetData[presetId] ?? {}), [key]: value } } })),
  resetStyle: () => set(styleOf(get().presetId)),
}))
