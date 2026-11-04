/**
 * `dist/404.html` (issue #146): the page Vercel serves, with status 404, for any path no file or rewrite matches.
 * The "404" is drawn by the engine (text fields → grid sampler → SVG renderer) at build time, so the page needs no
 * script: no CSP grant, no app bundle. Colours follow the visitor's scheme through `prefers-color-scheme`.
 */
import { textAt, textSize } from '../../src/engine/layout'
import { sampleLayers } from '../../src/engine/sampler/gridSampler'
import { renderSVG } from '../../src/engine/renderer/svgRenderer'
import { dot480 } from '../../src/engine/theme/tokens'
import type { DotStyle, Field, Layer } from '../../src/engine/types'
import { boardGroups, boardLabel } from '../../src/widgets/manifest'
import { SITE_NAME } from '../../src/site/meta'
import { esc } from './seo-html'

const PITCH = 5

/** The dot "404" with a NOT FOUND line under it, on a faint dot ground. Fills are classes, so CSS picks the scheme. */
export function notFoundSvg(): string {
  const big = { smooth: true, scale: 2 } as const, [bw, bh] = textSize('404', big), [sw, sh] = textSize('NOT FOUND')
  const cols = Math.max(bw, sw) + 8, rows = 4 + bh + 5 + sh + 4, grid = { cols, rows, pitch: PITCH }
  const ground: Field = () => 0.3
  const layers: Layer[] = [
    { field: ground, tone: 'faint' },
    { field: textAt(grid, '404', Math.floor(cols / 2), 4, { ...big, align: 'center' }), tone: 'active' },
    { field: textAt(grid, 'NOT FOUND', Math.floor(cols / 2), 4 + bh + 5, { align: 'center' }), tone: 'idle' },
  ]
  const style: DotStyle = { shape: 'circle', sizeMin: 0, sizeMax: PITCH * 0.42, opacityMode: 'constant', quantizeSteps: 4 }
  const svg = renderSVG(sampleLayers(layers, grid, style, dot480), cols * PITCH, rows * PITCH)
  const cls: Record<string, string> = { [dot480.dotActive]: 'a', [dot480.dotIdle]: 'i', [dot480.dotFaint!]: 'f' }
  return svg.replace(/<g fill="([^"]+)"/g, (all, c: string) => (cls[c] ? `<g class="${cls[c]}"` : all))
    .replace('<svg ', '<svg role="img" aria-label="404, not found" ')
}

/** The whole page: the dot 404, a line, and links home and to every board. */
export function notFoundPage(): string {
  const boards = boardGroups.filter(g => g.id !== 'start').flatMap(g => g.boards as readonly string[])
  const links = boards.map(id => `<li><a href="/${id}/">${esc(boardLabel(id))}</a></li>`).join('')
  const css = [
    ':root{color-scheme:dark;--bg:#070809;--value:#F2F3F5;--mute:#81858B;--a:#FF3B30;--i:#8A8F98;--f:#2E3033}',
    '@media (prefers-color-scheme: light){:root{color-scheme:light;--bg:#F2EFEF;--value:#1C1A1A;--mute:#676261;--a:#E43226;--i:#484846;--f:#D1D1CF}}',
    'body{margin:0;min-height:100svh;display:grid;place-items:center;background:var(--bg);color:var(--value);font:15px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
    'main{max-width:40rem;padding:48px 24px}svg{display:block;width:100%;max-width:380px;height:auto;margin-bottom:24px}',
    '.a{fill:var(--a)}.i{fill:var(--i)}.f{fill:var(--f)}',
    'p{margin:0 0 16px}a{color:inherit;text-underline-offset:3px}ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px 16px;color:var(--mute)}',
    'h2{font-size:12px;letter-spacing:.12em;color:var(--mute);margin:32px 0 12px}',
  ].join('')
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex" />
    <meta name="color-scheme" content="dark light" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <title>Not found · ${SITE_NAME}</title>
    <style>${css}</style>
  </head>
  <body>
    <main>
      ${notFoundSvg()}
      <p>There is no page at this address. It may have moved, or the link has a typo.</p>
      <p><a href="/">Go to the home board</a> or <a href="/blog/">read the blog</a>.</p>
      <h2>BOARDS</h2>
      <ul>${links}</ul>
    </main>
  </body>
</html>
`
}
