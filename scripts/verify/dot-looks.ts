/**
 * Dot control looks (#360): a switch, a scrubber and the label row switch look the same on every board.
 *  - every switch's knob is the components toggle's 30 on 46, scaled to its track (`switchKnobSize`), and off is `mid`;
 *  - a knob at 0 lights no track site (the components and type knobs draw `dialArc`);
 *  - every scrubber is a site index: the knob sits on the rail's pitch;
 *  - the label row switch: names 6 cells apart, the underline and focus line on row 10.
 * On its own: `pnpm exec tsx scripts/verify/dot-looks.ts`.
 */
import type { FrameContext } from '../../src/engine/context'
import type { Layer } from '../../src/engine/types'
import { LABEL_SWITCH, switchKnobSize } from '../../src/widgets/dot-controls'
import type { WidgetPreset } from '../../src/widgets/types'
import { checker, type Assert } from '../lib/check'

type Data = Record<string, number>
const frame = (p: WidgetPreset, data: Data = {}, ix: Partial<FrameContext> = {}): Layer[] =>
  p.layers({ t: .35, data: { ...(p.defaults ?? {}), ...data }, ...ix } as FrameContext)
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6
/** The one-site layers of size `size` (a switch knob). */
const knobs = (ls: Layer[], size: number) => ls.filter(l => l.sites?.length === 1 && near(l.size ?? 0, size))

export async function dotLookChecks(assert: Assert) {
  const { toggleCard, segmentedCard, knobCard } = await import('../../src/widgets/boards/components')
  const { heartbeatBoard } = await import('../../src/widgets/boards/heartbeat')
  const { driveCard } = await import('../../src/widgets/boards/dash-trip')
  const { music, settings } = await import('../../src/widgets/boards/henry')
  const { liveNowPlaying } = await import('../../src/widgets/boards/live')
  const { cardiology } = await import('../../src/widgets/boards/henry3')
  const { typeAxesCard } = await import('../../src/widgets/boards/type')
  const { pondKoi } = await import('../../src/widgets/boards/pond/koi')
  const { donutCard } = await import('../../src/widgets/boards/charts-more')
  const agent = heartbeatBoard.find(p => p.id === 'hb-agent')!

  // switches: [card, track height, data with the switch off (or a stop for a segmented one)]
  const switches: [WidgetPreset, number, Data, boolean][] = [
    [toggleCard, 46, { on2: 0 }, true], [segmentedCard, 40, {}, false], [agent, 18, {}, false],
    [driveCard, 24, { drive: 0 }, true], [settings, 12, { bluetooth: 0, sound: 0 }, true],
  ]
  const badKnob: string[] = [], badOff: string[] = []
  for (const [p, h, data, off] of switches) {
    const ks = knobs(frame(p, data), switchKnobSize(h))
    if (!ks.length) badKnob.push(p.id)
    else if (off && !ks.some(k => k.tone === 'mid')) badOff.push(`${p.id} (${ks.map(k => k.tone).join(' ')})`)
  }
  assert('dot looks: every switch knob is the components toggle\'s 30 on 46, scaled to its track', !badKnob.length, badKnob.join(' '))
  assert('dot looks: a switch that is off draws its knob in mid', !badOff.length, badOff.join(' '))

  // a knob at 0: no lit track site (dialArc's lit stretch is value, 2.2)
  const lit = [[knobCard, { gain: 0 }], [typeAxesCard, { wght: 0, wdth: 0, rond: 0 }]] as const
  const litAt0 = lit.filter(([p, d]) => frame(p, d).some(l => l.tone === 'value' && (l.sites?.length ?? 0) > 0 && near(l.size ?? 0, 2.2))).map(([p]) => p.id)
  assert('dot looks: a knob at 0 lights no track site', !litAt0.length, litAt0.join(' '))

  // scrubbers: [card, rail row]; the knob (one `active` site) sits on the rail's pitch
  const scrubs: [WidgetPreset, number][] = [[music, 141], [liveNowPlaying, 106], [cardiology, 140]]
  const offPitch: string[] = []
  for (const [p, y] of scrubs) for (const v of [.13, .44, .71]) {
    const key = p.id === 'live-now-playing' ? 'npPos' : 'position', ls = frame(p, { [key]: v })
    const row = ls.filter(l => l.sites?.length && l.sites.every(s => near(s[1], y)))
    const knob = row.find(l => l.tone === 'active' && l.sites!.length === 1)?.sites![0][0]
    const xs = row.filter(l => l.tone !== 'active').flatMap(l => l.sites!.map(s => s[0])).sort((a, b) => a - b)
    const step = Math.min(...xs.slice(1).map((x, i) => x - xs[i]))
    const k = knob === undefined ? NaN : (knob - xs[0]) / step
    if (!(Math.abs(k - Math.round(k)) < 1e-3)) offPitch.push(`${p.id}@${v}`)
  }
  assert('dot looks: every scrubber knob sits on its rail\'s site pitch (the site index method)', !offPitch.length, offPitch.join(' '))

  // label row switch: the two names `gap` cells apart; koi's hover underline and the charts focus line on `row`
  /** The blank columns between the label row's last two text fields (their `bounds`, rows 0 to 6). */
  const gapOf = (ls: Layer[]) => {
    const row = ls.map(l => l.field?.bounds).filter(b => !!b && b[1] === 0 && b[3] === 6).sort((a, b) => a![0] - b![0]).slice(-2)
    return row.length === 2 ? row[1]![0] - row[0]![2] - 1 : NaN
  }
  const koiGap = gapOf(frame(pondKoi)), chartGap = gapOf(frame(donutCard, { demo: 0 }))
  const rowOf = (ls: Layer[], tone: string) => [...new Set(ls.filter(l => l.tone === tone && l.sites?.length && l.sites.every(s => s[1] < 11 && s[1] > 7)).flatMap(l => l.sites!.map(s => s[1])))]
  const koiHover = rowOf(frame(pondKoi, {}, { hover: 'glyphs' }), 'value'), chartFocus = rowOf(frame(donutCard, { demo: 0 }, { focus: 'set' }), 'idle')
  assert('dot looks: the label row switch names sit 6 cells apart on koi and charts', koiGap === LABEL_SWITCH.gap && chartGap === LABEL_SWITCH.gap, `koi ${koiGap}, charts ${chartGap}`)
  assert('dot looks: the label row switch underline runs on row 10 on koi and charts', koiHover.join() === String(LABEL_SWITCH.row) && chartFocus.join() === String(LABEL_SWITCH.row), `koi ${koiHover}, charts ${chartFocus}`)
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('verify/dot-looks.ts')) {
  const { assert, done } = checker('dot looks')
  await dotLookChecks(assert)
  done('dot looks: all checks passed')
}
