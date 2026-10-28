import type { Control, ControlPatch, DotStyle, ThemeTokens } from '../engine'
import { needsHold } from '../engine/interaction'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { withChrome, type WidgetPreset } from '../widgets/types'
import { registeredPreset } from '../widgets/registry'
import { findPreset } from '../widgets/manifest'
import { cardFps, fpsTier } from '../widgets/fps'
import { DotCanvas, type DotCanvasProps } from './DotCanvas'
import { useCamera, withMedia } from '../media/useCamera'
import { HAND_KEY, useHandMode } from '../media/useHand'
import { useXRay } from './xray/useXRay'
import { XRayOverlay } from './xray/XRayOverlay'
import { cardAction, type CardAction } from './xray/store'
import { useDisplaySkin } from './skins/store'
import { useTheme } from '../site/theme/useTheme'
import { themeTokens } from '../site/theme/theme'
import { cardScheme } from '../site/theme/polarity'
import './touch.css'

/** U2 header hint: what a visitor can do to the card, read off its controls (grey, never the accent). */
function hintVerb(p: WidgetPreset, cs: Control[]) {
  const has = (re: RegExp) => cs.some(c => re.test(c.key) || re.test(c.label))
  return p.media === 'camera' || has(/^(cam|hand)$|camera/i) ? 'CAMERA' : has(/scratch/i) ? 'SCRATCH' : has(/^hold/i) ? 'HOLD'
    : has(/^(mic|sound|audio)$/i) ? 'SOUND' : cs.some(c => /slider|knob|crank|xy/.test(c.kind)) || has(/^(grab|stir|throw|drag)/i) ? 'DRAG' : 'TAP'
}
/** The same hint on touch, where a drag that has to go up or down starts with a hold (a vertical swipe scrolls the page). */
const touchVerb = (verb: string, cs: Control[]) => (verb === 'DRAG' && cs.some(needsHold) ? 'HOLD · DRAG' : undefined)
const ACTS: [CardAction, string, string][] = [['how', 'ⓘ', 'How it works'], ['remix', 'REMIX', 'Remix this card'], ['link', 'LINK', 'Copy a link to this card'], ['png', 'PNG', 'Download as PNG']]

