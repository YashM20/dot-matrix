/**
 * Page meta per deep link: `<title>`, description, canonical URL and OG/Twitter tags. Shared by the app
 * (runtime updates as you switch boards) and `scripts/site/pages.ts` (prebuilt `dist/<board>/index.html`
 * copies, so crawlers that don't run JS see the right card). Images are `dist/og/<board>.png`
 * (`scripts/site/og.ts`). Board URLs: `/<board>/` (path) or the older `?board=<id>`; both open the board.
 */
import { boardIds, boardMeta } from '../widgets/manifest'

export const SITE_NAME = 'DOT/480'
export const SITE_TITLE = 'DOT/480 — a field-based dot-matrix UI engine'
export const SITE_DESCRIPTION = 'Interfaces drawn entirely in dots: every card is a field, sampled onto a quantized dot grid and rendered live. Boards, a playground, a Field IR REPL and a drawing board.'

export interface PageMeta { title: string; description: string; path: string; image: string }

/** The board a path like `/light/` names, if any. */
export function boardFromPath(path: string): string | undefined {
  const seg = path.split('/').filter(Boolean)[0]
  return seg && boardIds.includes(seg) ? seg : undefined
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

/**
 * Apply a board's meta to the live document (or the default with no board), and keep the address bar
 * on the board's path so a copied link previews the right board. Other query params (debug flags like
 * `?worker=0`) are kept; `board`, `tab` and `p` are folded into the path.
 */
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
  if (!boardId) return
  const q = new URLSearchParams(location.search)
  for (const k of ['board', 'tab', 'p']) q.delete(k)
  const path = boardId === boardIds[0] && boardFromPath(location.pathname) === undefined ? location.pathname : m.path
  const next = path + (q.size ? `?${q}` : '') + location.hash
  if (next !== location.pathname + location.search + location.hash) history.replaceState(history.state, '', next)
}
