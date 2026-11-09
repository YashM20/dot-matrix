import type { Control, ControlPatch, DotStyle, ThemeTokens } from '../engine'
import { needsHold } from '../engine/interaction'
import { describe } from '../engine/describe'
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { withChrome, type WidgetPreset } from '../widgets/types'
import { registeredPreset } from '../widgets/registry'
import { findPreset } from '../widgets/manifest'
import { cardFps, fpsTier } from '../widgets/fps'
import { DotCanvas, type DotCanvasProps } from './DotCanvas'
import { useCamera, withMedia } from '../media/useCamera'
import { HAND_KEY, useHandMode } from '../media/useHand'
import { useXRay } from './xray/useXRay'
import { cardAction, type CardAction } from './xray/store'
import { DotWidgetBar } from './DotWidgetBar'
import { useFlag } from '../site/useFlag'
import { useDisplaySkin } from './skins/store'
import { useTheme } from '../site/theme/useTheme'
import { themeTokens } from '../site/theme/theme'
import type { Scheme } from '../site/theme/names'
import { cardScheme } from '../site/theme/polarity'
// card touch policy: ./touch.css, pulled into each page's stylesheet by src/index.css and src/blog/blog.css (#198)

/** U2 header hint: what a visitor can do to the card, read off its controls (grey, never the accent). */
function hintVerb(p: WidgetPreset, cs: Control[]) {
  const has = (re: RegExp) => cs.some(c => re.test(c.key) || re.test(c.label))
  return p.media === 'camera' || has(/^(cam|hand)$|camera/i) ? 'CAMERA' : has(/scratch/i) ? 'SCRATCH' : has(/^hold/i) ? 'HOLD'
    : has(/^(mic|sound|audio)$/i) ? 'SOUND' : cs.some(c => /slider|knob|crank|xy/.test(c.kind)) || has(/^(grab|stir|throw|drag)/i) ? 'DRAG' : 'TAP'
}
/** The same hint on touch, where a drag that has to go up or down starts with a hold (a vertical swipe scrolls the page). */
const touchVerb = (verb: string, cs: Control[]) => (verb === 'DRAG' && cs.some(needsHold) ? 'HOLD · DRAG' : undefined)
// X-ray's overlay and its probe are a lazy chunk behind the `xray` flag (src/site/flags.ts), off first load; a build
// with VITE_FLAG_XRAY=kill leaves the chunk out (the test stays inline so the bundler sees a constant)
const XRayOverlay = import.meta.env.VITE_FLAG_XRAY === 'kill' ? null : lazy(() => import('./xray/XRayOverlay').then(m => ({ default: m.XRayOverlay })))

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
  /** The card's position on a board (see `DotCanvas.boardOrder`); unset off boards, so a single card never takes turns. */
  boardOrder?: number
  /**
   * Board-level shared data (`BoardDef.shared`): merged over the defaults and `data`; control edits to
   * `sharedKeys` go to `onShared` (the board store) instead of this card's own state.
   */
  shared?: ControlPatch
  sharedKeys?: string[]
  onShared?: (patch: ControlPatch) => void
}

/**
 * The card's preset. By id: a preset of a board loaded so far, else the boards are loaded (lazy chunks) and searched.
 * A hook so the React Compiler reads the result as fixed for the render (a plain lookup call could be mutated later,
 * which stops it compiling the card).
 */
function usePreset(type: string, presetProp: WidgetPreset | undefined): WidgetPreset | undefined {
  // not memoized: the registry fills as board chunks load, so the lookup must run on every render
  'use no memo'
  const [found, setFound] = useState<WidgetPreset>()
  useEffect(() => {
    if (presetProp || registeredPreset(type)) return
    let live = true
    findPreset(type).then(p => { if (live) setFound(p) }, () => {})
    return () => { live = false }
  }, [presetProp, type])
  return presetProp ?? registeredPreset(type) ?? found
}

/**
 * The card's accessible name: its name, then the words drawn on it (`describe().label`), so a screen reader hears
 * "Timer: 12:48" and not just "Timer". Worked out when the page is idle, off the first paint; until then (and for a card
 * that draws no words) it is the name. Described as a reduced-motion still, so a card with a live world never starts one.
 */
