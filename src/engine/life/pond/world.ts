/**
 * The koi scene's world (docs/living-matter/L-pond.md §L1): a `World` (physics/world.ts) whose one flat state holds the
 * koi (head agents + argonaut spines), the food pellets, Elias wave-equation water at tile resolution and a foam
 * field. Step order: input → autopilot → contagion → steer + integrate (`koi.ts`) → pellets → wake → `rippleStep` →
 * foam. The bank and the shore are baked here once.
 *
 * Determinism: every step uses dsin/dcos/datan2/dpow (noise/dmath), `rngFor`/`ihash` streams, literal constants and
 * Float32 state, so the pristine run is the same in every engine. Schedules read the loop phase (`phaseSteps`), so
 * the pre-roll before `lead` lines up with the loop end and the seam has nothing to fake.
 */
import { createWorld, type StepInput } from '../../physics/world'
import { curl2, dcos, dsin, fbm2, ihash, rngFor, TAU, voronoi2 } from '../../noise'
import { createRipple, rippleAdd, rippleSplat, rippleStep, rippleTilt } from '../ripple'
import { chainInit, createChain } from '../chain'
import { koiPattern, type BodySpec } from '../body'
import { EDGE3, edgeOfGradient, RAMP3, rampGlyph } from '../glyphTiles'
import {
  BEND, CASCADE, DEFAULT_BODY_STYLE, FLICK, G_CASC, G_LURE, G_LX, G_LY, G_NEXT, G_PRESS, G_PX, G_PY, G_STILL, K_BACK, K_BEAT, K_FOOD,
  K_GULP, K_HUNGER, K_HX, K_HY, K_LEFT, K_MODE, K_PHASE, K_SIGN, K_U, K_Z, K_ZT, KOI_HALF_WIDTH, KS, MODE_GLIDE, NODES, P_AGE, P_H,
  P_STATE, P_VH, P_VX, P_VY, P_X, P_Y, PEL_EATEN, PEL_FALLING, PEL_FLOATING, PEL_OFF, PEL_SINKING, PELLETS, phaseSteps, POND_DT, pondLayout,
  PS, SPS, TILT_DRIFT, TILT_K, type KoiPond, type KoiPondSpec,
} from './layout'
import { contagion, CRUISE, startleKoi, steerKoi, type KoiCtx } from './koi'

/** The hover wake's depth by pointer speed: none below 10 cells/s, the L1 depth (.04) at 50, at most .06. */
const wakeAmp = (speed: number) => -.04 * Math.min(1.5, (speed - 10) / 40)

