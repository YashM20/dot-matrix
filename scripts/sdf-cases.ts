/**
 * The primitive table for scripts/sdf.ts: each 2D SDF bound to sample parameters, with the distances it must give
 * at known points (worked out from the geometry, not read back from the code) and points that must be inside or
 * outside. `exact: false` marks bounds and approximations: they still have to be 1-Lipschitz, but |∇d| may drop
 * below 1. `linf` cases are measured in the L∞ metric.
 */
import * as S from '../src/engine/sdf'

export type Sd = (x: number, y: number) => number
export interface Case {
  name: string; f: Sd
  /** (x, y, d): the distance at a known point. */
  at?: [number, number, number][]
  inside?: [number, number][]; outside?: [number, number][]
  exact?: boolean; signed?: boolean; linf?: boolean
  /** Tolerance on the known points (default 1e-9) and the Lipschitz slack (default 1e-9). */
  tol?: number; slack?: number
  /** Where the field is meant to be used; the sweeps skip points outside it. */
  domain?: (x: number, y: number) => boolean
}

const R2 = Math.SQRT2, R3 = Math.sqrt(3)
/** Sine/cosine pair of an angle, for the aperture parameters. */
const sc = (a: number): [number, number] => [Math.sin(a), Math.cos(a)]
const [s8, c8] = sc(.8)
const SQUARE = [-1, -1, 1, -1, 1, 1, -1, 1]
const ELL = [0, 0, 2, 0, 2, 1, 1, 1, 1, 2, 0, 2] // an L, concave corner at (1, 1)

