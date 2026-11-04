/**
 * Checks for the watch board (#126, src/engine/astro, src/widgets/boards/watch*.ts):
 * - the moon: the phase finds known new and full moons (eclipse dates, 2000–2026) within a day;
 * - the sun: at the default place sunrise comes before solar noon and sunset on every day of a year, London's
 *   solstice times match the almanac within a few minutes, and polar day and night are reported;
 * - time zones: the EU, US and Australian summer-time switches land on the right hour;
 * - the tide model: highs and lows alternate about 12.4 h apart, the clock's hand and level follow them;
 * - the analog face: the hands point at the right angles for fixed times, and the red tip is drawn there;
 * - the cards: each face draws exactly one red dot and stays inside its case, the switcher draws the same face as
 *   the face's own card and steps and wraps on tap and keys, control boxes sit inside the grid, reduced motion
 *   holds the pulse, the determinism lint on src/engine/astro, and the frame time (warn-only).
 * Called from verify.ts (`watchChecks(assert)`); also runnable alone: `npx tsx scripts/watch.ts`.
 */
import { CITIES, DAY, HOUR, MINUTE, zoneOffset } from '../src/engine/astro/calendar'
import { moonPhase, nextMoonPhase, SYNODIC } from '../src/engine/astro/moon'
import { LONDON, sunTimes } from '../src/engine/astro/sun'
import { tideClock, tideTurns } from '../src/engine/astro/tide'
import { beginDrag, dragValue, keyValue } from '../src/engine/interaction/controls'
import { sampleLayers, sampleLayersInto } from '../src/engine/sampler/gridSampler'
import { dot480 } from '../src/engine/theme/tokens'
import { TILE, withChrome, type WidgetPreset } from '../src/widgets'
import { facesCard, faceIndex, WATCH_FACES, watchBoard } from '../src/widgets/boards/watch'
import { HANDS, analogFace, handAngles, handSites } from '../src/widgets/boards/watch-hands'
import { complicationsFace } from '../src/widgets/boards/watch-life'
import { CX, CY, caseOf, frameOf, onScreen, style, type FrameKind, type Pt } from '../src/widgets/boards/watch-kit'
import { sampleCard, theme, type CtxExtra } from './lib/cards'
import { detLint } from './lib/detLint'
import { freezeWallClock } from './lib/freeze'
import { fmtLoaded, medianLoaded } from './lib/load'

type Assert = (name: string, cond: boolean, detail?: string) => void
const TAU = Math.PI * 2
const utc = (y: number, m: number, d: number, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h, mi)
const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
const near = (a: number, b: number, eps: number) => Math.abs(a - b) <= eps
/** Angle difference folded into (−π, π]. */
const dA = (a: number, b: number) => { const d = ((a - b) % TAU + TAU) % TAU; return d > Math.PI ? d - TAU : d }

/** New and full moons from eclipses (the date in UTC). */
const NEW_MOONS: [number, number, number][] = [[2000, 1, 6], [2024, 4, 8], [2024, 10, 2], [2025, 3, 29], [2025, 9, 21], [2026, 2, 17], [2026, 8, 12]]
const FULL_MOONS: [number, number, number][] = [[2000, 1, 21], [2024, 9, 18], [2025, 3, 14], [2025, 9, 7], [2026, 1, 3], [2026, 3, 3], [2026, 8, 28]]

