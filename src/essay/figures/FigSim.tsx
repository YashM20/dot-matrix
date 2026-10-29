import { useEffect, useState } from 'react'
import { glyphHourglass } from '../../widgets/boards/glyph'
import { simRd, simSand } from '../../widgets/boards/sim'
import { Card } from '../ui/Card'
import { Cards, Controls, Range } from '../ui/kit'
import { registerPresets } from '../../widgets/registry'
import { lightSource } from '../../site/light'

// registry cards: the sample worker can rebuild them by id, static ones share the sample cache
registerPresets([glyphHourglass, simSand, simRd])

/** Simulation as a field: the Hourglass clock from the Lock board, falling sand, Gray-Scott reaction-diffusion. */
export default function FigSim() {
  const [tilt, setTilt] = useState(0)
  // tilt the phone and the stream leans: the light hub's `tx` (−1..1 from the rest pose, 0 inside its dead zone).
  // The hub owns the sensor: no listener unless tilt is on (granted via TILT, or Android), none under reduced motion
  // until asked, and it emits only on a change (≤ 15 Hz).
  useEffect(() => lightSource.subscribe(s => setTilt(Math.round((s.data.tx ?? 0) * 10) / 10)), [])
  return (
    <>
      <Cards n={3}>
        <Card preset={glyphHourglass} data={{ tilt }} />
        <Card preset={simSand} />
        <Card preset={simRd} />
      </Cards>
      <Controls>
        <Range label="Hourglass tilt" name="tilt" value={tilt} min={-1} max={1} step={.1} onChange={setTilt} format={v => v.toFixed(1)} />
      </Controls>
    </>
  )
}
