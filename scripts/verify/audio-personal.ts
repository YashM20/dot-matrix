/**
 * AUDIO (#259) and PERSONAL (#256) card checks for `pnpm verify`: one per bug fixed on those boards.
 * Run alone: `pnpm exec tsx scripts/verify/audio-personal.ts`.
 */
import { describe } from '../../src/engine/describe'
import { sampleLayers } from '../../src/engine/sampler/gridSampler'
import { widgetById } from '../../src/widgets'
import { theme, visible } from '../lib/stats'
import type { Assert } from '../lib/check'

const card = (id: string) => {
  const p = widgetById(id)
  if (!p) throw new Error(`no card ${id}`)
  return p
}
const shows = (id: string, ctx: Parameters<typeof describe>[1] = {}) => describe(card(id), ctx).text

export function audioPersonalChecks(assert: Assert) {
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
