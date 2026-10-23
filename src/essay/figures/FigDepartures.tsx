import { departures, nextTrain, stationClock } from '../../widgets/boards/departures'
import { Card } from '../ui/Card'
import { Cards } from '../ui/kit'
import { registerPresets } from '../../widgets/registered'

// registry cards: the sample worker can rebuild them by id, static ones share the sample cache
registerPresets([departures, stationClock, nextTrain])

/** The Departures board, embedded live: split-flap rows, the station clock, a train gliding along its line. */
export default function FigDepartures() {
  return (
    <Cards n={3}>
      <Card preset={departures} />
      <Card preset={stationClock} />
      <Card preset={nextTrain} />
    </Cards>
  )
}
