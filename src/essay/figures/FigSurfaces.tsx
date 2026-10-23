import { surfacesBoard, surfacesSources } from '../../widgets/boards/surfaces'
import { pick, useLiveData } from '../../data/useLiveData'
import { Card } from '../ui/Card'
import { Cards } from '../ui/kit'
import { registerPresets } from '../../widgets/registered'

// registry cards: the sample worker can rebuild them by id, static ones share the sample cache
registerPresets(surfacesBoard)

/** One Field, Five Surfaces: one timer on browser, LED matrix, e-ink, flip-disc and plotter, on one clock. */
export default function FigSurfaces() {
  const live = useLiveData(surfacesSources)
  return (
    <Cards n={5}>
      {surfacesBoard.map(p => <Card key={p.id} preset={p} data={pick(live, p.defaults)} />)}
    </Cards>
  )
}