export function watchChecks(assert: Assert): void {
  // ── the moon ─────────────────────────────────────────────────────────────────────────────────────
  {
    const miss: string[] = []
    for (const [list, target] of [[NEW_MOONS, 0], [FULL_MOONS, .5]] as const) for (const [y, m, d] of list) {
      const noon = utc(y, m, d, 12), found = nextMoonPhase(noon - 3 * DAY, target)
      const p = moonPhase(noon).phase, off = Math.abs(((p - target + 1.5) % 1) - .5) * SYNODIC
      if (Math.abs(found - noon) > DAY || off > 1) miss.push(`${y}-${m}-${d} ${target ? 'full' : 'new'}: found ${fmt(found)}, ${off.toFixed(2)} d off`)
    }
    const full = moonPhase(utc(2026, 1, 3, 10)), dark = moonPhase(utc(2026, 1, 18, 20))
    assert('watch: moon phase finds 14 known new and full moons (2000–2026) within a day', miss.length === 0, miss.join('; ') || `${NEW_MOONS.length + FULL_MOONS.length} dates`)
    assert('watch: the full moon is lit, the new moon dark', full.illumination > .98 && dark.illumination < .02, `${full.illumination.toFixed(3)} / ${dark.illumination.toFixed(3)}`)
  }

  // ── the sun ──────────────────────────────────────────────────────────────────────────────────────
  {
    const bad: string[] = []
    let shortest = Infinity, longest = 0
    for (let d = 0; d < 365; d++) {
      const day0 = utc(2026, 1, 1) + d * DAY, s = sunTimes(day0, LONDON)
      if (s.rise === null || s.set === null || !(s.rise < s.noon && s.noon < s.set) || s.rise < day0 || s.set > day0 + DAY) { bad.push(fmt(day0)); continue }
      shortest = Math.min(shortest, s.set - s.rise); longest = Math.max(longest, s.set - s.rise)
    }
    assert('watch: London, every day of 2026: sunrise before solar noon before sunset, all on the day', bad.length === 0, bad.slice(0, 4).join(', ') || `day ${(shortest / HOUR).toFixed(2)}–${(longest / HOUR).toFixed(2)} h`)
    // almanac (UTC): 1 Jan 08:06 / 16:02, 21 Jun 03:43 / 20:21
    const jan = sunTimes(utc(2026, 1, 1), LONDON), jun = sunTimes(utc(2026, 6, 21), LONDON)
    const ok = (ms: number | null, h: number, m: number, day0: number) => ms !== null && near(ms, day0 + h * HOUR + m * MINUTE, 5 * MINUTE)
    assert('watch: London sunrise and sunset within 5 min of the almanac on 1 Jan and 21 Jun', ok(jan.rise, 8, 6, utc(2026, 1, 1)) && ok(jan.set, 16, 2, utc(2026, 1, 1)) && ok(jun.rise, 3, 43, utc(2026, 6, 21)) && ok(jun.set, 20, 21, utc(2026, 6, 21)),
      [jan.rise, jan.set, jun.rise, jun.set].map(x => (x === null ? '-' : fmt(x).slice(11))).join(' '))
    const tromso = { name: 'TROMSO', lat: 69.65, lon: 18.96 }
    assert('watch: polar night and midnight sun are reported (Tromsø, December and June)', sunTimes(utc(2026, 12, 21), tromso).polar === 'night' && sunTimes(utc(2026, 6, 21), tromso).polar === 'day')
  }

  // ── time zones ───────────────────────────────────────────────────────────────────────────────────
  {
    const [ldn, nyc, tyo, syd] = CITIES
    const cases: [typeof ldn, number, number][] = [
      [ldn, utc(2026, 1, 1), 0], [ldn, utc(2026, 7, 1), 60], [ldn, utc(2026, 3, 29, 0, 59), 0], [ldn, utc(2026, 3, 29, 1), 60], [ldn, utc(2026, 10, 25, 0, 59), 60], [ldn, utc(2026, 10, 25, 1), 0],
      [nyc, utc(2026, 1, 1), -300], [nyc, utc(2026, 3, 8, 6, 59), -300], [nyc, utc(2026, 3, 8, 7), -240], [nyc, utc(2026, 11, 1, 5, 59), -240], [nyc, utc(2026, 11, 1, 6), -300],
      [tyo, utc(2026, 7, 1), 540], [syd, utc(2026, 1, 1), 660], [syd, utc(2026, 4, 4, 15, 59), 660], [syd, utc(2026, 4, 4, 16), 600], [syd, utc(2026, 10, 3, 15, 59), 600], [syd, utc(2026, 10, 3, 16), 660],
    ]
    const wrong = cases.filter(([z, t, want]) => zoneOffset(z, t) !== want).map(([z, t, want]) => `${z.code} ${fmt(t)}: ${zoneOffset(z, t)} ≠ ${want}`)
    assert('watch: summer time switches on the right hour (EU, US, south-east Australia)', wrong.length === 0, wrong.join('; ') || `${cases.length} instants`)
  }

  // ── the tide model ───────────────────────────────────────────────────────────────────────────────
  {
    const t0 = utc(2026, 1, 1), turns = tideTurns(t0, t0 + 3 * DAY), highs = turns.filter(x => x.high)
    const alternate = turns.every((x, i) => i === 0 || x.high !== turns[i - 1].high)
    const gaps = highs.slice(1).map((x, i) => (x.at - highs[i].at) / HOUR)
    const clocks = turns.slice(1, -1).map(x => ({ x, c: tideClock(x.at + MINUTE) }))
    const follows = clocks.every(({ x, c }) => near(c.angle, x.high ? 0 : Math.PI, .05) && near(c.level, x.high ? 1 : 0, .02) && c.rising === !x.high)
    assert('watch: tide highs and lows alternate, highs 11–14 h apart; the hand is at 12 at high water and 6 at low', alternate && gaps.every(g => g > 11 && g < 14) && follows && turns.length >= 10,
      `${turns.length} turns in 3 days, high to high ${gaps.map(g => g.toFixed(1)).join(' ')} h`)
  }

  // ── the analog hands ─────────────────────────────────────────────────────────────────────────────
  const pitch = 2.25, cell = (px: number) => px / pitch - .5
  {
    const times: [number, number, number, number, number, number][] = [
      [3, 0, 0, TAU / 4, 0, 0], [6, 30, 0, (6.5 / 12) * TAU, Math.PI, 0], [9, 45, 30, ((9 + 45.5 / 60) / 12) * TAU, (45.5 / 60) * TAU, Math.PI], [12, 0, 0, 0, 0, 0], [15, 15, 45, ((3 + 15.75 / 60) / 12) * TAU, (15.75 / 60) * TAU, (45 / 60) * TAU],
    ]
    const wrong = times.filter(([h, m, s, ha, ma, sa]) => { const a = handAngles(h, m, s); return !near(dA(a.hour, ha), 0, 1e-9) || !near(dA(a.minute, ma), 0, 1e-9) || !near(dA(a.second, sa), 0, 1e-9) })
    const onRay = (pts: Pt[], a: number) => pts.every(([x, y]) => { const dx = x - CX, dy = y - CY; return Math.abs(dx * Math.cos(a) + dy * Math.sin(a)) < 1e-6 })
    const offRay = times.filter(([h, m, s]) => { const a = handAngles(h, m, s), hs = handSites(h, m, s); return !onRay(hs.hour, a.hour) || !onRay(hs.minute, a.minute) || !onRay(hs.second, a.second) || !onRay([hs.tip], a.second) })
    assert('watch: analog hand angles for 03:00, 06:30, 09:45:30, 12:00 and 15:15:45, every hand site on its ray', wrong.length === 0 && offRay.length === 0, [...wrong, ...offRay].map(t => t.slice(0, 3).join(':')).join(', '))
  }

  const Real = Date
  try {
    // the red tip is drawn where the seconds hand points: 03:00:00 at 12, 09:41:15 at 3
    const tipAt = (h: number, m: number, s: number) => {
      freezeWallClock(2026, 0, 1, h, m, s)
      const red = sampleCard(analogFace, 0).filter(d => d.color === dot480.dotActive)
      return red.map(d => [cell(d.x), cell(d.y)] as Pt)
    }
    const a = tipAt(3, 0, 0), b = tipAt(9, 41, 15)
    const at = (pts: Pt[], x: number, y: number) => pts.length === 1 && near(pts[0][0], x, .01) && near(pts[0][1], y, .01)
    assert('watch: the analog face draws its red tip where the seconds hand points (frozen 03:00:00 and 09:41:15)', at(a, CX, CY - HANDS.tip.r) && at(b, CX + HANDS.tip.r, CY), JSON.stringify([a, b]))

    // ── the cards, at the goldens' time ──────────────────────────────────────────────────────────────
    freezeWallClock()
    const redCount: string[] = [], outside: string[] = [], boxes: string[] = []
    for (const p of watchBoard) {
      for (const t of [0, 1.3]) {
        const dots = sampleCard(p, t), red = dots.filter(d => d.color === dot480.dotActive).length
        if (red !== 1) redCount.push(`${p.id}@${t}: ${red}`)
        const kind = frameOf(p.id === facesCard.id ? WATCH_FACES[faceIndex(p.defaults?.face)].id : p.id)
        // the face (everything but the case's own dots and the label row) stays on the screen, a dot's reach of slack
        const shell = caseDots(kind)
        const stray = dots.filter(d => { const x = cell(d.x), y = cell(d.y); return y > 9 && !shell.has(`${d.x},${d.y}`) && !onScreen(kind, x, y, -2.5) })
        if (stray.length) outside.push(`${p.id}@${t}: ${stray.length} at ${stray.slice(0, 2).map(d => `${cell(d.x).toFixed(0)},${cell(d.y).toFixed(0)}`).join(' ')}`)
      }
      for (const c of p.controls ?? []) { const [x, y, w, h] = c.box; if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > p.grid.cols || y + h > p.grid.rows) boxes.push(`${p.id}:${c.key}`) }
    }
    assert('watch: every face draws exactly one red dot (t 0 and 1.3, the goldens\' time)', redCount.length === 0, redCount.join(', ') || `${watchBoard.length} cards`)
    assert('watch: every face stays inside its case (round or squircle screen)', outside.length === 0, outside.join('; '))
    assert('watch: control boxes are [col, row, width, height] inside the card grid', boxes.length === 0, boxes.join(', '))

    // the switcher shows the face's own card under the label row, and steps / wraps on tap and keys
    const below = (p: WidgetPreset, extra: CtxExtra = {}) => JSON.stringify(sampleCard(p, 0, p.style, undefined, extra).filter(d => cell(d.y) > 9))
    const differs = WATCH_FACES.filter((f, i) => below(facesCard, { data: { face: i } }) !== below(f)).map(f => f.id)
    const c = facesCard.controls![0], tap = (x: number, v: number) => dragValue(c, beginDrag(c, x, CY, { face: v }), { x, y: CY }).face
    const steps = [tap(CX + 30, 0) === 1, tap(CX - 30, 0) === 7, tap(CX + 30, 7) === 0, keyValue(c, 7, 'ArrowRight') === 0, keyValue(c, 0, 'ArrowLeft') === 7, faceIndex(-1) === 7]
    assert('watch: the switcher draws each face like its own card, and taps and arrow keys step and wrap', differs.length === 0 && steps.every(Boolean), [...differs, ...steps.map((s, i) => (s ? '' : `step ${i}`)).filter(Boolean)].join(', '))

    // reduced motion: the pulse dot holds still
    const still = (t: number) => JSON.stringify(sampleCard(complicationsFace, t, complicationsFace.style, undefined, { reducedMotion: true }))
    const moves = new Set([0, .2, .45, .7].map(t => JSON.stringify(sampleCard(complicationsFace, t)))).size > 1
    assert('watch: the pulse beats on the clock and holds still under reduced motion', moves && still(.2) === still(.45) && still(0) === still(.7))

    const frame = (p: WidgetPreset, t: number) => sampleLayersInto(withChrome(p)({ t, data: { ...p.defaults } }), p.grid, p.style, dot480)
    for (const p of watchBoard) {
      for (let i = 0; i < 3; i++) frame(p, i / 12)
      const r = medianLoaded(i => frame(p, 1.5 + i * .37), 9)
      assert(`watch: ${p.id} frame ≤ 4 ms (layers + sample, median warm × load)`, r.ms <= 4 * r.load, `${fmtLoaded(r)}, ${frame(p, 1.5).n} dots`)
    }
  } finally {
    globalThis.Date = Real
  }

  const det = detLint(['src/engine/astro/'])
  assert('det: no engine-specific Math in src/engine/astro (in the determinism lint)', !det.violations.length && det.scanned.length >= 4, det.violations.map(x => `${x.file}:${x.line} ${x.rule}`).join('; ') || `${det.scanned.length} files`)
}

/** Positions (px) of the case's own dots: edge, bezel and crown. */
const cases = new Map<FrameKind, Set<string>>()
function caseDots(kind: FrameKind): Set<string> {
  let s = cases.get(kind)
  if (!s) cases.set(kind, (s = new Set(sampleLayers(caseOf(kind), TILE, style, theme).map(d => `${d.x},${d.y}`))))
  return s
}

const self = process.argv[1]?.replace(/\\/g, '/')
if (self && import.meta.url.endsWith(self.split('/').slice(-2).join('/'))) {
  const { assert, done } = (await import('./lib/check')).checker('watch')
  watchChecks(assert)
  done()
}
