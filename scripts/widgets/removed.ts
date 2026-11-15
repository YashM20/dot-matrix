/**
 * Retired cards (#364, `removedCards` in src/widgets/manifest.ts): every old link of a removed card opens the board it
 * lived on, in the app (`viewFromUrl`, then the address it writes back) and on the server (a vercel.json redirect),
 * and its uid stays reserved in ids.json. Run by `pnpm verify` through `shareChecks()`. Standalone:
 *   npx tsx scripts/widgets/removed.ts
 */
import { catalog } from '../../src/widgets/catalog'
import { boardIds, removedCardBoard, removedCards } from '../../src/widgets/manifest'
import { urlForView, viewFromUrl } from '../../src/site/views'
import { readVercel, route } from '../site/vercel-routes'
import { readIds } from './ids'

type Assert = (name: string, cond: boolean, detail?: string) => void

export function removedChecks(check: Assert) {
  const ids = readIds(), entries = Object.entries(removedCards)
  const reserved = entries.filter(([slug, [uid, board]]) => ids[slug] !== uid || !boardIds.includes(board) || catalog.some(r => r[0] === slug || r[1] === uid)).map(([s]) => s)
  check('share: retired cards keep their uid in ids.json, name a real board and are gone from the catalog', entries.length > 0 && !reserved.length, reserved.join(', '))

  // in the app: the board view, never a widget page, and the address bar becomes the board's path
  const app = entries.flatMap(([slug, [uid, board]]) => [`/widget/${slug}/`, `/widget/${uid}/`, `/${uid}`, `/${uid.toUpperCase()}/`, `/?card=${slug}`, `/light/?card=${uid}&skin=crt`].flatMap(u => {
    const x = new URL(u, 'https://x'), v = viewFromUrl(x.search, x.pathname), url = urlForView(v, x.search, x.pathname)
    return v.view === 'EXPLORE' && v.board === board && !v.all && !v.widget && !v.card && url.split('?')[0] === `/${board}/` && !url.includes('card=') ? [] : [`${u} → ${v.board}${v.widget ? ' (widget)' : ''} ${url}`]
  }))
  check('share: a retired card\'s /widget/<slug|uid>/, /<uid> and ?card= links open its board in the app', !app.length, app.slice(0, 4).join('; '))
  check('share: removedCardBoard ignores current cards, unknown keys and prototype names', removedCardBoard('timer') === undefined && removedCardBoard('constructor') === undefined
    && removedCardBoard('__proto__') === undefined && removedCardBoard('MAT-MARBLE') === 'materials')

  // on the server: one permanent redirect straight to the board (redirects run before files, so no dist is needed)
  const v = readVercel()
  const server = entries.flatMap(([slug, [uid, board]]) => [`/widget/${slug}`, `/widget/${slug}/`, `/widget/${uid}`, `/widget/${uid}/`, `/${uid}`, `/${uid}/`].flatMap(p => {
    const o = route(v, 'dist', p)
    return 'redirect' in o && o.redirect === `/${board}/` && o.permanent ? [] : [`${p}: ${JSON.stringify(o)}`]
  }))
  check('share: vercel.json redirects every retired card path to its board (permanent, one hop)', !server.length, server.slice(0, 4).join('; '))
}

if (/[\\/]scripts[\\/]widgets[\\/]removed\.ts$/.test(process.argv[1] ?? '')) {
  let failures = 0
  removedChecks((name, ok, detail) => { console[ok ? 'log' : 'error'](`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++ })
  if (failures) process.exit(1)
}
