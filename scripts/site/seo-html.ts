/**
 * The crawlable markup `scripts/site/seo.ts` puts into the built pages (issue #146): plain HTML strings, no DOM.
 * Every page's root gets a block a crawler can read without running JS (headings, blurbs, links). React's
 * `createRoot` replaces the root on mount, so nothing hydrates against it. The block is visually hidden while the
 * app loads (no flash) and shown as a plain page when scripts are off (`<noscript>`). It is never `display:none`.
 */
import { boardGroups, boardLabel, boardManifest } from '../../src/widgets/manifest'
import { boardBlurbs, conceptCredit, groupBlurbs } from '../../src/widgets/blurbs'
import { ABOUT_META, ABOUT_PATH, SITE_DESCRIPTION, SITE_NAME, widgetTitle } from '../../src/site/meta'
import { releases } from '../../src/changelog'
import { BLOG, POSTS, postPath, type PostInfo } from '../../src/blog/posts'
import { EXPERIMENTS, LAB, experimentPath } from '../../src/lab/experiments'
import { inline, parse, tex, type Block, type Inline, type ListBlock } from '../../src/blog/markdown'
import { flag } from '../../src/site/flags'
import { BROWSE_META, BROWSE_PATH } from '../../src/site/browse'

/** The fields of a `dist/widgets.json` row this step reads. */
export interface WidgetRow { slug: string; uid: string; name: string; blurb: string; board: string; boards: string[]; tags: string[]; url: string }

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** schema.org JSON-LD as a data block (not script: CSP-safe); `<` escaped so text can never close the element. */
export const jsonLd = (o: object) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`

/** The class of the static block, and the head styles that hide it while the app loads and show it without JS. */
export const STATIC_CLASS = 'dot-static'
const HIDE = `.${STATIC_CLASS}{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}`
const SHOW = `.${STATIC_CLASS}{position:static;width:auto;height:auto;margin:0 auto;padding:24px;overflow:visible;clip:auto;clip-path:none;white-space:normal;max-width:68ch;font:16px/1.6 system-ui,sans-serif}`
  + `.${STATIC_CLASS} a{color:inherit}.${STATIC_CLASS} pre{white-space:pre-wrap}`
export const staticStyles = (): string => `<style>${HIDE}</style><noscript><style>${SHOW}</style></noscript>`

const boardTitle = (id: string) => boardManifest.find(b => b.id === id)?.title ?? id.toUpperCase()
const boardLink = (id: string) => `<a href="/${id}/">${esc(boardLabel(id))}</a>`
const siteNav = (...extra: string[]) => `<nav><a href="/">${SITE_NAME}</a>${extra.map(x => ` / ${x}`).join('')}</nav>`
const wrap = (body: string) => `<div class="${STATIC_CLASS}">${body}</div>`
/** "A, B and C" */
const andList = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

/** The home page: what the site is, every board by group, and the other pages. */
export function homeBody(): string {
  const groups = boardGroups.filter(g => g.id !== 'start').map(g => `<h2>${esc(g.label)}</h2><p>${esc(groupBlurbs[g.id])}</p><ul>${g.boards
    .map(id => `<li>${boardLink(id)}: ${esc(boardBlurbs[id])}</li>`).join('')}</ul>`).join('')
  const more = [
    `<li><a href="${postPath()}">Blog</a>: ${esc(BLOG.dek)}</li>`, ...(flag('lab') ? [`<li><a href="${LAB.path}">Lab</a>: ${esc(LAB.dek)}</li>`] : []),
    `<li><a href="${ABOUT_PATH}">About</a>: ${esc(ABOUT_META.description)}</li>`, '<li><a href="/privacy">Privacy</a></li>', '<li><a href="/terms">Terms</a></li>',
  ].join('')
  return wrap(`<h1>${SITE_NAME}</h1><p>${esc(SITE_DESCRIPTION)}</p><p><a href="${BROWSE_PATH}">Browse every card</a></p>${groups}<h2>More</h2><ul>${more}</ul>`)
}

/** A board page: its title, its blurb and a link to every card's widget page. */
export function boardBody(id: string, cards: readonly WidgetRow[]): string {
  const list = cards.map(w => `<li><a href="${esc(w.url)}">${esc(widgetTitle(w.name))}</a>: ${esc(w.blurb)}</li>`).join('')
  return wrap(`${siteNav(boardLink(id))}<h1>${esc(boardTitle(id))}</h1><p>${esc(boardBlurbs[id as keyof typeof boardBlurbs] ?? '')}</p>`
    + `<h2>${cards.length} card${cards.length === 1 ? '' : 's'}</h2><ul>${list}</ul><p><a href="/">All boards</a></p>`)
}

/** BROWSE (#182): every card by board group, each linking its widget page. */
export function browseBody(widgets: readonly WidgetRow[]): string {
  const groups = boardGroups.filter(g => g.id !== 'start').map(g => `<h2>${esc(g.label)}</h2><ul>${widgets.filter(w => (g.boards as readonly string[]).includes(w.board))
    .map(w => `<li><a href="${esc(w.url)}">${esc(widgetTitle(w.name))}</a> (${boardLink(w.board)}): ${esc(w.blurb)}</li>`).join('')}</ul>`).join('')
  return wrap(`${siteNav(`<a href="${BROWSE_PATH}">Browse</a>`)}<h1>Browse every card</h1><p>${esc(BROWSE_META.description)}</p>${groups}<p><a href="/">All boards</a></p>`)
}

/** A widget page: the card's name and blurb, and the boards that show it. */
export function widgetBody(w: WidgetRow): string {
  const on = w.boards.length ? w.boards : [w.board]
  return wrap(`${siteNav(boardLink(w.board))}<h1>${esc(widgetTitle(w.name))}</h1><p>${esc(w.blurb)}</p>`
    + `<p>A dot-matrix card on the ${andList(on.map(boardLink))} board${on.length === 1 ? '' : 's'}.</p>`
    + (w.tags.length ? `<p>Tags: ${esc(w.tags.join(', '))}</p>` : '') + `<p><a href="/">All boards</a></p>`)
}

/** The blog index: every post with its line and date. */
export function blogIndexBody(): string {
  const list = POSTS.map(p => `<li><a href="${postPath(p.slug)}">${esc(p.title)}</a>: ${esc(p.dek)} <time datetime="${p.date}">${p.date}</time></li>`).join('')
  return wrap(`${siteNav(`<a href="${postPath()}">Blog</a>`)}<h1>Blog</h1><p>${esc(BLOG.dek)}</p><ul>${list}</ul>`)
}

/**
 * ABOUT (`/about/`): what this is, the links, the credits and the visitor log, as `src/components/About.tsx` shows them
 * with the `make` flag off (its default). The app's view replaces this block on mount.
 */
export function aboutBody(): string {
  const c = conceptCredit, log = releases.map(r => `<li><b>${esc(r.version)}</b> <time datetime="${esc(r.date)}">${esc(r.date)}</time>: ${esc(r.title)}. ${esc(r.summary)}</li>`).join('')
  return wrap(`${siteNav(`<a href="${ABOUT_PATH}">About</a>`)}<h1>About</h1>`
    + `<p>${SITE_NAME} runs on Dot/480, an interface engine where everything you see is dots. Every card is a field, a function that says how bright each point is; a sampler reads it onto a quantized grid of dots, and a renderer (SVG, Canvas or WebGL) draws them, live. EXPLORE has the boards.</p>`
    + `<p><a href="/blog/dot-matrix-essay/">How it works: the essay</a> · <a href="${postPath()}">Blog</a> · <a href="https://github.com/YashM20/dot-matrix">Source</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p>`
    + `<h2>Credits</h2><p>This project started from the ESP-Mosaico concept screens for a 480 × 480 OLED device by <a href="${esc(c.profile)}" rel="noreferrer">${esc(c.by)} (${esc(c.handle)})</a>. The first seven boards rebuild his sheets, and the 480 in Dot/480 is his screen. Cards built on someone else's work name it on their own page. The full list is in <a href="https://github.com/YashM20/dot-matrix/blob/main/docs/CREDITS.md">CREDITS.md</a>.</p>`
    + `<h2>What changed</h2><ul>${log}</ul>`)
}

