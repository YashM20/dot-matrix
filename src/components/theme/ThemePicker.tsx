/**
 * The theme picker (docs/LAYOUT-THEME-PLAN.md §4 Picker), lazy: the header's THEME popover (`ThemePopover`) and the
 * phone TOOLS sheet's THEME section share `ThemeControls`:
 *  - scheme as a three-way segmented control (SYSTEM / LIGHT / DARK; a radio group, arrows pick);
 *  - the 7 accents as dot swatches, each a 7×7 dot disc in its own colour on the shown scheme (a horizontal
 *    listbox: arrows, Home and End move, Enter, Space or a click picks; the picked one has the halo ring);
 *  - an 8th, "custom" swatch (T6): it opens the hue slider, a range input over a track of 36 dots, each the
 *    generated accent of its hue on the shown scheme. The generator (`src/site/theme/custom.ts`) loads lazily on
 *    first use; any hue it gives passes the same contrast rules as the presets;
 *  - the share-link opt-in (`src/site/theme/share.ts`).
 * Live preview (popover): hovering or focusing a swatch or a scheme re-scopes the popover itself
 * (`data-scheme` + `data-accent` on its root), so its own controls, its tone ramp and its glass take that theme;
 * the page changes only on a pick. A pick goes through `switchTheme` (the radial halftone wipe from the pressed
 * control; instant under reduced motion). Colours come from the theme CSS: no colour table in JS.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type FocusEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { ACCENTS, type AccentChoice, type AccentId, type Scheme, type SchemePref } from '../../site/theme/names'
import { resolveScheme, setTheme } from '../../site/theme/theme'
import { useTheme } from '../../site/theme/useTheme'
import { switchTheme } from '../../site/theme/moment'
import { setShareTheme, shareTheme, subscribeShareTheme } from '../../site/theme/share'
import './picker.css'

const SCHEME_PREFS: readonly SchemePref[] = ['system', 'light', 'dark']
/** What each accent is, in a few words (DESIGN.md › Theme). */
const ACCENT_LINES: Record<AccentId, string> = {
  signal: 'red, the default', amber: 'warm VFD amber', phosphor: 'green CRT phosphor', cyan: 'VFD cyan', cobalt: 'cobalt blue', vite: "vite.dev's purple", magenta: 'magenta pink',
}
// the swatch glyph: a 7×7 dot disc ('1' = a dot)
const DISC = [...'0011100 0111110 1111111 1111111 1111111 0111110 0011100'.replace(/\s/g, '')]
// the custom swatch before any hue is set: the disc's rim only
const RING = [...'0011100 0100010 1000001 1000001 1000001 0100010 0011100'.replace(/\s/g, '')]
const prefersLight = () => matchMedia('(prefers-color-scheme: light)').matches
const isMouse = (e: ReactPointerEvent) => e.pointerType === 'mouse'
type CustomMod = typeof import('../../site/theme/custom')
let customMod: Promise<CustomMod> | undefined
const loadCustom = () => (customMod ??= import('../../site/theme/custom'))

export interface ThemePreview { scheme?: Scheme; accent?: AccentChoice }

function Swatch({ ring = false }: { ring?: boolean }) {
  return <svg className={`theme-disc${ring ? ' theme-disc--ring' : ''}`} viewBox="0 0 7 7" aria-hidden="true">
    {(ring ? RING : DISC).map((c, i) => c === '1' && <circle key={i} cx={(i % 7) + .5} cy={Math.floor(i / 7) + .5} r={.36} />)}
  </svg>
}

/**
 * The custom hue slider: a native range (keyboard, touch and screen readers for free) over a row of dots, each the
 * generated accent of its hue on the shown scheme. Dragging applies the hue at once (no wipe: it is a continuous
 * control); every value is a legal theme.
 */
function HueSlider({ scheme, mod }: { scheme: Scheme; mod: CustomMod }) {
  const t = useTheme(), hue = t.custom?.hue ?? 0, track = mod.trackOf(scheme)
  const frame = useRef(0), want = useRef(hue)
  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  const pick = (v: number) => {
    want.current = v
    if (frame.current) return
    frame.current = requestAnimationFrame(() => { frame.current = 0; setTheme({ accent: 'custom', custom: mod.customHue(want.current) }) })
  }
  return <div className="theme-hue">
    <svg className="theme-hue-track" viewBox={`0 0 ${track.length} 1`} preserveAspectRatio="none" aria-hidden="true">
      {track.map((c, i) => <circle key={i} cx={i + .5} cy={.5} r={.3} style={{ fill: c }} />)}
    </svg>
    <input type="range" min={0} max={359} step={1} value={hue} aria-label="Custom hue" aria-valuetext={`${hue} degrees`}
      onChange={e => pick(+e.currentTarget.value)} />
  </div>
}

/** The shown theme's dot tones, faint to the accent: what a card on it is drawn with. */
function ToneRamp() {
  return <svg className="theme-ramp" viewBox="0 0 5 1" aria-hidden="true">
    {['faint', 'mid', 'idle', 'value', 'red'].map((t, i) => <circle key={t} className={`t-${t}`} cx={i + .5} cy={.5} r={.32} />)}
  </svg>
}

