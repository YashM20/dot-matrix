/**
 * The shell's two bars: the top bar (brand, place name, view tabs, DISPLAY, theme, the tool dock's slot, search) and
 * the phone's bottom tab bar. App owns the view state and passes it in; styles are in chrome.css and mobile/.
 */
import { useRoving } from '../../hooks/useRoving'
import { SkinSwitcher } from '../../components/skins/SkinSwitcher'
import { ThemeButton } from '../../components/theme/ThemeButton'
import { useXR } from '../../components/xray/store'
import { boardLabel, liveBoards } from '../../widgets/manifest'
import { requestLayer } from '../layer'
import { useFlag } from '../useFlag'
import { VIEWS, type View } from '../views'

/** The views on offer: MAKE only while its flag is on. */
const useViews = (): readonly View[] => useFlag('make') ? VIEWS : VIEWS.filter(v => v !== 'MAKE')

/** A row of real tabs: ← → Home End move and pick, the selected one is the only tab stop. */
function Tabs<T extends string>({ label, items, value, onPick, className }: { label: string; items: readonly T[]; value: T; onPick: (t: T) => void; className: string }) {
  const onKey = useRoving({ items: '[role=tab]', pick: true })
  return <div className={className} role="tablist" aria-label={label} onKeyDown={onKey}>{items.map(t => <button key={t} type="button" role="tab" id={`tab-${t}`} aria-selected={value === t} tabIndex={value === t ? 0 : -1} className={value === t ? 'selected' : ''} onClick={() => onPick(t)}>{t}</button>)}</div>
}

/**
 * The tool dock's place in the top bar, held from first paint: a hidden, inert copy with the same buttons, so the real
 * dock (CommandLayer portals it in once the page is idle) takes the room it left and the bar doesn't jump (#198).
 */
function DockGhost() {
  'use no memo'
  const xray = useFlag('xray')
  return <div className="pal-dock dock-ghost" aria-hidden="true" inert>{xray && <button type="button">X-RAY</button>}<button type="button">TIME</button><button type="button">⌘K</button><button type="button">&gt;_</button></div>
}

/** A 5×5 dot glyph for the tab bar: chrome, drawn as dots like everything else ('1' = a dot). */
function Glyph({ rows }: { rows: string }) {
  return <svg className="glyph" viewBox="0 0 5 5" aria-hidden="true">{[...rows.replace(/\s/g, '')].map((c, i) => <circle key={i} cx={i % 5 + .5} cy={Math.floor(i / 5) + .5} r={c === '1' ? .36 : .14} className={c === '1' ? 'on' : ''} />)}</svg>
}
const GLYPHS: Record<View | 'TOOLS' | 'SEARCH', string> = {
  EXPLORE: '11011 11011 00000 11011 11011',
  MAKE: '00100 00100 11111 00100 00100',
  ABOUT: '00100 00000 00100 00100 00100',
  TOOLS: '10001 01010 00100 01010 10001',
  SEARCH: '01110 10001 10001 01110 00001',
}
const toTop = () => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })

/** The place's name in the top bar: MAKE, ALL, the board's label, or the view. */
const placeTitle = (view: View, all: boolean, board: string) => view === 'MAKE' ? 'MAKE' : view === 'EXPLORE' ? (all ? 'ALL' : boardLabel(board)) : view

interface TopBarProps { view: View; all: boolean; board: string; onView: (v: View) => void; onBoards: () => void }
export function TopBar({ view, all, board, onView, onBoards }: TopBarProps) {
  const views = useViews(), lab = useFlag('lab'), title = placeTitle(view, all, board)
  return <header className="topbar"><a className="brand" href="/" aria-label="MATRIX home"><i className="mark" aria-hidden="true" />MATRIX</a>
    {/* phones: the place's name (on EXPLORE it opens every board) and search; the tab bar holds the views */}
    {view === 'EXPLORE'
      ? <button type="button" className="topbar-place" aria-haspopup="dialog" aria-label={`Board: ${title}. All boards`} onClick={onBoards}>{title}<span aria-hidden="true"> ▾</span></button>
      : <span className="topbar-place">{title}</span>}
    {/* one evenly spaced group: the views, then the lab and the blog (their own pages: lab.html, blog.html) */}
    <div className="topbar-nav">
      <Tabs className="view-tabs" label="Views" items={views} value={view} onPick={onView} />
      {lab && <a className="topbar-blog" href="/lab/">LAB</a>}
      <a className="topbar-blog" href="/blog/">BLOG</a>
    </div>
    <SkinSwitcher />
    <ThemeButton />
    {/* red means live: only while a board streams real data */}
    {view === 'EXPLORE' && !all && liveBoards.includes(board) && <div className="live"><i className="status-dot status-dot--live" aria-hidden="true"/> LIVE DATA</div>}
    {/* the tool dock (CommandLayer portals it here on desktop) */}
    <div className="topbar-dock"><DockGhost /></div>
    <button type="button" className="topbar-search" aria-label="Search boards, cards and actions" aria-haspopup="dialog" onClick={() => requestLayer('palette')}><Glyph rows={GLYPHS.SEARCH} /></button></header>
}

/**
 * Phones: the bottom tab bar (EXPLORE / MAKE / ABOUT, then TOOLS for the dock, the DISPLAY menu and the
 * palette). The current view is `aria-current="page"`; tapping it again goes back to the top, and on
 * EXPLORE at the top it opens every board. TOOLS carries a dot while X-ray or the time machine is on.
 * The widget page has the bar too, with no current view (`view` unset): each view leaves the card's page.
 */
export function TabBar({ view, onView, onBoards }: { view?: View; onView: (v: View) => void; onBoards?: () => void }) {
  const busy = useXR(s => s.global || s.on.size > 0 || s.frozen), views = useViews()
  const pick = (v: View) => {
    if (v !== view) { window.scrollTo(0, 0); return onView(v) }
    if (v === 'EXPLORE' && window.scrollY < 8) onBoards?.(); else toTop()
  }
  return <nav className="tabbar" aria-label="Main">
    {views.map(v => <button key={v} type="button" aria-current={view === v ? 'page' : undefined} onClick={() => pick(v)}><Glyph rows={GLYPHS[v]} /><span>{v}</span></button>)}
    <button type="button" aria-haspopup="dialog" className={busy ? 'busy' : ''} onClick={() => requestLayer('tools')}><Glyph rows={GLYPHS.TOOLS} /><span>TOOLS</span>{busy && <i className="status-dot status-dot--live tabbar-busy" aria-hidden="true" />}</button>
  </nav>
}
