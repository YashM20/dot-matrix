/**
 * Pin the wall clock for headless runs: `new Date()` / `Date.now()` return a fixed local time,
 * so clock cards (`timeNow()` in henry.ts) hash the same on every machine and every minute.
 * Built from local components, so `getHours()` etc. agree in every time zone.
 */
export function freezeWallClock(year = 2026, month = 0, day = 1, hours = 9, minutes = 41) {
  const Real = Date, fixed = new Real(year, month, day, hours, minutes).getTime()
  class FrozenDate extends Real {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(fixed)
      else super(...(args as [string | number | Date]))
    }
    static now() { return fixed }
  }
  globalThis.Date = FrozenDate as DateConstructor
}
