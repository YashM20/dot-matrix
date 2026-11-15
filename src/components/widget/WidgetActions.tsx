/**
 * The widget page's card actions: copy and download (PNG, SVG, HTML), the links, SHARE, REMIX and X-RAY, and the
 * toolbar that holds them, grouped by what they do. Exports are what the visitor sees: the card's theme and clock at the moment
 * of the click, and the data on the stage (live values, typed words). The export code loads on the first export (#214).
 */
import { useMemo, useRef, type RefObject } from 'react'
import { canShare, copyPNG, copySVG, copyText, download, shareCard, type Outcome } from '../../export/clipboard'
import { flag } from '../../site/flags'
import { withPondDay } from '../../site/pondMemory'
import { shortPath, widgetPath, type ResolvedWidget } from '../../site/routes'
import { getTheme, themeTokens } from '../../site/theme/theme'
import { withTheme } from '../../site/theme/share'
import { cardScheme } from '../../site/theme/polarity'
import { withChrome, type WidgetPreset } from '../../widgets/types'
import { boardLabel } from '../../widgets/manifest'
import { getSkin } from '../skins/store'
import { boardTime, cardAction, toast } from '../xray/store'
import { MoreMenu } from './MoreMenu'
import { Pill, PillBar, PillButton } from './PillBar'
import { LinkIcon, PlayIcon, RemixIcon, ShareIcon, XrayIcon } from './toolIcons'

/** The export code (PNG, SVG, HTML), loaded on the first export. */
const exporter = () => import('./cardExport')

const said: Record<Outcome, string> = { copied: 'copied', downloaded: 'saved (copy isn’t available here)', shared: 'shared', cancelled: '', failed: 'failed' }

interface ActsInput {
  w: ResolvedWidget
  preset: WidgetPreset
  name: string
  /** The data the card shows now (live values, typed words), so exports and REMIX match the stage. */
  cardData?: Record<string, number>
  /** The stage, to find the mounted card's X-ray key. */
  stageRef: RefObject<HTMLElement | null>
}

/** What each action does. Theme and time are read in the click; the export code loads after it (the clipboard takes the pending result). */
function useWidgetActs({ w, preset, name, cardData, stageRef }: ActsInput) {
  const pond = w.board === 'pond', url = location.origin + widgetPath(w.slug, w.scope), short = location.origin + shortPath(w.uid)
  const theme = () => { const s = getTheme(); return themeTokens(cardScheme(preset, s.resolved, getSkin()), s.accent) }
  const t = () => (preset.animated ? boardTime() : 0)
  const png = () => { const th = theme(), at = t(), d = cardData; return exporter().then(x => x.cardPNG(preset, th, at, d)) }
  const info = { name, slug: w.slug, url }
  const svg = () => { const th = theme(), at = t(), d = cardData; return exporter().then(x => x.cardSVGText(preset, th, at, info, d)) }
  const html = () => { const th = theme(), at = t(), d = cardData; return exporter().then(x => x.cardHTMLText(preset, th, at, info, d)) }
  const report = (what: string) => (o: Outcome) => { if (said[o]) toast(`${what} ${said[o]}`) }
  const actionArgs = () => {
    const key = stageRef.current?.querySelector<HTMLElement>('[data-xr-key]')?.dataset.xrKey ?? ''
    return { key, preset, data: { ...preset.defaults, ...cardData }, layers: withChrome(preset), grid: preset.grid, style: preset.style, theme: theme(), animated: !!preset.animated }
  }
  const sharePNG = useRef<Promise<Blob> | undefined>(undefined)
  return {
    png: () => void copyPNG(png(), `${w.slug}.png`).then(report('PNG')),
    svg: () => void copySVG(svg(), `${w.slug}.svg`).then(report('SVG')),
    html: () => void copyText(html()).then(report('HTML')),
    // the share-link opt-in (THEME popover) adds the visitor's ?theme=
    link: () => { const u = withPondDay(withTheme(url), pond); void copyText(u).then(o => toast(o === 'copied' ? 'link copied' : u)) },
    short: () => { const u = withPondDay(withTheme(short), pond); void copyText(u).then(o => toast(o === 'copied' ? `short link copied: ${shortPath(w.uid)}` : u)) },
    savePNG: () => void png().then(b => { download(b, `${w.slug}.png`); toast(`${w.slug}.png saved`) }, () => toast('PNG failed')),
    saveSVG: () => void svg().then(s => { download(new Blob([s], { type: 'image/svg+xml' }), `${w.slug}.svg`); toast(`${w.slug}.svg saved`) }, () => toast('SVG failed')),
    // SHARE starts its PNG on the press; the click that follows shares it
    pressShare: () => { sharePNG.current = png() },
    // the PNG made on the press is this click's only: a keyboard click (detail 0) after a press that ended off the
    // button would otherwise share an old one, in the theme and at the time of that press (docs/STATE-MACHINES.md A9.1)
    share: (e?: { detail: number }) => { const p = (e?.detail ? sharePNG.current : undefined) ?? png(); sharePNG.current = undefined; void shareCard({ title: `${name} · MATRIX`, url: withPondDay(withTheme(url), pond), png: p, file: `${w.slug}.png` }).then(report('card')) },
    remix: () => cardAction('remix', actionArgs()),
    xray: () => cardAction('how', actionArgs()),
  }
}

