import { useMemo, useState } from 'react'
import type { MaskName } from '../../engine/motion'
import { withChrome } from '../../widgets/types'
import { platform } from '../../widgets/boards/departures'
import { DotCanvas } from '../../components/DotCanvas'
import { Choice, Controls, Panel } from '../ui/kit'
import { registerPresets } from '../../widgets/registered'

// registry cards: the sample worker can rebuild them by id, static ones share the sample cache
registerPresets([platform])

const MASKS = ['bayer', 'ign', 'noise', 'diagonal', 'radial', 'curtain', 'scan'] as const satisfies readonly MaskName[]

/** Enter is a mask, not a keyframe: every dot gets a threshold in 0..1 and appears when progress passes it. */
export default function FigMasks() {
  const [mask, setMask] = useState<MaskName>('bayer')
  const [run, setRun] = useState(0)
  const layers = useMemo(() => withChrome(platform), [])
  const pick = (m: MaskName) => { setMask(m); setRun(r => r + 1) }
  return (
    <>
      <Panel label={`ENTER · MASK ${mask.toUpperCase()} · 900 MS`}>
        <div className="stage stage--card">
          <DotCanvas key={`${mask}-${run}`} layers={layers} data={platform.defaults} grid={platform.grid} style={platform.style} animated={platform.animated} enter={{ delay: 120, mask, duration: 900 }} />
        </div>
      </Panel>
      <Controls>
        <Choice label="Enter mask (click to replay)" options={MASKS} value={mask} onChange={pick} />
      </Controls>
    </>
  )
}
