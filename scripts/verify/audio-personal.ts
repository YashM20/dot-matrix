/**
 * AUDIO (#259) and PERSONAL (#256) card checks for `pnpm verify`: one per bug fixed on those boards.
 * Run alone: `pnpm exec tsx scripts/verify/audio-personal.ts`.
 */
import { describe } from '../../src/engine/describe'
import { catalog } from '../../src/widgets/catalog'
import { cardBlurbs } from '../../src/widgets/meta'
import { cardNames } from '../../src/widgets/names'
import { removedCards } from '../../src/widgets/manifest'
import { urlForView, viewFromUrl } from '../../src/site/views'
import { readVercel, route } from '../site/vercel-routes'
import { sampleLayers } from '../../src/engine/sampler/gridSampler'
import { boardById, widgetById } from '../../src/widgets'
import { theme, visible } from '../lib/stats'
import type { Assert } from '../lib/check'

const card = (id: string) => {
  const p = widgetById(id)
  if (!p) throw new Error(`no card ${id}`)
  return p
}
const shows = (id: string, ctx: Parameters<typeof describe>[1] = {}) => describe(card(id), ctx).text

export function audioPersonalChecks(assert: Assert) {
  // removed cards (thermal-puppy, #343): gone from the board, catalog, names and blurbs; every old link opens the board it was on,
  // in the app (`viewFromUrl`, then the URL written back) and on the server (a vercel.json 301), never a missing-widget page or 404
  {
    const vercel = readVercel(), bad: string[] = []
    for (const [slug, uid, board] of removedCards) {
      const left = [boardById(board)?.items.some(p => p.id === slug), catalog.some(r => r[0] === slug), slug in cardNames, slug in cardBlurbs]
      if (left.some(Boolean)) bad.push(`${slug} still listed (${left})`)
      for (const [path, search] of [[`/widget/${slug}/`, ''], [`/widget/${slug}`, ''], [`/${uid}`, ''], [`/${uid}/`, ''], ['/', `?card=${slug}`]]) {
        const v = viewFromUrl(search, path), url = urlForView(v, search, path)
        if (v.widget || v.all || v.board !== board || url !== `/${board}/`) bad.push(`app ${path}${search} → ${v.widget ? 'widget page' : url}`)
        if (search) continue
        const r = route(vercel, 'dist', path)
        if (!('redirect' in r) || r.redirect !== `/${board}/` || !r.permanent) bad.push(`vercel ${path} → ${'redirect' in r ? r.redirect : 'no redirect'}`)
      }
    }
    assert('cards: a removed card is gone from the site and its old links open its board', !bad.length, bad.join('; '))
  }
  // interpreter: the translated line is baked dots, so it draws with no system CJK font (Node has no document at all)
  {
    const p = card('interpreter'), pitch = p.grid.pitch ?? theme.gridPx
    const line = sampleLayers(p.layers({ t: 0, data: { ...p.defaults } }), p.grid, p.style, theme)
      .filter(d => visible(d) && d.y / pitch >= 117 && d.x / pitch > 30 && d.x / pitch < 114)
    assert('audio: interpreter draws 开始吧 without a CJK font', line.length > 60, `${line.length} dots`)
    assert('audio: interpreter names 开始吧 for screen readers', shows('interpreter').includes('开始吧'), shows('interpreter').join(' | '))
  }
  // shopping: the count matches the list (milk is checked, coffee and ramen are left)
  assert('audio: shopping says 2 LEFT', shows('shopping').includes('2 LEFT'), shows('shopping').join(' | '))
  // radio: HOLD is push to talk; holding it says TALK, letting go says READY
  {
    const idle = shows('radio'), held = shows('radio', { pressed: 'talk' }), key = shows('radio', { data: { talk: 1 } })
    assert('audio: radio reads READY, then TALK while held (pointer or key)', idle.includes('READY') && held.includes('TALK') && key.includes('TALK'), `${idle} / ${held} / ${key}`)
  }
  // recorder: the colon is two single sites, not two 2 × 2 clusters
  {
    const sites = card('recorder').layers({ t: 0, data: {} }).filter(l => l.sites && l.tone === 'value' && l.sites.length === 2)
    assert('audio: recorder colon is two sites', sites.length === 1, `${sites.length} two-site layers`)
  }
  // midnight-circuit: the track plays on, so the time moves with t (it was frozen at 1:47)
  {
    const at = (t: number) => shows('midnight-circuit', { t }).find(s => s.includes('/')) ?? ''
    assert('personal: midnight-circuit time runs from 1:47', at(0) === '1:47 / 3:52' && at(60) === '2:47 / 3:52', `${at(0)}, ${at(60)}`)
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('verify/audio-personal.ts')) {
  let failed = 0
  audioPersonalChecks((name, ok, detail) => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : `: ${detail}`}`) })
  process.exit(failed ? 1 : 0)
}
