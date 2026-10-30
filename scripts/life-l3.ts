/**
 * L3 checks (docs/living-matter/L-pond.md §L3, steps L3.1–L3.7): feeding depth (hunger, sated koi, the gulp, pellets
 * never stuck), startle depth (the contagion cascade, the flick threshold), day and night (night frames render, keep
 * one accent and differ from 09:41), the TYPE glyph look (budget, red only on koi), reduced motion (no input reaches
 * a world), tilt and light (`rippleTilt` is exact at rest, `rippleStep` pinned, a tilt forks and heals, tilt light
 * keeps one accent), the salt, lantern and lamp holds, and the L3 gate: every pond card's frames at rest (defaults,
 * the golden clock) equal the L2 frames bit for bit. Called from scripts/life.ts (`lifeChecks`).
 */
import {
  antViews, CASCADE, createRipple, flyLantern, FLIES, flyViews, KOI_SLOTS, KOI_TYPE_TILES, koiBulge, koiView, LAMP_R, LANTERN_R, pelletViews,
  PEL_EATEN, PEL_FALLING, PEL_FLOATING, PEL_OFF, PEL_SINKING, rippleSplat, rippleStep, rippleTilt, SALT_R, setKoiHunger, bodyRaster, createBodyRaster,
  slimeLx, slimeLy, SLIME_W, SLIME_H,
} from '../src/engine/life'
import { simAtStep, simReset, simStep } from '../src/engine/sim'
import { worldAt, worldReset, type StepInput, type StepPointer, type World } from '../src/engine/physics/world'
import { sampleLayers } from '../src/engine/sampler/gridSampler'
import { dot480 } from '../src/engine/theme/tokens'
import { withChrome, type WidgetPreset } from '../src/widgets/types'
import { freezeWallClock } from './lib/freeze'
import { fmtLoaded, medianLoaded } from './lib/load'

type Assert = (name: string, cond: boolean, detail?: string) => void
const fnvBits = (a: ArrayLike<number>) => {
  let h = 0x811c9dc5
  const f = new Float32Array(1), u = new Uint32Array(f.buffer)
  for (let i = 0; i < a.length; i++) { f[0] = a[i]; const w = u[0]; for (let b = 0; b < 4; b++) { h ^= (w >>> (8 * b)) & 0xff; h = Math.imul(h, 0x01000193) >>> 0 } }
  return h.toString(16).padStart(8, '0')
}
const fnvStr = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h.toString(16).padStart(8, '0') }

/**
 * The L2 frames (FNV of the sampled dot list, data {}, frozen 09:41), taken on the L2 code before any L3 edit: koi at
 * t 0, 1.3, 2.9, 4.4, 5.9 (before the loop's first feed at 6 s, the first moment L3.1's feeding can differ), the
 * others at 0, 1.3, 7.7, 21.2, 33.3. Frames at rest must stay these (L3 gate; goldens unchanged).
 */
const L2_FRAMES: Record<string, string[]> = {
  'pond-koi': ['35f856bc', 'e38c1082', 'a3a9658e', '0f0d8417', 'de271316'],
  'pond-jelly': ['bf60d3f3', 'c9f3be3e', 'a118e398', '870d8b79', '66bb3263'],
  'pond-slime': ['c6ac7099', 'd608a496', 'ff62c644', 'a7f70385', 'a62ed30f'],
  'pond-fireflies': ['35749df8', '04a558dd', 'b838eda2', 'f2d3cd6c', '469d5a70'],
  'pond-murmur': ['e1640663', '135d364c', '8953debb', 'b88857e4', 'aa6eced8'],
  'pond-terrarium': ['4d43b58b', '2c7e53c7', '017e01e0', 'e3ab60e3', 'f18b738f'],
}
/** `rippleStep`'s output, pinned: FNV of a 600-step run on the pond mask with a splat every 50 steps (the L1.2 code). */
const RIPPLE_600 = '6045c3bb'

