/**
 * The single-widget page (docs/SHARE-PLAN.md §4): `/widget/<slug>/`, `/widget/<uid>/`, `/<uid>` and the old
 * `?card=` all land here (src/site/routes.ts). Lazy: the catalog, the metadata and the export helpers load with
 * it, never in the first load. The card is live and large, centred; its facts sit beside it (below on phones);
 * actions are iOS-style pills: a top bar (back to the board, previous / next) and a bottom bar (copy, share,
 * remix, X-ray, more), one capsule on phones above the home indicator.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DotName } from '../DotName'
import { dot480 } from '../../engine'
import { boardIds, boardLabel, loadBoard, resolveCardId } from '../../widgets/manifest'
import { catalog } from '../../widgets/catalog'
import { deriveWidgetMeta, type WidgetMeta } from '../../widgets/meta'
import { withChrome, type WidgetPreset } from '../../widgets/types'
import { canonicalWidgetUrl, resolveWidget, shortPath, widgetPath, type ResolvedWidget, type WidgetRoute } from '../../site/routes'
import { setPageMeta, widgetPageMeta, widgetTitle } from '../../site/meta'
import { presetSource } from '../../export/source'
import { stillPNG } from '../../export/still'
import { cardHTML, cardSVG } from '../../export/snippets'
import { canShare, copyPNG, copySVG, copyText, download, shareCard, type Outcome } from '../../export/clipboard'
import { boardTime, cardAction, toast, useXR } from '../xray/store'
import { getSkin } from '../skins/store'
import { getTheme, themeTokens } from '../../site/theme/theme'
import { withTheme } from '../../site/theme/share'
import { cardScheme } from '../../site/theme/polarity'
import { DotWidget } from '../DotWidget'
import { Pill, PillBar, PillButton } from './PillBar'
import './WidgetPage.css'

export interface WidgetPageProps {
  route: WidgetRoute
  /** Open another widget (previous / next): pushes `/widget/<slug>/`. */
  onOpen: (slug: string) => void
  /** Back to a board, scrolled to `slug`. */
  onBoard: (board: string, slug?: string) => void
}

type Loaded = { w: ResolvedWidget; preset: WidgetPreset; items: WidgetPreset[]; meta: WidgetMeta }
type State = { status: 'loading' } | { status: 'missing' } | ({ status: 'ok' } & Loaded)

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
      setResult({ slug: w.slug, state: { status: 'ok', w, preset, items, meta } })
      // the address bar shows the canonical slug URL (uid, old slug and ?card= forms are normalised in place)
      const want = canonicalWidgetUrl(w, location.search) + location.hash
      if (want !== location.pathname + location.search + location.hash) history.replaceState(history.state, '', want)
      setPageMeta(widgetPageMeta(meta))
    }, () => { if (live) setResult({ slug: w.slug, state: { status: 'missing' } }) })
    return () => { live = false }
  }, [w])
  const state: State = !w ? { status: 'missing' } : result?.slug === w.slug ? result.state : { status: 'loading' }

  if (state.status === 'loading') return <section className="wp" aria-busy="true"><div className="wp-loading" /></section>
  if (state.status === 'missing') return <section className="wp wp--missing">
    <PillBar label="Navigation" className="wp-top"><Pill><PillButton label="BOARDS" glyph="‹" title="Back to the boards" href="/" onClick={() => onBoard(boardIds[0])} /></Pill></PillBar>
    <div className="wp-missing"><h1>No widget “{route.key}”</h1><p>It may have been renamed or removed. Every card is on one of the boards.</p></div>
  </section>
  return <Loaded key={state.w.slug} {...state} onOpen={onOpen} onBoard={onBoard} />
}

