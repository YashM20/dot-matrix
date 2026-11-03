/**
 * Board — CHARTS: the dot charts kit (issue #132). Bar, line, area, donut, heatmap, sparklines and candlesticks,
 * each drawn by the engine's chart module (src/engine/charts) from made-up data (`./charts-data`). Every card
 * grows in, morphs between its two data sets on a loop and reads out the nearest point under a hover, tap or
 * arrow key. Red is the board's one accent: the picked point on each card.
 */
import { areaCard, barCard, candleCard, lineCard } from './charts-xy'
import { donutCard, heatCard, sparkCard } from './charts-more'

export const chartsBoard = [
  barCard, lineCard, areaCard,
  donutCard, heatCard, sparkCard,
  candleCard,
]
