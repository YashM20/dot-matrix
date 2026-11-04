/**
 * Page meta per deep link: `<title>`, description, canonical URL and OG/Twitter tags. Shared by the app
 * (runtime updates as you switch boards) and `scripts/site/postbuild.ts` (prebuilt `dist/<board>/index.html`
 * copies, so crawlers that don't run JS see the right card). Images are `dist/og/<board>.png`
 * (`scripts/og.ts`). Board URLs: `/<board>/` (path) or the older `?board=<id>`; both open the board.
 * A board's description leads with its blurb (`src/widgets/blurbs.ts`): postbuild passes the blurbs in, the app
 * loads their chunk (the one the first board fetches anyway) and fills them in once it lands.
 */
import { boardIds, boardLabel, boardMeta, resolveBoardId } from '../widgets/manifest'
import { widgetPath } from './routes'

export const SITE_NAME = 'MATRIX'
export const SITE_TITLE = 'MATRIX · a field-based dot-matrix UI engine'
export const SITE_DESCRIPTION = 'Interfaces drawn entirely in dots: every card is a field, sampled onto a quantized dot grid and rendered live. Boards, a playground, a Field IR REPL and a drawing board.'
export const SITE_LOCALE = 'en_US'
const PRODUCTION = 'https://matrix.reactopia.me'
const ENV: Record<string, unknown> = import.meta.env ?? {}
/**
 * The site's origin in the app's canonical and OG URLs: `VITE_SITE_URL` when a build sets it (an `https://host`
 * origin, anything else is ignored), else the production domain. Never `location.origin`, so a preview or another
 * alias of the deployment never names itself as the canonical page.
 */
export const SITE_URL = typeof ENV.VITE_SITE_URL === 'string' && /^https:\/\/[a-z0-9.-]+(:\d+)?\/?$/i.test(ENV.VITE_SITE_URL) ? ENV.VITE_SITE_URL.replace(/\/+$/, '') : PRODUCTION

export interface PageMeta { title: string; description: string; path: string; image: string; /** The OG image's alt text. */ imageAlt?: string }
type Blurbs = Readonly<Partial<Record<string, string>>>
let loadedBlurbs: Blurbs | undefined
const defaultAlt = 'A dot-matrix card from MATRIX, drawn in lit dots on a dark panel.'

/** The board a path like `/light/` names, if any. */
export function boardFromPath(path: string): string | undefined {
  const seg = path.split('/').filter(Boolean)[0], id = seg && resolveBoardId(seg)
  return id && boardIds.includes(id) ? id : undefined
}

/**
 * Meta for a board's deep link, or the site default (`boardId` undefined or unknown). `blurbs` defaults to the ones
 * the app has loaded; without a blurb the description is the board's templated line.
 */
export function pageMeta(boardId?: string, blurbs: Blurbs | undefined = loadedBlurbs): PageMeta {
  const b = boardId ? boardMeta(boardId) : undefined
  if (!b) return { title: SITE_TITLE, description: SITE_DESCRIPTION, path: '/', image: '/og/default.png', imageAlt: defaultAlt }
  const blurb = blurbs?.[b.id], label = boardLabel(b.id)
  return {
    title: `${b.title} · ${SITE_NAME}`,
    description: blurb ? `${blurb} The ${label} board of MATRIX, where every card is a live dot field.` : `The ${label} board of MATRIX, a field-based dot-matrix UI engine: every card is a field sampled onto a quantized dot grid and rendered live.`,
    path: `/${b.id}/`,
    image: `/og/${b.id}.png`,
    imageAlt: `A card from the ${label} board of MATRIX, drawn in dots.`,
  }
}

/** What a widget page's meta needs (a subset of `WidgetMeta`, src/widgets/meta.ts). */
export interface WidgetPageInfo { slug: string; uid: string; name: string; blurb: string; board: string; scope?: string }
/** A card's name without its board numbering (`01 Home` → `Home`). */
export const widgetTitle = (name: string): string => name.replace(/^\d{2}\s+/, '').trim() || name

/** Meta for a widget page: canonical `/widget/<slug>/`, OG image `/og/widget/<uid>.png` (keyed by uid, so a rename keeps cached previews). */
export function widgetPageMeta(w: WidgetPageInfo): PageMeta {
  const name = widgetTitle(w.name)
  return {
    title: `${name} · ${SITE_NAME}`,
    description: `${w.blurb ? `${w.blurb} ` : ''}A dot-matrix widget from the ${boardLabel(w.board)} board of MATRIX: a field sampled onto a quantized dot grid and rendered live.`,
    path: widgetPath(w.slug, w.scope),
    image: `/og/widget/${w.uid}.png`,
    imageAlt: `${name}, a dot-matrix card from the ${boardLabel(w.board)} board of MATRIX.`,
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
    ['property', 'og:image:alt', m.imageAlt ?? defaultAlt],
    ['property', 'og:locale', SITE_LOCALE],
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:title', m.title],
    ['name', 'twitter:description', m.description],
    ['name', 'twitter:image', image],
    ['name', 'twitter:image:alt', m.imageAlt ?? defaultAlt],
  ]
}

let shown: string | PageMeta | undefined
/** Apply a board's meta to the live document, or the site default with no board; or any page's `PageMeta`. */
export function setPageMeta(boardId?: string | PageMeta) {
  shown = boardId
  const m = typeof boardId === 'object' ? boardId : pageMeta(boardId)
  document.title = m.title
  for (const [attr, key, content] of metaTags(m, SITE_URL)) {
    let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
    if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.append(el) }
    el.content = content
  }
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.append(canonical) }
  canonical.href = SITE_URL + m.path
  // a board without its blurb yet: fetch the blurbs chunk, then redo the tags if that board is still the page
  if (typeof boardId === 'string' && !loadedBlurbs && boardMeta(boardId)) {
    void import('../widgets/blurbs').then(b => { loadedBlurbs = b.boardBlurbs; if (shown === boardId) setPageMeta(boardId) }, () => {})
  }
}

/** Mark the live page `noindex` (a missing widget) or drop the mark; `setPageMeta` leaves it alone. */
export function setNoIndex(on: boolean) {
  let el = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')
  if (!on) { el?.remove(); return }
  if (!el) { el = document.createElement('meta'); el.name = 'robots'; document.head.append(el) }
  el.content = 'noindex'
}

/**
 * Keep the address bar on the view, so a copied link opens it and Back / Forward walk the views
 * (docs/UX-PLAN.md U0, U3). `pathAndQuery` is the view's canonical URL (`urlForView` in `./views`: the
 * board path, `?make=<mode>`, `?about`; other params stay). `push` adds a history entry; otherwise it
 * only replaces (the first render, or an older URL form of the same view).
 */
export function syncUrl(pathAndQuery: string, push: boolean) {
  const next = pathAndQuery + location.hash
  if (next === location.pathname + location.search + location.hash) return
  if (push) history.pushState(null, '', next); else history.replaceState(history.state, '', next)
}
