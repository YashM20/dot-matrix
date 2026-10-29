/**
 * Growth (docs/living-matter/L-pond.md §L2 "grow.ts"):
 * - **Space colonisation** (Runions et al., *Modeling trees with a space colonization algorithm*, 2007; venation
 *   2005): attractors pull the nearest node within the influence distance di; each pulled node grows one step D
 *   along the mean direction to its attractors (plus a tropism); attractors within the kill distance dk of a node
 *   die. Grown once to completion and kept as a history: every node records the iteration it was born in, so a
 *   card scrubs growth by iteration instead of re-running it. Pipe-model thickness from descendant counts.
 * - **L-systems** (Prusinkiewicz & Lindenmayer, *The Algorithmic Beauty of Plants*, 1990) with stochastic rules,
 *   and a turtle that emits dot sites along its strokes (no trig per symbol: turns rotate a unit heading by a
 *   precomputed cos / sin).
 */
import { dcos, dpow, dsin, rngFor } from '../noise'

export interface ColonySpec {
  seed: number; root: [number, number][]; attractors: [number, number][]
  /** di: influence distance. */
  influence: number
  /** dk: kill distance. */
  kill: number
  /** D: segment length. */
  step: number
  /** Tropism: a direction (x, y) and its weight, added to every growth direction. */
  tropism?: [number, number, number]
  maxNodes: number; maxIterations: number
}
export interface Colony {
  x: Float32Array; y: Float32Array; parent: Int32Array
  /** Iteration each node was born in (roots: 0). */
  born: Uint16Array
  /** Pipe model: descendants^(1/2.5) (Runions 2007 §4, after Shinozaki's pipe model). */
  thickness: Float32Array
  /** Descendant count per node (itself included). */
  descendants: Int32Array
  count: number; iterations: number
}

const cache = new Map<string, Colony>()
/** FNV-1a over the spec's numbers: the cache key. */
function keyOf(spec: ColonySpec): string {
  let h = 0x811c9dc5
  const f = new Float32Array(1), u = new Uint32Array(f.buffer)
  const mix = (v: number) => { f[0] = v; const w = u[0]; for (let b = 0; b < 4; b++) { h ^= (w >>> (8 * b)) & 0xff; h = Math.imul(h, 0x01000193) >>> 0 } }
  for (const v of [spec.seed, spec.influence, spec.kill, spec.step, spec.maxNodes, spec.maxIterations, ...(spec.tropism ?? [0, 0, 0])]) mix(v)
  for (const [x, y] of spec.root) { mix(x); mix(y) }
  for (const [x, y] of spec.attractors) { mix(x); mix(y) }
  return `${h}:${spec.root.length}:${spec.attractors.length}`
}
/** Colonies kept (most recent first out): the terrarium keys one per hour bucket. */
export const COLONY_CACHE = 2

/** Grow to completion once, keeping the birth iteration of every node (the history scrubs by iteration). Cached by spec. */
export function colonise(spec: ColonySpec): Colony {
  const key = keyOf(spec), hit = cache.get(key)
  if (hit) { cache.delete(key); cache.set(key, hit); return hit }
  const c = grow(spec)
  cache.set(key, c)
  while (cache.size > COLONY_CACHE) cache.delete(cache.keys().next().value!)
  return c
}

function grow(spec: ColonySpec): Colony {
  const M = spec.maxNodes, A = spec.attractors.length, di2 = spec.influence * spec.influence, dk2 = spec.kill * spec.kill, D = spec.step
  const x = new Float32Array(M), y = new Float32Array(M), parent = new Int32Array(M).fill(-1), born = new Uint16Array(M)
  const ax = new Float64Array(A), ay = new Float64Array(A), alive = new Uint8Array(A).fill(1)
  const near = new Int32Array(A).fill(-1), nearD = new Float64Array(A).fill(Infinity)
  spec.attractors.forEach(([px, py], i) => { ax[i] = px; ay[i] = py })
  const [tx, ty, tw] = spec.tropism ?? [0, 0, 0]
  let count = 0
  for (const [rx, ry] of spec.root) { if (count < M) { x[count] = rx; y[count] = ry; count++ } }
  /** Attractors: kill those within dk of nodes [from, count), and refresh each one's nearest node. */
  const update = (from: number) => {
    for (let a = 0; a < A; a++) {
      if (!alive[a]) continue
      for (let i = from; i < count; i++) {
        const dx = ax[a] - x[i], dy = ay[a] - y[i], d = dx * dx + dy * dy
        if (d <= dk2) { alive[a] = 0; break }
        if (d < nearD[a]) { nearD[a] = d; near[a] = i }
      }
    }
  }
  update(0)
  const sx = new Float64Array(M), sy = new Float64Array(M), pulled = new Uint8Array(M)
  let it = 0
  for (it = 1; it <= spec.maxIterations && count < M; it++) {
    sx.fill(0, 0, count); sy.fill(0, 0, count); pulled.fill(0, 0, count)
    let any = false
    for (let a = 0; a < A; a++) {
      if (!alive[a] || near[a] < 0 || nearD[a] > di2) continue
      const i = near[a], dx = ax[a] - x[i], dy = ay[a] - y[i], l = Math.sqrt(dx * dx + dy * dy)
      if (l < 1e-9) continue
      sx[i] += dx / l; sy[i] += dy / l; pulled[i] = 1; any = true
    }
    const from = count
    if (!any) {
      // nothing within reach yet: the trunk grows from the newest node toward the closest live attractor
      let best = -1, bd = Infinity
      for (let a = 0; a < A; a++) if (alive[a] && nearD[a] < bd) { bd = nearD[a]; best = a }
      if (best < 0) break
      const i = near[best]
      sx[i] = ax[best] - x[i]; sy[i] = ay[best] - y[i]; pulled[i] = 1
    }
    for (let i = 0; i < from && count < M; i++) {
      if (!pulled[i]) continue
      let dx = sx[i], dy = sy[i], l = Math.sqrt(dx * dx + dy * dy)
      if (l < 1e-9) continue
      dx = dx / l + tx * tw; dy = dy / l + ty * tw; l = Math.sqrt(dx * dx + dy * dy)
      if (l < 1e-9) continue
      x[count] = x[i] + (D * dx) / l; y[count] = y[i] + (D * dy) / l; parent[count] = i; born[count] = it; count++
    }
    if (count === from) break
    update(from)
  }
  const desc = new Int32Array(count).fill(1)
  for (let i = count - 1; i > 0; i--) if (parent[i] >= 0) desc[parent[i]] += desc[i]
  const thickness = new Float32Array(count)
  for (let i = 0; i < count; i++) thickness[i] = dpow(desc[i], 1 / 2.5)
  return { x: x.slice(0, count), y: y.slice(0, count), parent: parent.slice(0, count), born: born.slice(0, count), thickness, descendants: desc, count, iterations: it - 1 }
}

