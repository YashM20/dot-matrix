/** UX checks for `pnpm verify` (scripts/verify.ts): the board picker (U1), the EXPLORE / MAKE / ABOUT views (U3) and ALL's filters and order (#182, #315). */
import { boardGroups, boardIds, boardLabel, groupOf } from '../../src/widgets/manifest'
import { boardBlurbs } from '../../src/widgets/blurbs'
import { boardFromPath } from '../../src/site/meta'
import { PLACES, placeView, urlForView, viewFromUrl, type ViewState } from '../../src/site/views'
import { matches, readFilters, writeFilters, ROWS, ORDERED, FEATURED, MAX_QUERY } from '../../src/components/browse/data'
import { readFileSync } from 'node:fs'
import type { Assert } from '../lib/check'

export function uxChecks(assert: Assert) {
  // UX U1) board picker (docs/UX-PLAN.md §4.2): every board in exactly one group after START HERE, a label and a blurb; old paths still open
  {
    const homes = boardIds.map(id => boardGroups.filter(g => g.id !== 'start' && (g.boards as readonly string[]).includes(id)).length)
    assert('ux: every board sits in exactly one picker group (START HERE aside)', homes.every(n => n === 1), boardIds.filter((_, i) => homes[i] !== 1).join(', '))
    assert('ux: START HERE lists only real boards, each also in its own group', boardGroups[0].boards.every(id => boardIds.includes(id) && groupOf(id) !== 'start'))
    const labels = boardIds.map(boardLabel)
    assert('ux: board labels are unique and every board has a blurb', new Set(labels).size === labels.length && boardIds.every(id => (boardBlurbs as Record<string, string>)[id]?.length > 10))
    assert('ux: old board paths still resolve (/light/, /glyph/ → lock)', boardFromPath('/light/') === 'light' && boardFromPath('/glyph/') === 'lock' && boardFromPath('/') === undefined)
  }

  // UX U3) EXPLORE / MAKE / ABOUT (docs/UX-PLAN.md §4.1, src/site/views.ts): every old link opens the view it became; canonical URLs round-trip.
  // EXPLORE on `/` is ALL (every card, #315); `*` below means ALL (the board state is then the first board)
  {
    const at = (url: string) => { const u = new URL(url, 'https://x'); return viewFromUrl(u.search, u.pathname) }
    const is = (v: ViewState, view: string, mode: string | null, board: string) => v.view === view && (mode === null || v.mode === mode) && (view !== 'EXPLORE' || v.all === (board === '*')) && v.board === (board === '*' ? first : board)
    const first = boardIds[0]
    const old: [string, string, string | null, string][] = [
      ['/', 'EXPLORE', null, '*'], ['/?tab=boards', 'EXPLORE', null, '*'], ['/?tab=BOARDS', 'EXPLORE', null, '*'],
      ['/?tab=gallery', 'EXPLORE', null, 'henry'], ['/?tab=Gallery', 'EXPLORE', null, 'henry'], ['/henry/', 'EXPLORE', null, 'henry'],
      ['/?tab=workspace', 'MAKE', 'TUNE', first], ['/?tab=studio', 'MAKE', 'COMPOSE', first], ['/?tab=STUDIO', 'MAKE', 'COMPOSE', first],
      ['/?tab=dots', 'MAKE', 'CODE', first], ['/?tab=dots&p=zAbC', 'MAKE', 'CODE', first], ['/?p=zAbC', 'MAKE', 'CODE', first],
      ['/?tab=draw', 'MAKE', 'DRAW', first], ['/?tab=log', 'ABOUT', null, first], ['/?tab=LOG', 'ABOUT', null, first],
      ['/?board=light', 'EXPLORE', null, 'light'], ['/?board=glyph', 'EXPLORE', null, 'lock'], ['/glyph/', 'EXPLORE', null, 'lock'],
      ['/light/', 'EXPLORE', null, 'light'], ['/light/?tab=studio', 'MAKE', 'COMPOSE', 'light'], ['/?board=metro&tab=dots', 'MAKE', 'CODE', 'metro'],
      ['/?skin=crt', 'EXPLORE', null, '*'], ['/?worker=0&tab=draw', 'MAKE', 'DRAW', first], ['/?board=nope', 'EXPLORE', null, '*'],
      ['/?make=compose', 'MAKE', 'COMPOSE', first], ['/?make=CODE&p=zAbC', 'MAKE', 'CODE', first], ['/?make', 'MAKE', 'TUNE', first], ['/?about', 'ABOUT', null, first],
      ['/about', 'ABOUT', null, first], ['/about/', 'ABOUT', null, first], ['/nope/', 'EXPLORE', null, '*'],
      // BROWSE became ALL (#315): its page, its tab name and its filters; its board filter opens that board
      ['/browse/', 'EXPLORE', null, '*'], ['/browse', 'EXPLORE', null, '*'], ['/?tab=browse', 'EXPLORE', null, '*'], ['/?tab=all', 'EXPLORE', null, '*'],
      ['/browse/?tag=clock&q=x', 'EXPLORE', null, '*'], ['/browse/?in=metro&tag=clock&q=x', 'EXPLORE', null, 'metro'], ['/?in=glyph', 'EXPLORE', null, 'lock'], ['/?in=nope', 'EXPLORE', null, '*'],
    ]
    const bad = old.filter(([u, v, m, b]) => !is(at(u), v, m, b)).map(([u]) => `${u} → ${JSON.stringify(at(u))}`)
    assert('ux: every old URL (?tab=… any case, ?board=, /<board>/, aliases, ?p=, /browse/ and its ?in=) opens the view it became', !bad.length, bad.join('; '))
    assert('ux: ?card= and ?tab=essay are recognised', at('/?card=music').card === 'music' && at('/?tab=essay').essay === true && !at('/?tab=log').essay)
    assert('ux: /privacy and /terms hand over to their static pages', at('/privacy').legal === 'privacy' && at('/terms/').legal === 'terms' && !at('/').legal && !at('/privacy-x').legal)
    // canonical URLs: every place on the first board and on another, with other params kept and old ones folded away
    type V = Pick<ViewState, 'view' | 'mode' | 'board' | 'all'>
    const canon = (u: string, v: V) => { const x = new URL(u, 'https://x'); return urlForView(v, x.search, x.pathname) }
    const E = (board: string, all = false): V => ({ view: 'EXPLORE', mode: 'TUNE', board, all })
    const M = (mode: ViewState['mode'], board = first): V => ({ view: 'MAKE', mode, board, all: true })
    const A = (board = first): V => ({ view: 'ABOUT', mode: 'TUNE', board, all: true })
    const want: [string, V, string][] = [
      ['/?tab=boards', E(first, true), '/'], ['/?board=glyph', E('lock'), '/lock/'], ['/', E(first), '/henry/'], ['/index.html', E(first, true), '/index.html'],
      ['/?tab=studio&skin=crt', M('COMPOSE'), '/?make=compose&skin=crt'],
      ['/?tab=dots&p=zAbC&worker=0', M('CODE'), '/?make=code&p=zAbC&worker=0'],
      ['/light/?make=code&p=zAbC', M('DRAW', 'light'), '/light/?make=draw'],
      ['/?make=tune', M('TUNE'), '/?make'], ['/?tab=workspace&pro=1', M('TUNE'), '/?make&pro=1'],
      ['/?tab=log', A(), '/about/'], ['/metro/?about&skin=vfd', E('metro'), '/metro/?skin=vfd'],
      ['/about', A(), '/about/'], ['/?about&skin=crt', A(), '/about/?skin=crt'], ['/light/', A('light'), '/about/'], ['/nope/?skin=crt', E(first, true), '/?skin=crt'],
      // ALL keeps its filters on `/`; a board, MAKE and ABOUT drop them; BROWSE's old ?in= never survives
      ['/browse/?tag=clock&q=x&skin=crt', E(first, true), '/?tag=clock&q=x&skin=crt'],
      ['/browse/?in=metro&tag=clock&q=x&skin=crt', E('metro'), '/metro/?skin=crt'],
      ['/?tag=clock&q=x', A(), '/about/'], ['/?in=nope&tag=clock', E(first, true), '/?tag=clock'],
    ]
    const off = want.filter(([u, v, w]) => canon(u, v) !== w).map(([u, v, w]) => `${u} → ${canon(u, v)} (want ${w})`)
    assert('ux: views write their canonical URL (/ for ALL, board path, ?make (the editor) / ?make=<mode>, /about/; ?skin/?worker/?p kept, old params folded)', !off.length, off.join('; '))
    // ABOUT has one URL for every board (`/about/`): it opens on the first board's state
    const trips = [...PLACES.flatMap(p => [first, 'light'].map(board => ({ ...placeView(p), board, all: false }))), E(first, true)]
      .filter(v => { const u = new URL(urlForView(v, '?skin=crt', '/'), 'https://x'); return !is(viewFromUrl(u.search, u.pathname), v.view, v.view === 'MAKE' ? v.mode : null, v.view === 'EXPLORE' && v.all ? '*' : v.view === 'ABOUT' ? first : v.board) })
    assert('ux: every view, MAKE mode and ALL round-trips through its canonical URL', !trips.length, trips.map(v => `${v.view}/${v.mode}/${v.board}${v.all ? '/all' : ''}`).join(', '))
  }

  // BROWSE (#182): the filter query is hostile input; unknown boards and tags drop, aliases resolve, the words are capped and cleaned
  {
    const f = readFilters('?in=glyph&tag=CLOCK&q=%20ring%00%0A%20game%20')
    assert('ux: browse reads ?in= (aliases too), ?tag= (any case) and ?q= (control characters stripped)', f.board === 'lock' && f.tag === 'clock' && f.q === 'ring game', JSON.stringify(f))
    const bad = readFilters(`?in=nope&tag=%3Cscript%3E&q=${'x'.repeat(500)}&in=metro`)
    assert('ux: browse drops an unknown board or tag and caps the search', bad.board === '' && bad.tag === '' && bad.q.length === MAX_QUERY, JSON.stringify(bad).slice(0, 80))
    assert('ux: browse survives a malformed query', readFilters('?q=%E0%A4%A&in=%zz').board === '')
    assert('ux: browse writes its filters and keeps other params', writeFilters({ board: 'metro', tag: '', q: 'a b' }, '?skin=crt&tag=old') === '?skin=crt&in=metro&q=a+b')
    const all = ROWS.filter(r => matches(r, { board: '', tag: '', q: '' })).length, clocks = ROWS.filter(r => matches(r, { board: '', tag: 'clock', q: '' }))
    assert('ux: browse lists every widget once, and a tag filter keeps only cards with that tag', all === ROWS.length && new Set(ROWS.map(r => r.slug)).size === ROWS.length && clocks.length > 0 && clocks.every(r => r.tags.includes('clock')), `${all} cards, ${clocks.length} clocks`)
    const start = boardGroups[0].boards as readonly string[], lead = ORDERED.slice(FEATURED.length, FEATURED.length + 9).map(r => r.board)
    assert('ux: ALL opens on the quality-bar cards, then the START HERE boards, and lists every card once', ORDERED.slice(0, FEATURED.length).every((r, i) => r.slug === FEATURED[i]) && lead.every(b => b === start[0]) && ORDERED.length === ROWS.length && new Set(ORDERED.map(r => r.slug)).size === ROWS.length, ORDERED.slice(0, 4).map(r => r.slug).join(', '))
    assert('ux: browse search finds a card by its name', ROWS.some(r => r.slug === 'home-clock' && matches(r, { board: '', tag: '', q: 'HOME' })))
  }

  // the phone bar folds LIVE DATA to its dot with `font-size: 0`; unscoped, that rule also blanked the footer's LIVE label
  {
    const css = readFileSync('src/site/mobile/phone.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const bare = [...css.matchAll(/(^|[{}])\s*([^{}]*)\{[^}]*font-size:\s*0[;\s}]/g)].map(m => m[2].trim()).filter(sel => sel.split(',').some(s => /(^|\s)\.live$/.test(s.trim()) && !/\.topbar\s+\.live$/.test(s.trim())))
    assert('ux: the phone LIVE fold stays in the top bar (the footer keeps its LIVE word)', !bare.length, bare.join(' | '))
  }
}
