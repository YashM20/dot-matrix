import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ControlPatch, ThemeTokens } from '../../engine'
import { DotCanvas } from '../../components/DotCanvas'
import { themeTokens } from '../../site/theme/theme'
import { useTheme } from '../../site/theme/useTheme'
import { withChrome, type WidgetPreset } from '../../widgets/types'

/** Minute counter on the wall clock (clock cards flip exactly on :00). */
function useMinuteTick(on: boolean): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!on) return
    let timer = 0
    const arm = () => { timer = window.setTimeout(() => { setTick(t => t + 1); arm() }, 60_000 - (Date.now() % 60_000)) }
    arm()
    return () => clearTimeout(timer)
  }, [on])
  return tick
}

/**
 * One real preset as a card, the way the app's boards render it (DotWidget without the preset
 * registry, so the essay only pulls in the boards it embeds): chrome, controls with local data,
 * optional board-shared keys, the minute tick for clock cards.
 * Theme as on the boards (DESIGN.md › Theme readers): the page's, or a dark inset on a light page
 * (`data-scheme="dark"` + the page's accent, dark tokens) for photos, the camera, or a figure that asks.
 */
export function Card({ preset, data, theme: themeProp, dark, shared, sharedKeys, onShared, onData, className }: {
  preset: WidgetPreset
  data?: ControlPatch
  /** Fixed tokens (a figure's own off-system theme); default: the site theme. */
  theme?: ThemeTokens
  /** Keep the card a dark inset on a light page (a scene that is dark by nature). */
  dark?: boolean
  shared?: ControlPatch
  sharedKeys?: readonly string[]
  onShared?: (patch: ControlPatch) => void
  /** Called with the card's merged data after each control edit (figures read the card's state). */
  onData?: (data: ControlPatch) => void
  className?: string
}) {
  const [local, setLocal] = useState<ControlPatch>({})
  const layers = useMemo(() => withChrome(preset), [preset])
  const tick = useMinuteTick(!!preset.clock)
  const merged = { ...preset.defaults, ...data, ...shared, ...local }
  const keys = sharedKeys?.join(',') ?? ''
  const onInput = useCallback((patch: ControlPatch) => {
    const mine: ControlPatch = {}, board: ControlPatch = {}, set = new Set(keys ? keys.split(',') : [])
    for (const k in patch) (set.has(k) && onShared ? board : mine)[k] = patch[k]
    if (Object.keys(mine).length) setLocal(prev => ({ ...prev, ...mine }))
    if (Object.keys(board).length) onShared!(board)
  }, [keys, onShared])
  useEffect(() => { onData?.(local) }, [local, onData])
  const interactive = !!preset.controls?.length
  // `cardScheme()` (src/site/theme/polarity.ts) for the essay's OLED-only cards, inlined: importing it here would
  // make it a module shared with the app's first load and split it into a chunk of its own (+0.16 kB gz)
  const site = useTheme(), inset = site.resolved === 'light' && (dark || preset.group === 'photo' || preset.media === 'camera')
  const scheme = inset ? 'dark' : site.resolved
  const theme = themeProp ?? themeTokens(scheme, site.accent)
  return (
    <div className={`dot-card${preset.bleed ? ' dot-card--bleed' : ''}${className ? ` ${className}` : ''}`} role={interactive ? 'group' : 'img'} aria-label={preset.name} data-card={preset.id}
      {...(inset ? { 'data-scheme': scheme, 'data-accent': site.accent } : {})}>
      <div className="dot-card-body">
        <DotCanvas layers={layers} data={merged} grid={preset.grid} style={preset.style} theme={theme} animated={preset.animated} tick={preset.clock ? tick : undefined} burst={preset.burst}
          springKeys={preset.springKeys} controls={interactive ? preset.controls : undefined} onInput={interactive ? onInput : undefined} />
      </div>
    </div>
  )
}
