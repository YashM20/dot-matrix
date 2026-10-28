import { lightTorch } from '../../widgets/boards/light'
import { Card } from '../ui/Card'
import { Cards } from '../ui/kit'
import { torchDark } from './torchDark'
import { registerPresets } from '../../widgets/registry'

// registry cards: the sample worker can rebuild them by id, static ones share the sample cache
registerPresets([lightTorch])

/** Light as a field: the torch card (Lambert + Phong on cached normals) and the dark corridor. */
export default function FigLight() {
  return (
    <Cards n={2}>
      <Card preset={lightTorch} />
      {/* the corridor with the lights off stays dark on paper too: a dark inset */}
      <Card preset={torchDark} dark />
    </Cards>
  )
}
