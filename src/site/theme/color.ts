/**
 * Colour math for the theme generator (docs/LAYOUT-THEME-PLAN.md §4): sRGB ↔ OKLab/OKLCH, sRGB gamut
 * clamping at fixed L and h, WCAG 2 contrast, APCA (0.0.98G-4g) and colour-vision-deficiency simulation
 * (Machado 2009, severity 1, in linear RGB). Pure and framework-free; no dependency. Only the generator
 * (`accents.ts`) and the checks (`scripts/site/theme.ts`) use it: the site reads the precomputed table.
 */

export type Rgb = readonly [r: number, g: number, b: number] // 0..1, gamma-encoded sRGB
export interface Oklch { L: number; C: number; h: number }

const lin = (c: number) => (c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
const gam = (c: number) => (c <= .0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - .055)

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '')
  const f = h.length === 3 ? h.split('').map(x => x + x).join('') : h.slice(0, 6)
  return [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16) / 255) as unknown as Rgb
}
const to8 = (c: number) => Math.round(Math.min(1, Math.max(0, c)) * 255)
export const rgbToHex = (c: Rgb) => '#' + c.map(x => to8(x).toString(16).padStart(2, '0')).join('').toUpperCase()
/** `rgba(r, g, b, a)` for CSS, 8-bit channels. */
export const rgba = (hex: string, a: number) => { const c = hexToRgb(hex); return `rgba(${c.map(to8).join(', ')}, ${+a.toFixed(3)})` }

function linToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b)
  const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b)
  const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b)
  return [.2104542553 * l + .7936177850 * m - .0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .8086757660 * s]
}
function oklabToLin(L: number, a: number, b: number): [number, number, number] {
  const l = (L + .3963377774 * a + .2158037573 * b) ** 3
  const m = (L - .1055613458 * a - .0638541728 * b) ** 3
  const s = (L - .0894841775 * a - 1.2914855480 * b) ** 3
  return [4.0767416621 * l - 3.3077115913 * m + .2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s, -.0041960863 * l - .7034186147 * m + 1.7076147010 * s]
}

export function oklab(hex: string): [number, number, number] { const [r, g, b] = hexToRgb(hex).map(lin); return linToOklab(r, g, b) }
export function oklch(hex: string): Oklch {
  const [L, a, b] = oklab(hex), C = Math.hypot(a, b)
  return { L, C, h: C < 1e-6 ? 0 : (Math.atan2(b, a) * 180 / Math.PI + 360) % 360 }
}
const linOf = ({ L, C, h }: Oklch) => { const r = h * Math.PI / 180; return oklabToLin(L, C * Math.cos(r), C * Math.sin(r)) }
/** Inside sRGB (with a hair of tolerance for float error). */
export const inGamut = (c: Oklch, eps = 1e-5) => linOf(c).every(x => x >= -eps && x <= 1 + eps)
/** Inputs `fromOklch` had to clip because they were outside sRGB (the generator must leave this empty). */
export const gamutMisses: Oklch[] = []
/** Hex of an OKLCH colour; callers clamp first (out-of-gamut channels are clipped and recorded). */
export function fromOklch(c: Oklch): string {
  if (!inGamut(c, 1e-4)) gamutMisses.push(c)
  return rgbToHex(linOf(c).map(x => gam(Math.min(1, Math.max(0, x)))) as unknown as Rgb)
}

/** The most chroma ≤ `C` that fits sRGB at this L and h (binary search; L and h never move). */
export function gamutClamp(L: number, C: number, h: number): Oklch {
  L = Math.min(1, Math.max(0, L))
  if (inGamut({ L, C, h })) return { L, C, h }
  let lo = 0, hi = C
  for (let i = 0; i < 32; i++) { const mid = (lo + hi) / 2; if (inGamut({ L, C: mid, h })) lo = mid; else hi = mid }
  return { L, C: lo, h }
}
/** Max in-gamut chroma at L, h. */
export const maxChroma = (L: number, h: number) => gamutClamp(L, .5, h).C

