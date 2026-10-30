/**
 * Phone polish (docs/EDITOR-PLAN.md E6), React-free so the Node suite runs it: which layout a viewport gets
 * (desktop, a phone upright, a phone on its side), the bottom sheet's detents and the memory of them (per
 * panel, this session and across reloads), the inset the on-screen keyboard takes (`visualViewport`), the
 * snap cue (which guides just engaged), and the share sheet: `navigator.share` over a made link, falling
 * back to the clipboard and then to EXPORT · LINK. A share the visitor cancels is not an error.
 */
import type { Guide } from './select'
import type { RightTab, Sheet } from './store'

// ── layout ─────────────────────────────────────────────────────────────────
/** The phone layout: narrow, or short and not wide (a phone on its side: 844×390, 932×430). */
export const PHONE_QUERY = '(max-width: 640px), (max-height: 500px) and (max-width: 960px)'
export const LANDSCAPE_QUERY = '(orientation: landscape)'
export type Layout = 'desktop' | 'portrait' | 'landscape'
/** What `PHONE_QUERY` and `LANDSCAPE_QUERY` decide for a `w`×`h` viewport (the Node checks pin the two together). */
export function layoutFor(w: number, h: number): Layout {
  if (!(w <= 640 || (h <= 500 && w <= 960))) return 'desktop'
  return w > h ? 'landscape' : 'portrait'
}
export const isPhone = () => typeof matchMedia === 'function' && matchMedia(PHONE_QUERY).matches

// ── the bottom sheet's detents and their memory ────────────────────────────
/** Sheet heights, as parts of the visible viewport. */
export const DETENTS = [.36, .6, .9] as const
export const SHEET_KEY = 'dot480.editor.sheet'
/** What the sheet shows: LAYERS, ASSETS, or one tab of the inspector (CODE wants more room than DESIGN). */
export type SheetPanel = 'layers' | 'assets' | `inspector:${RightTab}`
export const panelOf = (sheet: Exclude<Sheet, null>, right: RightTab): SheetPanel => (sheet === 'inspector' ? `inspector:${right}` : sheet)
/** Before anything is remembered: the middle detent, the tall one for CODE. */
export const defaultDetent = (p: SheetPanel) => (p === 'inspector:code' ? 2 : 1)
type KV = Pick<Storage, 'getItem' | 'setItem'>
const kv = (): KV | undefined => { try { return globalThis.localStorage } catch { return undefined } }
const ok = (i: unknown): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < DETENTS.length
/** This session's detents (they hold when storage is closed: private windows, a full quota). */
const session = new Map<SheetPanel, number>()
/** The stored detents, malformed rows dropped. */
export function loadDetents(store: KV | undefined = kv()): Partial<Record<SheetPanel, number>> {
  try {
    const o: unknown = JSON.parse(store?.getItem(SHEET_KEY) ?? '{}')
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {}
    return Object.fromEntries(Object.entries(o).filter(([k, v]) => /^(layers|assets|inspector:(design|animate|code|export))$/.test(k) && ok(v)))
  } catch { return {} }
}
/** The detent a panel was last left at (this session first, then storage), if it ever was. */
export const rememberedDetent = (p: SheetPanel, store: KV | undefined = kv()): number | undefined => session.get(p) ?? loadDetents(store)[p]
/** The detent a panel opens at: the remembered one, else its default. */
export const detentFor = (p: SheetPanel, store: KV | undefined = kv()): number => rememberedDetent(p, store) ?? defaultDetent(p)
/** Remember the detent the sheet was left at for a panel (this session, and in localStorage for later visits). */
export function rememberDetent(p: SheetPanel, i: number, store: KV | undefined = kv()) {
  if (!ok(i)) return
  session.set(p, i)
  try { store?.setItem(SHEET_KEY, JSON.stringify({ ...loadDetents(store), [p]: i })) } catch { /* storage closed: the session still remembers */ }
}
/** Tests: forget this session's detents. */
export const forgetDetents = () => session.clear()

