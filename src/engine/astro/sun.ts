/**
 * Sunrise and sunset from the date and a place (#126): the solar position of Jean Meeus, "Astronomical Algorithms"
 * (ch. 25, low accuracy), with the equation of time and the −0.833° horizon (refraction and the Sun's radius) as in
 * NOAA's solar calculator, which follows the same book. About a minute off at mid latitudes. Deterministic trig only.
 */
import { datan2 } from '../noise/dmath'
import { DAY, MINUTE, centuries } from './calendar'
import { cosD, deg360, sinD } from './moon'

const DEG = 180 / Math.PI
const asinD = (x: number) => datan2(x, Math.sqrt(Math.max(0, 1 - x * x))) * DEG
const acosD = (x: number) => datan2(Math.sqrt(Math.max(0, 1 - x * x)), x) * DEG
const tanD = (x: number) => sinD(x) / cosD(x)

export interface Place { name: string; /** Degrees north. */ lat: number; /** Degrees east. */ lon: number }
/** The sun face's default place. */
export const LONDON: Place = { name: 'LONDON', lat: 51.5074, lon: -.1278 }

export interface SunDay {
  /** Instants (ms) of sunrise, solar noon and sunset; rise and set are null in polar day or night. */
  rise: number | null; noon: number; set: number | null
  /** 'day' (midnight sun) or 'night' (polar night) when the Sun doesn't cross the horizon. */
  polar?: 'day' | 'night'
}

/** Declination (°) and equation of time (minutes) at instant `utc`. */
export function solarPosition(utc: number): { decl: number; eot: number } {
  const T = centuries(utc)
  const L0 = deg360(280.46646 + T * (36000.76983 + T * .0003032))
  const M = 357.52911 + T * (35999.05029 - .0001537 * T)
  const e = .016708634 - T * (.000042037 + .0000001267 * T)
  const C = sinD(M) * (1.914602 - T * (.004817 + .000014 * T)) + sinD(2 * M) * (.019993 - .000101 * T) + sinD(3 * M) * .000289
  const omega = 125.04 - 1934.136 * T
  const lambda = L0 + C - .00569 - .00478 * sinD(omega)
  const eps = 23 + (26 + (21.448 - T * (46.815 + T * (.00059 - T * .001813))) / 60) / 60 + .00256 * cosD(omega)
  const decl = asinD(sinD(eps) * sinD(lambda))
  const y = tanD(eps / 2) * tanD(eps / 2)
  const eot = 4 * DEG * (y * sinD(2 * L0) - 2 * e * sinD(M) + 4 * e * y * sinD(M) * cosD(2 * L0) - .5 * y * y * sinD(4 * L0) - 1.25 * e * e * sinD(2 * M))
  return { decl, eot }
}

/** Sunrise, solar noon and sunset at `place` on the UTC calendar day that starts at `day0` (ms of 00:00 UTC). */
export function sunTimes(day0: number, place: Place): SunDay {
  // evaluate the Sun near the place's own noon (twice: the second pass at the first noon found)
  let noon = day0 + (720 - 4 * place.lon) * MINUTE
  let p = solarPosition(noon)
  noon = day0 + (720 - 4 * place.lon - p.eot) * MINUTE
  p = solarPosition(noon)
  noon = day0 + (720 - 4 * place.lon - p.eot) * MINUTE
  const cosH = cosD(90.833) / (cosD(place.lat) * cosD(p.decl)) - tanD(place.lat) * tanD(p.decl)
  if (cosH > 1) return { rise: null, noon, set: null, polar: 'night' }
  if (cosH < -1) return { rise: null, noon, set: null, polar: 'day' }
  const half = 4 * acosD(cosH) * MINUTE
  return { rise: noon - half, noon, set: noon + half }
}
/** 00:00 UTC of the UTC calendar day holding `ms`. */
export const dayStart = (ms: number) => Math.floor(ms / DAY) * DAY
