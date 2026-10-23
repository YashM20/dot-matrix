import { lightTorch } from '../../widgets/boards/light'
import { Card } from '../ui/Card'
import { Cards } from '../ui/kit'
import { torchDark } from './torchDark'

/** Light as a field: the torch card (Lambert + Phong on cached normals) and the dark corridor. */
export default function FigLight() {
  return (
    <Cards n={2}>
      <Card preset={lightTorch} />
      <Card preset={torchDark} />
    </Cards>
  )
}
