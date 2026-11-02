/**
 * Engine acceptance checks for `pnpm verify` (scripts/verify.ts): the input layer, the Field IR, the raster and light
 * stack, materials as dot vocabularies, SimFields, describe(), migration and SDF morph.
 */
import { quantize } from '../../src/engine/sampler/quantize'
import { cellU, sampleLayers } from '../../src/engine/sampler/gridSampler'
import { dot480 } from '../../src/engine/theme/tokens'
import { widgetPresets, withChrome } from '../../src/widgets'
import { hash01 } from '../../src/engine/math'
import { bounded } from '../../src/engine/layout'
import type { Field } from '../../src/engine/types'
import { irChecks } from '../ir'
import { TOUCH, beginDrag, classifyMove, dragValue, isTap, keyValue, needsHold, pick, releaseValue, settle, toLocal, touchIntent, type Control } from '../../src/engine/interaction'
import { blur as rBlur, createRaster, cut as rCut, dilate as rDilate, distanceRaster, erode as rErode, moat as rMoat, outline as rOutline, rasterSum, rasterize, sample as rSample } from '../../src/engine/raster'
import { bloom, heightRaster, illuminate, lambert, lightDir, normalRaster, phong, sdfBox, sdfCircle, stackHeights, torch, type HeightRaster } from '../../src/engine/light'
import { bayer4, emissive as mEmissive, fabric as mFabric, glass as mGlass, gloss as mGloss, hourOf, matte as mMatte, metal as mMetal, sunAt } from '../../src/engine/light'
import { fallingSand, grayScott, life, lifeStamp, sandCount, simAt, simAtStep, simField, simReset, simStep, simView, SAND, SAND_B, WALL, type Sim } from '../../src/engine/sim'
import { simBoard, simBoardSims } from '../../src/widgets/boards/sim'
import { describe as describeCard, describeBoard } from '../../src/engine/describe'
import { boards as allBoards } from '../../src/widgets'
import { heartbeatCard, HEARTBEAT_STATES } from '../../src/widgets/boards/heartbeat'
import type { Assert } from '../lib/check'

const close = (a: number, b: number, eps = 1e-3) => Math.abs(a - b) < eps

