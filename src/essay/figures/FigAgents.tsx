import { useState } from 'react'
import type { Layer, Tone } from '../../engine/types'
import { DEVICES, ledGlow, toDevice, type DeviceSpec } from '../../engine/device'
import { heartbeatCard } from '../../widgets/boards/heartbeat'
import { TILE, layer, layoutFor, tileStyle, type WidgetPreset } from '../../widgets/types'
import { Card } from '../ui/Card'
import { Cards, Choice, Controls } from '../ui/kit'

const T = layoutFor(TILE)
const HB = heartbeatCard()
const SPEC: DeviceSpec = { grid: TILE, style: tileStyle, layers: HB.layers }
const LED25 = DEVICES['glyph-matrix-25'], GP = 5.2, GX = 72 - 12 * GP, GY = 74 - 12 * GP

/**
 * Signature moment 4: the agent heartbeat, mirrored to a phone's back-panel LED matrix. The same card
 * goes through `toDevice` (area-weighted onto the 25×25 round mask), then LED bloom, then dot sites.
 */
const phoneBack: WidgetPreset = {
  id: 'essay-hb-phone', name: 'Phone back', label: 'PHONE BACK  25×25 LED', group: 'composite', chrome: 'dots', grid: TILE, style: tileStyle, animated: true,
  defaults: { state: 0 }, springKeys: ['state'],
  layers: ctx => {
    const { lit, halo } = ledGlow(toDevice(SPEC, LED25, { ctx: { t: ctx.t, data: ctx.data } }), LED25.physics)
    const groups = new Map<string, { tone: Tone; size: number; sites: [number, number][] }>()
    const put = (tone: Tone, size: number, at: [number, number]) => { const k = `${tone}${size}`; let g = groups.get(k); if (!g) groups.set(k, (g = { tone, size, sites: [] })); g.sites.push(at) }
    for (let r = 0; r < 25; r++) for (let c = 0; c < 25; c++) {
      const i = r * 25 + c, L = lit[i], at: [number, number] = [GX + c * GP, GY + r * GP]
      if (L < 0) continue
      if (L >= .8) put('value', 4.7, at)
      else if (L >= .45) put('idle', 4.3, at)
      else if (L > 0) put('mid', 3.6, at)
      else put(halo[i] >= .3 ? 'mid' : 'faint', halo[i] >= .15 ? 1.9 : 1.3, at)
    }
    const out: Layer[] = [...groups.values()].map(g => ({ field: () => 1, sites: g.sites, size: g.size, tone: g.tone }))
    out.push(layer(T.text('SAME CARD, RESAMPLED', 0, 136), 'faint'))
    return out
  },
}
const STATES = [0, 1, 2, 3, 4] as const
const NAMES = { 0: 'Thinking', 1: 'Running tool', 2: 'Awaiting approval', 3: 'Error', 4: 'Done' }

/** Agents write one number (`data.state`); the card does the rest, on screen and on the phone's back. */
export default function FigAgents() {
  const [state, setState] = useState<typeof STATES[number]>(0)
  return (
    <>
      <Cards n={2}>
        <Card preset={HB} data={{ state }} />
        <Card preset={phoneBack} data={{ state }} />
      </Cards>
      <Controls>
        <Choice label="Agent state (what an agent writes)" options={STATES} value={state} onChange={setState} names={NAMES} />
      </Controls>
    </>
  )
}
