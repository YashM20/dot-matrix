/** UX checks for `pnpm verify` (scripts/verify.ts): the board picker (U1) and the EXPLORE / MAKE / ABOUT views (U3). */
import { boardGroups, boardIds, boardLabel, groupOf } from '../../src/widgets/manifest'
import { boardBlurbs } from '../../src/widgets/blurbs'
import { boardFromPath } from '../../src/site/meta'
import { PLACES, urlForView, viewFromUrl, type ViewState } from '../../src/site/views'
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

  // UX U3) EXPLORE / MAKE / ABOUT (docs/UX-PLAN.md §4.1, src/site/views.ts): every old link opens the view it became; canonical URLs round-trip
  {
    const at = (url: string) => { const u = new URL(url, 'https://x'); return viewFromUrl(u.search, u.pathname) }
    const is = (v: ViewState, view: string, mode: string | null, board: string) => v.view === view && (mode === null || v.mode === mode) && v.board === board
    const first = boardIds[0]
    const old: [string, string, string | null, string][] = [
      ['/', 'EXPLORE', null, first], ['/?tab=boards', 'EXPLORE', null, first], ['/?tab=BOARDS', 'EXPLORE', null, first],
      ['/?tab=gallery', 'EXPLORE', null, 'henry'], ['/?tab=Gallery', 'EXPLORE', null, 'henry'],
      ['/?tab=workspace', 'MAKE', 'TUNE', first], ['/?tab=studio', 'MAKE', 'COMPOSE', first], ['/?tab=STUDIO', 'MAKE', 'COMPOSE', first],
      ['/?tab=dots', 'MAKE', 'CODE', first], ['/?tab=dots&p=zAbC', 'MAKE', 'CODE', first], ['/?p=zAbC', 'MAKE', 'CODE', first],
      ['/?tab=draw', 'MAKE', 'DRAW', first], ['/?tab=log', 'ABOUT', null, first], ['/?tab=LOG', 'ABOUT', null, first],
      ['/?board=light', 'EXPLORE', null, 'light'], ['/?board=glyph', 'EXPLORE', null, 'lock'], ['/glyph/', 'EXPLORE', null, 'lock'],
      ['/light/', 'EXPLORE', null, 'light'], ['/light/?tab=studio', 'MAKE', 'COMPOSE', 'light'], ['/?board=metro&tab=dots', 'MAKE', 'CODE', 'metro'],
      ['/?skin=crt', 'EXPLORE', null, first], ['/?worker=0&tab=draw', 'MAKE', 'DRAW', first], ['/?board=nope', 'EXPLORE', null, first],
      ['/?make=compose', 'MAKE', 'COMPOSE', first], ['/?make=CODE&p=zAbC', 'MAKE', 'CODE', first], ['/?make', 'MAKE', 'TUNE', first], ['/?about', 'ABOUT', null, first],
    ]
    const bad = old.filter(([u, v, m, b]) => !is(at(u), v, m, b)).map(([u]) => `${u} → ${JSON.stringify(at(u))}`)
    assert('ux: every old URL (?tab=… any case, ?board=, /<board>/, aliases, ?p=) opens the view it became', !bad.length, bad.join('; '))
    assert('ux: ?card= and ?tab=essay are recognised', at('/?card=music').card === 'music' && at('/?tab=essay').essay === true && !at('/?tab=log').essay)
    assert('ux: /privacy and /terms hand over to their static pages', at('/privacy').legal === 'privacy' && at('/terms/').legal === 'terms' && !at('/').legal && !at('/privacy-x').legal)
    // canonical URLs: every place on the first board and on another, with other params kept and old ones folded away
    const canon = (u: string, v: Pick<ViewState, 'view' | 'mode' | 'board'>) => { const x = new URL(u, 'https://x'); return urlForView(v, x.search, x.pathname) }
    const want: [string, Pick<ViewState, 'view' | 'mode' | 'board'>, string][] = [
      ['/?tab=boards', { view: 'EXPLORE', mode: 'TUNE', board: first }, '/'], ['/?board=glyph', { view: 'EXPLORE', mode: 'TUNE', board: 'lock' }, '/lock/'],
      ['/?tab=studio&skin=crt', { view: 'MAKE', mode: 'COMPOSE', board: first }, '/?make=compose&skin=crt'],
      ['/?tab=dots&p=zAbC&worker=0', { view: 'MAKE', mode: 'CODE', board: first }, '/?make=code&p=zAbC&worker=0'],
      ['/light/?make=code&p=zAbC', { view: 'MAKE', mode: 'DRAW', board: 'light' }, '/light/?make=draw'],
      ['/?make=tune', { view: 'MAKE', mode: 'TUNE', board: first }, '/?make'], ['/?tab=workspace&pro=1', { view: 'MAKE', mode: 'TUNE', board: first }, '/?make&pro=1'],
      ['/?tab=log', { view: 'ABOUT', mode: 'TUNE', board: first }, '/?about'], ['/metro/?about&skin=vfd', { view: 'EXPLORE', mode: 'TUNE', board: 'metro' }, '/metro/?skin=vfd'],
    ]
    const off = want.filter(([u, v, w]) => canon(u, v) !== w).map(([u, v, w]) => `${u} → ${canon(u, v)} (want ${w})`)
    assert('ux: views write their canonical URL (board path, ?make (the editor) / ?make=<mode>, ?about; ?skin/?worker/?p kept, old params folded)', !off.length, off.join('; '))
    const trips = PLACES.flatMap(p => [first, 'light'].map(board => ({ ...placeView(p), board }))).filter(v => { const u = new URL(urlForView(v, '?skin=crt', '/'), 'https://x'); return !is(viewFromUrl(u.search, u.pathname), v.view, v.view === 'MAKE' ? v.mode : null, v.board) })
    assert('ux: every view and MAKE mode round-trips through its canonical URL', !trips.length, trips.map(v => `${v.view}/${v.mode}/${v.board}`).join(', '))
  }
}