// ── L-systems ───────────────────────────────────────────────────────────────────────────────────────
export interface LSystem {
  axiom: string
  /** Deterministic successor, or stochastic [successor, weight] pairs. */
  rules: Record<string, string | [string, number][]>
  generations: number; seed: number
}
/** Rewrite `generations` times; a stochastic rule draws from rngFor(seed, generation, symbol position). */
export function lsystem(l: LSystem): string {
  let s = l.axiom
  for (let g = 0; g < l.generations; g++) {
    let out = ''
    for (let i = 0; i < s.length; i++) {
      const r = l.rules[s[i]]
      if (r === undefined) { out += s[i]; continue }
      if (typeof r === 'string') { out += r; continue }
      let total = 0
      for (const [, w] of r) total += w
      let u = rngFor(l.seed, g, i)() * total, pick = r[r.length - 1][0]
      for (const [succ, w] of r) { if (u < w) { pick = succ; break } u -= w }
      out += pick
    }
    s = out
  }
  return s
}
export interface TurtleSites {
  x: Float32Array; y: Float32Array
  /** Bracket depth of the stroke a site sits on. */
  depth: Uint8Array
  /** Unit tangent of the stroke (for line glyphs). */
  hx: Float32Array; hy: Float32Array
  /** Stroke width (1, × shrink per '!'). */
  width: Float32Array
  count: number
}
/**
 * Turtle: F draws a step (sites every `spacing` along it), f moves, + − turn by `angle` (radians; + turns
 * clockwise on screen, y down), [ ] push / pop, ! multiplies the width by `shrink` (default .7). Heading in radians.
 */
export function turtleSites(str: string, o: { x: number; y: number; heading: number; angle: number; step: number; spacing: number; shrink?: number }): TurtleSites {
  let n = 0
  for (let i = 0; i < str.length; i++) if (str[i] === 'F') n++
  const per = Math.max(1, Math.round(o.step / o.spacing)), cap = n * per
  const X = new Float32Array(cap), Y = new Float32Array(cap), depth = new Uint8Array(cap), HX = new Float32Array(cap), HY = new Float32Array(cap), W = new Float32Array(cap)
  const c = dcos(o.angle), s = dsin(o.angle), shrink = o.shrink ?? .7
  let x = o.x, y = o.y, hx = dcos(o.heading), hy = dsin(o.heading), w = 1, d = 0, k = 0
  const stack: number[] = []
  for (let i = 0; i < str.length; i++) {
    const ch = str[i]
    if (ch === 'F') {
      for (let q = 1; q <= per; q++) { X[k] = x + (hx * o.step * q) / per; Y[k] = y + (hy * o.step * q) / per; depth[k] = Math.min(255, d); HX[k] = hx; HY[k] = hy; W[k] = w; k++ }
      x += hx * o.step; y += hy * o.step
    } else if (ch === 'f') { x += hx * o.step; y += hy * o.step }
    else if (ch === '+') { const nx = hx * c - hy * s; hy = hx * s + hy * c; hx = nx }
    else if (ch === '-') { const nx = hx * c + hy * s; hy = -hx * s + hy * c; hx = nx }
    else if (ch === '[') { stack.push(x, y, hx, hy, w); d++ }
    else if (ch === ']') { if (stack.length) { w = stack.pop()!; hy = stack.pop()!; hx = stack.pop()!; y = stack.pop()!; x = stack.pop()! } d = Math.max(0, d - 1) }
    else if (ch === '!') w *= shrink
  }
  return { x: X, y: Y, depth, hx: HX, hy: HY, width: W, count: k }
}
