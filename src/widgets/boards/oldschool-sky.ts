/**
 * The oldschool board's clouds card: 2D dynamic clouds (src/engine/oldschool/clouds.ts) drifting over a line of hills
 * past a red sun, shaded by the march toward it. A pure function of t: the cover is baked once a frame.
 */
import { cloudCover, cloudFbm, cloudMarch } from '../../engine/oldschool/clouds'
import { noise2 } from '../../engine/noise/gradient'
import { layer, type WidgetPreset } from '../types'
import { BODY_BOTTOM, BODY_TOP, CREDIT_CLOUDS, FAINT, IDLE, MID, T, VALUE, caption, footer, pad, plate, tile } from './oldschool-kit'


// ── 04 SKY ── four octaves drifting at their own speeds, a clear-sky threshold, and four samples marched toward the
// sun (up and to the right): the side of a cloud facing the sun is lit, the far side and the thick middles go grey.
const SUN: [number, number] = [118, 26]
/** Cloud units per card cell: the card is 1.1 units wide, so the coarsest octave (2 per unit) puts ~3 clouds across. */
const UNIT = 1.1 / 144, A = .45, B = .6, PACE = 3, SEED = 67
/** March step toward the sun, in plate dots (two right, one up), and the plate's margin for it. */
const DI = 2, DJ = -1, STEPS = 4
const SK = 2.5, COLS = Math.floor(144 / SK), ROWS = Math.floor((BODY_BOTTOM + .5 - BODY_TOP) / SK + .5)
const W = COLS + DI * (STEPS - 1), H = ROWS - DJ * (STEPS - 1)
function skyFrame(t: number) {
  const cover = new Float32Array(W * H), tt = t * PACE
  let sum = 0
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    // grid row j = plate row j − margin (the margin sits above the plate, toward the sun)
    const x = i * SK * UNIT, y = (j + DJ * (STEPS - 1)) * SK * UNIT
    const c = cloudCover(cloudFbm(x, y, tt, SEED), A, B)
    cover[j * W + i] = c
    if (i < COLS && j >= -DJ * (STEPS - 1)) sum += c
  }
  return { cover, mean: sum / (COLS * ROWS) }
}
/** The hills under the sky: a ridge from two octaves of noise, its crest a line of grey dots, the land below dim. */
const ridge = (x: number) => 112 + 12 * noise2(x / 40 + 1.3, .5, 11) + 3 * noise2(x / 12, 2.5, 12)
const hills = plate(2, (x, y, ink) => {
  const h = y - ridge(x)
  if (h < 0) return
  if (h < 2) { ink.v = .7; ink.tone = MID; return }
  ink.v = .45; ink.tone = FAINT
}, 90, BODY_BOTTOM)
export const osSky: WidgetPreset = {
  id: 'os-sky', name: 'Oldschool Sky', label: 'SKY', ...tile, credit: CREDIT_CLOUDS,
  layers: ctx => {
    const { cover, mean } = skyFrame(ctx.t), m = -DJ * (STEPS - 1)
    const sky = plate(SK, (x, y, ink, d) => {
      if (y > ridge(x) - 2) return
      const i = d % COLS, j = Math.floor(d / COLS) + m, c = cover[j * W + i]
      if (!(c > .12)) return
      // the article lerps lit → shadow colour by the march; here light is dot size and grey together
      const b = 1 - Math.min(1, cloudMarch(cover, W, H, i, j, DI, DJ) * 1.25)
      ink.v = c * (.35 + .65 * b)
      ink.tone = b > .8 ? VALUE : b > .55 ? IDLE : b > .3 ? MID : FAINT
    })
    return [
      caption('DE=MAX(FBM-RAY,0)'),
      layer(T.dots([SUN], 9), 'active'),
      layer(sky),
      layer(hills),
      ...footer(`COVER ${pad(mean * 100, 2)}%`, `A.${Math.round(A * 100)} B.${Math.round(B * 100)}`),
    ]
  },
}
