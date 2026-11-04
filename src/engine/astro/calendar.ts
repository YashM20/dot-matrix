/**
 * Calendar and time zones for the watch faces (#126): Julian days, wall-clock parts of an instant, and the UTC offset
 * of a few cities with their daylight-saving rules. Times are plain numbers of milliseconds (`Date.UTC` scale), so
 * every function is pure and deterministic: dates come from day counts (Howard Hinnant's civil-from-days), never
 * from a `Date` object.
 * Framework-free, in the determinism lint (scripts/lib/detLint.ts).
 */

export const MINUTE = 60_000, HOUR = 3_600_000, DAY = 86_400_000
/** Julian Day of an instant (ms since 1970-01-01 UTC): JD 2440587.5 is the Unix epoch (Meeus, ch. 7). */
export const julianDay = (ms: number) => ms / DAY + 2440587.5
/** Julian centuries since J2000.0 (JD 2451545.0), the time argument of every series here. */
export const centuries = (ms: number) => (julianDay(ms) - 2451545) / 36525

/** Calendar parts of a wall time given as ms on the UTC scale (a local time shifted by its offset). */
export interface WallParts { year: number; month: number; day: number; dow: number; hour: number; minute: number; second: number }
/** Year, month (0-based) and day of month of day `days` since 1970-01-01 (proleptic Gregorian). */
export function civil(days: number): { year: number; month: number; day: number } {
  const z = days + 719468, era = Math.floor(z / 146097), doe = z - era * 146097
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365)
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)), mp = Math.floor((5 * doy + 2) / 153)
  const m = mp < 10 ? mp + 3 : mp - 9
  return { year: yoe + era * 400 + (m <= 2 ? 1 : 0), month: m - 1, day: doy - Math.floor((153 * mp + 2) / 5) + 1 }
}
/** Day of the week of day `days` since 1970-01-01 (a Thursday), 0 = Sunday. */
const weekday = (days: number) => (((days + 4) % 7) + 7) % 7
export function partsOf(ms: number): WallParts {
  const days = Math.floor(ms / DAY), rem = ms - days * DAY
  return {
    ...civil(days), dow: weekday(days),
    hour: Math.floor(rem / HOUR), minute: Math.floor((rem % HOUR) / MINUTE), second: (rem % MINUTE) / 1000,
  }
}

/** Daylight-saving rules: none, the EU's, the US's and south-east Australia's. */
export type DstRule = 'none' | 'eu' | 'us' | 'au'
export interface Zone { code: string; name: string; /** Standard offset, minutes east of UTC. */ std: number; dst: DstRule }

const dowOf = (y: number, m: number, d: number) => weekday(Date.UTC(y, m, d) / DAY)
/** Day of the month of the last Sunday of month `m` (0-based). */
const lastSunday = (y: number, m: number) => { const last = civil(Date.UTC(y, m + 1, 0) / DAY).day; return last - dowOf(y, m, last) }
/** Day of the month of the `n`th Sunday of month `m`. */
const nthSunday = (y: number, m: number, n: number) => 1 + ((7 - dowOf(y, m, 1)) % 7) + 7 * (n - 1)
/** An instant given as a local standard time of the zone (hours past midnight of y-m-d). */
const atStd = (z: Zone, y: number, m: number, d: number, h: number) => Date.UTC(y, m, d, h) - z.std * MINUTE

/** Is daylight saving on in zone `z` at instant `utc`? */
export function isDst(z: Zone, utc: number): boolean {
  const y = civil(Math.floor((utc + z.std * MINUTE) / DAY)).year
  switch (z.dst) {
    case 'none': return false
    // last Sunday of March to last Sunday of October, both at 01:00 UTC
    case 'eu': return utc >= Date.UTC(y, 2, lastSunday(y, 2), 1) && utc < Date.UTC(y, 9, lastSunday(y, 9), 1)
    // second Sunday of March 02:00 standard to first Sunday of November 02:00 daylight (01:00 standard)
    case 'us': return utc >= atStd(z, y, 2, nthSunday(y, 2, 2), 2) && utc < atStd(z, y, 10, nthSunday(y, 10, 1), 1)
    // southern summer: first Sunday of October 02:00 standard to first Sunday of April 03:00 daylight (02:00 standard)
    case 'au': return utc >= atStd(z, y, 9, nthSunday(y, 9, 1), 2) || utc < atStd(z, y, 3, nthSunday(y, 3, 1), 2)
  }
}
/** UTC offset of zone `z` at instant `utc`, minutes east. */
export const zoneOffset = (z: Zone, utc: number) => z.std + (isDst(z, utc) ? 60 : 0)
/** The zone's wall time at `utc`, on the UTC scale (feed it to `partsOf`). */
export const zoneWall = (z: Zone, utc: number) => utc + zoneOffset(z, utc) * MINUTE

/** The world clock's cities. */
export const CITIES: readonly Zone[] = [
  { code: 'LDN', name: 'LONDON', std: 0, dst: 'eu' },
  { code: 'NYC', name: 'NEW YORK', std: -300, dst: 'us' },
  { code: 'TYO', name: 'TOKYO', std: 540, dst: 'none' },
  { code: 'SYD', name: 'SYDNEY', std: 600, dst: 'au' },
]