interface CardActionsProps extends ActsInput {
  /** The `xray` flag, and whether X-ray is on now (the pill shows pressed). */
  xrayOn: boolean
  xray: boolean
  onBoard: (board: string, slug?: string) => void
}

/** The actions as one toolbar: the card's own actions (export, link, share, remix) left, the rest (X-RAY, MORE) right. */
export function CardActions({ xrayOn, xray, onBoard, ...input }: CardActionsProps) {
  const act = useWidgetActs(input), { w } = input
  // SHARE is a touch action (owner decision): on a mouse the system sheet adds little to LINK, and the toolbar stays one
  // row with X-RAY on. The test is the phone UI's own, a coarse pointer
  const share = useMemo(() => canShare() && matchMedia('(pointer: coarse)').matches, [])
  return <PillBar label="Card actions" className="wp-actions">
    <Pill className="wp-copy">
      <PillButton label="PNG" title="Copy as PNG" onClick={act.png} />
      <PillButton label="SVG" title="Copy as SVG" onClick={act.svg} />
      <PillButton label="LINK" title="Copy link" icon={<LinkIcon />} iconOnly onClick={act.link} />
      {share && <PillButton label="SHARE" title="Share" icon={<ShareIcon />} iconOnly onPointerDown={act.pressShare} onClick={act.share} />}
      {flag('make') && <PillButton label="REMIX" title="Remix in MAKE" icon={<RemixIcon />} onClick={act.remix} className="wp-remix" />}
      {/* the levels board's cards are HIVE's screens: the game opens on its board (HiveStart reads ?play=1) */}
      {w.board === 'levels' && <PillButton label="PLAY" title="Play HIVE" icon={<PlayIcon />} href="/levels/?play=1" />}
    </Pill>
    <Pill className="wp-go">
      {xrayOn && <PillButton label="X-RAY" title="X-ray: how it works" icon={<XrayIcon />} onClick={act.xray} pressed={xray} className="wp-desk" />}
      <MoreMenu items={[
        { label: 'Copy short link', note: shortPath(w.uid), run: act.short },
        { label: 'Copy HTML', note: 'static SVG', run: act.html },
        { label: 'Download PNG', run: act.savePNG, group: true },
        { label: 'Download SVG', run: act.saveSVG },
        ...(xrayOn ? [{ label: 'X-ray: how it works', run: act.xray, group: true, className: 'wp-phone' }] : []),
        { label: `Back to ${boardLabel(w.board)}`, run: () => onBoard(w.board, w.slug), group: true },
      ]} />
    </Pill>
  </PillBar>
}
