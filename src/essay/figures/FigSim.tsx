import { useEffect, useState } from 'react'
import { glyphHourglass } from '../../widgets/boards/glyph'
import { simRd, simSand } from '../../widgets/boards/sim'
import { Card } from '../ui/Card'
import { Cards, Controls, Range } from '../ui/kit'

/** Simulation as a field: the Hourglass clock from the Lock board, falling sand, Gray-Scott reaction-diffusion. */
export default function FigSim() {
  const [tilt, setTilt] = useState(0)
  // tilt the phone and the stream leans (no permission prompt: browsers that gate the sensor simply send nothing)
  useEffect(() => {
    const on = (e: DeviceOrientationEvent) => { if (e.gamma != null) setTilt(Math.max(-1, Math.min(1, Math.round(e.gamma / 4.5) / 10))) }
    window.addEventListener('deviceorientation', on)
    return () => window.removeEventListener('deviceorientation', on)
  }, [])
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