export function ThemeControls({ shown, onPreview, focus = false }: { shown?: { scheme: Scheme; accent: AccentChoice }; onPreview?: (p: ThemePreview) => void; focus?: boolean }) {
  const t = useTheme(), share = useSyncExternalStore(subscribeShareTheme, shareTheme, () => false)
  const view = shown ?? { scheme: t.resolved, accent: t.accent }
  const seg = useRef<HTMLDivElement>(null)
  // the custom hue: the generator loads on first use (hover warms it), the slider shows while custom is picked
  const [mod, setMod] = useState<CustomMod>()
  const [hueOpen, setHueOpen] = useState(false)
  useEffect(() => { if (t.accent === 'custom') void loadCustom().then(setMod) }, [t.accent])
  // opened by a click or the keyboard: focus lands on the current scheme
  useEffect(() => { if (focus) seg.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus() }, [focus])
  const preview = (p: ThemePreview) => onPreview?.(p)
  const pickScheme = (s: SchemePref, el: Element) => { preview({}); switchTheme({ scheme: s }, el) }
  const pickAccent = (a: AccentId, el: Element) => { preview({}); setHueOpen(false); switchTheme({ accent: a }, el) }
  // custom: the stored hue, or (first time) the hue of the accent in use, so the slider starts where the visitor is
  const pickCustom = (el: Element) => {
    preview({}); setHueOpen(true)
    void loadCustom().then(m => {
      setMod(m)
      const custom = t.custom ?? m.customHue(t.accent === 'custom' ? 0 : m.ACCENT_SPECS[t.accent].hue)
      switchTheme({ accent: 'custom', custom }, el)
    })
  }

  const onSegKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const n = SCHEME_PREFS.length, j = (SCHEME_PREFS.indexOf(t.scheme) + d + n) % n
    const el = e.currentTarget.querySelectorAll<HTMLElement>('[role=radio]')[j]
    el?.focus(); if (el) pickScheme(SCHEME_PREFS[j], el)
  }
  const onSwatchKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const all = [...e.currentTarget.querySelectorAll<HTMLElement>('[role=option]')], i = all.indexOf(document.activeElement as HTMLElement), n = all.length
    const j = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % n : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i + n - 1) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1
    if (j < 0) return
    e.preventDefault(); all[j]?.focus()
  }
  // focus leaving a row ends its preview
  const leaveRow = (e: FocusEvent<HTMLDivElement>) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) preview({}) }
  const previewing = view.scheme !== t.resolved || view.accent !== t.accent
  const line = view.accent === 'custom' ? (t.custom ? `custom hue, ${t.custom.hue}°` : 'any hue, kept legible') : ACCENT_LINES[view.accent]

  return <div className="theme-ctl">
    <div className="theme-head">
      <b>{view.scheme.toUpperCase()} · {view.accent.toUpperCase()}</b>
      <span>{previewing ? 'PREVIEW' : t.scheme === 'system' ? 'FOLLOWS THE SYSTEM' : ''}</span>
      <ToneRamp />
    </div>
    <div ref={seg} className="theme-seg" role="radiogroup" aria-label="Scheme" onKeyDown={onSegKey} onBlur={leaveRow} onPointerLeave={e => { if (isMouse(e)) preview({}) }}>
      {SCHEME_PREFS.map(s => <button key={s} type="button" role="radio" aria-checked={t.scheme === s} tabIndex={t.scheme === s ? 0 : -1}
        onPointerEnter={e => { if (isMouse(e)) preview({ scheme: resolveScheme(s, prefersLight()) }) }}
        onClick={e => pickScheme(s, e.currentTarget)}>{s.toUpperCase()}</button>)}
    </div>
    <div className="theme-swatches" role="listbox" aria-label="Accent" aria-orientation="horizontal" onKeyDown={onSwatchKey} onBlur={leaveRow} onPointerLeave={e => { if (isMouse(e)) preview({}) }}>
      {ACCENTS.map(a => <button key={a} type="button" role="option" aria-selected={t.accent === a} tabIndex={t.accent === a ? 0 : -1}
        aria-label={`${a}: ${ACCENT_LINES[a]}`} data-scheme={view.scheme} data-accent={a}
        onPointerEnter={e => { if (isMouse(e)) preview({ accent: a }) }} onFocus={() => preview({ accent: a })}
        onClick={e => pickAccent(a, e.currentTarget)}><Swatch /></button>)}
      <button type="button" role="option" aria-selected={t.accent === 'custom'} tabIndex={t.accent === 'custom' ? 0 : -1}
        aria-label={`custom: ${t.custom ? `hue ${t.custom.hue}` : 'any hue'}`} aria-expanded={hueOpen || t.accent === 'custom'} className="theme-custom"
        {...(t.custom ? { 'data-scheme': view.scheme, 'data-accent': 'custom' } : {})}
        onPointerEnter={e => { void loadCustom(); if (isMouse(e) && t.custom) preview({ accent: 'custom' }) }} onFocus={() => { if (t.custom) preview({ accent: 'custom' }) }}
        onClick={e => pickCustom(e.currentTarget)}><Swatch ring={!t.custom} /></button>
    </div>
    {mod && (hueOpen || t.accent === 'custom') && <HueSlider scheme={view.scheme} mod={mod} />}
    <p className="theme-line">{line}</p>
    <button type="button" className="theme-share" role="switch" aria-checked={share} onClick={() => setShareTheme(!share)}>
      <span>Shared links keep my theme</span><b>{share ? 'ON' : 'OFF'}</b>
    </button>
  </div>
}

/** The header popover: the controls in a raised layer that takes the previewed theme. */
export function ThemePopover({ id, focus }: { id: string; focus: boolean }) {
  const t = useTheme()
  const [p, setP] = useState<ThemePreview>({})
  const shown = { scheme: p.scheme ?? t.resolved, accent: p.accent ?? t.accent }
  return <div id={id} className="theme-pop" role="dialog" aria-label="Theme" data-scheme={shown.scheme} data-accent={shown.accent}>
    <ThemeControls shown={shown} onPreview={setP} focus={focus} />
  </div>
}
