import type { ControlPatch, DotStyle, ThemeTokens } from '../engine'
import { dot480 } from '../engine'
import { useCallback, useMemo, useState } from 'react'
import type { WidgetPreset } from '../widgets'
import { widgetById, withChrome } from '../widgets'
import { DotCanvas, type DotCanvasProps } from './DotCanvas'
import { useCamera, withMedia } from '../media/useCamera'
import { useXRay } from './xray/useXRay'
import { XRayOverlay } from './xray/XRayOverlay'

export interface DotWidgetProps {
  /** Preset id from `widgetPresets` (ignored when `preset` is given). */
  type: string
  /** Dot pitch in px — the one responsive lever (DESIGN.md › Density Scaling). */
  density?: number
  dotShape?: DotStyle['shape']
  roundness?: number
  /** Override the preset's own grid, in px; cols/rows are derived from density. */
  size?: { w: number; h: number }
  theme?: ThemeTokens
  /** Run the preset's clock. Defaults to the preset's `animated` flag. */
  animated?: boolean
  data?: Record<string, number>
  tick?: number
  preset?: WidgetPreset
  /** Staggered entrance (see `DotCanvas.enter`). */
  enter?: DotCanvasProps['enter']
  /** Exit (see `DotCanvas.exit`). */
  exit?: DotCanvasProps['exit']
  /**
   * Board-level shared data (`BoardDef.shared`): merged over the defaults and `data`; control edits to
   * `sharedKeys` go to `onShared` (the board store) instead of this card's own state.
   */
  shared?: ControlPatch
  sharedKeys?: string[]
  onShared?: (patch: ControlPatch) => void
}

export function DotWidget({ type, density, dotShape, roundness, size, theme = dot480, animated, data, tick, preset: presetProp, enter, exit, shared, sharedKeys, onShared }: DotWidgetProps) {
  const preset = presetProp ?? widgetById(type)
  // interactive data (P2): input patches merged over the defaults and the `data` prop
  const [local, setLocal] = useState<ControlPatch>({})
  // live media (P4): a camera card's feed starts only once its own control turned `cam` on
  const merged = { ...preset?.defaults, ...data, ...shared, ...local }
  const camera = useCamera(preset?.media === 'camera', !!merged.cam, preset?.grid)
  const layers = useMemo(() => preset && (preset.media ? withMedia(withChrome(preset), camera.read) : withChrome(preset)), [preset, camera.read])
  // C10 X-ray slot: identity (same layers, no override) unless this card is X-rayed with a layer soloed / muted
  const xr = useXRay(layers)
  const sharedKey = sharedKeys?.join(',') ?? ''
  const onInput = useCallback((patch: ControlPatch) => {
    // split the patch: shared keys go to the board store, the rest stay on this card
    const keys = sharedKey ? new Set(sharedKey.split(',')) : null, mine: ControlPatch = {}, board: ControlPatch = {}
    let ownEdit = false, boardEdit = false
    for (const k in patch) {
      if (keys?.has(k) && onShared) { board[k] = patch[k]; boardEdit = true }
      else { mine[k] = patch[k]; ownEdit = true }
    }
    if (ownEdit) setLocal(prev => ({ ...prev, ...mine }))
    if (boardEdit) onShared!(board)
  }, [sharedKey, onShared])
  if (!preset || !layers) return null
  const native = preset.grid.pitch ?? theme.gridPx, pitch = density ?? native, k = pitch / native
  // radii are px tuned for the preset's own pitch — scale them with density so dots keep their proportion
  const style: DotStyle = { ...preset.style, sizeMin: preset.style.sizeMin * k, sizeMax: preset.style.sizeMax * k, shape: dotShape ?? preset.style.shape, cornerRoundness: roundness ?? preset.style.cornerRoundness }
  const grid = size ? { pitch, cols: Math.max(4, Math.round(size.w / pitch)), rows: Math.max(4, Math.round(size.h / pitch)) } : { ...preset.grid, pitch }
  // control boxes are in cell space, like the layers: a `size` override only re-grids the canvas, so they keep
  // working unscaled; boxes that fall outside the smaller grid are dropped
  const controls = preset.controls?.filter(({ box: [c, r, bw, bh] }) => c < grid.cols && r < grid.rows && c + bw > 0 && r + bh > 0)
  const interactive = !!controls?.length
  return (
    // role="img": the card is one dot-matrix picture; its children (label text, canvas) are presentational.
    // An interactive card is a group instead, so its accessibility overlay (real controls) stays reachable.
    <div className={`dot-card${preset.bleed ? ' dot-card--bleed' : ''}`} role={interactive ? 'group' : 'img'} data-xr-key={xr.key} data-card-id={preset.id} aria-label={preset.live ? `${preset.name} (live)` : preset.name}>
      {preset.chrome !== 'dots' && <header className="dot-card-head" aria-hidden="true">
        <span className="dot-card-label">{preset.name.toUpperCase()}</span>
        {preset.live && <i className="status-dot" />}
      </header>}
      <div className="dot-card-body">
        <DotCanvas layers={xr.layers} renderer={xr.renderer} onMode={xr.onMode} data={preset.media ? { ...merged, ...camera.data } : merged} grid={grid} style={style} theme={theme} animated={animated ?? preset.animated} fps={camera.status === 'live' ? 30 : undefined} tick={tick} burst={preset.burst} enter={enter} exit={exit} springKeys={preset.springKeys}
          controls={interactive ? controls : undefined} onInput={interactive ? onInput : undefined} />
        {xr.on && <XRayOverlay xr={xr} preset={preset} layers={layers} data={preset.media ? { ...merged, ...camera.data } : merged} grid={grid} style={style} theme={theme}
          animated={!!(animated ?? preset.animated)} fps={camera.status === 'live' ? 30 : undefined} tick={tick} />}
      </div>
    </div>
  )
}
