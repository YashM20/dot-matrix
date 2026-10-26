/**
 * The site's three views and MAKE's four modes, and their URLs (docs/UX-PLAN.md §4.1). Pure and DOM-free,
 * so `scripts/verify.ts` checks every old link in Node. Canonical: EXPLORE is the board path (`/light/`; the
 * first board keeps `/`), MAKE is `?make=tune|compose|code|draw` (a DOTS program keeps `&p=`), ABOUT is
 * `?about`. Old links resolve through `TAB_ALIASES`, `?board=`, `boardAliases` and a bare `?p=`.
 */
import { boardIds, resolveBoardId } from '../widgets/manifest'
import { boardFromPath, pageMeta } from './meta'

export const VIEWS = ['EXPLORE', 'MAKE', 'ABOUT'] as const
export type View = typeof VIEWS[number]
export const MODES = ['TUNE', 'COMPOSE', 'CODE', 'DRAW'] as const
export type Mode = typeof MODES[number]
/** One grey line under the MAKE switch, per mode. */
export const MODE_LINES: Record<Mode, string> = { TUNE: "change a preset's look", COMPOSE: 'layer and animate a card', CODE: 'write a field program', DRAW: 'paint dots' }
/** A view, or a MAKE mode (which means MAKE in that mode): what the palette, shell and command layer navigate to. */
export type Place = View | Mode
export const PLACES = ['EXPLORE', ...MODES, 'ABOUT'] as const

/** Every name a view has had: the old `?tab=` values (GALLERY was the henry board, LOG the changelog). */
export const TAB_ALIASES: Readonly<Record<string, Place>> = {
  boards: 'EXPLORE', gallery: 'EXPLORE', workspace: 'TUNE', studio: 'COMPOSE', dots: 'CODE', draw: 'DRAW', log: 'ABOUT',
  explore: 'EXPLORE', make: 'MAKE', about: 'ABOUT', tune: 'TUNE', compose: 'COMPOSE', code: 'CODE',
}
/** The board GALLERY repeated. */
export const GALLERY_BOARD = 'henry'
/** A place by any of its names, old or new, any case. */
export const placeFromName = (name: string): Place | undefined => TAB_ALIASES[name.trim().toLowerCase()]

export interface ViewState { view: View; mode: Mode; board: string; card?: string; essay?: boolean }
export const isMode = (s: string): s is Mode => (MODES as readonly string[]).includes(s)
/** A place as view + mode (a mode means MAKE in it; any other place keeps `mode`). */
export const placeView = (p: Place, mode: Mode = 'TUNE'): { view: View; mode: Mode } => isMode(p) ? { view: 'MAKE', mode: p } : { view: p, mode }

/** The view a URL names (first render, Back / Forward). `card` = the one-card page, `essay` = redirect to the essay. */
export function viewFromUrl(search: string, pathname: string, mode: Mode = 'TUNE'): ViewState {
  const q = new URLSearchParams(search), tab = (q.get('tab') ?? '').toLowerCase(), b = resolveBoardId(q.get('board') ?? '')
  const make = (q.get('make') ?? '').toUpperCase()
  const place: Place = q.has('about') ? 'ABOUT' : isMode(make) ? make : q.has('make') ? 'MAKE' : placeFromName(tab) ?? (q.get('p') ? 'CODE' : 'EXPLORE')
  const board = boardIds.includes(b) ? b : tab === 'gallery' ? GALLERY_BOARD : boardFromPath(pathname) ?? boardIds[0]
  return {
    ...placeView(place, mode), board,
    ...(q.get('card') && { card: q.get('card')! }), ...(tab === 'essay' && { essay: true }),
  }
}

/** The canonical path + query for a view; params that aren't about the view (`?skin`, `?worker`, …) stay. */
export function urlForView(v: Pick<ViewState, 'view' | 'mode' | 'board'>, search: string, pathname: string): string {
  const q = new URLSearchParams(search)
  for (const k of ['tab', 'board', 'make', 'about', 'card']) q.delete(k)
  if (v.view !== 'MAKE' || v.mode !== 'CODE') q.delete('p')
  const head = v.view === 'ABOUT' ? 'about' : v.view === 'MAKE' ? `make=${v.mode.toLowerCase()}` : ''
  const query = [head, q.toString()].filter(Boolean).join('&')
  // the first board keeps whatever non-board path served the page (`/`, `/index.html`)
  const path = v.board === boardIds[0] && boardFromPath(pathname) === undefined ? pathname : pageMeta(v.board).path
  return path + (query ? `?${query}` : '')
}

/** Same place: the view, its mode (MAKE only) and the board. */
export const sameView = (a: Pick<ViewState, 'view' | 'mode' | 'board'>, b: Pick<ViewState, 'view' | 'mode' | 'board'>) =>
  a.view === b.view && a.board === b.board && (a.view !== 'MAKE' || a.mode === b.mode)