/** WCAG 2 relative luminance of a hex colour. */
export const luminance = (hex: string) => { const [r, g, b] = hexToRgb(hex).map(lin); return .2126 * r + .7152 * g + .0722 * b }
/** WCAG 2 contrast ratio (1..21). */
export function wcag(a: string, b: string): number { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05) }

/** APCA 0.0.98G-4g lightness contrast Lc of `text` on `bg` (positive: dark on light; negative: light on dark). */
export function apca(text: string, bg: string): number {
  const Y = (hex: string) => { const [r, g, b] = hexToRgb(hex).map(c => c ** 2.4); return .2126729 * r + .7151522 * g + .0721750 * b }
  const clamp = (y: number) => (y > .022 ? y : y + (.022 - y) ** 1.414)
  const t = clamp(Y(text)), k = clamp(Y(bg))
  if (Math.abs(k - t) < .0005) return 0
  if (k > t) { const s = (k ** .56 - t ** .57) * 1.14; return s < .1 ? 0 : (s - .027) * 100 }
  const s = (k ** .65 - t ** .62) * 1.14
  return s > -.1 ? 0 : (s + .027) * 100
}

/** `fg` at alpha `a` composited over an opaque `bg`. */
export function over(fg: string, a: number, bg: string): string {
  const f = hexToRgb(fg), b = hexToRgb(bg)
  return rgbToHex(f.map((x, i) => x * a + b[i] * (1 - a)) as unknown as Rgb)
}

export type Cvd = 'protan' | 'deutan' | 'tritan'
const MACHADO: Record<Cvd, number[]> = {
  protan: [.152286, 1.052583, -.204868, .114503, .786281, .099216, -.003882, -.048116, 1.051998],
  deutan: [.367322, .860646, -.227968, .280085, .672501, .047413, -.011820, .042940, .968881],
  tritan: [1.255528, -.076749, -.178779, -.078411, .930809, .147602, .004733, .691367, .303900],
}
/** OKLab of a colour as seen with full protanopia / deuteranopia / tritanopia (Machado 2009, linear RGB). */
export function simulate(hex: string, kind: Cvd): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map(lin), m = MACHADO[kind]
  const c = [0, 3, 6].map(i => Math.min(1, Math.max(0, m[i] * r + m[i + 1] * g + m[i + 2] * b)))
  return linToOklab(c[0], c[1], c[2])
}
/** Euclidean OKLab distance (ΔE_OK; ~.02 is a just-noticeable difference). */
export const deltaE = (p: readonly number[], q: readonly number[]) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])

/** Accent vs grey must differ by lightness (ΔL) or by a clear ΔE_OK in every vision, not by hue alone. */
export const CVD_DL = .08, CVD_DE = .1
export const VISIONS = ['normal', 'protan', 'deutan', 'tritan'] as const
export type Vision = (typeof VISIONS)[number]
export const seen = (hex: string, v: Vision) => (v === 'normal' ? oklab(hex) : simulate(hex, v))
/**
 * How distinct `a` stays from each of `greys` in the worst vision: max(ΔL / CVD_DL, ΔE / CVD_DE) at the
 * closest pair (≥ 1 passes), with where that was.
 */
export function distinctness(a: string, greys: readonly string[]): { score: number; vision: Vision; grey: string; dL: number; dE: number } {
  let best = { score: Infinity, vision: 'normal' as Vision, grey: '', dL: 0, dE: 0 }
  for (const v of VISIONS) for (const g of greys) {
    const p = seen(a, v), q = seen(g, v), dL = Math.abs(p[0] - q[0]), dE = deltaE(p, q), score = Math.max(dL / CVD_DL, dE / CVD_DE)
    if (score < best.score) best = { score, vision: v, grey: g, dL, dE }
  }
  return best
}
