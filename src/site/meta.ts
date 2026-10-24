/**
 * Page meta per deep link: `<title>`, description, canonical URL and OG/Twitter tags. Shared by the app
 * (runtime updates as you switch boards) and `scripts/site/postbuild.ts` (prebuilt `dist/<board>/index.html`
 * copies, so crawlers that don't run JS see the right card). Images are `dist/og/<board>.png`
 * (`scripts/og.ts`). Board URLs: `/<board>/` (path) or the older `?board=<id>`; both open the board.
 */
import { boardIds, boardMeta, resolveBoardId } from '../widgets/manifest'

export const SITE_NAME = 'DOT/480'
export const SITE_TITLE = 'DOT/480 — a field-based dot-matrix UI engine'
export const SITE_DESCRIPTION = 'Interfaces drawn entirely in dots: every card is a field, sampled onto a quantized dot grid and rendered live. Boards, a playground, a Field IR REPL and a drawing board.'

export interface PageMeta { title: string; description: string; path: string; image: string }

/** The board a path like `/light/` names, if any. */
export function boardFromPath(path: string): string | undefined {
  const seg = path.split('/').filter(Boolean)[0], id = seg && resolveBoardId(seg)
  return id && boardIds.includes(id) ? id : undefined
}

/** Meta for a board's deep link, or the site default (`boardId` undefined or unknown). */
export function pageMeta(boardId?: string): PageMeta {
  const b = boardId ? boardMeta(boardId) : undefined
  if (!b) return { title: SITE_TITLE, description: SITE_DESCRIPTION, path: '/', image: '/og/default.png' }
  return {
    title: `${b.title} · ${SITE_NAME}`,
    description: `The ${b.id.toUpperCase()} board of DOT/480, a field-based dot-matrix UI engine: every card is a field sampled onto a quantized dot grid and rendered live.`,
    path: `/${b.id}/`,
    image: `/og/${b.id}.png`,
  }
}

/** `[attribute, key, content]` for every meta tag a page carries; `origin` makes URLs absolute (OG needs that). */
export function metaTags(m: PageMeta, origin = ''): [attr: 'name' | 'property', key: string, content: string][] {
  const url = origin + m.path, image = origin + m.image
  return [
    ['name', 'description', m.description],
    ['property', 'og:type', 'website'],
    ['property', 'og:site_name', SITE_NAME],
    ['property', 'og:title', m.title],
    ['property', 'og:description', m.description],
    ['property', 'og:url', url],
    ['property', 'og:image', image],
    ['property', 'og:image:width', '1200'],
    ['property', 'og:image:height', '630'],
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:title', m.title],
    ['name', 'twitter:description', m.description],
    ['name', 'twitter:image', image],
  ]
}

/** Apply a board's meta to the live document, or the site default with no board. */
export function setPageMeta(boardId?: string) {
  const m = pageMeta(boardId)
  document.title = m.title
  for (const [attr, key, content] of metaTags(m, location.origin)) {
    let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
    if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.append(el) }
    el.content = content
  }
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.append(canonical) }
  canonical.href = location.origin + m.path
}

/**
 * Keep the address bar on the view, so a copied link opens it and Back / Forward walk the views
 * (docs/UX-PLAN.md U0). The path names the board (`/light/`; the first board keeps `/`), `?tab=<view>`
 * names any other view, and the older `?board=` folds into the path. Other params (`?worker=0`,
 * `?skin=`, the DOTS `?p=`) stay. `push` adds a history entry; the first render only replaces.
 */
export function syncUrl(tab: string, boardId: string, push: boolean) {
  const q = new URLSearchParams(location.search)
  q.delete('board')
  if (tab === 'BOARDS') q.delete('tab'); else q.set('tab', tab.toLowerCase())
  if (tab !== 'DOTS') q.delete('p')
  const path = boardId === boardIds[0] && boardFromPath(location.pathname) === undefined ? location.pathname : pageMeta(boardId).path
  const next = path + (q.size ? `?${q}` : '') + location.hash
  if (next === location.pathname + location.search + location.hash) return
  if (push) history.pushState(null, '', next); else history.replaceState(history.state, '', next)
}
