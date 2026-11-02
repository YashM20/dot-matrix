/**
 * The oldschool board's clouds card: 2D dynamic clouds (src/engine/oldschool/clouds.ts) drifting past a red sun over a
 * calm horizon, shaded by the march toward the sun. A pure function of t: the cover is baked once a frame.
 */
import { cloudCover, cloudFbm, cloudMarch } from '../../engine/oldschool/clouds'
import { layer, type WidgetPreset } from '../types'
import { BODY_TOP, CREDIT_CLOUDS, IDLE, MID, T, VALUE, caption, clamp01, footer, pad, plate, tile } from './oldschool-kit'

// ── 04 SKY ── four octaves drifting at their own speeds, a clear-sky threshold, and four samples marched toward the
// sun (up and to the right): the side of a cloud facing the sun is lit white, the body grey, the far side and the
// thick middles darker. The clouds are big (the card is .7 cloud units wide) and thin out toward the horizon.
const SUN: [number, number] = [116, 30]
/** Cloud units per card cell: the coarsest octave (2 per unit) puts one or two masses across the card. */
const UNIT = .8 / 144, A = .42, B = .6, PACE = 2.5, SEED = 67
/** Clouds stop above the horizon line; the bias clears the sky toward it. */
const HORIZON = 120, CLOUD_BOTTOM = 112, CLEAR = .16
/** March step toward the sun, in plate dots (three right, two up), and the plate's margin for it. */
const DI = 3, DJ = -2, STEPS = 4
const SK = 2.5, COLS = Math.floor(144 / SK), ROWS = Math.floor((CLOUD_BOTTOM + .5 - BODY_TOP) / SK + .5)
const W = COLS + DI * (STEPS - 1), H = ROWS - DJ * (STEPS - 1), M = -DJ * (STEPS - 1)
function skyFrame(t: number) {
  const cover = new Float32Array(W * H), tt = t * PACE
  let sum = 0
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    // grid row j = plate row j − M (the margin sits above the plate, toward the sun); lower rows lose cover, and so
    // does a patch round the sun, so it shines in clear sky and the clouds part around it
    const r = j - M, x = i * SK * UNIT, y = r * SK * UNIT, low = clamp01(r / ROWS)
    const sx = (i + .5) * SK - .5 - SUN[0], sy = BODY_TOP + (r + .5) * SK - .5 - SUN[1], near = clamp01(1 - Math.sqrt(sx * sx + sy * sy) / 30)
    const c = cloudCover(cloudFbm(x, y, tt, SEED) - CLEAR * low * low - .2 * near, A, B)
    cover[j * W + i] = c
    if (i < COLS && r >= 0) sum += c
  }
  return { cover, mean: sum / (COLS * ROWS) }
}
export const osSky: WidgetPreset = {
  id: 'os-sky', name: 'Oldschool Sky', label: 'SKY', ...tile, credit: CREDIT_CLOUDS,
  layers: ctx => {
    const { cover, mean } = skyFrame(ctx.t)
    const sky = plate(SK, (_x, _y, ink, d) => {
      const i = d % COLS, j = Math.floor(d / COLS) + M, c = cover[j * W + i]
      if (!(c > .18)) return
      // the article lerps lit → shadow colour by the march; here light is grey and a little size
      const b = 1 - Math.min(1, cloudMarch(cover, W, H, i, j, DI, DJ) * 2)
      ink.v = (.25 + .75 * c) * (.8 + .2 * b)
      ink.tone = b > .72 ? VALUE : b > .4 ? IDLE : MID
    }, BODY_TOP, CLOUD_BOTTOM)
    return [
      caption('DE=MAX(FBM-RAY,0)'),
      layer(T.dots([SUN], 9), 'active'),
      layer(sky),
      // the horizon: one dotted line, the sun's path on the water below it as a few short dashes
      layer(T.hrule(0, HORIZON, 144, 3), 'mid'),
      layer(T.hrule(SUN[0] - 6, HORIZON + 4, 13, 3), 'faint'),
      layer(T.hrule(SUN[0] - 3, HORIZON + 8, 7, 3), 'faint'),
      ...footer(`COVER ${pad(mean * 100, 2)}%`, `A.${Math.round(A * 100)} B.${Math.round(B * 100)}`),
    ]
  },
}
