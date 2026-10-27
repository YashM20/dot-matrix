/**
 * What a widget leaves the site as (docs/SHARE-PLAN.md §5): pure string builders, no DOM, testable in Node.
 * The card frame matches `stillPNG`: the dots on the card surface with 14 px padding and the card's corner.
 */
import type { DotInstance } from '../engine/types'
import { renderSVG } from '../engine/renderer/svgRenderer'

export interface CardFrame { width: number; height: number; background: string; border?: string; radius?: number; pad?: number }
export interface CardCredit { name: string; slug: string; url: string }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A standalone card SVG: surface, hairline border, the dots, a `<title>` and a credit comment with the widget's URL. */
export function cardSVG(dots: DotInstance[], f: CardFrame, c: CardCredit): string {
  const pad = f.pad ?? 14, W = f.width + pad * 2, H = f.height + pad * 2, r = f.radius ?? 16
  const inner = renderSVG(dots, f.width, f.height).replace('<svg ', `<svg x="${pad}" y="${pad}" `)
  return `<!-- dot480 card ${c.slug} · ${c.url} -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(c.name)}">`
    + `<title>${esc(c.name)} · DOT/480</title>`
    + `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="${r}" fill="${esc(f.background)}"${f.border ? ` stroke="${esc(f.border)}"` : ''}/>${inner}</svg>\n`
}

/** Static HTML: the card SVG inline, linked to its page. No script, so it pastes into email, docs and CMS blocks. */
export function cardHTML(svg: string, c: CardCredit): string {
  const body = svg.replace(/^<!--[^]*?-->\n/, '').trim()
  return `<!-- dot480 card ${c.slug} -->\n<a href="${esc(c.url)}" title="${esc(c.name)} · DOT/480" style="display:inline-block;line-height:0">${body}</a>\n`
}
