/**
 * The quiet row under a card (owner feedback, 2026-11-10; it replaces the ⋯ of #181): on ALL the card's name and its
 * board on the left; three small icon buttons on the right: open (a real link to the card's page), copy link and more,
 * each with the site's tooltip. A board's row has no name (the card's header shows it), only the icons. The smallest
 * mono and `--mute` at rest, so the card stays the focus. MORE opens the card's menu under the row, never over the
 * card. The row sits outside the card's tree (a sibling in its grid slot), so the card's own pointer and keys
 * stay the card's; its actions reach the mounted card through `cardActs`.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import type { CardAction } from './xray/store'
import { toast, useXR, xrState } from './xray/store'
import { cardActs, type CardActs } from './cardActs'
import { CopiedIcon, LinkIcon, MoreIcon, OpenIcon } from './rowIcons'
import './CardRow.css'

export interface CardRowProps {
  /** The card's id (its slug). */
  id: string
  name: string
  /** The card page's path (`widgetPath`), passed in so a lazy view needn't import the routes module. */
  href: string
  /** Open the card's page in place (ALL); without it OPEN runs the card's own action (a view transition). */
  onOpen?: (id: string) => void
  /** The left side: the card's name, then this (ALL: the card's board, a link). Without it the row is only the
   * actions (a board, where the card's header shows its name). */
  meta?: ReactNode
}

/** The menu: the widget page's wording (its MORE menu). Open and copy link are in the row itself; Copy link shows here
 * only while the card isn't mounted (the rest need it). */
const MORE: [CardAction, string][] = [['png', 'Download PNG'], ['link', 'Copy link'], ['remix', 'Remix in MAKE'], ['how', 'X-ray: how it works']]
const plain = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey

export function CardRow({ id, name, href, onOpen, meta }: CardRowProps) {
  // the menu: closed (false), or open with the card's actions as they were when it opened (null: not mounted)
  const [menu, setMenu] = useState<CardActs | null | false>(false)
  const opened = menu !== false
  // LINK's confirmation: while the site's "link copied" toast that followed this row's click is up (2.4 s), LINK's
  // tooltip says "Copied" and its icon is a check. The toast is a polite live region, so screen readers hear it too;
  // a copy that fails toasts the URL instead, and LINK stays as it was
  const note = useXR(s => s.toast)
  const [asked, setAsked] = useState<number | null>(null)
  const copied = asked !== null && !!note && note.id > asked && note.text === 'link copied'
  const row = useRef<HTMLDivElement>(null), more = useRef<HTMLButtonElement>(null)
  // the card in the same slot (the row's previous sibling), and its actions once it is mounted
  const acts = () => cardActs(row.current?.parentElement?.querySelector<HTMLElement>(':scope > [data-xr-key]')?.dataset.xrKey)
  // the menu closes on a tap anywhere else, like a native menu; its keys are on the menu (onMenuKey)
  useEffect(() => {
    if (!opened) return
    const away = (e: PointerEvent) => { if (!row.current?.contains(e.target as Node)) setMenu(false) }
    document.addEventListener('pointerdown', away, true)
    // the first item takes focus, so arrows, Enter and Escape work at once
    row.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus()
    return () => document.removeEventListener('pointerdown', away, true)
  }, [opened])
  const run = (a: CardAction) => {
    const own = acts()
    if (own) return own.act(a)
    // a card that isn't mounted yet (a windowed slot on ALL) can still give its link
    if (a === 'link') void navigator.clipboard?.writeText(new URL(href, location.href).href).then(() => toast('link copied'), () => {})
  }
  const open = (e: MouseEvent) => {
    if (!plain(e)) return
    if (onOpen) { e.preventDefault(); onOpen(id) } else if (acts()) { e.preventDefault(); run('open') }
  }
  const close = () => { setMenu(false); more.current?.focus() }
  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const all = [...e.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]')], i = all.indexOf(document.activeElement as HTMLElement)
    const to = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : null
    if (to !== null) { e.preventDefault(); all[(to + all.length) % all.length]?.focus() } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() } else if (e.key === 'Tab') close()
  }
  const own = menu || undefined
  // X-ray only while its flag is on, REMIX only while `make` is; PNG and REMIX need the mounted card
  const items = MORE.filter(([a]) => (a === 'link' ? !own : own) && (a !== 'how' || own?.xray) && (a !== 'remix' || own?.make))
  const pick = (a: CardAction) => () => { close(); run(a) }
  return <div ref={row} className={`dot-card-row${opened ? ' open' : ''}`}>
    {meta && <p className="dot-card-row-meta"><span className="dot-card-row-name" aria-hidden="true">{name}</span>{meta}</p>}
    <a className="dot-card-row-open" href={href} aria-label={`Open ${name}`} data-tip="Open" onClick={open}><OpenIcon /></a>
    <button type="button" className={`dot-card-row-link${copied ? ' copied' : ''}`} aria-label={`Copy link to ${name}`} data-tip={copied ? 'Copied' : 'Copy link'}
      onClick={() => { setAsked(xrState().toast?.id ?? 0); run('link') }}>{copied ? <CopiedIcon /> : <LinkIcon />}</button>
    <button ref={more} type="button" className="dot-card-row-more" aria-label={`More for ${name}`} data-tip={opened ? undefined : 'More'} aria-haspopup="menu" aria-expanded={opened}
      onClick={() => setMenu(opened ? false : acts() ?? null)}><MoreIcon /></button>
    {opened && <div className="dot-card-menu" role="menu" aria-label={`${name}: more`} onKeyDown={onMenuKey}>
      {items.map(([a, label]) => a === 'how'
        ? <button key={a} type="button" tabIndex={-1} role="menuitemcheckbox" aria-checked={!!own?.xrOn} onClick={pick(a)}>{label}</button>
        : <button key={a} type="button" tabIndex={-1} role="menuitem" onClick={pick(a)}>{label}</button>)}
    </div>}
  </div>
}