function Loaded({ w, preset, items, meta, onOpen, onBoard }: Loaded & Omit<WidgetPageProps, 'route'>) {
  const stage = useRef<HTMLElement>(null)
  const [more, setMore] = useState(false)
  const xray = useXR(s => s.global || s.on.size > 0)
  const i = items.findIndex(p => p.id === preset.id), prev = items[(i - 1 + items.length) % items.length], next = items[(i + 1) % items.length]
  const name = widgetTitle(preset.name), url = location.origin + widgetPath(w.slug, w.scope), short = location.origin + shortPath(w.uid)
  const share = useMemo(() => canShare(), [])
  const pitch = (preset.grid.pitch ?? dot480.gridPx) * 2
  // exports are what the visitor sees: the card's theme at the moment of export (the site theme, or its dark inset)
  const theme = () => { const s = getTheme(); return themeTokens(cardScheme(preset, s.resolved, getSkin()), s.accent) }
  const source = () => presetSource(preset, theme())
  const t = () => (preset.animated ? boardTime() : 0)
  const png = () => stillPNG(source(), t())
  const svg = () => {
    const src = source(), th = theme()
    return cardSVG(src.frame(t()), { width: src.width, height: src.height, background: th.surface, border: th.hairline, radius: th.cornerRadiusCard }, { name, slug: w.slug, url })
  }
  const report = (what: string) => (o: Outcome) => { if (said[o]) toast(`${what} ${said[o]}`) }
  const actionArgs = () => {
    const key = stage.current?.querySelector<HTMLElement>('[data-xr-key]')?.dataset.xrKey ?? ''
    return { key, preset, data: { ...preset.defaults }, layers: withChrome(preset), grid: preset.grid, style: preset.style, theme: theme(), animated: !!preset.animated }
  }
  const sharePNG = useRef<Promise<Blob> | undefined>(undefined)
  const act = {
    png: () => void copyPNG(png(), `${w.slug}.png`).then(report('PNG')),
    svg: () => void copySVG(svg(), `${w.slug}.svg`).then(report('SVG')),
    html: () => void copyText(cardHTML(svg(), { name, slug: w.slug, url })).then(report('HTML')),
    // the share-link opt-in (THEME popover) adds the visitor's ?theme=
    link: () => { const u = withTheme(url); void copyText(u).then(o => toast(o === 'copied' ? 'link copied' : u)) },
    short: () => { const u = withTheme(short); void copyText(u).then(o => toast(o === 'copied' ? `short link copied: ${shortPath(w.uid)}` : u)) },
    savePNG: () => void png().then(b => { download(b, `${w.slug}.png`); toast(`${w.slug}.png saved`) }, () => toast('PNG failed')),
    saveSVG: () => { download(new Blob([svg()], { type: 'image/svg+xml' }), `${w.slug}.svg`); toast(`${w.slug}.svg saved`) },
    share: () => { const p = sharePNG.current ?? png(); sharePNG.current = undefined; void shareCard({ title: `${name} · DOT/480`, url: withTheme(url), png: p, file: `${w.slug}.png` }).then(report('card')) },
    remix: () => cardAction('remix', actionArgs()),
    xray: () => cardAction('how', actionArgs()),
  }

  // ← → walk the board (not while typing, scrubbing the frozen clock, or inside the card's own controls)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.closest('.dot-card, [role="toolbar"], .pal-backdrop, .tm-bar'))) return
      if (document.querySelector('.pal-backdrop, .pal-shell')) return
      e.preventDefault()
      onOpen((e.key === 'ArrowLeft' ? prev : next).id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prev, next, onOpen])
  useEffect(() => {
    if (!more) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMore(false) }
    const onDown = (e: PointerEvent) => { if (!(e.target as Element).closest?.('.wp-more, .wp-more-btn')) setMore(false) }
    window.addEventListener('keydown', onKey); window.addEventListener('pointerdown', onDown)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown) }
  }, [more])

  const chips = [meta.hint, meta.animated && 'ANIMATED', meta.live && 'LIVE DATA', meta.media === 'camera' && 'CAMERA', meta.media === 'mic' && 'MICROPHONE', meta.clock && 'CLOCK'].filter((c): c is string => !!c)
  const facts: [string, ReactNode][] = [
    ['Board', <a key="b" href={`/${w.board}/`} onClick={e => { if (e.button === 0 && !e.metaKey && !e.ctrlKey) { e.preventDefault(); onBoard(w.board, w.slug) } }}>{boardLabel(w.board)}</a>],
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
      <figure className="wp-stage" ref={stage} style={{ maxWidth: preset.grid.cols * pitch + 32 }}>
        <DotWidget type={preset.id} preset={preset} density={pitch} />
        {/* the figure legend (docs/LAYOUT-THEME-PLAN.md §1c #14) */}
        <figcaption className="fig-cap"><b>FIG {String(i + 1).padStart(2, '0')}</b>{w.slug} · {meta.grid.cols} × {meta.grid.rows} dots · {meta.grid.pitch} px · {meta.renderer.toUpperCase()}</figcaption>
      </figure>
      <aside className="wp-rail">
        <p className="wp-eyebrow">{boardLabel(w.board)} · {String(i + 1).padStart(2, '0')}</p>
        <h1 id="wp-title"><span className="sr-only">{name}</span><DotName text={name} pitch={4} /></h1>
        <p className="wp-blurb">{meta.blurb}</p>
        {chips.length > 0 && <ul className="wp-chips" aria-label="What it does">{chips.map(c => <li key={c}>{c}</li>)}</ul>}
        <dl className="wp-facts">{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      </aside>
    </div>
    <PillBar label="Card actions" className="wp-bottom">
      <Pill className="wp-copy">
        <PillButton label="PNG" glyph="▣" title="Copy as PNG" onClick={act.png} />
        <PillButton label="SVG" glyph="◇" title="Copy as SVG" onClick={act.svg} className="wp-desk" />
        <PillButton label="LINK" glyph="⌁" title="Copy link" onClick={act.link} className={share ? 'wp-desk' : ''} />
      </Pill>
      <Pill className="wp-go">
        {share && <PillButton label="SHARE" glyph="↗" title="Share" onPointerDown={() => { sharePNG.current = png() }} onClick={act.share} />}
        <PillButton label="REMIX" glyph="✎" title="Remix in MAKE" onClick={act.remix} />
        <PillButton label="X-RAY" glyph="ⓘ" title="X-ray: how it works" onClick={act.xray} pressed={xray} className="wp-desk" />
        <PillButton label="MORE" glyph="⋯" title="More actions" onClick={() => setMore(m => !m)} expanded={more} className="wp-more-btn" />
      </Pill>
    </PillBar>
    {more && <div className="wp-more" role="menu" aria-label="More actions">
      <button role="menuitem" type="button" className="wp-phone" onClick={() => { setMore(false); act.svg() }}>Copy SVG</button>
      {share && <button role="menuitem" type="button" className="wp-phone" onClick={() => { setMore(false); act.link() }}>Copy link</button>}
      <button role="menuitem" type="button" onClick={() => { setMore(false); act.short() }}>Copy short link <code>{shortPath(w.uid)}</code></button>
      <button role="menuitem" type="button" onClick={() => { setMore(false); act.html() }}>Copy HTML <small>static SVG, no script</small></button>
      <button role="menuitem" type="button" onClick={() => { setMore(false); act.savePNG() }}>Download PNG</button>
      <button role="menuitem" type="button" onClick={() => { setMore(false); act.saveSVG() }}>Download SVG</button>
      <button role="menuitem" type="button" className="wp-phone" onClick={() => { setMore(false); act.xray() }}>X-ray: how it works</button>
      <button role="menuitem" type="button" onClick={() => { setMore(false); onBoard(w.board, w.slug) }}>Back to {boardLabel(w.board)}</button>
    </div>}
  </section>
}
