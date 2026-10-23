/**
 * The NCA training target: a top-down dot lizard (the Growing-NCA mascot) on a 24 × 28 training grid (the board runs it on 32 × 28: an NCA is
 * translation-invariant, so the extra margin costs nothing to learn), built from
 * SDF primitives (head ellipse, torso, tapering tail, four splayed legs with toes) so it can be tweaked as
 * geometry rather than pixel art. Two visible channels per cell: alpha (1 inside the lizard) and tone
 * (1 = body, .5 = the darker back spots and eyes, drawn as `mid` dots on the card).
 *
 *   npx tsx scripts/nca/target.ts      # print it as ASCII
 */
export const GRID_W = 24, GRID_H = 28
/** The geometry below is drawn on a 32-wide canvas centred on x = 16; the training grid crops 4 columns each side. */
const SHIFT = 4
/** Where the single seed cell sits (the torso centre). */
export const SEED_AT: [number, number] = [16 - SHIFT, 12]

type Pt = [number, number]
const segDist = (px: number, py: number, [ax, ay]: Pt, [bx, by]: Pt) => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy
  const k = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0
  return { d: Math.hypot(px - ax - dx * k, py - ay - dy * k), k }
}
/** Distance to a polyline whose radius tapers linearly from r0 to r1 along it (negative inside). */
function strand(px: number, py: number, pts: Pt[], r0: number, r1: number): number {
  let len = 0; const acc = [0]
  for (let i = 1; i < pts.length; i++) { len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); acc.push(len) }
  let best = Infinity
  for (let i = 1; i < pts.length; i++) {
    const { d, k } = segDist(px, py, pts[i - 1], pts[i])
    const s = (acc[i - 1] + k * (acc[i] - acc[i - 1])) / len
    best = Math.min(best, d - (r0 + (r1 - r0) * s))
  }
  return best
}
const ellipse = (px: number, py: number, cx: number, cy: number, rx: number, ry: number) => (Math.hypot((px - cx) / rx, (py - cy) / ry) - 1) * Math.min(rx, ry)
const mirror = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [32 - x, y])

const FRONT: Pt[] = [[15, 9.5], [11.5, 8.2], [9.2, 5.6]]
const BACK: Pt[] = [[15, 15.6], [11.6, 16.6], [9.6, 18.8]]
const TAIL: Pt[] = [[16, 17], [16, 21], [15.2, 24], [12.6, 25.6], [10, 25.3], [8.8, 23.6]]
/** Toes: two short strands fanning out of each foot. */
function toes(foot: Pt, dir: number): Pt[][] {
  return [-.6, .6].map(a => [foot, [foot[0] + Math.cos(dir + a) * 1.7, foot[1] + Math.sin(dir + a) * 1.7]])
}
function lizardSdf(x: number, y: number): number {
  let d = ellipse(x, y, 16, 4.6, 2.9, 3.4)                     // head
  d = Math.min(d, strand(x, y, [[16, 7], [16, 9]], 1.5, 1.9))    // neck
  d = Math.min(d, ellipse(x, y, 16, 12.4, 3, 5.2))               // torso
  d = Math.min(d, strand(x, y, TAIL, 2.1, 1.05))                   // tail, curling left
  for (const leg of [FRONT, BACK, mirror(FRONT), mirror(BACK)]) {
    d = Math.min(d, strand(x, y, leg, 1.3, 1.05))
    const foot = leg[leg.length - 1], prev = leg[leg.length - 2]
    for (const t of toes(foot, Math.atan2(foot[1] - prev[1], foot[0] - prev[0]))) d = Math.min(d, strand(x, y, t, .75, .6))
  }
  return d
}
/** Darker marks: two eyes and three spots down the spine. */
const SPOTS: [number, number, number][] = [[14.7, 3.7, .75], [17.3, 3.7, .75], [16, 10.6, 1], [16, 14.2, 1], [16, 19.6, .9]]

/** alpha, tone for every cell (row-major, 2 floats per cell), unpadded. */
export function lizardTarget(): Float32Array {
  const out = new Float32Array(GRID_W * GRID_H * 2)
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
    const px = x + .5 + SHIFT, py = y + .5
    if (lizardSdf(px, py) > 0) continue
    const i = (y * GRID_W + x) * 2
    out[i] = 1
    out[i + 1] = SPOTS.some(([sx, sy, r]) => Math.hypot(px - sx, py - sy) <= r) ? .5 : 1
  }
  return out
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('target.ts')) {
  const t = lizardTarget(); let n = 0
  for (let y = 0; y < GRID_H; y++) {
    let row = ''
    for (let x = 0; x < GRID_W; x++) { const i = (y * GRID_W + x) * 2; row += t[i] ? (t[i + 1] < 1 ? '+' : '#') : '.'; if (t[i]) n++ }
    console.log(row)
  }
  console.log(`${n} cells`)
}
