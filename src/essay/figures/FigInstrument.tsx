import { cutoff, resonance, xyPad } from '../../widgets/boards/instrument'
import { Card } from '../ui/Card'
import { Cards } from '../ui/kit'

/** Instrument knobs, live: drag, scroll or use the arrow keys. Every response is made of dots. */
export default function FigInstrument() {
  return (
    <Cards n={3}>
      <Card preset={cutoff} />
      <Card preset={resonance} />
      <Card preset={xyPad} />
    </Cards>
  )
}
