/**
 * The determinism lint (docs/living-matter/F0-foundation.md F0.9): the single source scan that keeps
 * engine-specific `Math.*` out of deterministic code paths. Tracks never write their own scans; a track that adds
 * a sim file adds one line to `DET_PATHS`, nothing else. Run by `noiseChecks` (scripts/noise.ts, the noise slot).
 *
 * Banned (results differ between V8, JSC and SpiderMonkey): `Math.random`, the trig / hyperbolic / exp / log / pow /
 * cbrt / hypot family, and `**` with an exponent that is not an integer literal. Use `dsin`/`tsin`/`datan2`/`dexp`/`dpow`
 * and `rngFor` from `src/engine/noise/dmath.ts` instead. Comments are stripped first; a same-line
 * `// det-ok: <reason>` lets one line through.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'

/**
 * Path prefixes (directories ending in `/`, or file stems) of deterministic code. A prefix that doesn't exist yet
 * is skipped with a notice, so the tracks only have to create the files.
 */
export const DET_PATHS = [
  'src/engine/noise/', // F0: dmath, gradient, voronoi, the IR pack
  'src/engine/sdf/', // IQ1: the 2D SDF library (#62), so cards drawn with it hash the same in every engine
  'src/engine/filter/', // IQ4: filtered fields (#65), same reason
  'src/engine/life/', // L: pond and ecosystem sims
  'src/engine/matter/sand', // M3: sand / erosion sim (M's bakes are not scanned)
  'src/engine/matter/mercury', // M2: mercury sim
  'src/engine/matter/thread', // M3: the thread's step (over life/chain ropeStep)
  'src/engine/matter/lichtenberg', 'src/engine/matter/erosion', 'src/engine/matter/reiter', // XM: dielectric breakdown growth, droplet erosion, snow crystals
  'src/engine/matter/kintsugi', 'src/engine/matter/mudcrack', // X #3: the kintsugi plate's impact fracture, drying mud's cracks
  'src/engine/matter/fold', // X #17: the paper fold operator
  'src/engine/squares/', // Q: masks, geometry, the tetris sim (Q1)
  'src/engine/algo/linfVoronoi', 'src/engine/algo/schotter', 'src/engine/algo/pixelSort', 'src/engine/algo/glitch', 'src/engine/algo/truchet', // Q3: the square field pack
  'src/engine/algo/hex', 'src/engine/algo/hat', 'src/engine/algo/ammann', // XQ: the aperiodic floors (#20)
  'src/engine/fractal/', // IQ7: escape-time, trap and density fractals (#68)
  'src/engine/oldschool/', 'src/widgets/boards/oldschool', // IQ6: deformations, clouds, the feedback sim (#67) and the board drawn with them
  'src/engine/sdf3d/', 'src/widgets/boards/scenes', // IQ8: 3D SDFs, the tracer, shadows, fog and light (#69) and the scenes board
  'src/engine/charts/', 'src/widgets/boards/charts', // #132: chart scales, marks, motion and readouts, and the charts board
] as const

const BANNED = /\bMath\.(random|sin|cos|tan|asin|acos|atan|atan2|hypot|exp|expm1|log|log1p|log2|log10|pow|cbrt|sinh|cosh|tanh)(?![\w$])/
/** `**` (or `**=`) not followed by an integer literal (optionally negative / parenthesised). */
const POW = /\*\*=?\s*(?!\(?\s*-?\s*\d+\s*\)?(?![\d.eE\w]))/
const SOURCE = /\.(ts|tsx|js|mjs|cjs)$/

export interface DetViolation { file: string; line: number; text: string; rule: string }
export interface DetResult { violations: DetViolation[]; scanned: string[]; skipped: string[] }

/** Blank out comments (keeping line breaks and string contents) so neither a doc comment nor a URL trips the scan. */
function stripComments(src: string): string {
  let out = '', i = 0, quote = ''
  while (i < src.length) {
    const c = src[i], d = src[i + 1]
    if (quote) {
      out += c
      if (c === '\\') { out += d ?? ''; i += 2; continue }
      if (c === quote) quote = ''
      i++; continue
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; out += c; i++; continue }
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue }
    if (c === '/' && d === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') out += '\n'; i++ } i += 2; continue }
    out += c; i++
  }
  return out
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : SOURCE.test(name) ? [p] : []
  })
}
/** The source files a prefix covers: a directory (recursive), or every file / directory whose name starts with the stem. */
function resolvePrefix(root: string, prefix: string): string[] | null {
  const abs = join(root, prefix)
  if (prefix.endsWith('/')) return existsSync(abs) && statSync(abs).isDirectory() ? files(abs) : null
  const dir = dirname(abs), stem = basename(abs)
  if (!existsSync(dir)) return null
  const hits = readdirSync(dir).filter(n => n.startsWith(stem)).map(n => join(dir, n))
  return hits.length ? hits.flatMap(p => (statSync(p).isDirectory() ? files(p) : SOURCE.test(p) ? [p] : [])) : null
}

/** Scan the given path prefixes (relative to `root`) for engine-specific math. */
export function detLint(paths: readonly string[] = DET_PATHS, root = process.cwd()): DetResult {
  const violations: DetViolation[] = [], scanned: string[] = [], skipped: string[] = []
  for (const prefix of paths) {
    const list = resolvePrefix(root, prefix)
    if (!list) { skipped.push(prefix); continue }
    for (const file of list) {
      const rel = relative(root, file).replace(/\\/g, '/')
      scanned.push(rel)
      const raw = readFileSync(file, 'utf8').split('\n'), code = stripComments(raw.join('\n')).split('\n')
      code.forEach((line, k) => {
        if (/\/\/\s*det-ok:\s*\S/.test(raw[k])) return
        const m = BANNED.exec(line), p = POW.exec(line)
        if (m) violations.push({ file: rel, line: k + 1, text: raw[k].trim(), rule: `Math.${m[1]}` })
        else if (p) violations.push({ file: rel, line: k + 1, text: raw[k].trim(), rule: '** with a non-integer exponent' })
      })
    }
  }
  return { violations, scanned, skipped }
}
