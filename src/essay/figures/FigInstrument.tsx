import { cutoff, resonance, xyPad } from '../../widgets/boards/instrument'
import { Card } from '../ui/Card'
import { Cards } from '../ui/kit'
import { registerPresets } from '../../widgets/registry'

// registry cards: the sample worker can rebuild them by id, static ones share the sample cache
registerPresets([cutoff, resonance, xyPad])

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
