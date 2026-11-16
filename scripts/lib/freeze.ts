/**
 * Pin the wall clock for headless runs: `new Date()` / `Date.now()` return a fixed local time,
 * so clock cards (`timeNow()` in henry.ts) hash the same on every machine and every minute.
 * Built from local components, so `getHours()` etc. agree in every time zone. `getTimezoneOffset()`
 * reads 0, so a card that turns the local time into UTC that way (the watch faces' world clock, moon
 * and sun) sees the same instant everywhere too.
 */
export function freezeWallClock(year = 2026, month = 0, day = 1, hours = 9, minutes = 41, seconds = 0) {
  const Real = Date, fixed = new Real(year, month, day, hours, minutes, seconds).getTime()
  class FrozenDate extends Real {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(fixed)
      else super(...(args as [string | number | Date]))
    }
    static now() { return fixed }
    getTimezoneOffset() { return 0 }
  }
  globalThis.Date = FrozenDate as DateConstructor
}

/**
 * The same pin for a page, as a script for `Page.addScriptToEvaluateOnNewDocument`: `new Date()`, `Date()` and
 * `Date.now()` give one fixed local time, so a card that reads the wall clock (the pond's hour, a clock face) draws the
 * same frame whenever a probe looks at it. Without it a redraw that lands on the next minute or hour shows new pixels,
 * and a probe that compares frames fails on the time of day (#28: the pond terrarium's dawn dither, the koi's moon).
 * A Proxy rather than a subclass, so `Date()` called without `new` still works and `instanceof Date` holds.
 */
export const pinnedClockScript = (year = 2026, month = 0, day = 1, hours = 9, minutes = 41) => `(() => {
  const Real = Date, fixed = new Real(${year}, ${month}, ${day}, ${hours}, ${minutes}).getTime()
  globalThis.Date = new Proxy(Real, {
    construct: (D, args, target) => Reflect.construct(D, args.length ? args : [fixed], target),
    apply: () => new Real(fixed).toString(),
    get: (D, key) => key === 'now' ? () => fixed : Reflect.get(D, key),
  })
})()`
