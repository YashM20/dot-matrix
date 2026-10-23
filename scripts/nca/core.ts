/**
 * NCA training core: the exact update rule of src/engine/nca (padded grid, identity + Sobel/8 perception,
 * 3C → HID ReLU → C, fire mask, pre ∧ post alive masking) with a tape, and hand-written reverse mode through
 * every unrolled step (BPTT). The masks are constants of the tape (the paper treats them the same way).
 * Param layout (flat): w1 [HID][3C] | b1 [HID] | w2 [HID][C].
 */
export interface Dims { W: number; H: number; C: number; HID: number; VIS: number }
export const paramCount = (d: Dims) => d.HID * 3 * d.C + d.HID + d.HID * d.C
export const views = (d: Dims, flat: Float32Array) => {
  const P = 3 * d.C, a = d.HID * P, b = a + d.HID
  return { w1: flat.subarray(0, a), b1: flat.subarray(a, b), w2: flat.subarray(b, b + d.HID * d.C) }
}

/** xorshift32 in [0, 1). */
export function rng(seed: number) {
  let s = (seed >>> 0) || 0x9e3779b9
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 }
}

export interface Result { loss: number; over: number; out: Float32Array }

export function makeTrainer(d: Dims, target: Float32Array, maxSteps: number, fire = .5, overflow = 1) {
  const { W, H, C, HID, VIS } = d, WP = W + 2, NP = WP * (H + 2), P = 3 * C, N = W * H
  const interior = new Int32Array(N)
  for (let y = 0, k = 0; y < H; y++) for (let x = 0; x < W; x++) interior[k++] = (y + 1) * WP + x + 1
  // 8-neighbour Sobel table: offset (in cells), x and y coefficients (already / 8)
  const NB: [number, number, number][] = []
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue
    NB.push([dy * WP + dx, dx * (dy === 0 ? 2 : 1) / 8, dy * (dx === 0 ? 2 : 1) / 8])
  }
  const states = Array.from({ length: maxSteps + 1 }, () => new Float32Array(NP * C))
  const life = new Uint8Array(maxSteps * NP)
  const fired = new Int32Array(maxSteps * N), firedOff = new Int32Array(maxSteps + 1)
  const Pb = new Float64Array(maxSteps * N * P), Zb = new Float64Array(maxSteps * N * HID)
  const pf = new Float64Array(paramCount(d)), gf = new Float64Array(paramCount(d))
  const pre = new Uint8Array(NP), post = new Uint8Array(NP)
  let g = new Float32Array(NP * C), gx = new Float32Array(NP * C)
  const acc = new Float64Array(C), gp = new Float64Array(P)

  function alive(x: Float32Array, out: Uint8Array) {
    for (let k = 0; k < N; k++) {
      const i = interior[k]
      let live = 0
      for (let dy = -WP; dy <= WP && !live; dy += WP) {
        const r = i + dy
        if (x[(r - 1) * C] > .1 || x[r * C] > .1 || x[(r + 1) * C] > .1) live = 1
      }
      out[i] = live
    }
  }

  /** Unroll `steps` from x0, return the loss at the end and (if grad) accumulate dL/dparams into grad. */
  function run(x0: Float32Array, steps: number, seed: number, flat: Float32Array, grad: Float32Array | null): Result {
    // float64 copies for the inner loops (no float32 conversions per multiply-add)
    pf.set(flat)
    const w1 = pf.subarray(0, HID * P), b1 = pf.subarray(HID * P, HID * P + HID), w2 = pf.subarray(HID * P + HID), R = rng(seed)
    states[0].set(x0)
    firedOff[0] = 0
    for (let t = 0; t < steps; t++) {
      const x = states[t], y = states[t + 1], lt = t * NP
      alive(x, pre)
      y.set(x)
      let f = firedOff[t]
      for (let k = 0; k < N; k++) {
        const i = interior[k]
        if (!pre[i] || R() >= fire) continue
        fired[f] = i
        const po = f * P, zo = f * HID, o = i * C
        for (let c = 0; c < C; c++) {
          Pb[po + c] = x[o + c]
          let sx = 0, sy = 0
          for (let q = 0; q < 8; q++) { const v = x[o + NB[q][0] * C + c]; sx += NB[q][1] * v; sy += NB[q][2] * v }
          Pb[po + C + c] = sx; Pb[po + 2 * C + c] = sy
        }
        acc.fill(0)
        for (let j = 0; j < HID; j++) {
          let s = b1[j]
          const r = j * P
          for (let q = 0; q < P; q++) s += w1[r + q] * Pb[po + q]
          Zb[zo + j] = s
          if (s <= 0) continue
          const r2 = j * C
          for (let c = 0; c < C; c++) acc[c] += w2[r2 + c] * s
        }
        for (let c = 0; c < C; c++) y[o + c] += acc[c]
        f++
      }
      firedOff[t + 1] = f
      alive(y, post)
      for (let k = 0; k < N; k++) {
        const i = interior[k], l = pre[i] & post[i]
        life[lt + i] = l
        if (!l) y.fill(0, i * C, i * C + C)
      }
    }
    // loss: MSE on the visible channels + overflow penalty on every channel (outside ±1)
    const xs = states[steps]
    let loss = 0, over = 0
    g.fill(0)
    const kv = 1 / (N * VIS), ko = overflow / (N * C)
    for (let k = 0; k < N; k++) {
      const i = interior[k], o = i * C
      for (let v = 0; v < VIS; v++) { const e = xs[o + v] - target[k * VIS + v]; loss += e * e; g[o + v] += 2 * e * kv }
      for (let c = 0; c < C; c++) {
        const v = xs[o + c], e = v > 1 ? v - 1 : v < -1 ? v + 1 : 0
        if (e) { over += e * e; g[o + c] += 2 * e * ko }
      }
    }
    loss *= kv
    if (grad) {
      gf.fill(0)
      const gw1 = gf.subarray(0, HID * P), gb1 = gf.subarray(HID * P, HID * P + HID), gw2 = gf.subarray(HID * P + HID)
      for (let t = steps - 1; t >= 0; t--) {
        const lt = t * NP
        for (let k = 0; k < N; k++) { const i = interior[k]; if (!life[lt + i]) g.fill(0, i * C, i * C + C) }
        gx.set(g)
        for (let f = firedOff[t]; f < firedOff[t + 1]; f++) {
          const i = fired[f], o = i * C
          if (!life[lt + i]) continue
          const po = f * P, zo = f * HID
          gp.fill(0)
          for (let j = 0; j < HID; j++) {
            const z = Zb[zo + j]
            if (z <= 0) continue
            const r2 = j * C
            let gh = 0
            for (let c = 0; c < C; c++) { const gd = g[o + c]; gw2[r2 + c] += gd * z; gh += w2[r2 + c] * gd }
            if (gh === 0) continue
            gb1[j] += gh
            const r = j * P
            for (let q = 0; q < P; q++) { gw1[r + q] += gh * Pb[po + q]; gp[q] += w1[r + q] * gh }
          }
          for (let c = 0; c < C; c++) {
            gx[o + c] += gp[c]
            const ax = gp[C + c], ay = gp[2 * C + c]
            if (ax === 0 && ay === 0) continue
            for (let q = 0; q < 8; q++) gx[o + NB[q][0] * C + c] += NB[q][1] * ax + NB[q][2] * ay
          }
        }
        const s = g; g = gx; gx = s
      }
      for (let i = 0; i < gf.length; i++) grad[i] += gf[i]
    }
    return { loss, over, out: xs.slice() }
  }
  /** Visible-channel MSE of a state (no stepping). */
  function lossOf(x: Float32Array): number {
    let loss = 0
    for (let k = 0; k < N; k++) { const o = interior[k] * C; for (let v = 0; v < VIS; v++) { const e = x[o + v] - target[k * VIS + v]; loss += e * e } }
    return loss / (N * VIS)
  }
  return { run, lossOf, NP, interior }
}

/** A padded state holding one seed (alpha + hidden = 1, tone 0) at (sx, sy). */
export function seedState(d: Dims, sx: number, sy: number): Float32Array {
  const s = new Float32Array((d.W + 2) * (d.H + 2) * d.C), o = ((sy + 1) * (d.W + 2) + sx + 1) * d.C
  for (let c = 0; c < d.C; c++) s[o + c] = c === 1 ? 0 : 1
  return s
}