function useCardLabel(preset: WidgetPreset | undefined, data: Record<string, number>): string | undefined {
  const dataKey = JSON.stringify(data)
  const [said, setSaid] = useState<{ preset: WidgetPreset; label: string }>()
  useEffect(() => {
    if (!preset) return
    const run = () => setSaid({ preset, label: describe(preset, { data: JSON.parse(dataKey) as Record<string, number>, reducedMotion: true }).label })
    if (typeof requestIdleCallback === 'function') { const id = requestIdleCallback(run, { timeout: 2000 }); return () => cancelIdleCallback(id) }
    const id = window.setTimeout(run, 200)
    return () => window.clearTimeout(id)
  }, [preset, dataKey])
  return said && said.preset === preset ? said.label : undefined
}

interface LookOptions extends Pick<DotWidgetProps, 'density' | 'dotShape' | 'roundness' | 'size'> {
  /** The `theme` prop: when set, the card takes it as is (no inset). */
  theme?: ThemeTokens
  page: Scheme
  accent: Parameters<typeof themeTokens>[1]
  skin: Parameters<typeof cardScheme>[2]
  cameraLive: boolean
}
/** How a card draws at this size and theme: its scheme, tokens, grid and dot style, the controls that fit, its hint and fps. */
function cardLook(preset: WidgetPreset, o: LookOptions) {
  // the card's scheme: the page's, or a dark inset (a photo, the camera, an emissive skin) on a light page
  const scheme = cardScheme(preset, o.page, o.skin), inset = !o.theme && scheme !== o.page
  const theme = o.theme ?? themeTokens(scheme, o.accent)
  const native = preset.grid.pitch ?? theme.gridPx, pitch = o.density ?? native, k = pitch / native
  // radii are px tuned for the preset's own pitch — scale them with density so dots keep their proportion
  const style: DotStyle = { ...preset.style, sizeMin: preset.style.sizeMin * k, sizeMax: preset.style.sizeMax * k, shape: o.dotShape ?? preset.style.shape, cornerRoundness: o.roundness ?? preset.style.cornerRoundness }
  const grid = o.size ? { pitch, cols: Math.max(4, Math.round(o.size.w / pitch)), rows: Math.max(4, Math.round(o.size.h / pitch)) } : { ...preset.grid, pitch }
  // control boxes are in cell space, like the layers: a `size` override only re-grids the canvas, so they keep
  // working unscaled; boxes that fall outside the smaller grid are dropped
  const fit = preset.controls?.filter(({ box: [c, r, bw, bh] }) => c < grid.cols && r < grid.rows && c + bw > 0 && r + bh > 0)
  const controls = fit?.length ? fit : undefined
  const hint = controls ? hintVerb(preset, controls) : undefined
  // the live camera runs at 30; a card's own `fps` drops a tier on phones; no `fps` keeps DotCanvas's default
  const fps = o.cameraLive ? 30 : preset.fps !== undefined ? cardFps(preset.fps, fpsTier()) : undefined
  return { scheme, inset, theme, style, grid, controls, hint, touchHint: hint && controls && touchVerb(hint, controls), fps }
}

/**
 * The card's own data (P2): input patches merged over the preset's defaults, the `data` prop and the board's shared data.
 * An edit to a shared key goes to the board store (`onShared`), the rest stay on this card; an idle demo hands over on
 * the first edit (`WidgetPreset.handover`), which also sets its key to 0. `intercept`: the hand pointer's say first.
 */
function useCardData(preset: WidgetPreset | undefined, data: DotWidgetProps['data'], shared: ControlPatch | undefined, sharedKeys: string[] | undefined,
  onShared: DotWidgetProps['onShared'], intercept: (input: ControlPatch) => ControlPatch) {
  const [local, setLocal] = useState<ControlPatch>({})
  const merged = { ...preset?.defaults, ...data, ...shared, ...local }
  const sharedKey = sharedKeys?.join(',') ?? ''
  const handover = preset?.handover
  const onInput = useCallback((input: ControlPatch) => {
    let patch = intercept(input)
    if (handover && !(handover in patch)) patch = { ...patch, [handover]: 0 }
    const keys = sharedKey ? new Set(sharedKey.split(',')) : null, mine: ControlPatch = {}, board: ControlPatch = {}
    let ownEdit = false, boardEdit = false
    for (const k in patch) {
      if (keys?.has(k) && onShared) { board[k] = patch[k]; boardEdit = true }
      else { mine[k] = patch[k]; ownEdit = true }
    }
    if (ownEdit) setLocal(prev => ({ ...prev, ...mine }))
    if (boardEdit) onShared!(board)
  }, [sharedKey, onShared, intercept, handover])
  return { merged, onInput }
}