/** The lab index: every piece with its line. */
export function labBody(): string {
  const list = EXPERIMENTS.map(x => `<li><a href="${experimentPath(x.slug)}">${esc(x.title)}</a>: ${esc(x.dek)}</li>`).join('')
  return wrap(`${siteNav(`<a href="${LAB.path}">Lab</a>`)}<h1>${esc(LAB.title)}</h1><p>${esc(LAB.dek)}</p><ul>${list}</ul>`)
}

// ── a markdown post as static HTML (the same parser the blog uses, src/blog/markdown.ts) ──

const maths = (src: string) => tex(src).map(r => (r.t === 'text' ? esc(r.s) : `<${r.t}>${esc(r.s)}</${r.t}>`)).join('')
/** A link as the blog writes it: another post's file becomes its page, an outside link gets `rel=noreferrer`. */
function href(h: string): string {
  const md = /^([a-z0-9-]+)\.md(#.*)?$/.exec(h)
  return md ? postPath(md[1]) + (md[2] ?? '') : h
}
function spans(c: Inline[]): string {
  return c.map(x => {
    switch (x.t) {
      case 'text': return esc(x.s)
      case 'code': return `<code>${esc(x.s)}</code>`
      case 'math': return maths(x.s)
      case 'b': return `<b>${spans(x.c)}</b>`
      case 'i': return `<em>${spans(x.c)}</em>`
      case 'a': return `<a href="${esc(href(x.href))}"${/^https?:/.test(x.href) ? ' rel="noreferrer"' : ''}>${spans(x.c)}</a>`
    }
  }).join('')
}
const list = (b: ListBlock): string => {
  const items = b.items.map(it => `<li>${spans(it.c)}${it.sub ? list(it.sub) : ''}</li>`).join('')
  return b.ordered ? `<ol${b.start === 1 ? '' : ` start="${b.start}"`}>${items}</ol>` : `<ul>${items}</ul>`
}
/** One block; a live-card figure becomes its caption and a link to the card's page, other figure notes are left out. */
function block(b: Block, widgets: ReadonlySet<string>): string {
  switch (b.t) {
    case 'p': return `<p>${spans(b.c)}</p>`
    case 'list': return list(b)
    case 'code': return `<pre><code>${esc(b.text)}</code></pre>`
    case 'math': return `<p>${maths(b.tex)}</p>`
    case 'h': return b.level === 1 ? '' : `<h${b.level} id="${esc(b.id)}">${spans(inline(b.text))}</h${b.level}>`
    case 'visual': {
      if (b.kind !== 'card' || !widgets.has(b.what)) return ''
      const cap = b.notice ? b.notice[0].toUpperCase() + b.notice.slice(1) + (/[.!?]$/.test(b.notice) ? '' : '.') : ''
      return `<figure><figcaption>${esc(cap)} <a href="/widget/${esc(b.what)}/">Open the card</a></figcaption></figure>`
    }
  }
}

/** A post's page: its title and line, then the whole text for a markdown post (the essay is a TSX page: title and line only). */
export function postBody(p: PostInfo, md: string | undefined, widgets: ReadonlySet<string>): string {
  const head = `${siteNav(`<a href="${postPath()}">Blog</a>`)}<article><h1>${esc(p.title)}</h1><p>${esc(p.dek)}</p><p><time datetime="${p.date}">${p.date}</time></p>`
  const text = md === undefined ? '' : parse(md).map(b => block(b, widgets)).join('')
  return wrap(`${head}${text}</article><p><a href="${postPath()}">All posts</a></p>`)
}