export const CASES: Case[] = [
  // ── basic.ts
  { name: 'sdCircle', f: (x, y) => S.sdCircle(x, y, 1), at: [[0, 0, -1], [1, 0, 0], [3, 0, 2], [0, -2.5, 1.5]] },
  { name: 'sdBox', f: (x, y) => S.sdBox(x, y, 2, 1), at: [[0, 0, -1], [2, 0, 0], [4, 0, 2], [0, 3, 2], [3, 2, R2]] },
  { name: 'sdRoundedBox', f: (x, y) => S.sdRoundedBox(x, y, 2, 1, .5, .2, .3, .1),
    at: [[0, 0, -1], [4, 0, 2], [2, 1, .5 * (R2 - 1)], [2, -1, .2 * (R2 - 1)], [-2, 1, .3 * (R2 - 1)], [-2, -1, .1 * (R2 - 1)]] },
  { name: 'sdChamferBox', f: (x, y) => S.sdChamferBox(x, y, 2, 1, .5), at: [[0, 0, -1], [4, 0, 2], [0, 3, 2]], outside: [[2, 1]], inside: [[1.6, .6]] },
  { name: 'sdOrientedBox', f: (x, y) => S.sdOrientedBox(x, y, -1, -1, 1, 1, 1), at: [[0, 0, -.5], [-.5 / R2, .5 / R2, 0], [-R2, R2, 1.5], [2, 2, R2]] },
  { name: 'sdSegment', f: (x, y) => S.sdSegment(x, y, -1, 0, 1, 0), signed: false, at: [[0, 0, 0], [0, 2, 2], [3, 0, 2], [-2, -1, R2]] },
  { name: 'sdRhombus', f: (x, y) => S.sdRhombus(x, y, 2, 1), at: [[0, 0, -2 / Math.sqrt(5)], [2, 0, 0], [0, 1, 0], [4, 0, 2], [0, 3, 2]] },
  { name: 'sdTrapezoid', f: (x, y) => S.sdTrapezoid(x, y, 2, 1, 1), at: [[0, 1, 0], [0, -1, 0], [1.5, 0, 0], [0, 3, 2], [0, -3, 2]], inside: [[0, 0]] },
  { name: 'sdParallelogram', f: (x, y) => S.sdParallelogram(x, y, 2, 1, .5), at: [[0, 1, 0], [0, 3, 2], [2, 0, 0], [0, -3, 2]], inside: [[0, 0]] },
  { name: 'sdUnevenCapsule', f: (x, y) => S.sdUnevenCapsule(x, y, 1, .5, 2), at: [[0, 0, -1], [0, -1, 0], [0, -3, 2], [0, 2.5, 0], [0, 4.5, 2]] },
  // ── polygons.ts
  { name: 'sdEquilateralTriangle', f: (x, y) => S.sdEquilateralTriangle(x, y, 1), at: [[0, 0, -1 / R3], [0, -1 / R3, 0], [0, 2 / R3, 0], [0, -1 / R3 - 2, 2]] },
  { name: 'sdTriangleIsosceles', f: (x, y) => S.sdTriangleIsosceles(x, y, 1, 2), at: [[0, 2, 0], [0, 4, 2], [0, -1, 1], [1, 2, 0]], inside: [[0, 1]] },
  { name: 'sdTriangle', f: (x, y) => S.sdTriangle(x, y, 0, 0, 2, 0, 0, 2), at: [[.5, .5, -.5], [1, 1, 0], [-1, 0, 1], [0, -2, 2]] },
  { name: 'sdTriangle (other winding)', f: (x, y) => S.sdTriangle(x, y, 0, 0, 0, 2, 2, 0), at: [[.5, .5, -.5], [1, 1, 0], [-1, 0, 1]] },
  { name: 'sdPentagon', f: (x, y) => S.sdPentagon(x, y, 1), at: [[0, 0, -1], [0, 1, 0], [0, 3, 2]] },
  { name: 'sdHexagon', f: (x, y) => S.sdHexagon(x, y, 1), at: [[0, 0, -1], [0, 1, 0], [0, -3, 2], [2 / R3, 0, 0], [2 / R3 + 2, 0, 2]], tol: 1e-8 }, // the article's constants carry 9 digits
  { name: 'sdOctagon', f: (x, y) => S.sdOctagon(x, y, 1), at: [[0, 0, -1], [1, 0, 0], [0, 3, 2], [3, 0, 2]] },
  { name: 'sdHexagram', f: (x, y) => S.sdHexagram(x, y, 1), at: [[0, 0, -2 / R3], [R3, 1, 0], [0, 2, 0], [0, 4, 2], [2 * R3, 2, 2]] },
  { name: 'sdPentagram', f: (x, y) => S.sdPentagram(x, y, 1), at: [[0, 1, 0], [0, 3, 2]], inside: [[0, 0], [0, .8]] },
  { name: 'sdStar', f: (x, y) => S.sdStar(x, y, 2, 5, 3), at: [[0, 2, 0], [0, 4, 2]], inside: [[0, 0]], outside: [[0, -2]], tol: 1e-6 },
  { name: 'sdStar (m = 2: pentagon)', f: (x, y) => S.sdStar(x, y, 2, 5, 2), at: [[0, 2, 0]], inside: [[0, 0]], tol: 1e-6 },
  { name: 'sdCross', f: (x, y) => S.sdCross(x, y, 1, .3), exact: false, at: [[1, 0, 0], [3, 0, 2], [0, 3, 2], [0, 1, 0], [2, 2, Math.hypot(1, 1.7)]], inside: [[0, 0], [.8, 0]] },
  { name: 'sdRoundedX', f: (x, y) => S.sdRoundedX(x, y, 1, .1), at: [[0, 0, -.1], [.5, .5, -.1], [3, 3, Math.hypot(2.5, 2.5) - .1]] },
  { name: 'sdPolygon (square)', f: (x, y) => S.sdPolygon(x, y, SQUARE), at: [[0, 0, -1], [1, 0, 0], [3, 0, 2], [2, 2, R2]] },
  { name: 'sdPolygon (L, concave)', f: (x, y) => S.sdPolygon(x, y, ELL), at: [[1, 1, 0], [1.5, 1.5, .5], [1.5, 1.2, .2], [.5, .5, -.5], [-2, 0, 2]] },
  // ── arcs.ts
  { name: 'sdPie', f: (x, y) => S.sdPie(x, y, s8, c8, 2), at: [[0, 2, 0], [0, 4, 2], [0, 0, 0]], inside: [[0, 1]], outside: [[0, -1]] },
  { name: 'sdCutDisk', f: (x, y) => S.sdCutDisk(x, y, 1, .5), at: [[0, 1, 0], [0, 3, 2], [0, .5, 0], [0, -1.5, 2], [0, .75, -.25]] },
  { name: 'sdArc', f: (x, y) => S.sdArc(x, y, s8, c8, 2, .25), at: [[0, 2, -.25], [0, 4.25, 2], [0, 0, 1.75]], outside: [[0, -2]] },
  { name: 'sdRing', f: (x, y) => S.sdRing(x, y, 0, 1, 1.5, .4), at: [[0, 1.5, -.2], [0, 3.7, 2], [0, 1.7, 0]], outside: [[0, -1.5]] },
  { name: 'sdHorseshoe', f: (x, y) => S.sdHorseshoe(x, y, Math.cos(1.2), Math.sin(1.2), 1.5, .5, .3), at: [[0, -1.5, -.3], [0, -1.8, 0], [0, -3.8, 2]], outside: [[0, 0], [0, 1.5]] },
  { name: 'sdVesica', f: (x, y) => S.sdVesica(x, y, 2, 1), at: [[2, 0, 0], [0, 1, 0], [0, 0, -1], [0, 3, 2], [4, 0, 2]] },
  { name: 'sdOrientedVesica', f: (x, y) => S.sdOrientedVesica(x, y, 0, -2, 0, 2, 1), at: [[0, 0, -1], [1, 0, 0], [3, 0, 2], [0, 2, 0], [0, 4, 2]] },
  { name: 'sdMoon', f: (x, y) => S.sdMoon(x, y, 1, 2, 1.5), at: [[-2, 0, 0], [-4, 0, 2], [-1.25, 0, -.75]], outside: [[1, 0]] },
  { name: 'sdRoundedCross', f: (x, y) => S.sdRoundedCross(x, y, .5), at: [[1, 0, 0], [3, 0, 2], [0, .5, 0], [0, 2.5, 2], [0, 0, 1.25 - Math.hypot(1, 1.25)]] },
  { name: 'sdEgg', f: (x, y) => S.sdEgg(x, y, 1, 1, .5, .6), at: [[0, -1, 0], [0, -3, 2], [0, 1.5, 0], [0, 3.5, 2], [0, 0, -1]], inside: [[.5, .3]] },
  { name: 'sdHeart', f: (x, y) => S.sdHeart(x, y), at: [[0, 0, 0], [0, 1, 0], [0, -2, 2], [0, .5, -Math.SQRT1_2 / 2]] },
  { name: 'sdCircleWave', f: (x, y) => S.sdCircleWave(x, y, .5, 1), signed: false, // arcs of the unit circle centred on x = 2·sin(5π/12) and, upside down, on (0, 2·cos(5π/12))
    at: [[2 * Math.sin(5 * Math.PI / 12), 1, 0], [2 * Math.sin(5 * Math.PI / 12), 3, 2], [0, 2 * Math.cos(5 * Math.PI / 12) - 1, 0]], tol: 1e-6 },
  // ── curves.ts
  { name: 'sdParabola', f: (x, y) => S.sdParabola(x, y, 1), at: [[0, 0, 0], [1, 1, 0], [0, -2, 2], [2, 4, 0]], inside: [[0, 2]], outside: [[2, 0]], tol: 1e-7 },
  { name: 'sdParabolaSegment', f: (x, y) => S.sdParabolaSegment(x, y, 1, 1), at: [[0, 1, 0], [0, 3, 2], [1, 0, 0], [.5, .75, 0]], inside: [[0, 0]], tol: 1e-7,
    domain: x => Math.abs(x) <= 1 }, // past the ends the sign comes from the extended parabola (see its doc)
  { name: 'sdBezier', f: (x, y) => S.sdBezier(x, y, -1, 0, 0, 2, 1, 0), signed: false, at: [[-1, 0, 0], [1, 0, 0], [0, 1, 0], [-3, 0, 2], [0, 3, 2]], tol: 1e-7 },
  { name: 'sdBlobbyCross', f: (x, y) => S.sdBlobbyCross(x, y, .5), at: [[1, 0, 0], [(1 - .5 * R2) / 2, (1 - .5 * R2) / 2, 0]], inside: [[0, 0]], outside: [[1, 1]], tol: 1e-7 },
  { name: 'sdTunnel', f: (x, y) => S.sdTunnel(x, y, 1, 2), at: [[0, 1, 0], [0, 3, 2], [0, -2, 0], [0, -4, 2], [0, 0, -1], [3, -1, 2]] },
  { name: 'sdStairs', f: (x, y) => S.sdStairs(x, y, 1, 1, 3), at: [[3, 3, 0], [3, 5, 2], [5, 1, 2], [1.5, -2, 2], [2, 0, 0]], inside: [[2.5, .5]], outside: [[.5, 2.5]] },
  { name: 'sdQuadraticCircle', f: (x, y) => S.sdQuadraticCircle(x, y), at: [[1, 0, 0], [0, -1, 0]], inside: [[0, 0], [.5, .5]], outside: [[1, 1], [3, 0]], tol: 1e-7 },
  { name: 'sdHyperbola', f: (x, y) => S.sdHyperbola(x, y, 1, 2), at: [[R2, 0, 0], [-R2, 0, 0], [0, 0, R2]], inside: [[3, 0]], tol: 1e-7,
    domain: (_, y) => Math.abs(y) <= 2 }, // past the clip the sign follows the full hyperbola (see its doc)
  { name: 'sdCoolS', f: (x, y) => S.sdCoolS(x, y), inside: [[0, 0]], outside: [[3, 0], [0, 3]] },
  // ── ellipse.ts
  ...(['sdEllipse', 'sdEllipseNewton', 'sdEllipseRobust'] as const).map((n): Case => ({
    name: n, f: (x, y) => S[n](x, y, 2, 1), at: [[2, 0, 0], [0, 1, 0], [4, 0, 2], [0, 3, 2], [0, 0, -1], [-2, 0, 0]], tol: 1e-6,
  })),
  { name: 'sdEllipse (a = b)', f: (x, y) => S.sdEllipse(x, y, 1.5, 1.5), at: [[0, 0, -1.5], [3, 0, 1.5]] },
  { name: 'sdEllipseRobust (eccentric)', f: (x, y) => S.sdEllipseRobust(x, y, 4, .5, 12), at: [[4, 0, 0], [0, .5, 0], [6, 0, 2], [0, 2.5, 2]], tol: 1e-6 },
  // ── corners.ts
  ...(['cornerCircle', 'cornerCosine', 'cornerCubic', 'cornerParabola'] as const).map((n): Case => ({
    name: `sdBoxCorners (${n})`, f: (x, y) => S.sdBoxCorners(x, y, 2, 1, S[n], .6),
    at: [[0, 0, -1], [2, 0, 0], [0, 1, 0], [4, 0, 2], [0, -3, 2]], outside: [[2, 1]], inside: [[1.8, .8]],
    exact: n === 'cornerCircle', slack: n === 'cornerCircle' ? 1e-9 : 2e-3,
  })),
  // ── ops.ts
  { name: 'opRound (box → rounded box)', f: S.opRound((x, y) => S.sdBox(x, y, 1.5, .5), .5), at: [[0, 0, -1], [2, 0, 0], [3, 0, 1], [1.5, .5, -.5]] },
  { name: 'opOnion (circle → ring)', f: S.opOnion((x, y) => S.sdCircle(x, y, 2), .25), at: [[2, 0, -.25], [0, 0, 1.75], [5, 0, 2.75]], inside: [[0, -2.1]] },
  // ── linf.ts
  { name: 'sdBoxLinf', linf: true, f: (x, y) => S.sdBoxLinf(x, y, 2, 1), at: [[0, 0, -1], [4, 0, 2], [3, 2, 1]] },
  { name: 'sdCircleLinf', linf: true, f: (x, y) => S.sdCircleLinf(x, y, 1), at: [[0, 0, -Math.SQRT1_2], [1, 0, 0], [3, 0, 2], [0, -3, 2]] },
  { name: 'sdEllipseLinf', linf: true, f: (x, y) => S.sdEllipseLinf(x, y, 2, 1), at: [[2, 0, 0], [0, 1, 0], [4, 0, 2], [0, 3, 2]], inside: [[0, 0]] },
  { name: 'sdParabolaLinf', linf: true, f: (x, y) => S.sdParabolaLinf(x, y, 1, 1), at: [[0, 1, 0], [1, 0, 0], [0, 3, 2], [0, 0, (1 - Math.sqrt(5)) / 2]],
    domain: (_, y) => y >= 0 }, // below the base the sign isn't defined (see its doc)
  { name: 'sdSegmentLinf', linf: true, signed: false, f: (x, y) => S.sdSegmentLinf(x, y, -1, 0, 1, 0), at: [[0, 0, 0], [0, 2, 2], [3, 0, 2], [2, 1, 1]] },
  { name: 'sdSegmentLinf (diagonal)', linf: true, signed: false, f: (x, y) => S.sdSegmentLinf(x, y, 0, 0, 2, 1), at: [[0, 0, 0], [2, 1, 0], [4, 1, 2]] },
  { name: 'sdRoundBoxLinf', linf: true, f: (x, y) => S.sdRoundBoxLinf(x, y, 2, 1, .5), at: [[0, 0, -1.5], [2.5, 0, 0], [4.5, 0, 2], [0, 3.5, 2]] },
  { name: 'sdRhombusLinf', linf: true, f: (x, y) => S.sdRhombusLinf(x, y, 2, 1), at: [[2, 0, 0], [0, 1, 0], [4, 0, 2], [0, 3, 2]], inside: [[0, 0]] },
  { name: 'sdOrientedBoxLinf', linf: true, f: (x, y) => S.sdOrientedBoxLinf(x, y, 1, 1, Math.PI / 4), at: [[R2, 0, 0], [3, 0, 3 - R2], [0, 0, -R2 / 2]], tol: 1e-6 },
  { name: 'sdOrientedBoxLinf (0 rad = box)', linf: true, f: (x, y) => S.sdOrientedBoxLinf(x, y, 2, 1, 0), at: [[0, 0, -1], [4, 0, 2], [3, 2, 1]], tol: 1e-6 },
]
