/**
 * C10 command layer, mounted once by the App: global shortcuts (⌘K / Ctrl-K palette, ` dot shell,
 * X / ⇧X x-ray, hold T time machine, Space resume, ← → step, the Konami code), the palette, the
 * shell, the X-ray inspector, the time machine bar, a small dock with the same toggles, toasts, an
 * fps meter and the boss fight. Every shortcut ignores keys typed into inputs and editors.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getSkin, setSkin as setDisplaySkin } from '../skins/store'
import { findPreset } from '../../widgets/manifest'
import { DotWidget } from '../DotWidget'
import { TimeMachine } from '../xray/TimeMachine'
import { boardTime, freeze, hoveredCard, isXRay, onCardAction, resume, scrub, setXR, toast, toggleCard, toggleGlobal, useXR, xrState } from '../xray/store'
import { placeFromName, placeView, urlForView, type Place } from '../../site/views'
import { boardOfCard, type CommandApi } from './api'
import { setReducedMotion } from './reducedMotion'

// the panels load on first use: first-load JS stays inside the site budget
const Inspector = lazy(() => import('../xray/Inspector').then(m => ({ default: m.Inspector })))
const Palette = lazy(() => import('./Palette').then(m => ({ default: m.Palette })))
const Shell = lazy(() => import('./Shell').then(m => ({ default: m.Shell })))

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']
const editable = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
}

export interface CommandLayerProps {
  /** The place: EXPLORE, ABOUT, or a MAKE mode (TUNE, COMPOSE, CODE, DRAW); `setTab` takes any name, old tabs too. */
  tab: string
  board: string
  /** Absent in single-card mode: navigation then reloads into the requested view. */
  setTab?: (tab: string) => void
  setBoard?: (id: string) => void
}