export interface DotWidgetProps {
  /** Preset id from `widgetPresets` (ignored when `preset` is given). */
  type: string
  /** Dot pitch in px — the one responsive lever (DESIGN.md › Density Scaling). */
  density?: number
  dotShape?: DotStyle['shape']
  roundness?: number
  /** Override the preset's own grid, in px; cols/rows are derived from density. */
  size?: { w: number; h: number }
  /** Engine tokens. Default: the site theme (src/site/theme), with photo / camera / emissive-skin cards pinned dark on a light page. */
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

export function DotWidget({ type, density, dotShape, roundness, size, theme: themeProp, animated, data, tick, preset: presetProp, enter, exit, shared, sharedKeys, onShared }: DotWidgetProps) {
  // by id: a preset of a board loaded so far, else the boards are loaded (lazy chunks) and searched
  const [found, setFound] = useState<WidgetPreset>()
  const site = useTheme(), skin = useDisplaySkin()
  const preset = presetProp ?? registeredPreset(type) ?? found
  useEffect(() => {
    if (presetProp || registeredPreset(type)) return
    let live = true
    findPreset(type).then(p => { if (live) setFound(p) }, () => {})
    return () => { live = false }
  }, [presetProp, type])
  // interactive data (P2): input patches merged over the defaults and the `data` prop
  const [local, setLocal] = useState<ControlPatch>({})
  const [menu, setMenu] = useState(false)
  // touch engagement (a hold grabbed the card): the way out, shown as DONE in the bar
  const [letGo, setLetGo] = useState<(() => void) | null>(null)
  const onEngage = useCallback((exit: (() => void) | null) => setLetGo(() => exit), [])
  // the ⋯ strip closes on a tap anywhere else or on Escape, like a native menu
  const bar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const away = (e: PointerEvent) => { if (!bar.current?.contains(e.target as Node)) setMenu(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false) }
    document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', key) }
  }, [menu])
  // live media (P4): a camera card's feed starts only once its own control turned `cam` on
  const merged = { ...preset?.defaults, ...data, ...shared, ...local }
  const camera = useCamera(preset?.media === 'camera', !!merged.cam, preset?.grid)
  // HAND mode (C6): a card with a `hand` toggle drives the page-wide hand pointer
  const hand = useHandMode(!!preset?.controls?.some(c => c.key === HAND_KEY)), { intercept } = hand
  const layers = useMemo(() => preset && (preset.media ? withMedia(withChrome(preset), camera.read) : withChrome(preset)), [preset, camera.read])
  // C10 X-ray slot: identity (same layers, no override) unless this card is X-rayed with a layer soloed / muted
  const xr = useXRay(layers)
  const sharedKey = sharedKeys?.join(',') ?? ''
  const onInput = useCallback((input: ControlPatch) => {
    const patch = intercept(input)
    // split the patch: shared keys go to the board store, the rest stay on this card
    const keys = sharedKey ? new Set(sharedKey.split(',')) : null, mine: ControlPatch = {}, board: ControlPatch = {}
    let ownEdit = false, boardEdit = false
    for (const k in patch) {
      if (keys?.has(k) && onShared) { board[k] = patch[k]; boardEdit = true }
      else { mine[k] = patch[k]; ownEdit = true }
    }
    if (ownEdit) setLocal(prev => ({ ...prev, ...mine }))
    if (boardEdit) onShared!(board)
  }, [sharedKey, onShared, intercept])
  if (!preset || !layers) return null
  // the card's scheme: the page's, or a dark inset (a photo, the camera, an emissive skin) on a light page
  const scheme = cardScheme(preset, site.resolved, skin), inset = !themeProp && scheme !== site.resolved
  const theme = themeProp ?? themeTokens(scheme, site.accent)
  const native = preset.grid.pitch ?? theme.gridPx, pitch = density ?? native, k = pitch / native
  // radii are px tuned for the preset's own pitch — scale them with density so dots keep their proportion
  const style: DotStyle = { ...preset.style, sizeMin: preset.style.sizeMin * k, sizeMax: preset.style.sizeMax * k, shape: dotShape ?? preset.style.shape, cornerRoundness: roundness ?? preset.style.cornerRoundness }
  const grid = size ? { pitch, cols: Math.max(4, Math.round(size.w / pitch)), rows: Math.max(4, Math.round(size.h / pitch)) } : { ...preset.grid, pitch }
  // control boxes are in cell space, like the layers: a `size` override only re-grids the canvas, so they keep
  // working unscaled; boxes that fall outside the smaller grid are dropped
  const controls = preset.controls?.filter(({ box: [c, r, bw, bh] }) => c < grid.cols && r < grid.rows && c + bw > 0 && r + bh > 0)
  const interactive = !!controls?.length
  const hint = interactive ? hintVerb(preset, controls!) : undefined, touchHint = hint && touchVerb(hint, controls!), name = preset.live ? `${preset.name} (live)` : preset.name
  // the live camera runs at 30; a card's own `fps` drops a tier on phones; no `fps` keeps DotCanvas's default
  const fps = camera.status === 'live' ? 30 : preset.fps !== undefined ? cardFps(preset.fps, fpsTier()) : undefined
  const act = (a: CardAction) => () => { setMenu(false); cardAction(a, { key: xr.key, preset, data: merged, layers, grid, style, theme, animated: !!(animated ?? preset.animated) }) }
  return (
    // a group (it holds the action strip); a static card's body is one dot-matrix picture (role="img"), an
    // interactive card's body holds its accessibility overlay (real controls)
    <div className={`dot-card${preset.bleed ? ' dot-card--bleed' : ''}${letGo ? ' dot-card--engaged' : ''}`} role="group" data-xr-key={xr.key} data-card-id={preset.id} aria-label={name}
      {...(inset ? { 'data-scheme': scheme, 'data-accent': site.accent } : {})}>
      {preset.chrome !== 'dots' && <header className="dot-card-head" aria-hidden="true">
        <span className="dot-card-label">{preset.name.toUpperCase()}{hint && <small className="dot-card-hint" data-touch={touchHint}>{hint}</small>}</span>
        {preset.live && <i className="status-dot" />}
      </header>}
      <div ref={bar} className={`dot-card-bar${menu ? ' open' : ''}`}>
        {hint && preset.chrome === 'dots' && <small className="dot-card-hint" data-touch={touchHint} aria-hidden="true">{hint}</small>}
        {letGo && <button type="button" className="dot-card-done" aria-label={`${preset.name}: let go of the card`} onClick={letGo}>DONE</button>}
        <span className="dot-card-acts">{ACTS.map(([a, label, title]) => <button key={a} type="button" aria-label={title} title={title} aria-pressed={a === 'how' ? xr.on : undefined} onClick={act(a)}>{label}</button>)}</span>
        <button type="button" className="dot-card-more" aria-label={`${preset.name}: card actions`} aria-expanded={menu} onClick={() => setMenu(m => !m)}>⋯</button>
      </div>
      <div className="dot-card-body" role={interactive ? undefined : 'img'} aria-label={interactive ? undefined : name}>
        <DotCanvas layers={xr.layers} renderer={xr.renderer} onMode={xr.onMode} data={preset.media ? { ...merged, ...camera.data, ...hand.data } : { ...merged, ...hand.data }} grid={grid} style={style} theme={theme} animated={animated ?? preset.animated} fps={fps} tick={tick} burst={preset.burst} enter={enter} exit={exit} springKeys={preset.springKeys}
          controls={interactive ? controls : undefined} onInput={interactive ? onInput : undefined} onEngage={interactive ? onEngage : undefined} />
        {xr.on && <XRayOverlay xr={xr} preset={preset} layers={layers} data={preset.media ? { ...merged, ...camera.data } : merged} grid={grid} style={style} theme={theme}
          animated={!!(animated ?? preset.animated)} fps={fps} tick={tick} />}
      </div>
    </div>
  )
}
