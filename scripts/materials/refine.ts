/** Materials checks, #239 refine (scripts/materials.ts › board): one check per fix, so each can't come back. */
import { controlValueText, describe } from '../../src/engine/describe'
import { lensOffset } from '../../src/engine/matter'
import { dot480 } from '../../src/engine/theme/tokens'
import type { Pointer } from '../../src/engine/context'
import type { sampleLayers } from '../../src/engine/sampler/gridSampler'
import { TILE, withChrome, type WidgetPreset } from '../../src/widgets/types'
import { materialsBoard, materialsHooks } from '../../src/widgets/boards/materials'
import { atClock } from './board'
import type { Assert } from './util'

type FrameFn = (p: WidgetPreset, t: number, pointers?: Pointer[], data?: Record<string, number>) => ReturnType<typeof sampleLayers>

export function refineChecks(assert: Assert, frameOf: FrameFn): void {
  const H = materialsHooks, byId = (id: string) => materialsBoard.find(p => p.id === id)!, pitch = TILE.pitch!
  const cell = (d: { x: number; y: number }): [number, number] => [d.x / pitch - .5, d.y / pitch - .5]
  const said = (p: WidgetPreset, data?: Record<string, number>) => atClock(() => describe(p, { data: { ...p.defaults, ...data }, reducedMotion: true }))

  // marble: the time is relief, so its surface layer names it; the unreadable year line is gone
  const marble = byId('mat-marble'), mt = said(marble).text
  assert('marble: the accessible text carries the engraved time (09:41) and no year line', mt.includes('09:41') && !mt.some(s => s.startsWith('ANNO')), mt.join(' | '))

  // terrazzo: the previewed chip sits a step up, and the pad names the day it points at
  {
    const tz = byId('mat-terrazzo'), c = tz.controls![0], m = atClock(() => H.monthOf(2026, 0)), [x, y] = m.centres[14]
    const at = { px: (x - c.box![0]) / c.box![2], py: (c.box![1] + c.box![3] - y) / c.box![3] }
    const idle = (data?: Record<string, number>) => atClock(() => frameOf(tz, 0, undefined, data)).filter(d => d.color === dot480.dotIdle).length
    const lifted = idle(at) - idle()
    const text = atClock(() => controlValueText(c, { ...tz.defaults, ...at })), rest = atClock(() => controlValueText(c, { ...tz.defaults }))
    assert('terrazzo: a previewed future chip lifts to the past tone; the pad says the day', lifted > 0 && text === 'THURSDAY 15' && rest === 'THURSDAY 1, today', `+${lifted} idle dots; "${text}"; "${rest}"`)
  }

  // lens: the time in words, a 2.2 second with a 2-cell moat, and an unbroken outline round the glass
  {
    const lens = byId('mat-lens'), lt = said(lens).text
    assert('lens: the accessible text carries the time (09:41)', lt.includes('09:41'), lt.join(' | '))
    const dots = atClock(() => frameOf(lens, 0)), red = dots.filter(d => d.color === dot480.dotActive)
    const [sx, sy] = red.length === 1 ? cell(red[0]) : [NaN, NaN]
    const near = dots.filter(d => d !== red[0] && Math.hypot(cell(d)[0] - sx, cell(d)[1] - sy) < 2).length
    const sec = atClock(() => withChrome(lens)({ t: 0, data: { ...lens.defaults } })).filter(l => l.tone === 'active')
    assert('lens: the second is one 2.2 site with nothing within 2 cells of it', red.length === 1 && sec.length === 1 && sec[0].size === 2.2 && near === 0, `${red.length} red, size ${sec[0]?.size}, ${near} dots inside the moat`)
    const c = H.lensCentre({ ...lens.defaults }), off = lensOffset({ cx: c[0], cy: c[1], hw: H.LENS.hw, hh: H.LENS.hh, radius: H.LENS.radius, bezel: H.LENS.bezel, lut: H.lensLUT(), magnify: H.LENS.magnify })
    const lit = new Set(dots.map(d => { const [x, y] = cell(d); return `${Math.round(x)},${Math.round(y)}` })), o = new Float64Array(2)
    let edge = 0, shown = 0
    for (let r = 0; r < TILE.rows; r++) for (let q = 0; q < TILE.cols; q++) {
      const b = off(q, r, o)
      if (b < 0 || b >= .125 || Math.hypot(q - sx, r - sy) < 2) continue
      edge++; if (lit.has(`${q},${r}`)) shown++
    }
    assert('lens: every cell of the glass\'s outer edge draws a dot (a continuous outline)', edge > 100 && shown === edge, `${shown}/${edge} edge cells lit`)
  }

  // window: Enter / Space (the button with no pointer down) lights a pane; the red pane is named
  {
    const win = byId('mat-window'), g = H.windowGeometry()
    const key = (k: number) => new Map(atClock(() => frameOf(win, 0, undefined, { k })).map(d => [`${d.x},${d.y}`, `${d.r}|${d.color}`]))
    const a = key(0), b = key(1), moved: string[] = []
    for (const [p, v] of b) if (a.get(p) !== v) moved.push(p)
    const panes = new Set(moved.map(p => { const [x, y] = p.split(',').map(Number), i = Math.round((x / pitch + .5) / 1.5 - .5), j = Math.round((y / pitch + .5) / 1.5 - .5); return g.lat[j * 96 + i] }))
    assert('window: a key press with no pointer lights the rose\'s centre pane', moved.length > 0 && panes.size === 1 && panes.has(H.ROSE_CENTRE), `${moved.length} dots changed in panes ${[...panes].join(',')}`)
    const wt = said(win).text
    assert('window: the accessible text names the red pane (09:41 → 9 o\'clock)', wt.includes("9 O'CLOCK PANE"), wt.join(' | '))
  }

  // patch: a footer counts the stitches sewn
  {
    const pt = said(byId('mat-patch')).text
    assert('patch: the footer counts the border\'s stitches', pt.includes('STITCH') && pt.some(s => /^\d+\/\d+$/.test(s)), pt.join(' | '))
    // both halves idle (mid was too dim at 390), and at least one clear row between the patch and the footer
    const patch = byId('mat-patch'), ls = atClock(() => withChrome(patch)({ t: 0, data: { ...patch.defaults } }))
    const foot = ls.filter(l => l.field.text === 'STITCH' || /^\d+\/\d+$/.test(l.field.text ?? ''))
    const rows = atClock(() => frameOf(patch, 0)).map(d => Math.round(cell(d)[1])), ring = Math.max(...rows.filter(r => r < 134))
    assert('patch: the footer is idle on both halves and clears the patch by ≥ 1 row', foot.length === 2 && foot.every(l => l.tone === 'idle') && ring <= 132 && rows.some(r => r >= 134), `${foot.map(l => l.tone).join(', ')}; patch ends at row ${ring}`)
  }
}
