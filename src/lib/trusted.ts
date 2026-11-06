/**
 * Trusted Types (#149). vercel.json sends `require-trusted-types-for 'script'` and
 * `trusted-types dot480-svg default` in a Content-Security-Policy-Report-Only header for now: a supporting browser
 * reports a plain string at every HTML, script and script-URL sink. Moved into the enforced CSP, it refuses them. The site has two kinds of sink, and this module holds the only two policies:
 *  - HTML: the SVG renderer's markup, set by React's `dangerouslySetInnerHTML` in DotCanvas → `svgHtml()` (policy
 *    `dot480-svg`). It passes only an `<svg>` built from the renderer's own elements, with no event-handler
 *    attribute and no link but a local `#id`; anything else becomes an empty string (the card shows nothing, and a
 *    warning says why).
 *  - script URLs: `new Worker(...)` (the sample worker and the Field IR sandbox worker, from Vite's
 *    `new URL(..., import.meta.url)`, and the audio clock's blob) → the `default` policy, which passes this origin's
 *    own files and blobs only. It has no
 *    `createHTML` and no `createScript`, so any other string at a sink is refused, and `new Function` stays off
 *    (Field IR never tries it in a browser; it uses its closure tree).
 * Every page entry (`src/main.tsx`, `src/blog/main.tsx`, `src/lab/main.tsx`) imports this module second, so the
 * policies exist before any worker starts; workers/client.ts and audio/scheduler.ts import it too. HTML is built with
 * DOM calls everywhere else (the analytics banner included). Browsers without
 * Trusted Types skip it all: `svgHtml` hands the string back, and the CSP directives are ignored.
 * `scripts/site/csp-browser.ts` serves the build with the production CSP and checks no page trips it.
 */
interface Policy { createHTML?(s: string): unknown; createScriptURL?(s: string): unknown }
interface Factory { createPolicy(name: string, rules: { createHTML?: (s: string) => string; createScriptURL?: (s: string) => string }): Policy }

const tt = (globalThis as { trustedTypes?: Factory }).trustedTypes
const origin = typeof location !== 'undefined' ? location.origin : ''

/** A script URL for a worker: this origin's file (http/https) or a blob this origin made; else it throws. */
export function sameOriginScript(url: string): string {
  const u = new URL(url, typeof location !== 'undefined' ? location.href : undefined)
  const ok = u.protocol === 'blob:' ? url.startsWith(`blob:${origin}/`) : (u.protocol === 'https:' || u.protocol === 'http:') && u.origin === origin
  if (!ok) throw new TypeError(`Trusted Types: script URL refused (${u.protocol}//${u.host})`)
  return url
}

/** The elements `renderSVG` (engine/renderer/svgRenderer.ts) and the squares renderer (engine/squares/svg.ts) write. */
const SVG_TAGS = new Set(['svg', 'defs', 'g', 'path', 'use', 'rect', 'circle', 'title'])
/** The renderer's SVG markup as-is, once it is checked to be nothing else; anything else gives ''. */
export function checkSvg(svg: string): string {
  const tags = [...svg.matchAll(/<\/?([^\s/>]+)/g)].map(m => m[1])
  const ok = svg === '' || (svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"') && tags.every(t => SVG_TAGS.has(t))
    && !/\son[a-z]+\s*=/i.test(svg) && [...svg.matchAll(/\shref\s*=\s*"([^"]*)"/gi)].every(m => /^#[\w-]+$/.test(m[1])) && !/<!|<\?|javascript:/i.test(svg))
  if (!ok) console.warn('Trusted Types: markup refused (not the SVG renderer\'s)')
  return ok ? svg : ''
}

let svgPolicy: Policy | undefined
if (tt) {
  // `default` takes the strings Vite's worker code and the audio clock pass to `new Worker`; one per page, so a second
  // copy of this module (there is none) would find the name taken and leave the first in charge
  try { tt.createPolicy('default', { createScriptURL: sameOriginScript }) } catch { /* already made */ }
  try { svgPolicy = tt.createPolicy('dot480-svg', { createHTML: checkSvg }) } catch { /* already made */ }
}

/**
 * The SVG renderer's markup for `dangerouslySetInnerHTML` (React sets `__html` on `innerHTML` as it is, so a
 * TrustedHTML passes the CSP). Typed as a string for React; without Trusted Types it is the string, checked.
 */
export const svgHtml = (svg: string): string => (svgPolicy?.createHTML ? svgPolicy.createHTML(svg) : checkSvg(svg)) as string