/** The card's name strip over the drawing (not on a dots-only card): its name, the hint verb, and the live dot. */
function CardHead({ preset, hint, touchHint }: { preset: WidgetPreset; hint?: string; touchHint?: string }) {
  return <header className="dot-card-head" aria-hidden="true">
    <span className="dot-card-label">{preset.name.toUpperCase()}{hint && <small className="dot-card-hint" data-touch={touchHint}>{hint}</small>}</span>
    {preset.live && <i className="status-dot" />}
  </header>
}

export function DotWidget({ type, density, dotShape, roundness, size, theme: themeProp, animated, data, tick, preset: presetProp, enter, exit, boardOrder, shared, sharedKeys, onShared }: DotWidgetProps) {
  const preset = usePreset(type, presetProp)
  const site = useTheme(), skin = useDisplaySkin()
  // touch engagement (a hold grabbed the card): the way out, shown as DONE in the bar
  const [letGo, setLetGo] = useState<(() => void) | null>(null)
  const onEngage = useCallback((exit: (() => void) | null) => setLetGo(() => exit), [])
  // HAND mode (C6): a card with a `hand` toggle drives the page-wide hand pointer
  const hand = useHandMode(!!preset?.controls?.some(c => c.key === HAND_KEY))
  const { merged, onInput } = useCardData(preset, data, shared, sharedKeys, onShared, hand.intercept)
  // live media (P4): a camera card's feed starts only once its own control turned `cam` on
  const camera = useCamera(preset?.media === 'camera', !!merged.cam, preset?.grid)
  const spoken = useCardLabel(preset, merged)
  const layers = useMemo(() => preset && (preset.media ? withMedia(withChrome(preset), camera.read) : withChrome(preset)), [preset, camera.read])
  // C10 X-ray slot: identity (same layers, no override) unless this card is X-rayed with a layer soloed / muted
  const xr = useXRay(layers), xray = useFlag('xray') && !!XRayOverlay, make = useFlag('make')
  if (!preset || !layers) return null
  const { scheme, inset, theme, style, grid, controls, hint, touchHint, fps } = cardLook(preset, { theme: themeProp, page: site.resolved, accent: site.accent, skin, density, dotShape, roundness, size, cameraLive: camera.status === 'live' })
  const interactive = !!controls, name = preset.liveData ? `${preset.name} (live)` : preset.name
  // a still card's picture carries the words on it; an interactive card has no picture role, so its group does
  const label = spoken ?? name
  const onAct = (a: CardAction) => cardAction(a, { key: xr.key, preset, data: merged, layers, grid, style, theme, animated: !!(animated ?? preset.animated) })
  return (
    // a group (it holds the action strip); a static card's body is one dot-matrix picture (role="img"), an
    // interactive card's body holds its accessibility overlay (real controls)
    <div className={`dot-card${preset.bleed ? ' dot-card--bleed' : ''}${letGo ? ' dot-card--engaged' : ''}`} role="group" data-xr-key={xr.key} data-card-id={preset.id} aria-label={interactive ? label : name}
      {...(inset ? { 'data-scheme': scheme, 'data-accent': site.accent } : {})}>
      {preset.chrome !== 'dots' && <CardHead preset={preset} hint={hint} touchHint={touchHint} />}
      {/* #181: one ⋯ in the card's top padding */}
      <DotWidgetBar name={preset.name} hint={preset.chrome === 'dots' ? hint : undefined} touchHint={touchHint} letGo={letGo} xrOn={xr.on} xray={xray} make={make} onAct={onAct} />
      <div className="dot-card-body" role={interactive ? undefined : 'img'} aria-label={interactive ? undefined : label}>
        <DotCanvas layers={xr.layers} renderer={xr.renderer} onMode={xr.onMode} data={preset.media ? { ...merged, ...camera.data, ...hand.data } : { ...merged, ...hand.data }} grid={grid} style={style} theme={theme} animated={animated ?? preset.animated} fps={fps} tick={tick} boardOrder={boardOrder} burst={preset.burst} enter={enter} exit={exit} springKeys={preset.springKeys}
          controls={controls} onInput={interactive ? onInput : undefined} onEngage={interactive ? onEngage : undefined} />
        {xr.on && xray && XRayOverlay && <Suspense fallback={null}><XRayOverlay xr={xr} preset={preset} layers={layers} data={preset.media ? { ...merged, ...camera.data } : merged} grid={grid} style={style} theme={theme}
          animated={!!(animated ?? preset.animated)} fps={fps} tick={tick} /></Suspense>}
      </div>
    </div>
  )
}