export function createKoiPond(spec: KoiPondSpec): KoiPond {
  const { tiles, seed } = spec, K = spec.koi.length, lay = pondLayout(K, tiles), dt = POND_DT
  const tileX = (tx: number) => tiles.ox + tiles.pitch * tx + 1.5, tileY = (ty: number) => tiles.oy + tiles.pitch * ty + 1.5
  const water = new Uint8Array(tiles.cols * tiles.rows)
  for (let ty = 0; ty < tiles.rows; ty++) for (let tx = 0; tx < tiles.cols; tx++) water[ty * tiles.cols + tx] = spec.sdf(tileX(tx), tileY(ty)) < 0 ? 1 : 0
  const ripple = createRipple({ w: tiles.cols, h: tiles.rows, damp: .984, mask: water }, lay.RIP)
  const bodies: BodySpec[] = spec.koi.map(k => ({ length: k.length, halfWidth: KOI_HALF_WIDTH, fins: true, tail: true }))
  const chains = spec.koi.map((k, i) => createChain(NODES, k.length / (NODES - 1), BEND, lay.SPINE + SPS * i))
  const markings = spec.koi.map((k, i) => koiPattern(k.kind, (ihash(seed, i, 77) & 0xffff)))
  const start = Math.round(spec.lead / dt), len = Math.round(spec.period / dt)
  const feeds = (spec.feeds ?? []).map(([sec, x, y, count]) => ({ at: Math.round(sec / dt), x, y, count }))
  const kisses = (spec.kisses ?? []).map(([sec, koi]) => ({ at: Math.round(sec / dt), koi }))
  const dives = spec.koi.map((_, i) => { const every = Math.round((8 + 12 * (ihash(seed, i, 31) / 4294967296)) / dt); return { every, off: Math.floor((ihash(seed, i, 32) / 4294967296) * every) } })
  // the bank, baked once: voronoi stones with grout, density from fBm
  const bank = new Int16Array(tiles.cols * tiles.rows).fill(-1)
  for (let ty = 0; ty < tiles.rows; ty++) for (let tx = 0; tx < tiles.cols; tx++) {
    const i = ty * tiles.cols + tx
    if (water[i]) continue
    const x = tileX(tx), y = tileY(ty), vo = voronoi2(x / 7, y / 7, seed, 'l2')
    if (vo.f2 - vo.f1 < .08) continue
    bank[i] = rampGlyph(RAMP3, .2 + .3 * (fbm2(x / 9, y / 9, 3, seed) * .5 + .5) + .3 * (1 - Math.min(1, vo.f1 * 1.4))).index
  }

  // the shore, baked once: water tiles next to the bank draw a line along it (the pond's rim)
  const shore = new Int16Array(tiles.cols * tiles.rows).fill(-1)
  for (let ty = 0; ty < tiles.rows; ty++) for (let tx = 0; tx < tiles.cols; tx++) {
    const i = ty * tiles.cols + tx, x = tileX(tx), y = tileY(ty), d = spec.sdf(x, y)
    if (!water[i] || d < -3.2) continue
    shore[i] = edgeOfGradient(EDGE3, spec.sdf(x + 1, y) - spec.sdf(x - 1, y), spec.sdf(x, y + 1) - spec.sdf(x, y - 1)).index
  }

  // scratch (outside the state: the World contract)
  const foamTmp = new Float32Array(lay.fw * lay.fh)
  const toRx = (x: number) => (x - tiles.ox - 1.5) / tiles.pitch, toRy = (y: number) => (y - tiles.oy - 1.5) / tiles.pitch
  const ctx: KoiCtx = {
    spec, seed, K, lay, chains, bodies, ripple, toRx, toRy,
    f: new Float32Array(2), cs: new Float32Array(4), others: new Float32Array(4 * K), heads: new Float32Array(3 * K), a: { x: 0, y: 0, hx: 1, hy: 0, u: 0 },
  }

  const KO = (i: number) => lay.KOI + KS * i
  const insideWater = (x: number, y: number) => spec.sdf(x, y) < -1.5

  function dropPellets(s: Float32Array, x: number, y: number, count: number, salt: number, n: number) {
    const rng = rngFor(seed, 1000 + salt, n)
    for (let k = 0; k < count; k++) {
      const slot = s[lay.G + G_NEXT] | 0, o = lay.PEL + PS * slot
      s[lay.G + G_NEXT] = (slot + 1) % PELLETS
      const th = TAU * rng(), r = 5 * Math.sqrt(rng())
      let px = x + r * dcos(th), py = y + r * dsin(th)
      for (let it = 0; it < 12 && !insideWater(px, py); it++) { px += (72 - px) * .15; py += (77 - py) * .15 }
      s[o + P_X] = px; s[o + P_Y] = py; s[o + P_H] = 1; s[o + P_VH] = -rng() * .5; s[o + P_STATE] = PEL_FALLING; s[o + P_AGE] = 0; s[o + P_VX] = 0; s[o + P_VY] = 0
    }
  }
  /** A release: a press shorter than .3 s (and no lure) drops food at the press point and startles the koi near it. */
  function release(s: Float32Array, n: number) {
    const G = lay.G
    if (s[G + G_PRESS] < .3 && !s[G + G_LURE]) {
      const px = s[G + G_PX], py = s[G + G_PY]
      if (spec.sdf(px, py) < 0) {
        dropPellets(s, px, py, 5 + Math.floor(3 * (ihash(seed, n, 5) / 4294967296)), 7, n)
        rippleSplat(ripple, s, toRx(px), toRy(py), -.5, 1)
        let hit = 0
        for (let i = 0; i < K; i++) { const c = chains[i], dx = s[c.X] - px, dy = s[c.Y] - py, r = .7 * bodies[i].length; if (dx * dx + dy * dy < r * r && startleKoi(ctx, s, i, px, py, n)) hit++ }
        if (hit) s[G + G_CASC] = Math.max(0, CASCADE - hit)
      }
    }
    s[G + G_PRESS] = -1; s[G + G_LURE] = 0
  }

  function step(s: Float32Array, n: number, inp: StepInput) {
    const ph = phaseSteps(n, start, len), t = n * dt, G = lay.G
    // ── input ──
    const p = inp.pointers[0]
    let ptrX = 0, ptrY = 0, ptrIn = false, ptrDown = false, ptrSpeed = 0
    if (p) {
      ptrX = p.x; ptrY = p.y; ptrIn = spec.sdf(p.x, p.y) < 0; ptrDown = p.down; ptrSpeed = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
      if (p.pressed) {
        if (ptrIn) rippleSplat(ripple, s, toRx(p.x), toRy(p.y), -1.2, 1.6)
        s[G + G_PRESS] = 0; s[G + G_PX] = p.x; s[G + G_PY] = p.y
      }
      if (p.down && s[G + G_PRESS] >= 0) {
        s[G + G_PRESS] += dt
        if (s[G + G_PRESS] >= .3) { s[G + G_LURE] = 1; s[G + G_LX] = p.x; s[G + G_LY] = p.y }
      }
      if (p.released && s[G + G_PRESS] >= 0) release(s, n)
      if (!p.down && !p.released) { s[G + G_PRESS] = -1; s[G + G_LURE] = 0 }
      if (!p.down && ptrIn && ptrSpeed > 10) rippleSplat(ripple, s, toRx(p.x), toRy(p.y), wakeAmp(ptrSpeed), .7)
      if (ptrSpeed > FLICK) {
        let hit = 0
        for (let i = 0; i < K; i++) {
          const c = chains[i], dx = s[c.X] - p.x, dy = s[c.Y] - p.y, r = .9 * bodies[i].length
          if (dx * dx + dy * dy < r * r && startleKoi(ctx, s, i, p.x, p.y, n)) hit++
        }
        if (hit) s[G + G_CASC] = Math.max(0, CASCADE - hit)
      }
      s[G + G_STILL] = ptrIn && !p.down && ptrSpeed < 6 ? s[G + G_STILL] + dt : 0
    } else {
      // a lifted touch leaves the frame instead of reporting down = false (framePointers drops it): that is a release
      if (s[G + G_PRESS] >= 0) release(s, n)
      s[G + G_STILL] = 0; s[G + G_PRESS] = -1; s[G + G_LURE] = 0
    }
    if (inp.kick) dropPellets(s, 72, 77, 6, 9, n)

    // ── autopilot (loop phase) ──
    for (let k = 0; k < feeds.length; k++) if (ph === feeds[k].at) dropPellets(s, feeds[k].x, feeds[k].y, feeds[k].count, k, n)
    for (let i = 0; i < K; i++) {
      const o = KO(i), d = dives[i], q = ph + d.off
      if (q % d.every === 0) s[o + K_ZT] = .1 + .55 * (ihash(seed, i, Math.floor(q / d.every) + 100) / 4294967296)
    }
    if (spec.rain) {
      // raindrops: on the loop phase (pre-roll = loop end), at hashed water tiles; none in the last 3 s before the wrap
      const h = ihash(seed, ph, 61) / 4294967296
      if (h < spec.rain * dt && ph < len - 90) {
        const tx = Math.floor((ihash(seed, ph, 62) / 4294967296) * tiles.cols), ty = Math.floor((ihash(seed, ph, 63) / 4294967296) * tiles.rows)
        if (water[ty * tiles.cols + tx]) rippleSplat(ripple, s, tx, ty, -.35, .8)
      }
    }
    for (const k of kisses) {
      if (k.koi >= K) continue
      const o = KO(k.koi), c = chains[k.koi]
      if (ph >= k.at - 90 && ph < k.at) s[o + K_ZT] = 0
      if (ph === k.at) { rippleSplat(ripple, s, toRx(s[c.X]), toRy(s[c.Y]), -.6, 1); s[o + K_GULP] = 1; s[o + K_ZT] = .3 }
    }

    // ── startle contagion (L3.2) ──
    contagion(ctx, s, n)

    // ── steer + integrate ──
    steerKoi(ctx, s, n, ptrX, ptrY, ptrIn, ptrDown)

    // ── pellets ──
    for (let k = 0; k < PELLETS; k++) {
      const o = lay.PEL + PS * k, st = s[o + P_STATE]
      if (st === PEL_OFF) continue
      s[o + P_AGE] += dt
      if (st === PEL_FALLING) {
        s[o + P_VH] -= 9.8 * dt; s[o + P_H] += s[o + P_VH] * dt
        if (s[o + P_H] <= 0) { s[o + P_H] = 0; s[o + P_STATE] = PEL_FLOATING; s[o + P_AGE] = 0; rippleSplat(ripple, s, toRx(s[o + P_X]), toRy(s[o + P_Y]), -.35, .8) }
      } else if (st === PEL_FLOATING) {
        const v = curl2(s[o + P_X] / 40, s[o + P_Y] / 40, .05 * t, seed, cv)
        s[o + P_VX] = v[0] * 1.5 + inp.gx * TILT_DRIFT; s[o + P_VY] = v[1] * 1.5 + inp.gy * TILT_DRIFT
        const x = s[o + P_X] + s[o + P_VX] * dt, y = s[o + P_Y] + s[o + P_VY] * dt
        if (insideWater(x, y)) { s[o + P_X] = x; s[o + P_Y] = y }
        if (s[o + P_AGE] > 14) { s[o + P_STATE] = PEL_SINKING; s[o + P_AGE] = 0 }
      } else if (st === PEL_SINKING) { if (s[o + P_AGE] > 1.5) s[o + P_STATE] = PEL_OFF }
      else if (st === PEL_EATEN) { if (s[o + P_AGE] > .4) s[o + P_STATE] = PEL_OFF }
    }

    // ── wake and foam ──
    const F = lay.FOAM
    for (let i = 0; i < K; i++) {
      const o = KO(i), c = chains[i], L = bodies[i].length, ul = s[o + K_U] / L
      const amt = -.01 * ul * s[o + K_BEAT] * (1 - s[o + K_Z])
      for (let q = 12; q < NODES; q++) {
        const rx = toRx(s[c.X + q]), ry = toRy(s[c.Y + q])
        rippleAdd(ripple, s, rx, ry, amt)
        const fx = Math.floor((rx + .5) / 2), fy = Math.floor((ry + .5) / 2)
        if (fx >= 0 && fy >= 0 && fx < lay.fw && fy < lay.fh) s[F + fy * lay.fw + fx] += .05 * ul * (1 - s[o + K_Z])
      }
    }
    rippleStep(ripple, s)
    // tilt (L3.6): the card passes the light hub's (tx, ty) as the world's gravity channel; 0 in the pristine run
    rippleTilt(ripple, s, inp.gx, inp.gy, TILT_K)
    const fn = lay.fw * lay.fh
    for (let i = 0; i < fn; i++) s[F + i] *= .95
    if ((n & 1) === 0) {
      for (let y = 0; y < lay.fh; y++) for (let x = 0; x < lay.fw; x++) {
        const i = y * lay.fw + x, v = s[F + i] * .125
        foamTmp[i] += s[F + i] * .5
        if (x > 0) foamTmp[i - 1] += v; else foamTmp[i] += v
        if (x < lay.fw - 1) foamTmp[i + 1] += v; else foamTmp[i] += v
        if (y > 0) foamTmp[i - lay.fw] += v; else foamTmp[i] += v
        if (y < lay.fh - 1) foamTmp[i + lay.fw] += v; else foamTmp[i] += v
      }
      for (let i = 0; i < fn; i++) { s[F + i] = foamTmp[i]; foamTmp[i] = 0 }
    }
  }
  const cv: [number, number] = [0, 0]

  function init(s: Float32Array) {
    s[lay.G + G_PRESS] = -1
    for (let i = 0; i < K; i++) {
      const o = KO(i), h = (salt: number) => ihash(seed, i, salt) / 4294967296
      // spread on a ring around the centre, headings mostly along it
      const ang = TAU * (i / K + .1 * h(1)), rad = .45 + .15 * h(2)
      const x = 72 + 50 * rad * dcos(ang), y = 77 + 46 * rad * dsin(ang)
      const ha = ang + Math.PI / 2 + (h(3) - .5) * 1.2, hx = dcos(ha), hy = dsin(ha)
      s[o + K_HX] = hx; s[o + K_HY] = hy; s[o + K_U] = CRUISE * spec.koi[i].length
      s[o + K_Z] = s[o + K_ZT] = .2 + .5 * h(4); s[o + K_PHASE] = TAU * h(5); s[o + K_BEAT] = .3
      s[o + K_MODE] = MODE_GLIDE; s[o + K_LEFT] = 1 + 2.5 * h(6); s[o + K_FOOD] = -1; s[o + K_SIGN] = 1; s[o + K_HUNGER] = .25 * h(8)
      chainInit(chains[i], s, x, y, hx, hy)
    }
  }

  // blend: lerp the continuous floats; discrete slots snap at k ≥ .5; headings renormalised, phases on the circle
  const discrete = new Uint8Array(lay.size), phases: number[] = [], headsAt: number[] = []
  for (const g of [G_PRESS, G_LURE, G_NEXT]) discrete[lay.G + g] = 1
  for (let i = 0; i < K; i++) { const o = KO(i); discrete[o + K_MODE] = discrete[o + K_SIGN] = discrete[o + K_FOOD] = discrete[o + K_BACK] = 1; phases.push(o + K_PHASE); headsAt.push(o + K_HX) }
  for (let k = 0; k < PELLETS; k++) discrete[lay.PEL + PS * k + P_STATE] = 1
  const isPhase = new Uint8Array(lay.size)
  for (const q of phases) isPhase[q] = 1
  /**
   * The world's seam calls this after each of the loop's last steps with k = 1/(rem + 1), toward the fixed loop-start
   * state, while the koi keep swimming; at that k the motion reopens the gap every step and the koi land about a tile
   * off. Doubling k (capped at 1) makes the remaining gap telescope, the product of (rem - 1)/(rem + 1), to exactly 0
   * at the last step. A heal (k = 1/healLeft) still ends on the pristine state.
   */
  function blend(x: Float32Array, y: Float32Array, k0: number) {
    const k = k0 >= .5 ? 1 : 2 * k0
    for (let i = 0; i < x.length; i++) {
      if (discrete[i]) { if (k >= .5) x[i] = y[i]; continue }
      if (isPhase[i]) {
        let d = y[i] - x[i]
        if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU
        let v = x[i] + d * k
        if (v >= TAU) v -= TAU; else if (v < 0) v += TAU
        x[i] = v; continue
      }
      x[i] += (y[i] - x[i]) * k
    }
    for (const q of headsAt) { const hx = x[q], hy = x[q + 1], l = Math.sqrt(hx * hx + hy * hy); if (l > 1e-9) { x[q] = hx / l; x[q + 1] = hy / l } else { x[q] = 1; x[q + 1] = 0 } }
  }

  const world = createWorld({
    size: lay.size, dt, lead: spec.lead, period: spec.period, seam: spec.seam,
    every: 120, maxCheckpoints: 16, maxSteps: 2400, idle: 4, heal: 2, maxLiveSteps: 4,
    // no gravity: the pond reads the input's (gx, gy) as the hub's tilt (tx, ty), exactly 0 at rest and in the pristine run
    gravity: [0, 0],
    init, step, blend,
  })
  return { world, spec, ripple, chains, markings, bodyStyle: spec.bodyStyle ?? DEFAULT_BODY_STYLE, layout: lay, bank, shore, water, bodies }
}
