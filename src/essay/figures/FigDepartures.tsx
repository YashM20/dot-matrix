import { departures, nextTrain, stationClock } from '../../widgets/boards/departures'
import { Card } from '../ui/Card'
import { Cards } from '../ui/kit'

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