export async function lifeL3Checks(assert: Assert, pond: () => Promise<typeof import('../src/widgets/boards/pond/index')>): Promise<void> {
  const { pondBoard, pondWorlds, pondProbe } = await pond()
  const card = (id: string) => pondBoard.find(p => p.id === id) as WidgetPreset
  const world = (id: string) => pondWorlds[pondBoard.findIndex(p => p.id === id)]
  const frame = (p: WidgetPreset, t: number, extra: Record<string, unknown> = {}) => sampleLayers(withChrome(p)({ t, data: {}, ...extra } as Parameters<WidgetPreset['layers']>[0]), p.grid, p.style, dot480)
  const key = (p: WidgetPreset, t: number, extra: Record<string, unknown> = {}) => JSON.stringify(frame(p, t, extra))
  const koiCard = card('pond-koi'), P = pondProbe.koi.pond, W = P.world
  const resetAll = () => { for (const w of pondWorlds) { worldReset(w); simReset(w.sim) } }

  // ── the L3 gate: frames at rest equal L2 (data {} and the declared defaults), worlds pristine ──
  {
    resetAll()
    const bad: string[] = []
    for (const p of pondBoard) {
      const ts = p.id === 'pond-koi' ? [0, 1.3, 2.9, 4.4, 5.9] : [0, 1.3, 7.7, 21.2, 33.3]
      ts.forEach((t, i) => {
        if (fnvStr(key(p, t)) !== L2_FRAMES[p.id][i]) bad.push(`${p.id}@${t}`)
        if (fnvStr(key(p, t, { data: { ...p.defaults } })) !== L2_FRAMES[p.id][i]) bad.push(`${p.id}@${t} (defaults)`)
      })
      if (world(p.id).mode !== 'pristine') bad.push(`${p.id} not pristine`)
    }
    assert('pond: frames at rest (no input, defaults incl. tx = ty = 0 and lightSrc 0, 09:41) equal the L2 frames bit for bit; worlds pristine', !bad.length, bad.join(', ') || '30 frames × 2')
  }

  // ── L3.6 ripple: rippleTilt at rest is a no-op; rippleStep pinned ──
  {
    const r = createRipple({ w: 36, h: 33, mask: P.water }), s = new Float32Array(r.size)
    for (let n = 0; n < 600; n++) { if (n % 50 === 0) rippleSplat(r, s, 6 + (n % 23), 5 + (n % 19), -.8, 1.4); rippleStep(r, s) }
    const pinned = fnvBits(s), before = fnvBits(s)
    rippleTilt(r, s, 0, 0, .004)
    assert('life/ripple: rippleTilt(…, 0, 0, k) leaves the state bit-identical; rippleStep\'s output unchanged (FNV of a 600-step run = the L1.2 value)', fnvBits(s) === before && pinned === RIPPLE_600, `600-step FNV ${pinned}`)
    // a held tilt raises the downhill side (tx > 0: the right half) and stays finite
    const s2 = new Float32Array(r.size)
    for (let n = 0; n < 300; n++) { rippleStep(r, s2); rippleTilt(r, s2, .5, 0, .004) }
    let left = 0, right = 0, finite = true
    for (let y = 0; y < 33; y++) for (let x = 0; x < 36; x++) { const v = s2[y * 36 + x]; if (!Number.isFinite(v)) finite = false; if (x < 14) left += v; else if (x > 21) right += v }
    assert('life/ripple: a held tilt (tx .5) piles the water on the downhill side and stays finite', finite && right > 0 && left < 0, `Σh right ${right.toFixed(1)}, left ${left.toFixed(1)}`)
  }

  // a pristine state copy stepped by hand with crafted input (no heal in the way)
  const input = (pointers: StepPointer[] = [], gx = 0, gy = 0): StepInput => ({ pointers, gx, gy, kick: false, live: 0, quiet: 0 })
  const tapAt = (x: number, y: number): StepInput[] => [
    input([{ id: 1, x, y, vx: 0, vy: 0, down: true, pressed: true, released: false }]),
    input([{ id: 1, x, y, vx: 0, vy: 0, down: false, pressed: false, released: true }]),
  ]
  const stepper = (w: World, t0: number) => {
    const n0 = simStep(w.sim, t0), s = simAtStep(w.sim, n0).slice()
    let n = n0
    return { s, step: (inp: StepInput = input()) => { w.spec.step(s, n, inp); n++ }, get n() { return n } }
  }

  // ── L3.1 feeding depth ──
  {
    resetAll()
    // 18 pellets in 10 s: three taps of 6 (kicks would land them all at the centre); then follow every pellet to its end
    const run = stepper(W, 16)
    const drops: [number, number][] = [[50, 60], [96, 96], [70, 110]]
    let dropped = 0, eaten = 0, sank = 0
    const prev = new Int8Array(18).fill(PEL_OFF), lay = P.layout
    const watch = () => {
      for (let k = 0; k < 18; k++) {
        const st = run.s[lay.PEL + 8 * k + 4]
        if (st === PEL_FALLING && prev[k] !== PEL_FALLING) dropped++
        if (prev[k] === PEL_FLOATING && st === PEL_EATEN) eaten++
        if (prev[k] === PEL_FLOATING && st === PEL_SINKING) sank++
        prev[k] = st
      }
    }
    for (let k = 0; k < 3; k++) {
      for (const inp of tapAt(...drops[k])) { run.step(inp); watch() }
      for (let i = 0; i < 118; i++) { run.step(); watch() }
    }
    for (let i = 0; i < 30 * 18; i++) { run.step(); watch() }
    const left = pelletViews(P, run.s).length
    assert('pond-koi: 18 pellets in 10 s are all eaten or sink, none stuck (every pellet that lands ends eaten or sunk; no pellet left 18 s on)',
      dropped >= 15 && left === 0 && eaten + sank >= dropped - 3 && eaten > 0, `${dropped} dropped, ${eaten} eaten, ${sank} sank, ${left} left`)
    // sated koi ignore food: hunger 0 → no koi takes a pellet for 3 s (the hunger is back over .2 only after 10 s)
    const r2 = stepper(W, 20)
    setKoiHunger(P, r2.s, 0)
    const k0 = koiView(P, r2.s, 0)
    for (const inp of tapAt(k0.x + k0.hx * 10, k0.y + k0.hy * 10)) r2.step(inp)
    let taken = 0, chased = 0
    for (let i = 0; i < 90; i++) { r2.step(); for (let k = 0; k < 6; k++) if (koiView(P, r2.s, k).food >= 0) chased++ }
    for (const pv of pelletViews(P, r2.s)) if (pv.state === PEL_EATEN) taken++
    const hungry = stepper(W, 20)
    setKoiHunger(P, hungry.s, .8)
    for (const inp of tapAt(k0.x + k0.hx * 10, k0.y + k0.hy * 10)) hungry.step(inp)
    let hChased = 0
    for (let i = 0; i < 90; i++) { hungry.step(); for (let k = 0; k < 6; k++) if (koiView(P, hungry.s, k).food >= 0) hChased++ }
    assert('pond-koi: sated koi ignore food (hunger 0: no koi chases or eats for 3 s; the same drop with hunger .8 is chased)', taken === 0 && chased === 0 && hChased > 0, `${chased} chase-steps sated, ${hChased} hungry`)
    // the gulp: a head 1 cell wider for .3 s after a bite
    const g = stepper(W, 16)
    const kk = koiView(P, g.s, 2)
    setKoiHunger(P, g.s, .8)
    for (const inp of tapAt(kk.x + kk.hx * 6, kk.y + kk.hy * 6)) g.step(inp)
    // the bite step sets the gulp to 1 and the same step's decay leaves it at 14/15
    let bulgeSteps = -1, gulper = -1
    for (let i = 0; i < 300 && bulgeSteps < 0; i++) {
      g.step()
      for (let k = 0; k < 6 && gulper < 0; k++) if (koiView(P, g.s, k).gulp > .9) gulper = k
      if (gulper >= 0) { let m = 0; while (koiBulge(P, g.s, gulper) && m < 60) { m++; g.step() } bulgeSteps = m }
    }
    assert('pond-koi: a gulp widens the head for .3 s (8–10 steps at 30 Hz)', bulgeSteps >= 8 && bulgeSteps <= 10, `${bulgeSteps} steps (koi ${gulper})`)
  }

  // ── L3.2 startle depth ──
  {
    resetAll()
    // a tap startles the koi within .7 L directly; contagion may add koi only while the cascade has room (≤ 3 in all)
    let over = 0, spread = 0, taps = 0, worst = 0
    const refr = (st: Float32Array) => Array.from({ length: 6 }, (_, k) => koiView(P, st, k)).filter(k => k.refractory > 0).length
    for (const t0 of [14, 19.5, 23, 27.2, 31, 36.6, 40, 44.1]) for (let target = 0; target < 6; target += 2) {
      const run = stepper(W, t0), v = koiView(P, run.s, target)
      const px = v.x + v.hx * 3, py = v.y + v.hy * 3
      for (const inp of tapAt(px, py)) run.step(inp)
      const direct = refr(run.s)
      for (let i = 0; i < 20; i++) run.step()
      const total = refr(run.s)
      if (total > Math.max(CASCADE, direct)) over++
      worst = Math.max(worst, total); spread += total - direct; taps++
    }
    assert(`pond-koi: a single tap's startle cascade reaches ≤ ${CASCADE} koi (contagion adds none past ${CASCADE}; 24 taps at a koi's head)`, over === 0 && spread > 0, `${over} taps over, ${spread} koi startled by contagion over ${taps} taps, most startled by one tap ${worst}`)
    // the flick: 240 cells/s across a koi startles it; a 120 cells/s pass (an ordinary mouse move) does not
    const pass = (speed: number) => {
      const run = stepper(W, 34), k = koiView(P, run.s, 4), nx = -k.hy, ny = k.hx, step = speed / 30
      let prevX = k.x - nx * 8 * step, prevY = k.y - ny * 8 * step
      for (let i = -8; i <= 8; i++) {
        const x = k.x + nx * i * step, y = k.y + ny * i * step
        run.step(input([{ id: 2, x, y, vx: (x - prevX) * 30, vy: (y - prevY) * 30, down: false, pressed: false, released: false }]))
        prevX = x; prevY = y
      }
      return koiView(P, run.s, 4).refractory > 0
    }
    assert('pond-koi: a 240 cells/s flick startles the koi it crosses; a 120 cells/s pass does not (FLICK 200)', pass(240) && !pass(120))
  }

  // ── L3.3 day and night ──
  {
    resetAll()
    const reds = (dots: ReturnType<typeof frame>) => JSON.stringify(dots.filter(d => d.color === dot480.dotActive))
    const offPalette = (dots: ReturnType<typeof frame>) => dots.filter(d => ![dot480.dotFaint, dot480.dotMid, dot480.dotIdle, dot480.value, dot480.dotActive].includes(d.color)).length
    const out: string[] = []
    let ok = true
    for (const id of ['pond-koi', 'pond-fireflies', 'pond-terrarium']) {
      const p = card(id)
      freezeWallClock(); const day = frame(p, 0), dayKey = JSON.stringify(day)
      // dusk (20:00, night .5) thins the fireflies' few stars by half, so at a single t it may show none: they are checked at night only
      for (const [h, m] of (id === 'pond-fireflies' ? [[3, 0], [21, 0]] : [[3, 0], [21, 0], [20, 0]]) as [number, number][]) {
        freezeWallClock(2026, 0, 1, h, m)
        const night = frame(p, 0), differs = JSON.stringify(night) !== dayKey, accent = offPalette(night) === 0
        // the koi's red is untouched by night (whites come down a tone, the moon is white)
        const sameRed = id !== 'pond-koi' || reds(night) === reds(day)
        if (!(differs && accent && sameRed && night.length > 50)) ok = false
        out.push(`${id} ${h}:00 ${differs ? 'differs' : 'SAME'}${accent ? '' : ' OFF-PALETTE'}${sameRed ? '' : ' RED MOVED'}`)
      }
    }
    freezeWallClock()
    assert('pond: frames at frozen 03:00 and 21:00 (and 20:00, dusk) render, keep one accent (koi red unchanged) and differ from 09:41 (koi, fireflies, terrarium)', ok, out.filter(s => /SAME|OFF|RED/.test(s)).join('; ') || `${out.length} night frames`)
  }

  // ── L3.4 the TYPE look ──
  {
    resetAll()
    const typeData = { data: { ...koiCard.defaults, glyphs: 1 } }
    const body = createBodyRaster(), g = KOI_TYPE_TILES
    let redOut = 0, red = 0, lattice = 0
    for (const t of [0, 1.3, 7.7, 21.2]) {
      const dots = frame(koiCard, t, typeData), s = worldAt(W, t), cover = new Set<number>()
      for (let i = 0; i < 6; i++) {
        const o = P.layout.KOI + KOI_SLOTS * i
        bodyRaster(P.bodies[i], P.chains[i], s, s[o + 5], s[o + 6], body, koiBulge(P, s, i))
        for (let j = 0; j < body.h; j++) for (let k = 0; k < body.w; k++) if (body.cover[j * body.w + k]) cover.add(Math.floor((body.y0 + j - g.oy) / 8) * g.cols + Math.floor((body.x0 + k - g.ox) / 6))
      }
      for (const d of dots) {
        if (d.r > 2.25) lattice++
        if (d.color !== dot480.dotActive) continue
        red++
        const cx = Math.round(d.x / 2.25 - .5), cy = Math.round(d.y / 2.25 - .5)
        if (!cover.has(Math.floor((cy - g.oy) / 8) * g.cols + Math.floor((cx - g.ox) / 6))) redOut++
      }
    }
    assert('pond-koi: TYPE look: red only on koi, no lattice dots, and it differs from DOTS', red > 0 && redOut === 0 && key(koiCard, 1.3, typeData) !== key(koiCard, 1.3), `${red} red dots, ${redOut} off the koi, ${lattice} large dots`)
    for (let i = 0; i < 6; i++) frame(koiCard, 5 + i / 30, typeData)
    const fr = medianLoaded(i => frame(koiCard, 5.3 + i / 30, typeData), 15)
    assert('pond-koi: TYPE frame (step + layers + sample) ≤ 4 ms median warm × load', fr.ms <= 4 * fr.load, fmtLoaded(fr))
    const hover = key(koiCard, 0, { hover: 'glyphs' }) !== key(koiCard, 0)
    assert('pond-koi: the DOTS/TYPE switch shows on hover (the label row), and the default frame shows the caption only', hover && fnvStr(key(koiCard, 0, { data: { ...koiCard.defaults } })) === L2_FRAMES['pond-koi'][0])
  }

  // ── L3.5 reduced motion: no input reaches a world ──
  {
    resetAll()
    const bad: string[] = []
    for (const p of pondBoard) {
      const ctrl = p.controls?.[0]?.key ?? ''
      const still = key(p, 9)
      const moved = key(p, 9, { reducedMotion: true, pointers: [{ id: 1, x: 72, y: 80, down: true, inside: true, tDown: 0, tUp: 0, vx: 0, vy: 0, pressure: 0 }], data: { ...p.defaults, [ctrl]: 1 } })
      if (moved !== still || world(p.id).mode !== 'pristine') bad.push(p.id)
    }
    assert('pond: under reduced motion a press and a kick reach no world (all six: frame = pristine frame, world pristine)', !bad.length, bad.join(', '))
  }

  // ── L3.6 tilt and light ──
  {
    resetAll()
    let t = 30
    const data = (tx: number) => ({ data: { ...koiCard.defaults, tx, ty: 0 } })
    for (let i = 0; i < 45; i++) { t += 1 / 30; frame(koiCard, t, data(.3)) }
    const forked = W.mode === 'live'
    let heal = 0
    for (; heal < 30 * 9 && W.mode !== 'pristine'; heal++) { t += 1 / 30; frame(koiCard, t, data(0)) }
    const healed = W.mode === 'pristine' && key(koiCard, t, data(0)) === key(koiCard, t)
    assert('pond-koi: tx = .3 forks the world live; it heals to pristine after the tilt returns to 0', forked && healed, `${forked ? 'live' : W.mode} while tilted, pristine ${(heal / 30).toFixed(1)} s after`)
    resetAll()
    const lit = { data: { ...koiCard.defaults, lightSrc: 1, lightAz: 20, lightEl: 1 } }
    const a = frame(koiCard, 1.3, lit), moves = JSON.stringify(a) !== key(koiCard, 1.3)
    const off = a.filter(d => d.color === dot480.dotActiveDim || ![dot480.dotFaint, dot480.dotMid, dot480.dotIdle, dot480.value, dot480.dotActive].includes(d.color)).length
    assert('pond-koi: lightSrc 1 moves the koi shading and keeps one accent (no dotActiveDim); the world stays pristine', moves && off === 0 && W.mode === 'pristine', `${off} off-palette dots`)
  }

  // ── L3.7 holds: salt, lantern, lamp ──
  {
    resetAll()
    const hold = (w: World, t0: number, x: number, y: number, seconds: number) => {
      let t = t0
      for (let i = 0; i < seconds * 30; i++) { t += 1 / 30; worldAt(w, t, { pointers: [{ id: 9, x, y, down: true }] }) }
      return t
    }
    // slime: a 1.5 s hold clears the trail around the finger (pristine has a network there)
    const sl = pondProbe.slime, slW = sl.world, sx = 70, sy = 84
    const trailAt = (s: Float32Array) => { let sum = 0; const lx = slimeLx(sx), ly = slimeLy(sy); for (let y = 0; y < SLIME_H; y++) for (let x = 0; x < SLIME_W; x++) { const dx = x + .5 - lx, dy = y + .5 - ly; if (dx * dx + dy * dy < SALT_R * SALT_R) sum += s[y * SLIME_W + x] } return sum }
    const tS = hold(slW, 12, sx, sy, 1.5), salted = trailAt(worldAt(slW, tS, { pointers: [{ id: 9, x: sx, y: sy, down: true }] }))
    worldReset(slW)
    const plain = trailAt(worldAt(slW, tS))
    assert('pond-slime: hold = salt: the trail within the salt\'s reach is cleared (agents turn away)', salted < .02 * plain && plain > 1, `trail ${salted.toFixed(2)} under the salt vs ${plain.toFixed(1)} pristine`)
    // fireflies: an 8 s lantern pulls the flies within reach into its rhythm
    const fl = pondProbe.fireflies, flW = fl.world, lx = 72, ly = 70
    const tL = hold(flW, 12, lx, ly, 8), s = flW.live
    const lan = flyLantern(fl, s)
    const lock = (st: Float32Array, ref: number) => {
      let c = 0, sn = 0, m = 0
      for (const f of flyViews(fl, st)) { if (Math.hypot(f.x - lx, f.y - ly) >= LANTERN_R) continue; const d = 2 * Math.PI * (f.phase - ref); c += Math.cos(d); sn += Math.sin(d); m++ }
      return m ? Math.hypot(c, sn) / m : 0
    }
    const locked = lan ? lock(s, lan.phase) : 0
    worldReset(flW)
    const before = lock(worldAt(flW, tL), lan?.phase ?? 0)
    assert('pond-fireflies: hold = lantern: after 8 s the flies within reach flash with it (phase lock to the lantern ≥ .8; pristine lower)', !!lan && locked >= .8 && locked > before, `lock ${locked.toFixed(2)} vs pristine ${before.toFixed(2)} (${FLIES} flies)`)
    // terrarium: a 4 s lamp where the ants are thickest leaves fewer ants under it
    const te = pondProbe.terrarium, teW = te.world, t0 = 12, s0 = worldAt(teW, t0)
    let best = [72, 80], most = -1
    for (let y = 30; y <= 130; y += 10) for (let x = 20; x <= 124; x += 10) { const c = antViews(te, s0).filter(a => Math.hypot(a.x - x, a.y - y) < LAMP_R).length; if (c > most) { most = c; best = [x, y] } }
    const tT = hold(teW, t0, best[0], best[1], 4)
    const under = antViews(te, worldAt(teW, tT, { pointers: [{ id: 9, x: best[0], y: best[1], down: true }] })).filter(a => Math.hypot(a.x - best[0], a.y - best[1]) < LAMP_R).length
    worldReset(teW)
    const pristineUnder = antViews(te, worldAt(teW, tT)).filter(a => Math.hypot(a.x - best[0], a.y - best[1]) < LAMP_R).length
    assert('pond-terrarium: hold = lamp: ants shy from it (fewer under a 4 s lamp than in the pristine run)', under < .6 * pristineUnder, `${under} ants under the lamp vs ${pristineUnder}`)
  }
  resetAll()
}
