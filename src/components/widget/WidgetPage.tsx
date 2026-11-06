/**
 * The single-widget page (docs/SHARE-PLAN.md §4): `/widget/<slug>/`, `/widget/<uid>/`, `/<uid>` and the old
 * `?card=` all land here (src/site/routes.ts). Lazy: the catalog, the metadata and the export helpers load with
 * it, never in the first load; the page loads only its own board, and the export code on the first export (#214). On a desktop the page is an app that fits the screen (#183): a top bar (back to the
 * board, previous / next), the card on a stage that scales to fit, and a side panel with the name, the blurb, the
 * grouped actions (export, share and remix, MORE), the like button and the facts; the panel scrolls on its own.
 * Phones stack it. X-RAY shows only while its flag is on. A missing widget is noindex.
 */
import { useEffect, useEffectEvent, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { DotName } from '../DotName'
import { dot480 } from '../../engine/theme/tokens'
import { boardIds, boardLabel, loadBoard, resolveCardId, type BoardId } from '../../widgets/manifest'
import { catalog } from '../../widgets/catalog'
import { deriveWidgetMeta, type WidgetMeta } from '../../widgets/meta'
import { creditsOf, withChrome, type WidgetPreset } from '../../widgets/types'
import { canonicalWidgetUrl, resolveWidget, shortPath, widgetPath, type ResolvedWidget, type WidgetRoute } from '../../site/routes'
import { setNoIndex, setPageMeta, widgetPageMeta, widgetTitle } from '../../site/meta'
import { replaceUrl } from '../../site/safe-url'
import { useFlag } from '../../site/useFlag'
import { canShare, copyPNG, copySVG, copyText, download, shareCard, type Outcome } from '../../export/clipboard'
import { boardTime, cardAction, toast, useXR } from '../xray/store'
import { getSkin } from '../skins/store'
import { getTheme, themeTokens } from '../../site/theme/theme'
import { withTheme } from '../../site/theme/share'
import { withPondDay } from '../../site/pondMemory'
import type { Source } from '../../data/source'
import { pick, useLiveData } from '../../data/useLiveData'
import { cardScheme } from '../../site/theme/polarity'
import { DotWidget } from '../DotWidget'
import { ConceptCredit } from '../ConceptCredit'
import { useBlurbs } from '../useBlurbs'
import { LoadFailed } from '../LoadBoundary'
import { Pill, PillBar, PillButton } from './PillBar'
import { MoreMenu } from './MoreMenu'
import { WidgetLike } from '../likes/slot'
import './WidgetPage.css'
import { flag } from '../../site/flags'

export interface WidgetPageProps {
  route: WidgetRoute
  /** Open another widget (previous / next): pushes `/widget/<slug>/`. */
  onOpen: (slug: string) => void
  /** Back to a board, scrolled to `slug`. */
  onBoard: (board: string, slug?: string) => void
}

type Loaded = { w: ResolvedWidget; preset: WidgetPreset; items: WidgetPreset[]; meta: WidgetMeta; sources?: readonly Source[] }
/** Board sources a widget page subscribes to as well (X1): the pond's day (`?day=`, the opt-in age) and the light hub. */
const PAGE_SOURCES = new Set(['pond-day', 'light'])
type State = { status: 'loading' } | { status: 'missing' } | { status: 'failed' } | ({ status: 'ok' } & Loaded)

/** The export code (PNG, SVG, HTML), loaded on the first export. */
const exporter = () => import('./cardExport')

const said: Record<Outcome, string> = { copied: 'copied', downloaded: 'saved (copy isn’t available here)', shared: 'shared', cancelled: '', failed: 'failed' }

export function WidgetPage({ route, onOpen, onBoard }: WidgetPageProps) {
  const { key, scope } = route
  const w = useMemo(() => resolveWidget({ key, scope }, catalog, resolveCardId), [key, scope])
  const [result, setResult] = useState<{ slug: string; state: State }>()
  useEffect(() => {
    if (!w) { setPageMeta(); return }
    let live = true
    loadBoard(w.board).then(b => {
      if (!live) return
      const items = b.items.filter((p, i) => b.items.findIndex(q => q.id === p.id) === i), preset = items.find(p => p.id === w.slug)
      if (!preset) return setResult({ slug: w.slug, state: { status: 'missing' } })
      const meta = deriveWidgetMeta(preset, { uid: w.uid, board: w.board }, dot480)
      const sources = b.sources?.filter(s => PAGE_SOURCES.has(s.id))
      setResult({ slug: w.slug, state: { status: 'ok', w, preset, items, meta, sources: sources?.length ? sources : undefined } })
      // the address bar shows the canonical slug URL (uid, old slug and ?card= forms are normalised in place)
      const want = canonicalWidgetUrl(w, location.search) + location.hash
      if (want !== location.pathname + location.search + location.hash) replaceUrl(want)
      setPageMeta(widgetPageMeta(meta))
    }, () => { if (live) setResult({ slug: w.slug, state: { status: 'failed' } }) }) // the chunk didn't load (after the loader's retries)
    return () => { live = false }
  }, [w])
  const state: State = !w ? { status: 'missing' } : result?.slug === w.slug ? result.state : { status: 'loading' }
  const missing = state.status === 'missing'
  useEffect(() => { if (!missing) return; setNoIndex(true); return () => setNoIndex(false) }, [missing])

  if (state.status === 'loading') return <section className="wp" aria-busy="true"><div className="wp-loading" /></section>
  if (state.status === 'missing' || state.status === 'failed') return <section className="wp wp--missing">
    <PillBar label="Navigation" className="wp-top"><Pill><PillButton label="BOARDS" glyph="‹" title="Back to the boards" href="/" onClick={() => onBoard(boardIds[0])} /></Pill></PillBar>
    {state.status === 'failed'
      ? <div className="wp-missing"><LoadFailed what="This card" /></div>
      : <div className="wp-missing"><h1>No widget “{route.key}”</h1><p>It may have been renamed or removed. Every card is on one of the boards.</p></div>}
  </section>
  return <Loaded key={state.w.slug} {...state} onOpen={onOpen} onBoard={onBoard} />
}

function Loaded({ w, preset, items, meta, sources, onOpen, onBoard }: Loaded & Omit<WidgetPageProps, 'route'>) {
  const live = useLiveData(sources), pond = w.board === 'pond'
  const stage = useRef<HTMLElement>(null)
  const xrayOn = useFlag('xray')
  const xray = useXR(s => s.global || s.on.size > 0)
  const i = items.findIndex(p => p.id === preset.id), prev = items[(i - 1 + items.length) % items.length], next = items[(i + 1) % items.length]
  const name = widgetTitle(preset.name), url = location.origin + widgetPath(w.slug, w.scope), short = location.origin + shortPath(w.uid)
  const share = useMemo(() => canShare(), [])
  const pitch = (preset.grid.pitch ?? dot480.gridPx) * 2
  // exports are what the visitor sees: the card's theme at the moment of export (the site theme, or its dark inset)
  const theme = () => { const s = getTheme(); return themeTokens(cardScheme(preset, s.resolved, getSkin()), s.accent) }
  const t = () => (preset.animated ? boardTime() : 0)
  // theme and time are read in the click; the export code loads after it (the clipboard takes the pending result)
  const png = () => { const th = theme(), at = t(); return exporter().then(x => x.cardPNG(preset, th, at)) }
  const info = { name, slug: w.slug, url }
  const svg = () => { const th = theme(), at = t(); return exporter().then(x => x.cardSVGText(preset, th, at, info)) }
  const html = () => { const th = theme(), at = t(); return exporter().then(x => x.cardHTMLText(preset, th, at, info)) }
  const report = (what: string) => (o: Outcome) => { if (said[o]) toast(`${what} ${said[o]}`) }
  const actionArgs = () => {
    const key = stage.current?.querySelector<HTMLElement>('[data-xr-key]')?.dataset.xrKey ?? ''
    return { key, preset, data: { ...preset.defaults }, layers: withChrome(preset), grid: preset.grid, style: preset.style, theme: theme(), animated: !!preset.animated }
  }
  const sharePNG = useRef<Promise<Blob> | undefined>(undefined)
  const act = {
    png: () => void copyPNG(png(), `${w.slug}.png`).then(report('PNG')),
    svg: () => void copySVG(svg(), `${w.slug}.svg`).then(report('SVG')),
    html: () => void copyText(html()).then(report('HTML')),
    // the share-link opt-in (THEME popover) adds the visitor's ?theme=
    link: () => { const u = withPondDay(withTheme(url), pond); void copyText(u).then(o => toast(o === 'copied' ? 'link copied' : u)) },
    short: () => { const u = withPondDay(withTheme(short), pond); void copyText(u).then(o => toast(o === 'copied' ? `short link copied: ${shortPath(w.uid)}` : u)) },
    savePNG: () => void png().then(b => { download(b, `${w.slug}.png`); toast(`${w.slug}.png saved`) }, () => toast('PNG failed')),
    saveSVG: () => void svg().then(s => { download(new Blob([s], { type: 'image/svg+xml' }), `${w.slug}.svg`); toast(`${w.slug}.svg saved`) }, () => toast('SVG failed')),
    share: () => { const p = sharePNG.current ?? png(); sharePNG.current = undefined; void shareCard({ title: `${name} · MATRIX`, url: withPondDay(withTheme(url), pond), png: p, file: `${w.slug}.png` }).then(report('card')) },
    remix: () => cardAction('remix', actionArgs()),
    xray: () => cardAction('how', actionArgs()),
  }

  // ← → walk the board (not while typing, scrubbing the frozen clock, or inside the card's own controls); one
  // listener for the page's life, reading the current neighbours
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
    const el = e.target as HTMLElement | null
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.closest('.dot-card, [role="toolbar"], .pal-backdrop, .tm-bar'))) return
    if (document.querySelector('.pal-backdrop, .pal-shell')) return
    e.preventDefault()
    onOpen((e.key === 'ArrowLeft' ? prev : next).id)
  })
  useEffect(() => {
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // a camera card's hint is CAMERA too: each chip once
  const chips = [...new Set([meta.hint, meta.animated && 'ANIMATED', meta.live && 'LIVE DATA', meta.media === 'camera' && 'CAMERA', meta.media === 'mic' && 'MICROPHONE', meta.clock && 'CLOCK'].filter((c): c is string => !!c))]
  // the concept credit the board heading shows, here too: shared links land on this page
  const blurbs = useBlurbs(), concept = blurbs?.conceptCredit.boards.includes(w.board as BoardId) ? blurbs.conceptCredit : undefined
  const facts: [string, ReactNode][] = [
    ['Board', <a key="b" className="wp-link" href={`/${w.board}/`} onClick={e => { if (e.button === 0 && !e.metaKey && !e.ctrlKey) { e.preventDefault(); onBoard(w.board, w.slug) } }}>{boardLabel(w.board)}</a>],
    ['Kind', meta.group],
    ['Grid', `${meta.grid.cols} × ${meta.grid.rows} dots · ${meta.grid.pitch} px pitch`],
    ['Dots lit', meta.dots.toLocaleString('en')],
    ['Renderer', meta.renderer.toUpperCase()],
    ['Layers', `${meta.layerCount} · ${meta.layers.join(', ')}`],
    ...(meta.controls.length ? [['Controls', meta.controls.join(', ')] as [string, string]] : []),
    ['Tags', meta.tags.join(' · ')],
    ['Id', <span key="i" className="wp-ids"><code>{w.slug}</code> <code title="Permanent short id">{w.uid}</code></span>],
  ]
  return <section className="wp" aria-labelledby="wp-title">
    <PillBar label="Navigation" className="wp-top">
      <Pill><PillButton label={boardLabel(w.board)} glyph="‹" title={`Back to the ${boardLabel(w.board)} board`} href={`/${w.board}/`} onClick={() => onBoard(w.board, w.slug)} /></Pill>
      <Pill className="wp-step">
        <PillButton label="PREV" glyph="←" kbd="←" title={`Previous card: ${widgetTitle(prev.name)}`} href={widgetPath(prev.id)} onClick={() => onOpen(prev.id)} />
        <span className="wp-count" aria-label={`card ${i + 1} of ${items.length}`}>{i + 1}/{items.length}</span>
        <PillButton label="NEXT" glyph="→" kbd="→" title={`Next card: ${widgetTitle(next.name)}`} href={widgetPath(next.id)} onClick={() => onOpen(next.id)} />
      </Pill>
    </PillBar>
    <div className="wp-main">
      {/* the stage is a size container: the card takes the most it can of it at its own aspect (#183) */}
      <div className="wp-stagebox"><figure className="wp-stage" ref={stage} style={{ '--wp-max': `${preset.grid.cols * pitch + 32}px`, '--wp-ar': preset.grid.cols / preset.grid.rows } as CSSProperties}>
        <DotWidget type={preset.id} preset={preset} density={pitch} data={sources ? pick(live, preset.defaults) : undefined} />
        {/* the figure legend (docs/LAYOUT-THEME-PLAN.md §1c #14) */}
        <figcaption className="fig-cap"><b>FIG {String(i + 1).padStart(2, '0')}</b>{w.slug} · {meta.grid.cols} × {meta.grid.rows} dots · {meta.grid.pitch} px · {meta.renderer.toUpperCase()}</figcaption>
      </figure></div>
      <aside className="wp-rail" aria-label="About this card">
        <p className="wp-eyebrow">{boardLabel(w.board)} · {String(i + 1).padStart(2, '0')}</p>
        <h1 id="wp-title"><span className="sr-only">{name}</span><DotName text={name} pitch={4} /></h1>
        <p className="wp-blurb">{meta.blurb}</p>
        <WidgetLike uid={w.uid} name={name} />
        {creditsOf(preset).map(c => <p key={c.source} className="wp-credit">by {c.by.join(', ')} · <a className="wp-link" href={c.source} target="_blank" rel="noopener noreferrer">{c.title}</a>{c.note && <> · {c.note}</>}</p>)}
        {concept && <ConceptCredit credit={concept} card />}
        {/* the actions, grouped by what they do: export, then share and remix, then the rest */}
        <PillBar label="Card actions" className="wp-actions">
          <Pill className="wp-copy">
            <PillButton label="PNG" glyph="▣" title="Copy as PNG" onClick={act.png} />
            <PillButton label="SVG" glyph="◇" title="Copy as SVG" onClick={act.svg} />
            <PillButton label="LINK" glyph="⌁" title="Copy link" onClick={act.link} />
          </Pill>
          <Pill className="wp-go">
            {/* the levels board's cards are HIVE's screens: the game opens on its board (HiveStart reads ?play=1) */}
            {w.board === 'levels' && <PillButton label="PLAY" glyph="▸" title="Play HIVE" href="/levels/?play=1" />}
            {share && <PillButton label="SHARE" glyph="↗" title="Share" onPointerDown={() => { sharePNG.current = png() }} onClick={act.share} />}
            {flag('make') && <PillButton label="REMIX" glyph="✎" title="Remix in MAKE" onClick={act.remix} />}
            {xrayOn && <PillButton label="X-RAY" glyph="ⓘ" title="X-ray: how it works" onClick={act.xray} pressed={xray} className="wp-desk" />}
            <MoreMenu items={[
              { label: 'Copy short link', note: shortPath(w.uid), run: act.short },
              { label: 'Copy HTML', note: 'static SVG, no script', run: act.html },
              { label: 'Download PNG', run: act.savePNG, group: true },
              { label: 'Download SVG', run: act.saveSVG },
              ...(xrayOn ? [{ label: 'X-ray: how it works', run: act.xray, group: true, className: 'wp-phone' }] : []),
              { label: `Back to ${boardLabel(w.board)}`, run: () => onBoard(w.board, w.slug), group: true },
            ]} />
          </Pill>
        </PillBar>
        {/* tags describe the card: plain labels, not controls (#185) */}
        {chips.length > 0 && <ul className="wp-chips" aria-label="What it does">{chips.map(c => <li key={c}>{c}</li>)}</ul>}
        <dl className="wp-facts">{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      </aside>
    </div>
  </section>
}
