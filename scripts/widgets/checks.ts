/**
 * SHARE S0 checks (docs/SHARE-PLAN.md §3), run by `pnpm verify` through `shareChecks()`: permanent uids
 * (`./ids.ts`), authored + derived metadata (`./meta.ts`), and the widget URL grammar and resolver
 * (src/site/routes.ts, src/site/views.ts). Standalone:
 *   npx tsx scripts/widgets/checks.ts
 */
import { catalog } from '../../src/widgets/catalog'
import { resolveCardId } from '../../src/widgets/manifest'
import { canonicalWidgetUrl, isUid, makeUid, resolveWidget, shortPath, widgetPath, widgetRoute } from '../../src/site/routes'
import { urlForView, viewFromUrl } from '../../src/site/views'
import { widgetPageMeta } from '../../src/site/meta'
import { idsChecks } from './ids'
import { metaChecks, widgetIndex } from './meta'

type Assert = (name: string, cond: boolean, detail?: string) => void

export function shareChecks(check: Assert) {
  idsChecks(check)
  const index = widgetIndex()
  metaChecks(check, index)

  // the uid shape: 8 Crockford characters, ≥ 2 digits, ≥ 1 letter; never i l o u, never a word
  const good = ['k7m2qx9a', '8vw39pnx', '840200e9'], bad = ['k7m2qx9', 'k7m2qx9ab', 'abcdefgh', '12345678', 'k7m2qx9i', 'k7m2qxla', 'K7M2QX9A', 'ui-knob1', 'a1bcdefg']
  check('share: uid pattern accepts Crockford ids and rejects words, numbers, i/l/o/u and other lengths', good.every(isUid) && !bad.some(isUid), [...good.filter(u => !isUid(u)), ...bad.filter(isUid)].join(', '))
  let seed = 7
  const lcg = (b: Uint8Array) => { for (let i = 0; i < b.length; i++) { seed = (seed * 1103515245 + 12345) >>> 0; b[i] = seed >>> 24 } return b }
  const made = Array.from({ length: 500 }, () => makeUid(lcg))
  check('share: makeUid always draws a valid uid and skips taken ones', made.every(isUid) && !new Set(made).has(makeUid(lcg, new Set(made))))

  // URL grammar: /widget/<key>/, /<uid>, [/@scope], ?card=; everything else is not a widget page
  const r = (u: string) => { const x = new URL(u, 'https://x'); return widgetRoute(x.pathname, x.search) }
  const routes: [string, string | undefined, string, string?][] = [
    ['/widget/timer/', 'timer', 'path'], ['/widget/timer', 'timer', 'path'], ['/widget/dykmba98/', 'dykmba98', 'path'], ['/widget/Timer/', 'timer', 'path'],
    ['/dykmba98', 'dykmba98', 'short'], ['/dykmba98/', 'dykmba98', 'short'], ['/@acme/widget/timer/', 'timer', 'path', 'acme'],
    ['/?card=music', 'music', 'card'], ['/light/?card=music&skin=crt', 'music', 'card'],
    ['/', undefined, ''], ['/light/', undefined, ''], ['/timer', undefined, ''], ['/widget/', undefined, ''], ['/widget/a/b/', undefined, ''], ['/metro/', undefined, ''],
  ]
  const off = routes.filter(([u, key, via, scope = '']) => { const g = r(u); return key === undefined ? !!g : !g || g.key !== key || g.via !== via || g.scope !== scope }).map(([u]) => `${u} → ${JSON.stringify(r(u))}`)
  check('share: widget URLs parse (/widget/<slug|uid>/, /<uid>, /@scope/…, ?card=) and board / other paths do not', !off.length, off.join('; '))

  // resolver: uid → slug → cardAliases, against the real catalog; every widget by both keys
  const byBoth = catalog.filter(([slug, uid]) => resolveWidget({ key: slug, scope: '' }, catalog, resolveCardId)?.uid !== uid || resolveWidget({ key: uid, scope: '' }, catalog, resolveCardId)?.slug !== slug)
  check('share: every widget resolves by slug and by uid to the same widget', !byBoth.length && catalog.length === index.length, byBoth.map(r => r[0]).join(', '))
  const lockUid = catalog.find(x => x[0] === 'lock-hourglass')?.[1]
  const aliased = resolveWidget({ key: 'glyph-hourglass', scope: '' }, catalog, resolveCardId)
  check('share: old slugs resolve through cardAliases; unknown keys and scopes do not resolve', aliased?.slug === 'lock-hourglass' && aliased.via === 'alias' && aliased.uid === lockUid
    && !resolveWidget({ key: 'nope', scope: '' }, catalog, resolveCardId) && !resolveWidget({ key: 'timer', scope: 'acme' }, catalog, resolveCardId) && !resolveWidget({ key: 'k7m2qx9z', scope: '' }, catalog, resolveCardId))
  check('share: canonical widget URL is /widget/<slug>/, keeps state params, drops ?card=; short link is /<uid>', canonicalWidgetUrl({ slug: 'timer', scope: '' }, '?card=dykmba98&skin=crt&t=2') === '/widget/timer/?skin=crt&t=2'
    && widgetPath('timer', 'acme') === '/@acme/widget/timer/' && shortPath('dykmba98') === '/dykmba98')

  // views: a widget URL is EXPLORE + widget; leaving it writes the board URL, not the widget path
  const at = (u: string) => { const x = new URL(u, 'https://x'); return viewFromUrl(x.search, x.pathname) }
  const w = at('/widget/timer/?skin=crt'), s = at('/8vw39pnx'), c = at('/?card=music'), m = at('/widget/timer/?make=code')
  check('share: views carry the widget route (EXPLORE), and a MAKE link wins over a widget path', w.view === 'EXPLORE' && w.widget?.key === 'timer' && s.widget?.via === 'short' && c.widget?.key === 'music' && c.card === 'music' && m.view === 'MAKE' && !m.widget)
  check('share: leaving a widget page writes the board URL (/, /light/, ?make=)', urlForView({ view: 'EXPLORE', mode: 'TUNE', board: 'henry' }, '?skin=crt', '/widget/timer/') === '/?skin=crt'
    && urlForView({ view: 'EXPLORE', mode: 'TUNE', board: 'light' }, '', '/8vw39pnx') === '/light/' && urlForView({ view: 'MAKE', mode: 'CODE', board: 'henry' }, '', '/widget/timer/') === '/?make=code')
  const timer = index.find(x => x.slug === 'timer')!, pm = widgetPageMeta(timer)
  check('share: widget page meta: title, blurb description, canonical slug path, OG image by uid', pm.title === 'Timer · DOT/480' && pm.description.startsWith(timer.blurb) && pm.path === '/widget/timer/' && pm.image === `/og/widget/${timer.uid}.png`)
}

if (/[\\/]scripts[\\/]widgets[\\/]checks\.ts$/.test(process.argv[1] ?? '')) {
  let failures = 0
  shareChecks((name, ok, detail) => { console[ok ? 'log' : 'error'](`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++ })
  if (failures) process.exit(1)
}
