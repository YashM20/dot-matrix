import { create } from 'zustand'
import type { DotStyle, Field } from '../../engine'
import { dot480 } from '../../engine'

export interface PlaygroundState {
  presetId: string
  pitch: number
  shape: DotStyle['shape']
  sizeMin: number
  sizeMax: number
  cornerRoundness: number
  jitter: number
  quantizeSteps: number
  theme: 'dot480' | 'deerflowMosaic'
  animated: boolean
  photoField?: Field
  photoName?: string
  widgetData: Record<string, Record<string, number>>
  setPreset: (id: string) => void
  setPitch: (pitch: number) => void
  setShape: (shape: DotStyle['shape']) => void
  setSizeMin: (value: number) => void
  setSizeMax: (value: number) => void
  setCornerRoundness: (value: number) => void
  setJitter: (value: number) => void
  setQuantizeSteps: (value: number) => void
  setTheme: (theme: 'dot480' | 'deerflowMosaic') => void
  setAnimated: (animated: boolean) => void
  setPhoto: (field: Field | undefined, name?: string) => void
  setWidgetData: (presetId: string, key: string, value: number) => void
}

export const usePlayground = create<PlaygroundState>(set => ({
  presetId: 'clock',
  pitch: dot480.gridPx,
  shape: 'squircle',
  sizeMin: .3,
  sizeMax: 1.6,
  cornerRoundness: .72,
  jitter: 0,
  quantizeSteps: 5,
  theme: 'dot480',
  animated: false,
  widgetData: {
    'fitness-rings': { move: 1.21, exercise: 1.62, stand: 2 },
    'retail-analytics': { sales: 0.58 },
  },
  setPreset: presetId => set({ presetId }),
  setPitch: pitch => set({ pitch }),
  setShape: shape => set({ shape }),
  setSizeMin: sizeMin => set({ sizeMin }),
  setSizeMax: sizeMax => set({ sizeMax }),
  setCornerRoundness: cornerRoundness => set({ cornerRoundness }),
  setJitter: jitter => set({ jitter }),
  setQuantizeSteps: quantizeSteps => set({ quantizeSteps }),
  setTheme: theme => set({ theme }),
  setAnimated: animated => set({ animated }),
  setPhoto: (photoField, photoName) => set({ photoField, photoName }),
  setWidgetData: (presetId, key, value) => set(s => ({ widgetData: { ...s.widgetData, [presetId]: { ...(s.widgetData[presetId] ?? {}), [key]: value } } })),
}))
