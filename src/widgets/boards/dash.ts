/**
 * Board — DASH: a car and EV instrument cluster in nine TILE cards (issue #125). Speed, power and range dials,
 * the battery, the gear selector, the turn signals, the nav strip, the road ahead and the drive loop.
 *
 * One car drives the whole board (`./dash-drive`): a 30 s lap on the shared clock until the first control edit,
 * then the visitor's car, from board-shared keys that every card reads. Cards stay pure in ctx. The pieces are
 * the components board's (`./dash-kit` re-exports its interaction grammar). Red is the board's one accent,
 * one live part per card.
 */
import { DASH_SHARED } from './dash-drive'
import { batteryCard, gearCard, signalsCard } from './dash-controls'
import { powerCard, rangeCard, speedCard } from './dash-dials'
import { driveCard, navCard, roadCard } from './dash-trip'

export const dashBoard = [
  speedCard, powerCard, rangeCard,
  gearCard, signalsCard, batteryCard,
  navCard, roadCard, driveCard,
]
export const dashShared = DASH_SHARED