export async function engineChecks(assert: Assert) {
  // 15) input layer (P2-A): toLocal, pick, dragValue, keyValue, clamp + quantize
  {
    const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps
    const tl = toLocal(110, 220, { left: 100, top: 200, width: 100, height: 50 }, { cols: 10, rows: 5 })
    assert('toLocal maps client px to cell centres', near(tl.x, .5) && near(tl.y, 1.5), `${tl.x},${tl.y}`)
    const corner = toLocal(100, 200, { left: 100, top: 200, width: 100, height: 50 }, { cols: 10, rows: 5 })
    assert('toLocal: the element corner is half a cell before cell 0', near(corner.x, -.5) && near(corner.y, -.5))

    const slider: Control = { key: 's', kind: 'slider', box: [10, 10, 100, 10], label: 'S' }
    const knob: Control = { key: 'k', kind: 'knob', box: [0, 40, 20, 20], label: 'K' }
    const ctrls = [slider, knob]
    assert('pick: box hit, miss, and hit pad', pick(ctrls, 50, 15) === 's' && pick(ctrls, 50, 30) === null && pick(ctrls, 50, 21) === 's' && pick(ctrls, 50, 21, 0) === null)
    assert('pick: knobs use the inscribed circle (box corner misses)', pick(ctrls, 10, 50) === 'k' && pick(ctrls, 1, 41, 0) === null && pick(ctrls, 1, 41) === null)
    const over: Control = { key: 'o', kind: 'button', box: [40, 10, 10, 10], label: 'O' }
    assert('pick: later controls sit on top; exact hits beat padded ones', pick([slider, over], 45, 15) === 'o' && pick([over, slider], 45, 15) === 's' && pick([slider, over], 52, 15) === 's')

    const drag = (c: Control, x: number, y: number, data: Record<string, number>, to: { x: number; y: number }) => dragValue(c, beginDrag(c, x, y, data), to)
    assert('slider: value from position, clamped', near(drag(slider, 60, 15, { s: 0 }, { x: 60, y: 15 }).s, .5) && drag(slider, 60, 15, {}, { x: 500, y: 15 }).s === 1 && drag(slider, 60, 15, {}, { x: -50, y: 15 }).s === 0)
    const stepped: Control = { ...slider, min: 0, max: 10, step: 2 }
    assert('slider: quantized to step', drag(stepped, 10, 15, {}, { x: 44, y: 15 }).s === 4, String(drag(stepped, 10, 15, {}, { x: 44, y: 15 }).s))
    const vslider: Control = { key: 'v', kind: 'slider', orientation: 'vertical', box: [0, 0, 10, 100], label: 'V' }
    assert('vertical slider grows upwards', near(drag(vslider, 5, 25, {}, { x: 5, y: 25 }).v, .75))
    assert('knob: drag up / right increases, relative to the value at press', near(drag(knob, 10, 50, { k: .5 }, { x: 10, y: 30 }).k, 1) && near(drag(knob, 10, 50, { k: .5 }, { x: 0, y: 50 }).k, .25) && drag(knob, 10, 50, { k: .5 }, { x: 10, y: 90 }).k === 0)

    const crank: Control = { key: 'c', kind: 'crank', box: [0, 0, 20, 20], label: 'C' }
    const cs = beginDrag(crank, 20, 10, { c: 0 })
    let cv = 0
    for (let i = 1; i <= 36 * 2.5; i++) { const a = i / 36 * Math.PI * 2; cv = dragValue(crank, cs, { x: 10 + 10 * Math.cos(a), y: 10 + 10 * Math.sin(a) }).c }
    assert('crank: atan2 accumulation, unbounded (2.5 clockwise turns = 2.5)', near(cv, 2.5, 1e-6), cv.toFixed(4))
    const cs2 = beginDrag(crank, 20, 10, { c: 0 })
    for (let i = 1; i <= 36; i++) { const a = -i / 36 * Math.PI * 2; cv = dragValue(crank, cs2, { x: 10 + 10 * Math.cos(a), y: 10 + 10 * Math.sin(a) }).c }
    assert('crank: counter-clockwise goes negative', near(cv, -1, 1e-6), cv.toFixed(4))
    const wrapCrank: Control = { ...crank, min: 0, max: 1, wrap: true, step: .25 }
    const cs3 = beginDrag(wrapCrank, 20, 10, { c: 0 })
    for (let i = 1; i <= 45; i++) { const a = i / 36 * Math.PI * 2; cv = dragValue(wrapCrank, cs3, { x: 10 + 10 * Math.cos(a), y: 10 + 10 * Math.sin(a) }).c }
    assert('crank: wrap + step (1.25 turns on 0..1 → .25)', near(cv, .25), String(cv))

    const xy: Control = { key: 'px', keyY: 'py', kind: 'xy', box: [0, 0, 100, 100], label: 'XY' }
    const pxy = drag(xy, 25, 25, {}, { x: 25, y: 25 })
    assert('xy: returns two values (y grows upwards)', near(pxy.px, .25) && near(pxy.py, .75) && Object.keys(pxy).length === 2)

    const stepper: Control = { key: 'n', kind: 'stepper', box: [0, 0, 40, 10], min: 0, max: 10, step: 1, label: 'N' }
    assert('stepper: tap zones step down / up, clamped', drag(stepper, 5, 5, { n: 3 }, { x: 5, y: 5 }).n === 2 && drag(stepper, 35, 5, { n: 3 }, { x: 35, y: 5 }).n === 4 && drag(stepper, 35, 5, { n: 10 }, { x: 35, y: 5 }).n === 10)
    const seg: Control = { key: 'g', kind: 'segmented', box: [0, 0, 30, 10], options: 3, label: 'G' }
    assert('segmented: the option under the pointer', drag(seg, 5, 5, {}, { x: 5, y: 5 }).g === 0 && drag(seg, 5, 5, {}, { x: 15, y: 5 }).g === 1 && drag(seg, 5, 5, {}, { x: 99, y: 5 }).g === 2)
    const tog: Control = { key: 't', kind: 'toggle', box: [0, 0, 10, 10], label: 'T' }
    const btn: Control = { key: 'b', kind: 'button', box: [0, 0, 10, 10], label: 'B' }
    assert('toggle flips the value at press; button is max while held, min on release',
      drag(tog, 5, 5, { t: 0 }, { x: 5, y: 5 }).t === 1 && drag(tog, 5, 5, { t: 1 }, { x: 5, y: 5 }).t === 0 && drag(btn, 5, 5, {}, { x: 5, y: 5 }).b === 1 && releaseValue(btn)?.b === 0 && releaseValue(slider) === null)

    assert('keys: arrows step, PageUp/Down 10 %, Home/End ends', near(keyValue(slider, .5, 'ArrowRight')!, .51) && near(keyValue(slider, .5, 'ArrowDown')!, .49)
      && near(keyValue(slider, .5, 'PageUp')!, .6) && keyValue(slider, .5, 'Home') === 0 && keyValue(slider, .5, 'End') === 1 && keyValue(slider, .5, 'a') === null)
    assert('keys: clamp and quantize', keyValue(slider, 1, 'ArrowUp') === 1 && keyValue(stepped, 4, 'ArrowRight') === 6 && keyValue(stepper, 0, 'ArrowLeft') === 0)
    assert('keys: unbounded crank has no Home/End, arrows step 1/24 turn', keyValue(crank, 0, 'Home') === null && near(keyValue(crank, 0, 'ArrowRight')!, 1 / 24))
    assert('keys: segmented wraps, toggle / button on Space / Enter', keyValue(seg, 2, 'ArrowRight') === 0 && keyValue(seg, 0, 'ArrowLeft') === 2 && keyValue(seg, 1, 'End') === 2
      && keyValue(tog, 0, ' ') === 1 && keyValue(tog, 1, 'Enter') === 0 && keyValue(tog, 0, 'ArrowRight') === null && keyValue(btn, 0, 'Enter') === 1)
    // touch policy: scroll first; a tap acts on lift, a horizontal drag or a hold claims a drag control
    assert('touch intent: tap kinds vs drag kinds; `surface` makes a button a drag surface',
      touchIntent(btn) === 'tap' && touchIntent(tog) === 'tap' && touchIntent(seg) === 'tap' && touchIntent(stepper) === 'tap'
      && touchIntent(slider) === 'drag' && touchIntent(knob) === 'drag' && touchIntent(xy) === 'drag' && touchIntent({ ...btn, gesture: 'surface' }) === 'drag')
    assert('touch: only vertical-travel drags need a hold', !needsHold(slider) && !needsHold(knob) && !needsHold(btn) && needsHold(vslider) && needsHold(xy) && needsHold(crank) && needsHold({ ...btn, gesture: 'surface' }))
    assert('touch move: within slop pending; a vertical swipe is the page\'s; a horizontal one claims drags only',
      classifyMove('drag', 6, 6) === 'pending' && classifyMove('drag', 10, 1) === 'claim' && classifyMove('drag', 3, 40) === 'scroll' && classifyMove('drag', 30, 8) === 'claim' && classifyMove('drag', 20, 19) === 'scroll'
      && classifyMove('tap', 30, 0) === 'scroll' && classifyMove('none', 30, 0) === 'scroll')
    assert('touch tap: still and quick (buttons may be held)', isTap(tog, 4, 200) && !isTap(tog, 14, 100) && !isTap(tog, 2, TOUCH.tapMs + 1) && isTap(btn, 2, 3000) && isTap(undefined, 0, 100))
    assert('settle: quantize from min, then clamp; no float noise', settle({ ...slider, min: .1, max: .9, step: .2 }, .62) === .7 && settle(slider, 3) === 1 && settle({ ...slider, step: .1 }, .3) === .3)

    // every declared control (all boards) has a usable box and a label, and its key is unique per card
    const bad: string[] = []
    for (const p of widgetPresets) {
      const keys = new Set<string>()
      for (const c of p.controls ?? []) {
        const [col, row, w, h] = c.box
        if (!(w > 0 && h > 0 && col >= -1 && row >= -1 && col + w <= p.grid.cols + 1 && row + h <= p.grid.rows + 1) || !c.label || keys.has(c.key)) bad.push(`${p.id}:${c.key}`)
        keys.add(c.key)
      }
    }
    assert('preset controls: in-grid boxes, labels, unique keys', bad.length === 0, bad.join(', '))
  }

  // IR) Field IR v0: parser limits, JSON round trip, JS ≡ GLSL-semantics reference, GLSL snapshot (scripts/ir.ts)
  irChecks(assert)
  // 16) P3-A raster + light stack: rasterize/sample, blur, morphology, distance, height → normals → lambert/phong, bloom, torch perf
  {
    const G = { cols: 37, rows: 23 }, U = cellU
    const wave: Field = (u, v) => .5 + .5 * Math.sin(u * 9.1) * Math.cos(v * 5.3)
    const ras = rasterize(wave, G), near = rSample(ras), bil = rSample(ras, 'bilinear')
    let exact = true
    for (let r = 0; r < G.rows; r++) for (let c = 0; c < G.cols; c++) {
      const want = Math.fround(wave(U(c, G.cols), U(r, G.rows)))
      if (near(U(c, G.cols), U(r, G.rows)) !== want || bil(U(c, G.cols), U(r, G.rows)) !== want) exact = false
    }
    assert('raster: sample round-trip is exact on cell centres (nearest + bilinear)', exact)
    const mid = bil(3.5 / (G.cols - 1), U(4, G.rows)), avg = (ras.data[4 * G.cols + 3] + ras.data[4 * G.cols + 4]) / 2
    assert('raster: bilinear halfway between centres is their mean; off-grid is 0', close(mid, avg, 1e-6) && near(-.2, .5) === 0 && bil(.5, 1.2) === 0)
    const br = rasterize(bounded(wave, 5, 3, 9, 8), G), bs = rSample(br)
    assert('raster: a bounded field rasterizes only its bounds; sample keeps them', br.data[0] === 0 && br.data[3 * G.cols + 5] > 0 && String(bs.bounds) === '5,3,9,8')

    // blur preserves mass, also for a blob in the corner (weight off the edge is reflected back in)
    const C = { cols: 40, rows: 30 }, blob = rasterize(bounded((u, v) => (Math.hypot(u * 39 - 2, v * 29 - 1) <= 3 ? 1 : 0), 0, 0, 6, 5), C)
    const m0 = rasterSum(blob), g = rBlur(blob, 4), bx = rBlur(blob, 3, 'box'), wr = rasterize(wave, C), whole = rBlur(wr, 6)
    assert('blur: gaussian + box preserve mass (corner blob, unbounded field)', close(rasterSum(g), m0, 1e-3) && close(rasterSum(bx), m0, 1e-3) && close(rasterSum(whole), rasterSum(wr), 1e-2),
      `${m0} → ${rasterSum(g).toFixed(4)} / ${rasterSum(bx).toFixed(4)}`)
    assert('blur: spreads (lower peak, bounds grown by the reach)', Math.max(...g.data) < 1 && String(g.bounds) === '0,0,10,9')

    // morphology on a disc of radius 6
    const D = { cols: 41, rows: 41 }, discAt = (rad: number) => rasterize((u, v) => (Math.hypot(u * 40 - 20, v * 40 - 20) <= rad ? 1 : 0), D)
    const discR = discAt(6), count = (r: { data: Float32Array }) => r.data.reduce((a, b) => a + b, 0)
    const dil = rDilate(discR, 2), ero = rErode(discR, 2)
    assert('dilate / erode grow and shrink a disc by the radius', Math.abs(count(dil) - count(discAt(8))) <= 12 && Math.abs(count(ero) - count(discAt(4))) <= 12 && ero.data[20 * 41 + 20] === 1 && ero.data[20 * 41 + 25] === 0,
      `${count(discR)} → +${count(dil)} / −${count(ero)}`)
    const inner = rOutline(discR, 1), mo = rMoat(discR, 2)
    let edgeOk = true
    for (let i = 0; i < inner.data.length; i++) { if (inner.data[i] && !discR.data[i]) edgeOk = false; if (mo.data[i] && discR.data[i]) edgeOk = false }
    assert('outline sits on the edge inside, moat just outside', edgeOk && count(inner) > 20 && count(inner) < 60 && mo.data[20 * 41 + 27] === 1 && mo.data[20 * 41 + 29] === 0 && count(rCut(dil, mo)) === count(discR))
    const sd = distanceRaster(discR)
    assert('distanceRaster: signed, ≈ −r at the centre, ±.5 across the edge', close(sd.data[20 * 41 + 20], -6, .6) && sd.data[20 * 41 + 26] < 0 && sd.data[20 * 41 + 27] > 0 && close(sd.data[20 * 41 + 30], 3.5, .01))

    // height → normals: a flat plateau and a tilted plane have constant normals
    const P = { cols: 60, rows: 60 }, boxSdf = sdfBox(P, 30, 30, 20, 20, 4), plate = heightRaster(boxSdf, { width: 4 }, P), pn = normalRaster(plate)
    let flat = true
    for (let r = 15; r <= 45; r++) for (let c = 15; c <= 45; c++) { const i = r * 60 + c; if (pn.x[i] !== 0 || pn.y[i] !== 0 || pn.z[i] !== 1) flat = false }
    const tilt: HeightRaster = { ...createRaster(P), mask: new Float32Array(3600).fill(1) }
    for (let r = 0; r < 60; r++) for (let c = 0; c < 60; c++) tilt.data[r * 60 + c] = .5 * c
    const tn = normalRaster(tilt), want = [-.5 / Math.sqrt(1.25), 0, 1 / Math.sqrt(1.25)]
    let tiltOk = true
    for (let i = 0; i < 3600; i++) if (!close(tn.x[i], want[0], 1e-6) || tn.y[i] !== 0 || !close(tn.z[i], want[2], 1e-6)) tiltOk = false
    assert('normals of a plane are flat (a plateau faces the viewer, a 0.5 slope tilts every normal alike)', flat && tiltOk)
    assert('heightRaster / normalRaster are cached per geometry, grid and profile', heightRaster(boxSdf, { shape: 'round', width: 4 }, P) === plate && normalRaster(plate) === pn
      && heightRaster(boxSdf, { width: 5 }, P) !== plate && heightRaster(boxSdf, { width: 4 }, { cols: 30, rows: 30 }) !== plate)

    // lambert of a hemisphere peaks where the normal equals L; phong where it bisects L and the view
    const S = { cols: 144, rows: 144 }, R = 40, sphere = normalRaster(heightRaster(sdfCircle(S, 72, 72, R), { width: R }, S))
    const argmax = (f: Field): [number, number, number] => { let best = -1, bc = 0, brr = 0; for (let r = 0; r < 144; r++) for (let c = 0; c < 144; c++) { const x = f(U(c, 144), U(r, 144)); if (x > best) { best = x; bc = c; brr = r } } return [bc, brr, best] }
    const L = lightDir(-Math.PI / 4, Math.PI / 4), [lc, lr, lmax] = argmax(lambert(sphere, L))
    assert('lambert of a hemisphere peaks toward L', Math.hypot(lc - (72 + R * L[0]), lr - (72 + R * L[1])) <= 1.5 && lmax > .99, `peak (${lc},${lr}) value ${lmax.toFixed(3)}`)
    const hv = [L[0], L[1], L[2] + 1], hk = 1 / Math.hypot(...hv), [pc, pr, pmax] = argmax(phong(sphere, L, [0, 0, 1], 40))
    assert('phong highlight sits on the half vector', Math.hypot(pc - (72 + R * hv[0] * hk), pr - (72 + R * hv[1] * hk)) <= 1.5 && pmax > .98 && pmax <= 1, `peak (${pc},${pr})`)
    const lit = lambert(sphere, L, { ambient: .2 })
    assert('lambert: ambient floor on the shadow side, 0 off the shape', close(lit(U(98, 144), U(98, 144)), .2, .02) && lit(U(2, 144), U(2, 144)) === 0)
    const tl = lambert(sphere, torch(52, 52, 60)), tr = lambert(sphere, torch(92, 92, 60))
    assert('torch: a point light brightens the side it is over', tl(U(60, 144), U(60, 144)) > tl(U(84, 144), U(84, 144)) && tr(U(84, 144), U(84, 144)) > tr(U(60, 144), U(60, 144)))

    // bloom: normalised to strength, the moat keeps it off the source
    const dotR = rasterize(bounded((u, v) => (Math.hypot(u * 40 - 20, v * 40 - 20) <= 2 ? 1 : 0), 18, 18, 22, 22), D), bl = bloom(dotR, 5, { strength: .8, gap: 1 })
    assert('bloom: peak = strength, source + 1-cell moat cut out, halo beyond', close(Math.max(...bl.data), .8, 1e-6) && bl.data[20 * 41 + 20] === 0 && bl.data[20 * 41 + 23] === 0 && bl.data[20 * 41 + 24] > 0 && bl.data[20 * 41 + 26] > 0)

    // perf: torch relight of a 144² card (an embossed plate + a dome): one illuminate pass + reading every cell back
    const card = stackHeights(heightRaster(sdfBox(S, 72, 72, 56, 56, 14), { width: 6 }, S), heightRaster(sdfCircle(S, 72, 72, 30), { width: 30, height: 12 }, S))
    const cn = normalRaster(card), into = createRaster(S), intoS = createRaster(S), tightCount = (n: { mask: Float32Array }) => n.mask.reduce((a, m) => a + (m > 0 ? 1 : 0), 0)
    const relight = (k: number) => illuminate(cn, torch(30 + (k % 80), 40 + (k % 50), 40, 90), { ambient: .1, shininess: 24, into, intoSpecular: intoS })
    const readBack = (f: { diffuse: Field; specular: Field }) => { let s = 0; for (let r = 0; r < 144; r++) { const v = U(r, 144); for (let c = 0; c < 144; c++) { const u = U(c, 144); s += f.diffuse(u, v) + f.specular(u, v) } } return s }
    const median = (fn: (k: number) => unknown) => {
      for (let k = 0; k < 40; k++) fn(k)
      const ts: number[] = []
      for (let k = 0; k < 101; k++) { const t0 = performance.now(); fn(k); ts.push(performance.now() - t0) }
      return ts.sort((a, b) => a - b)[50]
    }
    const pass = median(relight), full = median(k => readBack(relight(k)))
    console.log(`  torch relight 144² (one lambert + phong pass, ${tightCount(cn)} lit cells): median ${pass.toFixed(3)} ms; with every cell of both fields read back: ${full.toFixed(3)} ms`)
    assert('perf: torch relight of a 144² card ≤ 1 ms median after warm-up', pass <= 1, `${pass.toFixed(3)} ms`)
  }

  // P3-G) materials as dot vocabularies (src/engine/light/material.ts) and the board-wide time-of-day light
  {
    const N = 72, G = { cols: N, rows: N }, R = 24, U = cellU, at = (f: Field, c: number, r: number) => f(U(c, N), U(r, N))
    const ball = normalRaster(heightRaster(sdfCircle(G, 36, 36, R), { width: R }, G)), L = lightDir(-Math.PI / 4, Math.PI / 4)
    const cells = (fn: (c: number, r: number) => boolean) => { for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!fn(c, r)) return false; return true }

    // matte: the bands partition Lambert (each lit cell in exactly one band, at its Lambert value); the lit side is idle
    const mm = mMatte(ball, L, { ambient: .06, lattice: 2 }), lam = lambert(ball, L, { ambient: .06 })
    const bandsOk = cells((c, r) => { const x = at(lam, c, r), hits = mm.filter(l => at(l.field, c, r) > 0); return x < .06 ? hits.length === 0 : hits.length === 1 && close(at(hits[0].field, c, r), x, 1e-6) })
    assert('matte: faint/mid/idle bands partition Lambert, on the given lattice', bandsOk && mm.map(l => l.tone).join() === 'faint,mid,idle' && mm.every(l => l.lattice === 2)
      && at(mm[2].field, Math.round(36 + R * .5 * L[0] / Math.hypot(L[0], L[1])), Math.round(36 + R * .5 * L[1] / Math.hypot(L[0], L[1]))) > 0)

    // gloss: at the half vector the highlight is exactly two quantize steps above the body under it; nowhere above 1
    const hv = [L[0], L[1], L[2] + 1], hk = 1 / Math.hypot(...hv), hc = Math.round(36 + R * hv[0] * hk), hr = Math.round(36 + R * hv[1] * hk)
    const gl = mGloss(ball, L), hi = at(gl.highlight, hc, hr), body = at(gl.body, hc, hr)
    assert('gloss: highlight two quantize steps above its body at the half vector', close(quantize(hi, 5) - quantize(body, 5), .5, 1e-9) && cells((c, r) => at(gl.highlight, c, r) <= 1), `body ${body.toFixed(3)} → ${hi.toFixed(3)}`)
    assert('gloss: the body never takes the highlight\'s two steps (≤ 1 − 2 steps), the highlight layer is value', cells((c, r) => at(gl.body, c, r) <= .5 + 1e-9) && gl.layers[gl.layers.length - 1].tone === 'value')

    // glass: outside the ball the scene is untouched, at the centre (flat normal) it is unshifted, toward the rim it is read from nearer the centre
    const scene: Field = (u, v) => Math.round(u * (N - 1)) / (N - 1) + Math.round(v * (N - 1)) * 7
    const gs = mGlass(ball, L, scene, { strength: 6 }), [outside] = gs.layers
    const k = Math.round(6 * ball.x[36 * N + 54]), want = at(scene, 54 - k, 36)
    assert('glass: scene untouched outside, unshifted at the centre, read toward the centre near the rim (whole cells)',
      at(outside.field, 3, 3) === at(scene, 3, 3) && at(outside.field, 36, 36) === 0 && close(at(gs.through, 36, 36), at(scene, 36, 36), 1e-6) && k > 0 && close(at(gs.through, 54, 36), want, 1e-6))

    // emissive: the halo never touches the shape (a one-dot moat), tones default to active / activeDim, cached per source
    const src = rasterize((u, v) => (Math.hypot(u * (N - 1) - 36, v * (N - 1) - 36) <= 8 ? 1 : 0), G), em = mEmissive(src, { radius: 4, gap: 1 })
    assert('emissive: core in active, activeDim halo beyond a one-dot moat, halo cached per source', em.layers.map(l => l.tone).join() === 'activeDim,active'
      && at(em.halo, 36, 36) === 0 && at(em.halo, 45, 36) === 0 && at(em.halo, 46, 36) > 0 && mEmissive(src, { radius: 4, gap: 1 }).halo === em.halo)

    // metal: only studio values (hard stripes, no ramp), the light's own reflection at the half vector, a black horizon line
    const me = mMetal(ball, L), steps = new Set<number>()
    cells((c, r) => { const x = at(me.env, c, r); if (ball.mask[r * N + c] >= .5) steps.add(Math.round(x * 1e6) / 1e6); return true })
    assert('metal: hard environment stripes (≤ 5 values), the light reflected at the half vector, a black horizon inside the ball',
      steps.size <= 5 && [...steps].every(x => close(x * 4, Math.round(x * 4), 1e-6)) && at(me.env, hc, hr) === 1 && steps.has(0), `values ${[...steps].sort().join(' ')}`)

    // fabric: every dot on a quantize step, ≤ 3 steps, deterministic, the lit half denser than the shadow half; Bayer is a permutation
    const fa = mFabric(ball, L), fb = mFabric(ball, L)
    let lit = 0, dark = 0
    const fabOk = cells((c, r) => { const x = at(fa.cloth, c, r); if (c + r < 72) lit += x; else dark += x; return x === at(fb.cloth, c, r) && close(x * 4, Math.round(x * 4), 1e-9) && x <= .75 + 1e-9 })
    const bayer = new Set<number>(); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) bayer.add(bayer4(c, r))
    assert('fabric: ordered dither on quantize steps (≤ .75), deterministic, denser on the lit side', fabOk && lit > dark * 1.5 && bayer.size === 16 && bayer4(5, 6) === bayer4(1, 2), `lit ${lit.toFixed(1)} vs shadow ${dark.toFixed(1)}`)

    // the time-of-day light: rises on the left, sets on the right, highest at noon, always above the surface; pure in the hour
    const elev = (h: number) => sunAt(h)[2]
    assert('sunAt: left in the morning, right in the afternoon, highest at noon, above the surface at night, deterministic',
      sunAt(8)[0] < 0 && sunAt(16)[0] > 0 && elev(12) > elev(9) && elev(12) > elev(15) && elev(3) > 0 && sunAt(9.7).every((x, i) => x === sunAt(9.7)[i])
      && close(hourOf(new globalThis.Date(2026, 0, 1, 9, 41, 30)), 9 + 41 / 60 + 30 / 3600, 1e-9))
  }

  // P4-A) SimFields (src/engine/sim): fixed-dt steppers replay deterministically from checkpoints, loop so any t is
  // bounded, conserve sand, run B3/S23, and allocate nothing per step
  {
    const same = (a: Float32Array, b: Float32Array) => a.length === b.length && a.every((x, i) => x === b[i])
    const makers: [string, () => Sim][] = [
      ['gray-scott', () => grayScott({ w: 40, h: 40, seed: 3, every: 10 })],
      ['gray-scott clamp', () => grayScott({ w: 40, h: 40, seed: 3, every: 10, edge: 'clamp', killAt: x => x < 3 ? .01 : 0 })],
      ['sand', () => fallingSand({ w: 40, h: 40, seed: 5, every: 10 })],
      ['life', () => life({ w: 40, h: 40, seed: 11, every: 10 })],
      ['life dead+glow', () => life({ w: 40, h: 40, seed: 11, every: 10, edge: 'dead', afterglow: .8 })],
    ]
    for (const [name, make] of makers) {
      const a = make(), b = make(), T1 = 37 * a.dt, T0 = 12 * a.dt
      const g1 = simAt(a, T1).slice()
      // same t → same grid: repeated, and on an independent instance
      const rep = same(simAt(a, T1), g1) && same(simAt(b, T1), g1)
      // replay: jump back past a checkpoint and forward again, vs. the straight run from step 0
      simAt(a, T0)
      const replay = same(simAt(a, T1), g1)
      const c = make(); let straight = c.checkpoints.get(0)!.slice(), scratch = new Float32Array(straight.length)
      for (let n = 0; n < 37; n++) { c.step(straight, scratch, c.w, c.h, n); [straight, scratch] = [scratch, straight] }
      const evolved = !same(straight, a.checkpoints.get(0)!)
      // restore after LRU eviction: a 3-checkpoint sim run far ahead, then asked for an evicted step
      const lru = make(); lru.maxCheckpoints = 3; simAtStep(lru, 80); const evicted = !lru.checkpoints.has(30)
      const restored = same(simAtStep(lru, 37), g1) && lru.checkpoints.size <= 3 && lru.checkpoints.has(0)
      assert(`sim ${name}: same t → same grid (fresh instances, replay, restore after LRU eviction) = straight run from the seed`,
        rep && replay && same(straight, g1) && evolved && a.checkpoints.has(30) && same(simAtStep(a, 20), simAtStep(make(), 20)) && evicted && restored,
        `step 37 checksum ${g1.reduce((s, x) => s + x, 0).toFixed(4)}`)
    }

    // loop: t folds into [lead, lead + period); a wall-clock t costs at most lead + period steps cold, and the grid
    // equals the one at the folded time on a fresh instance
    const looped = () => life({ w: 32, h: 32, seed: 4, lead: 1, period: 4, dt: 1 / 8 })
    const L1 = looped(), L2 = looped(), wall = 1_761_000_000.3 // a Date.now()/1000-like t
    const folded = (wall % 4 + 4) % 4
    const g3600 = simAt(L1, 3600.5).slice(), loopOk = simStep(L1, 3600.5) === simStep(L1, .5) && simStep(L1, -.5) === simStep(L1, 3.5) && simStep(L1, 0) === 8
    assert('sim loop: t = 3600 s and wall-clock t fold into [lead, lead+period); cold cost ≤ lead+period steps',
      loopOk && same(g3600, simAt(L2, .5)) && L1.stepsTaken <= 8 + 32 && same(simAt(looped(), wall), simAt(looped(), folded)), `${L1.stepsTaken} steps for t=3600.5`)

    // budget: an unlooped far jump never takes more than maxSteps in one call; it catches up and then matches exactly
    const cap = life({ w: 32, h: 32, seed: 4, maxSteps: 50 }), ref = life({ w: 32, h: 32, seed: 4 })
    simAtStep(cap, 180); const lag1 = cap.lag, took1 = cap.stepsTaken
    let calls = 1; while (cap.lag > 0 && calls < 10) { simAtStep(cap, 180); calls++ }
    assert('sim budget: one call takes ≤ maxSteps, `lag` reports the rest, catch-up lands on the exact grid',
      took1 === 50 && lag1 === 130 && cap.lag === 0 && calls === 4 && same(simAtStep(cap, 180), simAtStep(ref, 180)), `${calls} calls`)

    // sand: falling conserves mass exactly. Closed hourglass-like box: constant count, walls never move; with emitters
    // the count grows by at most one grain per emitter per step and never shrinks
    const box = fallingSand({
      w: 30, h: 30, seed: 9, emitters: [],
      init: (g, w, h) => { for (let y = 0; y < h; y++) { g[y * w] = WALL; g[y * w + w - 1] = WALL } for (let x = 5; x < 25; x++) g[15 * w + x] = x === 14 || x === 15 ? 0 : WALL; for (let y = 2; y < 12; y++) for (let x = 3; x < 27; x++) g[y * w + x] = y & 1 ? SAND : SAND_B },
    })
    const n0 = sandCount(simAtStep(box, 0)), walls0 = simAtStep(box, 0).map(x => x === WALL ? 1 : 0)
    let massOk = true, wallsOk = true
    for (let n = 1; n <= 300; n += 7) { const g = simAtStep(box, n); massOk &&= sandCount(g) === n0; wallsOk &&= g.every((x, i) => (x === WALL ? 1 : 0) === walls0[i]) }
    const kinds = (g: Float32Array, k: number) => g.reduce((s, x) => s + (x === k ? 1 : 0), 0)
    const kindOk = kinds(simAtStep(box, 300), SAND) === kinds(simAtStep(box, 0), SAND)
    const emit = fallingSand({ w: 40, h: 40, seed: 5, emitters: [{ x: .3, rate: .8 }, { x: .7, rate: .5 }] })
    let prev = 0, emitOk = true
    for (let n = 1; n <= 200; n++) { const c = sandCount(simAtStep(emit, n)); emitOk &&= c >= prev && c - prev <= 2; prev = c }
    const s = fallingSand({ w: 40, h: 40, seed: 5 }), g200 = sandCount(simAtStep(s, 200))
    assert('sim sand: mass is conserved (closed box constant per kind, walls fixed; emitters add ≤ 1 grain each per step)',
      n0 === 240 && massOk && wallsOk && kindOk && emitOk && prev > 0 && g200 > 0 && g200 <= 200, `${n0} grains held over 300 steps; ${prev} emitted`)

    // life: B3/S23. Blinker period 2, block still, glider moves (+1,+1) in 4 generations; on a torus it re-enters on
    // the far side, on dead edges it dies into debris and never wraps
    const lifeWith = (rows: string[], x: number, y: number, edge: 'wrap' | 'dead' = 'wrap') => life({ w: 12, h: 12, density: 0, edge, stamps: (g, w) => lifeStamp(g, w, rows, x, y) })
    const blinker = lifeWith(['###'], 4, 5), block = lifeWith(['##', '##'], 4, 4), glider = lifeWith(['.#.', '..#', '###'], 2, 2)
    const cells = (g: Float32Array) => [...g].flatMap((x, i) => x ? [i] : [])
    const shifted = (a: number[], d: number) => a.map(i => i + d).join()
    const gl0 = cells(simAtStep(glider, 0)), wrapG = lifeWith(['.#.', '..#', '###'], 9, 9), deadG = lifeWith(['.#.', '..#', '###'], 9, 9, 'dead')
    const lifeOk = same(simAtStep(blinker, 2), blinker.checkpoints.get(0)!) && !same(simAtStep(blinker, 1), blinker.checkpoints.get(0)!)
      && same(simAtStep(block, 5), block.checkpoints.get(0)!) && cells(simAtStep(glider, 4)).join() === shifted(gl0, 13)
      && cells(simAtStep(wrapG, 48)).length === 5 && cells(simAtStep(deadG, 48)).every(i => i >= 12 * 6)
    assert('sim life: B3/S23 (blinker, block, glider); wrap = torus, dead = bounded board', lifeOk)

    // gray-scott: the U=1, V=0 rest state is a fixed point; a mirror-symmetric seed stays symmetric on clamp edges
    const rest = grayScott({ w: 16, h: 16, blobs: 0 }), sym = grayScott({ w: 24, h: 24, blobs: 0, edge: 'clamp', sub: 4 })
    const gs = sym.checkpoints.get(0)!; for (const x of [4, 5, 6, 7, 16, 17, 18, 19]) for (let y = 6; y < 16; y++) { gs[(y * 24 + x) * 2] = .5; gs[(y * 24 + x) * 2 + 1] = .25 }
    sym.head.grid.set(gs)
    const gy = simAtStep(sym, 30); let mirror = true
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) mirror &&= Math.abs(gy[(y * 24 + x) * 2 + 1] - gy[(y * 24 + 23 - x) * 2 + 1]) < 1e-6
    assert('sim gray-scott: rest state is a fixed point; clamp edges keep a mirror-symmetric seed symmetric', same(simAtStep(rest, 20), rest.checkpoints.get(0)!) && mirror && gy.some((v, i) => i & 1 && v > .05))

    // memory: forward playback allocates nothing per step (ping-pong + bounded checkpoints); fields reuse 3 views
    const mem = grayScott({ w: 40, h: 40, maxCheckpoints: 4 }); simAtStep(mem, 1)
    const bufs = new Set<Float32Array>(); for (let n = 1; n < 200; n++) { simAtStep(mem, n); bufs.add(mem.head.grid); bufs.add(mem.scratch) }
    const views = new Set<Float32Array>(); for (let f = 0; f < 120; f++) { simField(mem, f / 30)(.5, .5); views.add(simView(mem, f / 30)) }
    assert('sim memory: head/scratch ping-pong (2 buffers over 200 steps), ≤ maxCheckpoints kept, fields read 3 reused views',
      bufs.size === 2 && mem.checkpoints.size <= 4 && views.size === 3 && simView(mem, 1) === simView(mem, 1))

    // timing: the sim board, cold (all checkpoints dropped), mounted at t = 1, 60 and 3600 s, then 15 frames on.
    // Asserted on steps (deterministic); the ms are printed for the record (bench: `pnpm bench`)
    const theme = dot480, rows: string[] = []
    let boundOk = true
    for (const T of [1, 60, 3600]) {
      for (const sim of simBoardSims) { simReset(sim); sim.stepsTaken = 0 }
      const a = performance.now()
      for (const p of simBoard) sampleLayers(withChrome(p)({ t: T, data: {} }), p.grid, p.style, theme)
      const mount = performance.now() - a, mountSteps = simBoardSims.map(s => s.stepsTaken)
      const b = performance.now()
      for (let f = 1; f <= 15; f++) for (const p of simBoard) sampleLayers(withChrome(p)({ t: T + f / 30, data: {} }), p.grid, p.style, theme)
      const frame = (performance.now() - b) / 15
      boundOk &&= simBoardSims.every((s, i) => mountSteps[i] <= s.maxSteps && s.lag === 0)
      rows.push(`t=${T}: mount ${mount.toFixed(1)} ms (${mountSteps.join('/')} steps), frame ${frame.toFixed(2)} ms`)
    }
    assert('sim board: cold mount at t = 1, 60, 3600 s stays within each sim\'s maxSteps (looped), never lags', boundOk, rows.join('; '))
  }

  // ── P4-G: describe() — agents read any board as text ──
  {
    console.log('\ndescribe')
    let threw = '', shapeOk = true, detOk = true
    for (const p of widgetPresets) {
      try {
        const a = describeCard(p, { t: 1.5 }), b = describeCard(p, { t: 1.5 })
        detOk &&= JSON.stringify(a) === JSON.stringify(b)
        shapeOk &&= a.id === p.id && !!a.summary && typeof a.state === 'string' && a.controls.length === (p.controls?.length ?? 0)
      } catch (e) { threw ||= `${p.id}: ${(e as Error).message}` }
    }
    assert(`describe: all ${widgetPresets.length} presets described without throwing, id/state/controls/summary filled`, !threw && shapeOk, threw)
    assert('describe: deterministic (same ctx → identical JSON for every preset)', detOk)
    const agent = widgetPresets.find(p => p.id === 'hb-agent')!
    const ask = describeCard(agent, { data: { state: 2 } })
    assert('describe: hb-agent state comes from its segmented control; text read from the drawn fields',
      ask.state === 'Awaiting approval' && ask.text.includes('EDIT 3 FILES?') && ask.summary.includes('Agent state = Awaiting approval'), ask.summary)
    const live = HEARTBEAT_STATES.map((st, i) => describeCard(heartbeatCard('pnpm test --run'), { state: st, data: { state: i } }))
    assert('describe: live heartbeat card names its state and shows the agent label', live.every((d, i) => d.state === HEARTBEAT_STATES[i] && d.text.includes('PNPM TEST --RUN')), live[1].summary)
    const bd = allBoards.map(b => describeBoard(b))
    assert('describeBoard: every board, one card per unique id', bd.every((d, i) => d.cards.length === new Set(allBoards[i].items.map(p => p.id)).size && d.summary.startsWith(allBoards[i].title)))
  }

  // P4-D) migration (Hilbert-rank shared-element pairing) + SDF morph
  {
    const { migrate, migrationLayers, hilbertIndex, morph, signedDistance } = await import('../src/engine/migrate')
    const { createRaster: mkRaster } = await import('../src/engine/raster')
    const { glyphLongpress } = await import('../src/widgets/boards/glyph')
    type D = { x: number; y: number; r: number; opacity: number; color: string }
    const cloud = (n: number, seed: number, w = 576): D[] => Array.from({ length: n }, (_, i) => ({ x: hash01(i, seed) * w, y: hash01(i, seed + 1) * w, r: 1 + hash01(i, seed + 2), opacity: 1, color: i % 3 ? '#ffffff' : '#7a7a7a' }))
    const key = (d: { x: number; y: number }) => `${d.x.toFixed(3)},${d.y.toFixed(3)}`
    const set = (ds: { x: number; y: number; r: number }[]) => new Set(ds.filter(d => d.r > 1e-6).map(key))
    const eqSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every(k => b.has(k))

    // the curve: order-1 visits (0,0) (0,1) (1,1) (1,0); every order-4 cell once, consecutive indices are neighbours
    const h4 = new Map<number, [number, number]>()
    for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) h4.set(hilbertIndex(x, y, 4), [x, y])
    let adjacent = h4.size === 256
    for (let d = 1; d < 256; d++) { const a = h4.get(d - 1)!, b = h4.get(d)!; adjacent &&= Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1 }
    assert('migrate hilbert: order 1 = U shape, order 4 is a bijection whose steps are unit moves', [hilbertIndex(0, 0, 1), hilbertIndex(0, 1, 1), hilbertIndex(1, 1, 1), hilbertIndex(1, 0, 1)].join() === '0,1,2,3' && adjacent)

    // pairing: deterministic, independent of input order, identity on A → A, far shorter paths than a random pairing
    const A = cloud(3000, 11), B = cloud(2600, 23), shuffled = [...A].reverse()
    const m1 = migrate(A, B), m2 = migrate(A, B), m3 = migrate(shuffled, B)
    const pairKey = (m: typeof m1, from: D[]) => Array.from(m.fromIndex, (a, k) => `${key(from[a])}>${key(B[m.toIndex[k]])}`).join('|')
    const self = migrate(A, A), selfOk = Array.from(self.fromIndex).every((a, k) => a === self.toIndex[k])
    const mean = (m: typeof m1, from: D[], to: D[]) => { let s = 0; for (let k = 0; k < m.count; k++) { const a = from[m.fromIndex[k]], b = to[m.toIndex[k]]; s += Math.hypot(a.x - b.x, a.y - b.y) } return s / m.count }
    let rnd = 0; for (let i = 0; i < 2600; i++) rnd += Math.hypot(A[i].x - B[i].x, A[i].y - B[i].y); rnd /= 2600
    const hil = mean(m1, A, B)
    assert('migrate pairing: deterministic, input-order independent, identity on A → A, shorter than random pairing',
      pairKey(m1, A) === pairKey(m2, A) && pairKey(m1, A) === pairKey(m3, shuffled) && selfOk && hil < rnd * .4, `mean path ${hil.toFixed(1)} px vs random ${rnd.toFixed(1)} px`)

    // counts: split draws max(n) dots, every one travels, p = 0 / 1 reproduce A / B exactly; fade keeps min(n) pairs, spares shrink in place
    const split0 = set(m1.dots(0)), split1 = set(m1.dots(1))
    const fade = migrate(A, B, { spares: 'fade' }), spare = Array.from(fade.toIndex).filter(i => i < 0).length
    const f1 = fade.dots(1), fadeOk = fade.count === 3000 && spare === 400 && f1.filter(d => d.r === 0 && d.opacity === 0).length === 400 && eqSet(set(f1), set(B)) && eqSet(set(fade.dots(0)), set(A))
    const grow = migrate([], B.slice(0, 10)), growOk = grow.count === 10 && grow.dots(0).every(d => d.r === 0) && eqSet(set(grow.dots(1)), set(B.slice(0, 10)))
    const covered = new Set(m1.fromIndex), coveredB = new Set(m1.toIndex)
    assert('migrate counts: split covers every dot of both sets, ends on A / B; fade pairs min(n), 400 spares shrink to 0; [] → B grows in',
      m1.count === 3000 && covered.size === 3000 && coveredB.size === 2600 && eqSet(split0, set(A)) && eqSet(split1, set(B)) && fadeOk && growOk)

    // in flight: colour mixes between the two ends, stagger delays the late ranks, arc bows the path off the chord
    const st = migrate(A, B, { stagger: .5, arc: .25 }), f = st.frame(.3), last = (st.count - 1) * 5, firstMoved = f[4] > 0, lastWaits = f[last + 4] === 0
    const mid = migrate([{ x: 0, y: 0, r: 1, opacity: 1, color: '#000000' }], [{ x: 10, y: 0, r: 3, opacity: 1, color: '#ffffff' }], { arc: .25 }).dots(.5)[0]
    assert('migrate frame: stagger by rank, arc bows the path, size and colour interpolate', firstMoved && lastWaits && close(mid.x, 5) && close(mid.y, 1.25) && close(mid.r, 2) && mid.color === '#808080')

    // board layers: a migration frame becomes site layers (never card-pitch splats), tones switch at half way
    const lay = migrationLayers(migrate([{ x: 10, y: 10, r: 2, opacity: 1, color: 'value' }], [{ x: 50, y: 10, r: 3, opacity: 1, color: 'mid' }]), .6)
    assert('migrate layers: site layers, snapped size, the `to` tone past half way', lay.length === 1 && !!lay[0].sites && lay[0].tone === 'mid' && lay[0].size! > 2 && lay[0].size! < 3)

    // perf gates (P4): setup ≤ 8 ms and a frame ≤ 4 ms for 3k dots (median of warm runs; cold first run printed)
    let c0 = performance.now(); migrate(cloud(3000, 5), cloud(3000, 6)); const cold = performance.now() - c0
    const setups: number[] = [], frames: number[] = [], out: ReturnType<typeof m1.dots> = []
    for (let i = 0; i < 15; i++) { c0 = performance.now(); migrate(A, B, { stagger: .3, arc: .1 }); setups.push(performance.now() - c0) }
    const mp = migrate(A, B, { stagger: .3, arc: .1 })
    for (let i = 0; i < 60; i++) { c0 = performance.now(); mp.dots(i / 59, out); frames.push(performance.now() - c0) }
    const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1]
    assert('migrate perf: 3000 → 2600 dots, setup ≤ 8 ms, frame ≤ 4 ms (medians)', med(setups) <= 8 && med(frames) <= 4,
      `setup ${med(setups).toFixed(2)} ms (cold ${cold.toFixed(1)}), frame ${med(frames).toFixed(3)} ms`)

    // SDF morph: k = 0 / 1 reproduce the masks, the halfway shape lies between them, the EDT is cached per shape
    const g = { cols: 40, rows: 40 }
    const disc: Field = (u, v) => (Math.hypot(u * 39 - 20, v * 39 - 20) <= 12 ? 1 : 0)
    const box = mkRaster(g); for (let y = 8; y < 32; y++) for (let x = 14; x < 26; x++) box.data[y * 40 + x] = 1
    const m0 = morph(disc, box, 0, { grid: g }), mk1 = morph(disc, box, 1, { grid: g }), mh = morph(disc, box, .5, { grid: g })
    let ends = true; for (let i = 0; i < 1600; i++) { const c = i % 40, r = (i / 40) | 0; ends &&= (m0.data[i] >= .5) === (disc(cellU(c, 40), cellU(r, 40)) >= .5) && (mk1.data[i] >= .5) === (box.data[i] >= .5) }
    const area = (r: { data: Float32Array }) => r.data.reduce((s, v) => s + (v >= .5 ? 1 : 0), 0)
    const between = area(mh) > Math.min(area(m0), area(mk1)) * .8 && area(mh) < Math.max(area(m0), area(mk1)) * 1.2 && mh.data[20 * 40 + 20] === 1
    const cached = signedDistance(box) === signedDistance(box) && signedDistance(disc, { grid: g }) === signedDistance(disc, { grid: g })
    c0 = performance.now(); for (let i = 0; i < 30; i++) morph(disc, box, i / 29, { grid: g }); const perMorph = (performance.now() - c0) / 30
    assert('sdf morph: ends reproduce both masks, halfway is in between, EDT cached per shape', ends && between && cached, `${perMorph.toFixed(3)} ms per 40×40 morph`)

    // lock-longpress: the demo hold loop locks → migrates → app → back; the app view and the lock are both site layers
    const lp = withChrome(glyphLongpress), hold = { hold: 1 }
    const at = (t: number) => sampleLayers(lp({ t, data: hold }), glyphLongpress.grid, glyphLongpress.style, dot480).length
    const lpFrames = [0, 2.4, 3.6, 6.5].map(at)
    c0 = performance.now(); for (let i = 0; i < 30; i++) at(2.1 + i * .04); const lpMs = (performance.now() - c0) / 30
    assert('lock-longpress: hold → unlock → migrate → app → back renders every phase', lpFrames.every(n => n > 100), `dots ${lpFrames.join('/')}, migrating frame ${lpMs.toFixed(2)} ms`)
  }
}