function FpsHud() {
  const [fps, setFps] = useState(0)
  useEffect(() => {
    let n = 0, t0 = performance.now(), raf = 0
    const step = (now: number) => { n++; if (now - t0 >= 500) { setFps(Math.round((n * 1000) / (now - t0))); n = 0; t0 = now } raf = requestAnimationFrame(step) }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [])
  const frozen = useXR(s => s.frozen)
  return <div className="pal-fps" aria-hidden="true"><b>{fps}</b> FPS · T {boardTime().toFixed(1)}{frozen ? ' ■' : ''}</div>
}

export function CommandLayer({ tab, board, setTab, setBoard }: CommandLayerProps) {
  const [palette, setPalette] = useState(false), [shell, setShell] = useState(false), [boss, setBoss] = useState(false)
  const [hovered, setHovered] = useState<string | undefined>()
  const anyXray = useXR(s => s.global || s.on.size > 0), frozen = useXR(s => s.frozen), fpsHud = useXR(s => s.fpsHud), note = useXR(s => s.toast)
  const view = useRef({ tab, board }); view.current = { tab, board }

  // the layer itself mounts once the page is idle: warm the palette / shell chunks now, so a ⌘K followed by
  // quick typing finds the input already there instead of dropping the first keystrokes into the page
  useEffect(() => { void import('./Palette'); void import('./Shell') }, [])

  const go = useCallback((query: string) => { window.location.assign(`${location.pathname}${query}`) }, [])
  // a place's canonical URL on this board (src/site/views.ts): reloads in single-card mode, links, remix
  const urlOf = useCallback((p: Place, search = location.search) => urlForView({ ...placeView(p), board: view.current.board }, search, location.pathname), [])
  const api: CommandApi = useMemo(() => ({
    get tab() { return view.current.tab },
    get board() { return view.current.board },
    openTab(t) {
      const name = placeFromName(t) ? t : 'EXPLORE'
      if (!setTab) return window.location.assign(urlOf(placeFromName(name)!))
      setTab(name)
    },
    openBoard(id) {
      if (!setTab || !setBoard) return go(`?board=${id}`)
      setTab('EXPLORE'); setBoard(id)
    },
    async focusCard(cardId, opts) {
      const b = await boardOfCard(cardId)
      if (!b) return toast(`no card ${cardId}`)
      this.openBoard(b.id)
      // the old view exits before the new one mounts: wait for the card, then bring it to the eye
      const t0 = performance.now()
      const find = () => {
        const el = document.querySelector<HTMLElement>(`.board-view [data-card-id="${CSS.escape(cardId)}"]`)
        if (!el) { if (performance.now() - t0 < 3000) window.setTimeout(find, 80); return }
        el.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
        el.classList.add('xr-flash'); window.setTimeout(() => el.classList.remove('xr-flash'), 1400)
        if (opts?.xray && el.dataset.xrKey && !xrState().on.has(el.dataset.xrKey)) toggleCard(el.dataset.xrKey)
      }
      window.setTimeout(find, 60)
    },
    async remix(cardId, data) {
      const preset = await findPreset(cardId)
      if (!preset) return toast(`no card ${cardId}`)
      void import('../xray/remix').then(m => m.remixQuery(preset, data)).then(({ query, stub }) => {
        if (stub) toast(`${preset.name} is not Field IR yet: CODE opens a stub from describe()`)
        const q = new URLSearchParams(location.search); q.set('p', new URLSearchParams(query).get('p') ?? '')
        const url = urlOf('CODE', `?${q}`)
        if (!setTab || view.current.tab === 'CODE') return window.location.assign(url)
        history.pushState(null, '', url)
        setTab('CODE')
      }, e => toast(`remix failed: ${(e as Error).message}`))
    },
    async studio(cardId) {
      if (!(await findPreset(cardId))) return toast(`no card ${cardId}`)
      if (!setTab) return window.location.assign(urlOf('COMPOSE'))
      // lazy, like the mode itself: the editor only loads when asked for
      void Promise.all([import('../studio/store'), import('../studio/doc')]).then(([{ useStudio }, { importPreset }]) => {
        useStudio.getState().replace(importPreset(cardId), `imported ${cardId} from x-ray`)
        setTab('COMPOSE')
      }, e => toast(`studio failed: ${(e as Error).message}`))
    },
    copyLink(cardId) {
      const { tab: t, board: b } = view.current
      // a card alone, or this view's canonical link (a CODE program keeps its ?p=)
      const url = location.origin + (cardId ? `${location.pathname}?card=${cardId}` : urlForView({ ...placeView(placeFromName(t) ?? 'EXPLORE'), board: b }, location.search, location.pathname))
      const done = () => toast('link copied')
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(done, () => toast(url))
      else toast(url)
    },
    toggleXray(force) { toggleGlobal(force) },
    freeze() { freeze(); toast('time machine: drag the scrubber, ← → step, space resumes') },
    resume() { resume() },
    scrub(t) { scrub(t) },
    setRenderer(r) { setXR({ renderer: r }); toast(`renderer: ${r}`) },
    setWorker(on) {
      const q = new URLSearchParams(location.search)
      if (on) q.delete('worker'); else q.set('worker', '0')
      const s = q.toString(); go(s ? `?${s}` : '')
    },
    setReducedMotion(s) { setReducedMotion(s); toast(`reduced motion: ${s}`) },
    setSkin(name) {
      const want = name === 'none' ? 'oled' : name
      setXR({ skin: want })
      setDisplaySkin(want)
      toast(getSkin() === want ? `skin ${want}` : `unknown skin ${name}`)
    },
    toggleFps(force) { setXR(s => ({ fpsHud: force ?? !s.fpsHud })) },
    openShell() { setPalette(false); setShell(true) },
    boss() { setPalette(false); setShell(false); setBoss(true) },
  }), [setTab, setBoard, go, urlOf])

  // U2 card action strip (DotWidget): ⓘ opens this card's X-ray, REMIX goes to DOTS (IR card) or STUDIO, LINK, PNG
  useEffect(() => onCardAction((action, { key, preset, data, layers, grid, style, theme, animated }) => {
    if (action === 'how') {
      const s = xrState()
      return isXRay(s, key) && s.active === key ? toggleCard(key) : setXR({ on: s.global ? s.on : new Set(s.on).add(key), active: key })
    }
    if (action === 'link') return api.copyLink(preset.id)
    if (action === 'remix') return void import('../xray/remix').then(m => (m.cardIR(preset, data) ? api.remix(preset.id, data) : api.studio(preset.id)))
    void Promise.all([import('../../export/source'), import('../../export/still')]).then(([{ layerSource }, { stillPNG }]) => stillPNG(layerSource(layers, grid, style, theme, data), animated ? boardTime() : 0))
      .then(blob => {
        const a = document.createElement('a'), url = URL.createObjectURL(blob)
        a.href = url; a.download = `${preset.id}.png`; a.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
        toast(`${preset.id}.png saved`)
      }, e => toast(`png failed: ${(e as Error).message}`))
  }), [api])

  // a frozen clock would stall the next view's entrance: a view change resumes it
  const viewKey = `${tab}|${board}`, lastView = useRef(viewKey)
  useEffect(() => { if (lastView.current !== viewKey) { lastView.current = viewKey; resume() } }, [viewKey])

  // global keys
  useEffect(() => {
    let konami = 0, tHeld = false, tX: number | null = null, tBase = 0
    const onKey = (e: KeyboardEvent) => {
      const k = e.key
      konami = k.toLowerCase() === KONAMI[konami].toLowerCase() ? konami + 1 : k === KONAMI[0] ? 1 : 0
      if (konami === KONAMI.length) { konami = 0; api.boss(); return }
      if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === 'k') { e.preventDefault(); setShell(false); setPalette(p => !p); return }
      if (e.metaKey || e.ctrlKey || e.altKey || editable(e.target)) return
      const overlayOpen = document.querySelector('.pal-backdrop, .pal-shell, .pal-boss')
      if (k === '`' && !overlayOpen) { e.preventDefault(); setShell(true); return }
      if (overlayOpen) return
      if (k === 'x' || k === 'X') {
        e.preventDefault()
        const el = hoveredCard()
        if (e.shiftKey || !el) toggleGlobal(); else toggleCard(el.dataset.xrKey!)
        return
      }
      if ((k === 't' || k === 'T') && !e.repeat) { tHeld = true; tX = null; tBase = boardTime(); api.freeze(); return }
      if (!xrState().frozen) return
      if (k === ' ' && (e.target as HTMLElement)?.tagName !== 'BUTTON') { e.preventDefault(); resume(); return }
      if ((k === 'ArrowLeft' || k === 'ArrowRight') && (e.target as HTMLElement)?.getAttribute?.('type') !== 'range') {
        e.preventDefault()
        scrub(boardTime() + (k === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 1 / 12))
      }
    }
    const onUp = (e: KeyboardEvent) => { if (e.key === 't' || e.key === 'T') tHeld = false }
    // hold T and move the pointer: 100 px = 1 s of board time
    const onMove = (e: PointerEvent) => {
      if (!tHeld) return
      if (tX === null) { tX = e.clientX; tBase = boardTime(); return }
      scrub(tBase + (e.clientX - tX) / 100)
    }
    const onHover = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.<HTMLElement>('[data-card-id]')
      setHovered(prev => (el ? el.dataset.cardId : prev))
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onUp)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerover', onHover)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onUp); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerover', onHover) }
  }, [api])

  useEffect(() => {
    if (!boss) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setBoss(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [boss])

  return <>
    {anyXray && <Suspense fallback={null}><Inspector onRemix={(id, data) => api.remix(id, data)} onStudio={id => api.studio(id)} onCopyLink={id => api.copyLink(id)} /></Suspense>}
    <TimeMachine />
    <div className="pal-dock" role="toolbar" aria-label="Explore">
      <button aria-pressed={anyXray} onClick={() => toggleGlobal()} title="X-ray every card (X on a hovered card, ⇧X all)">X-RAY</button>
      <button aria-pressed={frozen} onClick={() => (frozen ? resume() : api.freeze())} title="Time machine (hold T, Space resumes)">TIME</button>
      <button onClick={() => setPalette(true)} title="Command palette (⌘K / Ctrl-K)" aria-label="Command palette">⌘K</button>
      <button onClick={() => setShell(true)} title="Dot shell (`)" aria-label="Dot shell">&gt;_</button>
    </div>
    {fpsHud && <FpsHud />}
    <div className="pal-toast" role="status" aria-live="polite">{note && <span key={note.id}>{note.text}</span>}</div>
    {palette && <Suspense fallback={null}><Palette api={api} hoveredCard={hovered} onClose={() => setPalette(false)} /></Suspense>}
    {shell && <Suspense fallback={null}><Shell api={api} onClose={() => setShell(false)} /></Suspense>}
    {boss && <div className="pal-boss" role="dialog" aria-modal="true" aria-label="Boss fight: Level 07, the queen" onMouseDown={e => { if (e.target === e.currentTarget) setBoss(false) }}>
      <div className="pal-boss-card">
        <p className="pal-boss-title">↑↑↓↓←→←→BA · LEVEL 07 · THE QUEEN</p>
        <DotWidget type="lv-queen" enter={{ delay: 0, mask: 'radial', duration: 900 }} />
        <button className="pal-boss-flee" autoFocus onClick={() => setBoss(false)}>FLEE <kbd>ESC</kbd></button>
      </div>
    </div>}
  </>
}