// ── the on-screen keyboard (visualViewport) ────────────────────────────────
export interface ViewportBox { height: number; offsetTop: number }
/** Less than this is the browser's own chrome settling (the iOS toolbar), not a keyboard. */
export const KEYBOARD_MIN = 120
/**
 * The visible part of the layout viewport while a keyboard covers its bottom: its top, its height and the
 * keyboard's height (px). Undefined when nothing covers it, or the browser has no `visualViewport`.
 */
export function keyboardBox(innerHeight: number, vv?: ViewportBox | null): { top: number; height: number; kb: number } | undefined {
  if (!vv || !(vv.height > 0)) return undefined
  const top = Math.max(0, Math.round(vv.offsetTop)), kb = Math.round(innerHeight - vv.height - top)
  return kb >= KEYBOARD_MIN ? { top, height: Math.round(vv.height), kb } : undefined
}

// ── the snap cue ───────────────────────────────────────────────────────────
const guideKey = (g: Guide) => `${g.axis}:${Math.round(g.at * 2) / 2}`
/** The guides of `next` that were not engaged in `prev`: a drag just snapped to them (the cue lights their dots once). */
export function snappedGuides(prev: Guide[] | undefined, next: Guide[]): Guide[] {
  const had = new Set((prev ?? []).map(guideKey))
  return next.filter(g => !had.has(guideKey(g)))
}
/** How long the cue shows (ms); it fades out over that time (reduced motion: it holds, then goes). */
export const CUE_MS = 420

// ── the long press ─────────────────────────────────────────────────────────
/** A finger held this long (ms) on a frame or layer without moving past the press slop opens the menu. */
export const LONG_PRESS_MS = 500

// ── the share sheet ────────────────────────────────────────────────────────
export interface ShareTarget { url: string; title: string; text?: string }
/** The parts of `navigator` a share uses (the Node checks pass fakes). */
export interface ShareNav { share?: (d: ShareData) => Promise<void>; canShare?: (d: ShareData) => boolean }
/** shared: the share sheet took it; cancelled: the visitor closed it (not an error); copied; manual: show it to copy by hand. */
export type ShareOutcome = 'shared' | 'cancelled' | 'copied' | 'manual'
/** A share sheet left open this long without an answer no longer blocks the next share. */
export const SHARE_STALE_MS = 60000
let pendingSince = 0
/** The browser has a share sheet that takes this link. */
export function canShareLink(nav: ShareNav | undefined, d: ShareTarget): boolean {
  if (typeof nav?.share !== 'function') return false
  try { return typeof nav.canShare !== 'function' || nav.canShare(d) } catch { return false }
}
/**
 * Share a link: the system share sheet when there is one, else (or when the share is refused: no user
 * activation left, not allowed) the clipboard through `copy` (which gives up on a pending write), else
 * `manual`. A cancelled share is `cancelled`, never an error. A share sheet still open (a share that never
 * settles) does not block the next SHARE: that one copies instead.
 */
export async function shareLink(d: ShareTarget, copy: (text: string) => Promise<boolean>, nav: ShareNav | undefined = globalThis.navigator, now = Date.now): Promise<ShareOutcome> {
  if (canShareLink(nav, d) && !(pendingSince && now() - pendingSince < SHARE_STALE_MS)) {
    const at = (pendingSince = now())
    try {
      await nav!.share!({ url: d.url, title: d.title, ...(d.text && { text: d.text }) })
      return 'shared'
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return 'cancelled'
      // NotAllowedError (the tap's activation ran out), DataError, TypeError: the clipboard instead
    } finally { if (pendingSince === at) pendingSince = 0 }
  }
  return (await copy(d.url)) ? 'copied' : 'manual'
}
/** Tests: forget a share sheet left open. */
export const forgetShare = () => { pendingSince = 0 }
